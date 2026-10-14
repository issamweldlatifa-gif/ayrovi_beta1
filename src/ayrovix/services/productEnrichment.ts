/**
 * ENRICHISSEMENT DE LA FICHE — galerie et tailles (27/09/2026).
 *
 * Constat du client, capture à l'appui : chez Zalando la fiche montre quatre
 * photos et un sélecteur de taille ; chez nous, une seule photo et aucune
 * taille. Ce n'est pas un défaut d'affichage — Google Lens ne rend ni galerie
 * ni tailles. La seule façon honnête de les avoir est de les DEMANDER.
 *
 * Deux appels de base, seulement pour la fiche que le client OUVRE (jamais
 * pour toute une grille), puis des lectures ciblées et bornées uniquement pour
 * les variantes encore inconnues mais identifiables :
 *
 *   1. `google_shopping` : retrouve la fiche marchande et son `product_id` ;
 *   2. `google_product`  : rend les médias et les variantes de CE produit ;
 *   3. jusqu’à huit `google_product` de variante, avec cache et concurrence
 *      limitée, lorsque la réponse principale ne publie aucun état de stock.
 *
 * Les garde-fous sont les mêmes que pour la description, parce que ce sont eux
 * qui rendent une dépense acceptable :
 *   • PREUVE   — on n'accepte la fiche trouvée que si son titre recouvre
 *                fortement le nôtre. Illustrer un produit avec les photos d'un
 *                autre est pire que n'en montrer qu'une ;
 *   • PAGE     — l'hôte et le chemin normalisés doivent être ceux du lien
 *                ouvert ; un voisin du même marchand est refusé ;
 *   • CACHE    — 6 heures au plus, puisque la même enveloppe transporte
 *                désormais un état de stock par variante ;
 *   • ÉCHÉANCE — l'enrichissement ne retarde jamais indéfiniment la fiche ;
 *                s'il n'est pas prêt, on affiche ce qu'on a déjà ;
 *   • STOCK    — la disponibilité par taille vient du champ `available` de la
 *                source. Absent, elle vaut `unknown` : un silence n'est pas une
 *                disponibilité, ici comme partout ailleurs.
 *
 * `AYROVI_PRODUCT_ENRICH=false` coupe la dépense sans redéploiement.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeTitle, titleOverlap } from './titleMatch';
import { buildProductCard, parseSerpApi } from './productVariants';
import { resolveVariants, type Fetcher as VariantAvailabilityFetcher } from './variantAvailability';
import type { AyrovixProductFact, AyrovixProductFactSection } from '../types';

export interface EnrichedVariant {
  /** Literal value published by the merchant: clothing size, volume, storage, etc. */
  value: string;
  /** Merchant label when it differs from the literal value. */
  label: string | null;
  availability: 'available' | 'unavailable' | 'unknown';
  /** Identifiants source nécessaires à une vérification de stock dédiée. */
  productId?: string;
  serpapiLink?: string;
}

export interface ProductEnrichment {
  images: string[];
  /** Values from the product's primary, source-backed variant attribute. */
  sizes: EnrichedVariant[];
  optionLabel: string | null;
  description: string | null;
  /** Instant de lecture des variantes, jamais assimilé à une disponibilité. */
  variantsCheckedAt?: string;
  /** Faits structurés de la fiche SerpApi, regroupés pour les accordéons natifs. */
  details: AyrovixProductFact[];
}

export const EMPTY_ENRICHMENT: ProductEnrichment = {
  images: [], sizes: [], optionLabel: null, description: null, details: [],
};

// La fiche contient désormais un état de variante : elle ne peut pas vivre plus
// longtemps que le contrat de stock (6 h), même si les médias changent rarement.
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_DEADLINE_MS = 7000;
const MATCH_THRESHOLD = 0.72;

function enabled(): boolean {
  return process.env.AYROVI_PRODUCT_ENRICH !== 'false' && Boolean(serpApiKey());
}

