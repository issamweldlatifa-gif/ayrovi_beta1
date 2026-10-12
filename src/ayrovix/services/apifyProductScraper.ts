/**
 * Lecture d'une page produit via un Actor Apify (`skipper_lume/ecommerce-product-scraper`).
 *
 * Rôle : premier lecteur de la fiche produit (prix, devise, dispo, titre, image).
 * En cas d'échec, ou si le prix manque, l'appelant retombe sur le scraper local.
 *
 * Règles :
 *  • le jeton reste côté serveur (`APIFY_TOKEN`), envoyé en en-tête `Authorization`,
 *    jamais dans l'URL ni dans les journaux ;
 *  • le prix venant d'Apify n'est PAS marqué vérifié : `priceVerified=false` ⇒ « À confirmer » ;
 *  • rien n'est deviné : un champ absent reste `null` / `unknown`.
 */
import type { ScrapedProduct } from '../../types';

export const APIFY_PRODUCT_ACTOR = 'skipper_lume~ecommerce-product-scraper';
const APIFY_RUN_URL = `https://api.apify.com/v2/acts/${APIFY_PRODUCT_ACTOR}/run-sync-get-dataset-items`;
/** Une page = une requête synchrone ; Playwright peut prendre du temps. */
const APIFY_TIMEOUT_MS = 90_000;

export function apifyProductScraperEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.AYROVIX_APIFY_PRODUCT_SCRAPER || '').trim().toLowerCase() === 'off') return false;
  return Boolean((env.APIFY_TOKEN || '').trim());
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** Convertit un élément du dataset Apify en `ScrapedProduct`. `null` si le titre manque. */
export function mapApifyItem(item: unknown, requestedUrl: string, nowIso = new Date().toISOString()): ScrapedProduct | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const title = str(row.title);
  if (!title) return null;
  const url = str(row.url) || requestedUrl;
  const price = num(row.price);
  const currency = str(row.currency)?.toUpperCase() || '';
  const image = str(row.image) || '';
  const images = [...new Set([image, ...(Array.isArray(row.images) ? row.images : [])]
    .map((value) => str(value)).filter((value): value is string => !!value && /^https?:\/\//i.test(value)))];
  const inStock = row.in_stock;
  const availability = inStock === true ? 'in_stock' : inStock === false ? 'out_of_stock' : 'unknown';
  let storeName = str(row.store) || '';
  if (!storeName) {
    try { storeName = new URL(url).hostname.replace(/^www\./, ''); } catch { storeName = ''; }
  }
  return {
    id: `apify_${Buffer.from(url).toString('base64url').slice(0, 24)}`,
    store: 'generic',
    storeName,
    url,
    externalId: str(row.sku),
    title,
    description: str(row.description),
    images,
    mainImage: image || images[0] || '',
    sourcePrice: price ?? 0,
    sourceCurrency: price ? currency : '',
    convertedPriceTND: 0,
    estimatedShippingTND: 0,
    serviceFeeTND: 0,
    totalPriceTND: 0,
    variants: {},
    availability,
    brand: str(row.brand),
    rating: num(row.rating),
    reviewsCount: typeof row.review_count === 'number' && Number.isFinite(row.review_count) ? row.review_count : null,
    sku: str(row.sku),
    priceVerified: false,
    currencyVerified: false,
    priceRejection: null,
    verificationProvider: 'apify',
    verificationMethod: 'apify-actor',
    verificationFailureCode: null,
    titleSource: 'merchant',
    scrapedAt: nowIso,
  } as ScrapedProduct;
}

/** Appel synchrone de l'Actor. Toute erreur ⇒ `null` (l'appelant bascule sur le scraper local). */
export async function scrapeProductWithApify(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ScrapedProduct | null> {
  const token = (env.APIFY_TOKEN || '').trim();
  if (!token || (env.AYROVIX_APIFY_PRODUCT_SCRAPER || '').trim().toLowerCase() === 'off') return null;
  try {
    const response = await fetchImpl(APIFY_RUN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ urls: [url], maxConcurrency: 1, forcePlaywright: false }),
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[AYROVIX apify-product] HTTP ${response.status}`);
      return null;
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      console.warn('[AYROVIX apify-product] réponse inattendue');
      return null;
    }
    for (const item of payload) {
      const mapped = mapApifyItem(item, url);
      if (mapped) return mapped;
    }
    return null;
  } catch (error: any) {
    console.warn(`[AYROVIX apify-product] ${error?.name === 'TimeoutError' ? 'timeout' : 'indisponible'}`);
    return null;
  }
}

/**
 * Choix final entre Apify et le scraper local.
 * Apify gagne s'il a un prix ; sinon le local s'il a un titre ; sinon Apify (titre seul).
 */
export function pickScrapedProduct(
  apify: ScrapedProduct | null,
  local: ScrapedProduct | null,
): ScrapedProduct | null {
  if (apify && apify.sourcePrice > 0) return apify;
  if (local?.title) return local;
  return apify ?? local;
}
