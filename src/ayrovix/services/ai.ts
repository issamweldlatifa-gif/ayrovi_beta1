import type { AyrovixIdentification } from '../types';
import type { AiCompletionRequest } from '../../ai-core/contracts';
import { getAyroviAiCore } from '../../ai-core/core';
import { AiProviderError } from '../../ai-core/errors';

/**
 * AYROVIX Vision keeps ownership of identification and validation. Provider
 * image/message/schema wire details are isolated behind AYROVI AI Core.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class AyrovixUnavailableError extends Error {
  readonly code = 'AYROVIX_UNAVAILABLE';
}
export class AyrovixIdentificationError extends Error {
  readonly code = 'IDENTIFICATION_FAILED';
}

function boundedEnvMs(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

export function ayrovixAiReady(): boolean {
  return getAyroviAiCore().responses().isConfigured();
}

export function getActiveProviders(): string[] {
  const provider = getAyroviAiCore().responses();
  return provider.isConfigured() ? [provider.id] : [];
}

export function fallbackIdentification(description = 'Produit détecté visuellement'): AyrovixIdentification {
  const text = String(description || '').trim().slice(0, 400) || 'Produit détecté visuellement';
  return {
    input_kind: 'product_photo',
    category: 'product',
    brand: null,
    model: null,
    color: [],
    visible_text: [],
    possible_model_codes: [],
    description: text,
    confidence: 0.4,
    detected_price: { amount: 0, currency: '', label: 'none', confidence: 0 },
    pricing: {
      sale_price: null,
      original_price: null,
      shipping_price: null,
      total_price: null,
      currency: null,
      discount_percent: null,
    },
    products: [],
    url: null,
    seller: null,
  };
}

const SYSTEM_PROMPT = `Tu es le moteur visuel et d'intelligence produit d'AYROVIX (AYROVIX Lens Multi-Product Intelligence Engine), assistant shopping tunisien.
Analyse l'image avec une intelligence multi-produits en temps réel.
Identifie le produit principal ainsi que TOUS les produits distincts visibles dans la scène (ex. tenue complète : t-shirt, pantalon, chaussures, sac, montre, lunettes, ou plusieurs articles sur une table / un rayon). Ne t'arrête pas au premier produit.

Règles obligatoires :
- N'invente jamais une marque, un modèle, un code article, un prix ou une devise.
- Un code modèle n'est accepté que s'il est lisible dans l'image.
- Pour une photo de produit sans prix visible, detected_price.label doit être "none" et amount/confidence à 0.
- Pour un prix barré, utilise label "old_price"; pour le prix actuel "product_price"; pour le total d'un panier "cart_total".
- Si plusieurs prix sont visibles, remplis pricing : sale_price = prix actuel, original_price = prix barré/avant, shipping_price = livraison, total_price = total panier, discount_percent = remise lisible. Ne calcule jamais un prix manquant.
- detected_price doit refléter sale_price (ou total_price pour un panier). N'utilise jamais le plus grand nombre par défaut.
- Détecte TOUS les produits pertinents visibles et liste-les dans products (jusqu'à 8 produits).
- Pour CHAQUE produit listé dans products :
  - name : nom factuel court et précis du produit (ex. "T-shirt graphique oversize", "Sneakers blanches montantes", "Sac à dos en cuir").
  - brand : marque si lisible ou clairement identifiable, sinon null.
  - category : catégorie normalisée (ex. "clothing", "shoes", "bags", "accessories", "electronics", "beauty", "home").
  - subcategory : sous-catégorie spécifique (ex. "t-shirt", "jeans", "sneakers", "handbag", "smartwatch").
  - box : boîte englobante normalisée [x, y, largeur, hauteur] entre 0.0 et 1.0 délimitant précisément l'objet dans l'image ; sinon null.
  - color : liste des couleurs dominantes visibles.
  - motif : motif si identifiable (ex. "uni", "rayé", "logo-print", "carreaux"), sinon null.
  - material : matière si visible ou inférable (ex. "coton", "cuir", "denim", "métal", "maille"), sinon null.
  - price : prix visible propre à ce produit, sinon null.
  - currency : devise visible (code ISO 3 lettres comme EUR, USD, TND), sinon null.
- url et seller seulement s'ils sont lisibles dans l'image (barre d'adresse, logo boutique).
- Si l'image montre plusieurs produits ou un panier, input_kind doit être "cart_screenshot" ou "product_photo".
- Si aucun produit n'est identifiable, confidence vaut 0 et description vaut "PRODUIT_NON_IDENTIFIE".
- La description doit être une phrase factuelle courte en français.`;

const IDENTIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    input_kind: {
      type: 'string',
      enum: ['product_photo', 'product_screenshot', 'cart_screenshot', 'barcode', 'other'],
    },
    category: { type: 'string' },
    brand: { type: ['string', 'null'] },
    model: { type: ['string', 'null'] },
    // Runtime bounds are enforced again in parseIdentification() so provider
    // output can never bypass AYROVIX validation.
    color: { type: 'array', items: { type: 'string' } },
    visible_text: { type: 'array', items: { type: 'string' } },
    possible_model_codes: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    confidence: { type: 'number' },
    detected_price: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
        label: { type: 'string', enum: ['none', 'product_price', 'old_price', 'cart_total'] },
        confidence: { type: 'number' },
      },
      required: ['amount', 'currency', 'label', 'confidence'],
      additionalProperties: false,
    },
    pricing: {
      type: 'object',
      properties: {
        sale_price: { type: ['number', 'null'] },
        original_price: { type: ['number', 'null'] },
        shipping_price: { type: ['number', 'null'] },
        total_price: { type: ['number', 'null'] },
        currency: { type: ['string', 'null'] },
        discount_percent: { type: ['number', 'null'] },
      },
      required: ['sale_price', 'original_price', 'shipping_price', 'total_price', 'currency', 'discount_percent'],
      additionalProperties: false,
    },
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          brand: { type: ['string', 'null'] },
          category: { type: 'string' },
          subcategory: { type: ['string', 'null'] },
          price: { type: ['number', 'null'] },
          currency: { type: ['string', 'null'] },
          box: { type: ['array', 'null'], items: { type: 'number' } },
          color: { type: 'array', items: { type: 'string' } },
          motif: { type: ['string', 'null'] },
          material: { type: ['string', 'null'] },
        },
        required: ['name', 'brand', 'category', 'subcategory', 'price', 'currency'],
        additionalProperties: false,
      },
    },
    url: { type: ['string', 'null'] },
    seller: { type: ['string', 'null'] },
  },
  required: [
    'input_kind', 'category', 'brand', 'model', 'color', 'visible_text',
    'possible_model_codes', 'description', 'confidence', 'detected_price',
    'pricing', 'products', 'url', 'seller',
  ],
  additionalProperties: false,
};

/** يقيّد صندوقًا مُرجَعًا من الـ AI إلى [x,y,w,h] مُطبَّع 0..1، أو null إن كان غير صالح. */
export function normalizeBox(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums = raw.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [x0, y0, w0, h0] = nums;
  const x = Math.min(1, Math.max(0, x0));
  const y = Math.min(1, Math.max(0, y0));
  const w = Math.min(1 - x, Math.max(0.02, w0));
  const h = Math.min(1 - y, Math.max(0.02, h0));
  return [x, y, w, h];
}