function serpApiKey(): string {
  return (process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY || '').trim();
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function canonicalScope(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

function sameMerchantPage(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return ['http:', 'https:'].includes(a.protocol) && ['http:', 'https:'].includes(b.protocol)
      && canonicalScope(left) === canonicalScope(right);
  } catch {
    return false;
  }
}

function cacheFile(title: string, scope = ''): string {
  const dir = process.env.AYROVI_PRODUCT_ENRICH_CACHE_DIR
    || path.resolve(process.cwd(), 'data', 'product-enrichment');
  // Item titles are not unique; isolate merchant page data in cache identity.
  const key = crypto.createHash('sha256').update(`${normalizeTitle(title)}|${scope}`).digest('hex').slice(0, 32);
  return path.join(dir, `${key}.json`);
}

function readCache(title: string, now: number, scope = ''): ProductEnrichment | null {
  try {
    const entry = JSON.parse(fs.readFileSync(cacheFile(title, scope), 'utf8')) as { at: number; value: ProductEnrichment };
    const ttl = envInt('AYROVI_PRODUCT_ENRICH_TTL_MS', DEFAULT_TTL_MS, 60_000, DEFAULT_TTL_MS);
    if (now - entry.at > ttl) return null;
    return { ...entry.value, details: Array.isArray(entry.value?.details) ? entry.value.details : [] };
  } catch {
    return null;
  }
}

function writeCache(title: string, value: ProductEnrichment, now: number, scope = ''): void {
  try {
    const file = cacheFile(title, scope);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ at: now, value }), 'utf8');
  } catch {
    /* un cache muet reste un cache */
  }
}

/* ── Lecture des réponses SerpApi, sans rien deviner ───────────────────────── */

/** Read image URLs from the merchant/SerpApi shapes we actually receive. */
export function readImages(product: any): string[] {
  const root = product?.product_results ?? product;
  const urls: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      const url = value.trim();
      if (/^https?:\/\//i.test(url)) urls.push(url);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    const type = String(item.type ?? item.media_type ?? '').toLowerCase();
    if (type && !['image', 'photo', 'product_image'].includes(type)) return;
    for (const key of ['link', 'url', 'src', 'image_url', 'original', 'original_url', 'high_res', 'high_resolution']) {
      const candidate = item[key];
      if (typeof candidate === 'string') visit(candidate);
    }
  };
  for (const key of ['media', 'images', 'image', 'main_image', 'image_url', 'thumbnail', 'thumbnail_url', 'product_images']) {
    if (root?.[key] != null) visit(root[key]);
  }
  return [...new Set(urls)];
}

/** Read the primary source-backed attribute (size, pointure, volume, storage…). */
function primaryAttribute(product: unknown) {
  const payload = product && typeof product === 'object' && 'product_results' in (product as object)
    ? product : { product_results: product };
  const { card } = buildProductCard(payload);
  return card.attributes.find((attribute) => attribute.role === 'primary')
    ?? (card.attributes.length === 1 && card.attributes[0].kind !== 'color' ? card.attributes[0] : null);
}

function collectSizes(
  primary: NonNullable<ReturnType<typeof primaryAttribute>>,
  resolved?: Array<'available' | 'unavailable' | 'unknown'>,
): EnrichedVariant[] {
  const unique = new Map<string, EnrichedVariant>();
  primary.variants.forEach((option, index) => {
    const key = option.value.trim().toLocaleLowerCase();
    const existing = unique.get(key);
    const optionAvailability = resolved?.[index] ?? option.availability;
    const availability = existing && existing.availability !== optionAvailability ? 'unknown' : optionAvailability;
    if (!existing || availability === 'unknown' || !existing.label) {
      unique.set(key, {
        value: existing?.value ?? option.value,
        label: existing?.label ?? null,
        availability,
        ...(existing?.productId || option.productId ? { productId: existing?.productId || option.productId } : {}),
        ...(existing?.serpapiLink || option.serpapiLink ? { serpapiLink: existing?.serpapiLink || option.serpapiLink } : {}),
      });
    }
  });
  return [...unique.values()];
}

export function readSizes(product: any): EnrichedVariant[] {
  const primary = primaryAttribute(product);
  return primary ? collectSizes(primary) : [];
}

/**
 * Les variantes inconnues mais identifiables sont relues individuellement.
 * Une erreur, un budget épuisé ou l’absence d’identifiant restent `unknown`.
 */
