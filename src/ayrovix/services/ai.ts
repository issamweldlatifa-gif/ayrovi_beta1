import type { AyrovixIdentification } from '../types';

/**
 * AYROVIX Vision — Anthropic-only production path.
 * One Claude Haiku request identifies the product and reads a visible price.
 * Live product discovery is handled separately by Anthropic Web Search.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

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

function anthropicKey(): string | null {
  return (process.env.ANTHROPIC_API_KEY || '').trim() || null;
}

export function ayrovixAiReady(): boolean {
  return Boolean(anthropicKey());
}

export function getActiveProviders(): string[] {
  return anthropicKey() ? ['anthropic'] : [];
}

const SYSTEM_PROMPT = `Tu es le moteur visuel d'AYROVIX, un assistant shopping tunisien.
Analyse uniquement ce qui est réellement visible dans l'image et identifie le produit principal.
Lis aussi le prix seulement s'il est clairement affiché dans l'image.

Règles obligatoires :
- N'invente jamais une marque, un modèle, un code article, un prix ou une devise.
- Un code modèle n'est accepté que s'il est lisible dans l'image.
- Pour une photo de produit sans prix visible, detected_price.label doit être "none" et amount/confidence à 0.
- Pour un prix barré, utilise label "old_price"; pour le prix actuel "product_price"; pour le total d'un panier "cart_total".
- Si plusieurs prix sont visibles, remplis pricing : sale_price = prix actuel, original_price = prix barré/avant, shipping_price = livraison, total_price = total panier, discount_percent = remise lisible. Ne calcule jamais un prix manquant.
- detected_price doit refléter sale_price (ou total_price pour un panier). N'utilise jamais le plus grand nombre par défaut.
- Si plusieurs produits distincts sont visibles, liste-les dans products avec leur prix propre (6 maximum).
- url et seller seulement s'ils sont lisibles dans l'image (barre d'adresse, logo boutique).
- Si l'image montre plusieurs produits ou un panier, input_kind doit être "cart_screenshot".
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
    // Anthropic Structured Outputs rejects validation keywords such as
    // maxItems/minimum/maximum. Bounds are enforced in parseIdentification().
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
          price: { type: ['number', 'null'] },
          currency: { type: ['string', 'null'] },
        },
        required: ['name', 'brand', 'category', 'price', 'currency'],
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

function parseIdentification(raw: string): AyrovixIdentification {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new AyrovixIdentificationError('Réponse Claude inexploitable.');
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new AyrovixIdentificationError('JSON Claude invalide.');
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
    .slice(0, 6)
    .map((item: any) => ({
      name: String(item.name).trim().slice(0, 140),
      brand: typeof item.brand === 'string' && item.brand.trim() ? item.brand.trim().slice(0, 80) : null,
      category: typeof item.category === 'string' ? item.category.trim().slice(0, 60) : 'product',
      price: numOrNull(item.price),
      currency: /^[A-Z]{3}$/.test(String(item.currency || '').trim().toUpperCase()) ? String(item.currency).trim().toUpperCase() : null,
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

export async function identifyProduct(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  if (!ALLOWED_MIME.has(mime)) throw new AyrovixIdentificationError("Format d'image non supporté");
  if (!image.length || image.length > MAX_IMAGE_BYTES) throw new AyrovixIdentificationError('Image trop lourde');
  const key = anthropicKey();
  if (!key) throw new AyrovixUnavailableError('Anthropic key missing');

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  // The first request for a new Structured Outputs schema may compile a grammar.
  const timeoutMs = boundedEnvMs('AYROVIX_PROVIDER_TIMEOUT_MS', 12_000, 12_000, 20_000);
  try {
    console.log(`[AYROVIX] Trying Claude ${model}`);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: image.toString('base64') } },
            { type: 'text', text: 'Identifie le produit principal et lis uniquement son prix réellement visible.' },
          ],
        }],
        output_config: {
          format: { type: 'json_schema', schema: IDENTIFICATION_SCHEMA },
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) throw new AyrovixUnavailableError('Anthropic authentication failed');
      if (response.status === 429) throw new AyrovixIdentificationError('Anthropic quota exceeded');
      throw new AyrovixIdentificationError(`Anthropic HTTP ${response.status}: ${body.slice(0, 160)}`);
    }
    const payload: any = await response.json();
    const text = (Array.isArray(payload?.content) ? payload.content : [])
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => String(block.text || ''))
      .join('');
    const result = parseIdentification(text);
    console.log(`[AYROVIX] Claude SUCCESS ${model}`);
    return result;
  } catch (error: any) {
    if (error instanceof AyrovixUnavailableError || error instanceof AyrovixIdentificationError) throw error;
    throw new AyrovixIdentificationError(error?.name === 'TimeoutError' ? 'Anthropic timeout' : 'Anthropic request failed');
  }
}