function parseIdentification(raw: string): AyrovixIdentification {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new AyrovixIdentificationError('Réponse visuelle inexploitable.');
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new AyrovixIdentificationError('JSON visuel invalide.');
  }
  const list = (value: unknown, max: number): string[] => Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
      .map((item) => String(item).trim().slice(0, 80)).slice(0, max)
    : [];
  const confidence = Number(parsed.confidence);
  const priceConfidence = Number(parsed?.detected_price?.confidence);
  const priceAmount = Number(parsed?.detected_price?.amount);
  const currency = String(parsed?.detected_price?.currency || '').trim().toUpperCase();
  const numOrNull = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
  };
  const rawPricing = parsed?.pricing && typeof parsed.pricing === 'object' ? parsed.pricing : {};
  const pricingCurrency = /^[A-Z]{3}$/.test(String(rawPricing.currency || '').trim().toUpperCase())
    ? String(rawPricing.currency).trim().toUpperCase() : null;
  const pricing = {
    sale_price: numOrNull(rawPricing.sale_price),
    original_price: numOrNull(rawPricing.original_price),
    shipping_price: numOrNull(rawPricing.shipping_price),
    total_price: numOrNull(rawPricing.total_price),
    currency: pricingCurrency,
    discount_percent: (() => { const d = Number(rawPricing.discount_percent); return Number.isFinite(d) && d > 0 && d <= 95 ? d : null; })(),
  };
  const products = (Array.isArray(parsed?.products) ? parsed.products : [])
    .filter((item: any) => typeof item?.name === 'string' && item.name.trim())
    .slice(0, 8)
    .map((item: any) => ({
      name: String(item.name).trim().slice(0, 140),
      brand: typeof item.brand === 'string' && item.brand.trim() ? item.brand.trim().slice(0, 80) : null,
      category: typeof item.category === 'string' ? item.category.trim().slice(0, 60) : 'product',
      subcategory: typeof item.subcategory === 'string' && item.subcategory.trim() ? item.subcategory.trim().slice(0, 60) : null,
      price: numOrNull(item.price),
      currency: /^[A-Z]{3}$/.test(String(item.currency || '').trim().toUpperCase()) ? String(item.currency).trim().toUpperCase() : null,
      box: normalizeBox(item.box),
      color: list(item.color, 4),
      pattern: typeof (item.motif || item.pattern) === 'string' && (item.motif || item.pattern).trim() ? (item.motif || item.pattern).trim().slice(0, 60) : null,
      material: typeof item.material === 'string' && item.material.trim() ? item.material.trim().slice(0, 60) : null,
    }));
  const urlRaw = typeof parsed?.url === 'string' ? parsed.url.trim().slice(0, 500) : '';
  const url = /^https?:\/\//i.test(urlRaw) ? urlRaw : null;
  const seller = typeof parsed?.seller === 'string' && parsed.seller.trim() ? parsed.seller.trim().slice(0, 80) : null;
  const inputKinds = new Set(['product_photo', 'product_screenshot', 'cart_screenshot', 'barcode', 'other']);
  const priceLabels = new Set(['none', 'product_price', 'old_price', 'cart_total']);
  // detected_price dérivé du bloc pricing quand il est plus riche que l'ancien champ.
  const pricingSale = pricing.sale_price ?? null;
  const effectiveAmount = pricingSale ?? priceAmount;
  const effectiveCurrency = pricing.currency ?? (/^[A-Z]{3}$/.test(currency) ? currency : '');
  const effectiveLabel = pricingSale != null
    ? 'product_price'
    : (priceLabels.has(parsed?.detected_price?.label) ? parsed.detected_price.label : 'none');
  return {
    pricing,
    products,
    url,
    seller,
    input_kind: inputKinds.has(parsed.input_kind) ? parsed.input_kind : 'other',
    category: typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase().slice(0, 60) : 'product',
    brand: typeof parsed.brand === 'string' && parsed.brand.trim() ? parsed.brand.trim().slice(0, 80) : null,
    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim().slice(0, 120) : null,
    color: list(parsed.color, 3),
    visible_text: list(parsed.visible_text, 8),
    possible_model_codes: list(parsed.possible_model_codes, 4),
    description: typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 400) : '',
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    detected_price: {
      amount: Number.isFinite(effectiveAmount) && effectiveAmount > 0 && effectiveAmount < 1_000_000 ? effectiveAmount : 0,
      currency: /^[A-Z]{3}$/.test(effectiveCurrency) ? effectiveCurrency : '',
      label: effectiveLabel,
      confidence: Number.isFinite(priceConfidence) ? Math.min(1, Math.max(0, priceConfidence)) : 0,
    },
  };
}