export async function readResolvedSizes(
  product: unknown,
  fetcher?: VariantAvailabilityFetcher,
): Promise<EnrichedVariant[]> {
  const primary = primaryAttribute(product);
  if (!primary) return [];
  const resolved = await resolveVariants(primary.variants.map((variant) => ({
    value: variant.value,
    productId: variant.productId,
    serpapiLink: variant.serpapiLink,
    known: variant.availability,
    knownReason: variant.availabilityReason,
  })), fetcher);
  return collectSizes(primary, resolved.map((variant) => variant.availability));
}

function readOptionLabel(product: any): string | null {
  return primaryAttribute(product)?.label ?? null;
}

const FACT_NOISE = /(?:^|\b)(?:price|prix|stock|availability|disponibilit|seller|vendeur|shipping|livraison|delivery|offer|offre|rating|review|avis|payment|paiement)(?:\b|$)/i;
const MATERIAL_FACT = /material|mati[eè]re|composition|fabric|tissu|outer|lining|doublure|leather|cuir|sole|semelle/i;
const FIT_FACT = /(?:^|\b)(?:fit|coupe|size|taille|length|longueur|neckline|encolure|sleeve|manche|shape|forme|height|hauteur|width|largeur|dimension|waist|poitrine)(?:\b|$)/i;

const FACT_KEYS: Array<{ key: string; pattern: RegExp; section?: AyrovixProductFactSection }> = [
  { key: 'material', pattern: /material|mati[eè]re|composition|fabric|tissu/i, section: 'material' },
  { key: 'fit', pattern: /(?:^|\b)(?:fit|coupe)(?:\b|$)/i, section: 'fit' },
  { key: 'length', pattern: /length|longueur/i, section: 'fit' },
  { key: 'neckline', pattern: /neckline|encolure|col\b/i, section: 'fit' },
  { key: 'sleeveLength', pattern: /sleeve|manche/i, section: 'fit' },
  { key: 'shape', pattern: /shape|forme|silhouette/i, section: 'fit' },
  { key: 'pattern', pattern: /pattern|motif|imprim[eé]/i },
  { key: 'model', pattern: /model|mod[eè]le|mpn/i },
  { key: 'productNumber', pattern: /product\s*(?:number|id)|r[eé]f[eé]rence|sku/i },
];

function cleanFactText(value: unknown, max: number): string {
  const text = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text === '[object Object]' || /https?:\/\//i.test(text)) return '';
  return text.slice(0, max);
}

/**
 * Détails strictement publiés par la fiche Google Product/SerpApi.
 * Aucun chemin interne ni diagnostic n'est exposé au client.
 */
