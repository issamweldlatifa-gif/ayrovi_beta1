import type { AyrovixIdentification } from '../types';

/**
 * AYROVIX · AI understanding layer — Anthropic Claude Vision.
 * - La clé reste STRICTEMENT côté serveur (ANTHROPIC_API_KEY), jamais dans le bundle client
 *   (aucune variable VITE_* : tout ce qui commence par VITE_ part dans le navigateur).
 * - Rôle : comprendre l'image et identifier le produit — JAMAIS de prix, JAMAIS de recherche.
 * - Couche isolée et remplaçable : le reste d'AYROVIX ne connaît que identifyProduct().
 */

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export class AyrovixUnavailableError extends Error { readonly code = 'AYROVIX_UNAVAILABLE'; }
export class AyrovixIdentificationError extends Error { readonly code = 'IDENTIFICATION_FAILED'; }

export function ayrovixAiReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 20);
}

const SYSTEM_PROMPT = `Tu es le moteur d'identification visuelle d'AYROVIX, un assistant shopping tunisien.
Analyse l'image et identifie le produit principal. Réponds UNIQUEMENT par un objet JSON valide, sans markdown, avec exactement ces clés :
{
  "category": string en anglais simple (ex. "shoes", "handbag", "dress", "watch", "supplement"),
  "brand": string ou null si non visible,
  "model": string ou null (nom commercial du modèle si identifiable),
  "color": tableau de 1 à 3 couleurs en anglais, des plus dominantes aux plus discrètes,
  "visible_text": tableau de textes réellement lisibles sur le produit (logos, étiquettes),
  "possible_model_codes": tableau de codes article plausibles SEULEMENT si un code est visible (ex. "DC9412-400"), sinon [],
  "description": une phrase factuelle en français décrivant le produit (forme, matière, usage),
  "confidence": nombre entre 0 et 1 — honnêteté obligatoire : < 0.4 si l'identification est incertaine
}
Règles strictes : n'invente ni marque ni modèle ni code ; n'évalue JAMAIS de prix ; si l'image ne contient pas de produit identifiable, mets confidence à 0 et description à "PRODUIT_NON_IDENTIFIE".`;

function parseIdentification(raw: string): AyrovixIdentification {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new AyrovixIdentificationError('Réponse du modèle inexploitable.');
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new AyrovixIdentificationError('JSON d’identification invalide.');
  }
  const list = (value: unknown, max: number): string[] =>
    Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim().slice(0, 80)).slice(0, max) : [];
  const confidence = Number(parsed.confidence);
  return {
    category: typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase().slice(0, 60) : 'product',
    brand: typeof parsed.brand === 'string' && parsed.brand.trim() ? parsed.brand.trim().slice(0, 80) : null,
    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim().slice(0, 120) : null,
    color: list(parsed.color, 3),
    visible_text: list(parsed.visible_text, 8),
    possible_model_codes: list(parsed.possible_model_codes, 4),
    description: typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 400) : '',
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
  };
}

/** Requête de recherche : code article en priorité, sinon brand + model + couleurs + catégorie. */
export function buildSearchQuery(id: AyrovixIdentification): string {
  const parts: string[] = [];
  if (id.possible_model_codes.length && id.brand) parts.push(id.brand, id.possible_model_codes[0]);
  else {
    if (id.brand) parts.push(id.brand);
    if (id.model) parts.push(id.model);
    parts.push(...id.color);
    if (id.category && id.category !== 'product') parts.push(id.category);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export async function identifyProduct(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  if (!ayrovixAiReady()) throw new AyrovixUnavailableError("AYROVIX n'est pas encore configuré côté serveur.");
  if (!ALLOWED_MIME.has(mime)) throw new AyrovixIdentificationError("Format d'image non supporté (JPEG, PNG, WebP).");
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) throw new AyrovixIdentificationError('Image trop lourde (5 Mo max).');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': String(process.env.ANTHROPIC_API_KEY),
        'anthropic-version': '2023-06-01',
      },
      // Jamais de journalisation : ni clé, ni image, ni réponse brute (confidentialité client).
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 700,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mime,
                  data: image.toString('base64'),
                },
              },
              { type: 'text', text: 'Identifie le produit principal de cette image.' },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new AyrovixUnavailableError('Configuration AYROVIX invalide.');
      throw new AyrovixIdentificationError(`Analyse indisponible (HTTP ${response.status}).`);
    }
    const payload: any = await response.json();
    const text = String(payload?.content?.[0]?.text || '');
    if (!text.trim()) throw new AyrovixIdentificationError('Réponse vide du modèle.');
    return parseIdentification(text);
  } catch (error: any) {
    if (error instanceof AyrovixIdentificationError || error instanceof AyrovixUnavailableError) throw error;
    if (error?.name === 'AbortError') throw new AyrovixIdentificationError("L'analyse a dépassé le délai imparti.");
    throw new AyrovixIdentificationError("L'analyse de l'image a échoué.");
  } finally {
    clearTimeout(timeout);
  }
}