export function buildSearchQuery(identification: AyrovixIdentification): string {
  const parts: string[] = [];
  if (identification.possible_model_codes.length && identification.brand) {
    parts.push(identification.brand, identification.possible_model_codes[0]);
  } else {
    if (identification.brand) parts.push(identification.brand);
    if (identification.model) parts.push(identification.model);
    parts.push(...identification.color);
    if (identification.category && identification.category !== 'product') parts.push(identification.category);
  }
  const fallback = parts.length
    ? parts.join(' ')
    : `${identification.brand || ''} ${identification.category} ${identification.description}`.trim();
  return fallback.replace(/\s+/g, ' ').trim().slice(0, 200) || identification.category || 'produit';
}

async function requestIdentification(
  image: Buffer,
  mime: string,
  timeoutMs: number,
  structured: boolean,
): Promise<AyrovixIdentification> {
  const provider = getAyroviAiCore().responses();
  const request: AiCompletionRequest = {
    workload: 'vision',
    modelClass: 'fast',
    instructions: structured
      ? SYSTEM_PROMPT
      : `${SYSTEM_PROMPT}\nRéponds uniquement par un objet JSON valide, sans markdown ni texte autour.`,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', mediaType: mime, data: image.toString('base64') } },
        { type: 'text', text: 'Identifie le produit principal et lis uniquement son prix réellement visible.' },
      ],
    }],
    maxOutputTokens: structured ? 700 : 900,
    temperature: 0,
    ...(structured ? {
      outputSchema: { name: 'ayrovix_identification', schema: IDENTIFICATION_SCHEMA },
    } : {}),
  };
  try {
    const result = await provider.complete(request, AbortSignal.timeout(timeoutMs));
    return parseIdentification(result.textBlocks.join(''));
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    if (error.code === 'PROVIDER_AUTHENTICATION_FAILED') {
      throw new AyrovixUnavailableError('Vision provider authentication failed');
    }
    if (error.code === 'PROVIDER_RATE_LIMITED') {
      throw new AyrovixIdentificationError('Vision provider quota exceeded');
    }
    if (error.code === 'PROVIDER_TIMEOUT') throw error;
    const mapped = new AyrovixIdentificationError(`Vision provider HTTP ${error.status || 0}`);
    (mapped as any).httpStatus = error.status;
    throw mapped;
  }
}