export function readProductFacts(product: unknown): AyrovixProductFact[] {
  const payload = product && typeof product === 'object' && 'product_results' in (product as object)
    ? product : { product_results: product };
  const specs = parseSerpApi(payload).signals.specs;
  const seen = new Set<string>();
  const facts: AyrovixProductFact[] = [];
  for (const spec of specs) {
    const label = cleanFactText(spec.name, 80);
    const value = cleanFactText(spec.value, 240);
    if (!label || !value || FACT_NOISE.test(label)) continue;
    const canonical = FACT_KEYS.find((entry) => entry.pattern.test(label));
    const section: AyrovixProductFactSection = canonical?.section
      ?? (MATERIAL_FACT.test(label) ? 'material' : FIT_FACT.test(label) ? 'fit' : 'details');
    const identity = `${label.toLocaleLowerCase()}|${value.toLocaleLowerCase()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    facts.push({ key: canonical?.key ?? null, label, value, section });
    if (facts.length >= 18) break;
  }
  return facts;
}

/* ── Appels réseau, isolés pour être remplaçables dans les tests ───────────── */

export interface ProductFetchers {
  /** Retrouve la fiche marchande : titre trouvé + identifiant produit. */
  findProduct: (title: string) => Promise<{ title: string; productId: string; sourceUrl?: string } | null>;
  /** Rend la fiche complète pour cet identifiant. */
  loadProduct: (productId: string) => Promise<any | null>;
  /** Injection de test / fournisseur pour la vérification dédiée d’une variante. */
  resolveVariant: VariantAvailabilityFetcher;
}

async function serpApiFind(title: string): Promise<{ title: string; productId: string; sourceUrl?: string } | null> {
  const params = new URLSearchParams({ engine: 'google_shopping', q: title.slice(0, 120), api_key: serpApiKey(), num: '5' });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal: AbortSignal.timeout(envInt('AYROVI_PRODUCT_ENRICH_TIMEOUT_MS', 3500, 800, 10_000)),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json() as any;
  const matches = (Array.isArray(payload?.shopping_results) ? payload.shopping_results : [])
    .map((row: any) => ({
      title: String(row?.title || '').trim(),
      productId: String(row?.product_id || '').trim(),
      sourceUrl: String(row?.product_link || row?.merchant?.link || row?.link || '').trim(),
    }))
    .filter((row: { title: string; productId: string }) => row.title && row.productId)
    .map((row: { title: string; productId: string; sourceUrl: string }) => ({ ...row, score: titleOverlap(title, row.title) }))
    .filter((row: { score: number }) => row.score >= MATCH_THRESHOLD)
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
  const best = matches[0];
  return best ? { title: best.title, productId: best.productId, sourceUrl: best.sourceUrl } : null;
}

async function serpApiLoad(productId: string): Promise<any | null> {
  const params = new URLSearchParams({ engine: 'google_product', product_id: productId, api_key: serpApiKey() });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal: AbortSignal.timeout(envInt('AYROVI_PRODUCT_ENRICH_TIMEOUT_MS', 3500, 800, 10_000)),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json() as any;
  // Garder l’enveloppe : `product_results` porte les options, tandis que
  // `sellers_results` fournit la preuve de stock aux lectures dédiées.
  return payload?.product_results ? payload : null;
}

/* ── Enrichissement d'UNE fiche ────────────────────────────────────────────── */

export async function enrichProduct(
  title: string,
  options: { fetchers?: Partial<ProductFetchers>; now?: number; cacheScope?: string } = {},
): Promise<ProductEnrichment> {
  if (!title?.trim() || !enabled()) return EMPTY_ENRICHMENT;

  const now = options.now ?? Date.now();
  const cacheScope = canonicalScope(options.cacheScope || '');
  const cached = readCache(title, now, cacheScope);
  if (cached) return cached;

  const findProduct = options.fetchers?.findProduct ?? serpApiFind;
  const loadProduct = options.fetchers?.loadProduct ?? serpApiLoad;
  const deadline = envInt('AYROVI_PRODUCT_ENRICH_DEADLINE_MS', DEFAULT_DEADLINE_MS, 500, 15_000);

  const work = (async (): Promise<ProductEnrichment> => {
    const found = await findProduct(title);
    // La preuve avant les photos : sans recouvrement fort, c'est un autre produit.
    if (!found || titleOverlap(title, found.title) < MATCH_THRESHOLD) return EMPTY_ENRICHMENT;
    // Production callers supply the exact opened URL. A matching host is not
    // enough: a neighbouring product page must never lend its media or facts.
    if (options.cacheScope && (!found.sourceUrl || !sameMerchantPage(found.sourceUrl, options.cacheScope))) return EMPTY_ENRICHMENT;

    const product = await loadProduct(found.productId);
    if (!product) return EMPTY_ENRICHMENT;

    const root = product?.product_results ?? product;
    const sizes = await readResolvedSizes(product, options.fetchers?.resolveVariant);
    const value: ProductEnrichment = {
      images: readImages(product),
      sizes,
      optionLabel: readOptionLabel(product),
      description: String(root?.description || '').trim().slice(0, 600) || null,
      ...(sizes.length ? { variantsCheckedAt: new Date(now).toISOString() } : {}),
      details: readProductFacts(product),
    };
    // Cache only useful data and never let same-title pages share product media/options.
    if (value.images.length || value.sizes.length || value.description || value.details.length) {
      writeCache(title, value, now, cacheScope);
    }
    return value;
  })();

  return new Promise<ProductEnrichment>((resolve) => {
    const timer = setTimeout(() => resolve(EMPTY_ENRICHMENT), deadline);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(EMPTY_ENRICHMENT); },
    );
  });
}