export async function identifyProduct(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  if (!ALLOWED_MIME.has(mime)) throw new AyrovixIdentificationError("Format d'image non supporté");
  if (!image.length || image.length > MAX_IMAGE_BYTES) throw new AyrovixIdentificationError('Image trop lourde');
  const provider = getAyroviAiCore().responses();
  if (!provider.isConfigured()) throw new AyrovixUnavailableError('Vision provider is not configured');

  const model = provider.resolveModel('vision', 'fast');
  const timeoutMs = boundedEnvMs('AYROVIX_PROVIDER_TIMEOUT_MS', 12_000, 8_000, 20_000);
  try {
    console.log(`[AYROVIX] Trying ${provider.id} ${model}`);
    try {
      const result = await requestIdentification(image, mime, timeoutMs, true);
      console.log(`[AYROVIX] Provider SUCCESS ${model}`);
      return result;
    } catch (error: any) {
      if (error instanceof AyrovixUnavailableError) throw error;
      if (error instanceof AyrovixIdentificationError && error.message.includes('quota exceeded')) throw error;
      if (error instanceof AiProviderError && error.code === 'PROVIDER_TIMEOUT') {
        throw new AyrovixIdentificationError('Vision provider timeout');
      }
      // Structured output can be rejected or truncated. A plain JSON turn is
      // the behavior-preserving production fallback.
      console.warn(`[AYROVIX] structured output failed (${error?.message || 'unknown'}) — retrying JSON`);
      const result = await requestIdentification(image, mime, timeoutMs, false);
      console.log(`[AYROVIX] Provider SUCCESS ${model} (json fallback)`);
      return result;
    }
  } catch (error: any) {
    if (error instanceof AyrovixUnavailableError || error instanceof AyrovixIdentificationError) throw error;
    const timeout = error instanceof AiProviderError && error.code === 'PROVIDER_TIMEOUT';
    throw new AyrovixIdentificationError(timeout ? 'Vision provider timeout' : 'Vision provider request failed');
  }
}
