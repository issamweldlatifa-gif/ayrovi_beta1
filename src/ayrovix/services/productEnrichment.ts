/**
 * ENRICHISSEMENT DE LA FICHE — galerie et tailles (27/09/2026).
 *
 * Constat du client, capture à l'appui : chez Zalando la fiche montre quatre
 * photos et un sélecteur de taille ; chez nous, une seule photo et aucune
 * taille. Ce n'est pas un défaut d'affichage — Google Lens ne rend ni galerie
 * ni tailles. La seule façon honnête de les avoir est de les DEMANDER.
 *
 * Deux appels, pas un de plus, et seulement pour la fiche que le client OUVRE
 * (jamais pour toute une grille) :
 *
 *   1. `google_shopping` : retrouve la fiche marchande et son `product_id` ;
 *   2. `google_product`  : rend les médias et les variantes de CE produit.
 *
 * Les garde-fous sont les mêmes que pour la description, parce que ce sont eux
 * qui rendent une dépense acceptable :
 *   • PREUVE   — on n'accepte la fiche trouvée que si son titre recouvre
 *                fortement le nôtre. Illustrer un produit avec les photos d'un
 *                autre est pire que n'en montrer qu'une ;
 *   • CACHE    — 7 jours sur disque : une galerie ne change pas comme un prix ;
 *   • ÉCHÉANCE — l'enrichissement ne retarde jamais la fiche ; s'il n'est pas
 *                prêt, on affiche ce qu'on a déjà ;
 *   • STOCK    — la disponibilité par taille vient du champ `available` de la
 *                source. Absent, elle vaut `unknown` : un silence n'est pas une
 *                disponibilité, ici comme partout ailleurs.
 *
 * `AYROVI_PRODUCT_ENRICH=false` coupe la dépense sans redéploiement.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeTitle, titleOverlap } from './lensEnrichment';

export interface EnrichedVariant {
  /** Valeur telle que la source l'écrit (« M », « 42 », « 10 ml »). */
  value: string;
  /** Libellé complet quand la source en donne un autre (échelle marque). */
  label: string | null;
  availability: 'available' | 'unavailable' | 'unknown';
}

export interface ProductEnrichment {
  images: string[];
  sizes: EnrichedVariant[];
  description: string | null;
}

export const EMPTY_ENRICHMENT: ProductEnrichment = { images: [], sizes: [], description: null };

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DEADLINE_MS = 4000;
const MATCH_THRESHOLD = 0.6;
const MAX_IMAGES = 8;

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

function cacheFile(title: string): string {
  const dir = process.env.AYROVI_PRODUCT_ENRICH_CACHE_DIR
    || path.resolve(process.cwd(), 'data', 'product-enrichment');
  const key = crypto.createHash('sha256').update(normalizeTitle(title)).digest('hex').slice(0, 32);
  return path.join(dir, `${key}.json`);
}

function readCache(title: string, now: number): ProductEnrichment | null {
  try {
    const entry = JSON.parse(fs.readFileSync(cacheFile(title), 'utf8')) as { at: number; value: ProductEnrichment };
    const ttl = envInt('AYROVI_PRODUCT_ENRICH_TTL_MS', DEFAULT_TTL_MS, 60_000, 30 * 24 * 60 * 60 * 1000);
    return now - entry.at <= ttl ? entry.value : null;
  } catch {
    return null;
  }
}

function writeCache(title: string, value: ProductEnrichment, now: number): void {
  try {
    const file = cacheFile(title);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ at: now, value }), 'utf8');
  } catch {
    /* un cache muet reste un cache */
  }
}

/* ── Lecture des réponses SerpApi, sans rien deviner ───────────────────────── */

/** Médias du produit : images seulement, dédoublonnées, bornées. */
export function readImages(product: any): string[] {
  const media = Array.isArray(product?.media) ? product.media : [];
  const urls = media
    .filter((item: any) => !item?.type || item.type === 'image')
    .map((item: any) => String(item?.link || '').trim())
    .filter((url: string) => /^https?:\/\//i.test(url));
  return [...new Set<string>(urls)].slice(0, MAX_IMAGES);
}

/**
 * Variantes de taille. Trois formes possibles selon l'âge de la réponse, et
 * une seule règle : un `available` absent vaut `unknown`, jamais « disponible ».
 */
export function readSizes(product: any): EnrichedVariant[] {
  const out: EnrichedVariant[] = [];
  const push = (value: unknown, label: unknown, available: unknown) => {
    const text = String(value || '').trim();
    if (!text) return;
    const labelText = String(label || '').trim();
    out.push({
      value: text,
      label: labelText && labelText !== text ? labelText : null,
      availability: available === true ? 'available' : available === false ? 'unavailable' : 'unknown',
    });
  };

  // Forme moderne : variations est un objet dont les clés sont dynamiques.
  const variations = product?.variations;
  if (variations && typeof variations === 'object' && !Array.isArray(variations)) {
    for (const [group, items] of Object.entries(variations)) {
      if (!/taille|size|pointure|contenance/i.test(group)) continue;
      for (const item of (Array.isArray(items) ? items : [])) {
        push((item as any)?.name, (item as any)?.label, (item as any)?.available);
      }
    }
  }

  // Forme intermédiaire : variants est un tableau de groupes nommés.
  if (!out.length && Array.isArray(product?.variants)) {
    for (const group of product.variants) {
      if (!/taille|size|pointure|contenance/i.test(String(group?.title || ''))) continue;
      for (const item of (Array.isArray(group?.items) ? group.items : [])) {
        push(item?.name, item?.label, item?.available);
      }
    }
  }

  // Forme héritée : `sizes` est un objet sans aucune disponibilité.
  if (!out.length && product?.sizes && typeof product.sizes === 'object') {
    for (const key of Object.keys(product.sizes)) push(key, null, undefined);
  }

  return out;
}

/* ── Appels réseau, isolés pour être remplaçables dans les tests ───────────── */

export interface ProductFetchers {
  /** Retrouve la fiche marchande : titre trouvé + identifiant produit. */
  findProduct: (title: string) => Promise<{ title: string; productId: string } | null>;
  /** Rend la fiche complète pour cet identifiant. */
  loadProduct: (productId: string) => Promise<any | null>;
}

async function serpApiFind(title: string): Promise<{ title: string; productId: string } | null> {
  const params = new URLSearchParams({ engine: 'google_shopping', q: title.slice(0, 120), api_key: serpApiKey(), num: '5' });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal: AbortSignal.timeout(envInt('AYROVI_PRODUCT_ENRICH_TIMEOUT_MS', 3500, 800, 10_000)),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json() as any;
  for (const row of (Array.isArray(payload?.shopping_results) ? payload.shopping_results : [])) {
    const rowTitle = String(row?.title || '').trim();
    const productId = String(row?.product_id || '').trim();
    if (rowTitle && productId) return { title: rowTitle, productId };
  }
  return null;
}

async function serpApiLoad(productId: string): Promise<any | null> {
  const params = new URLSearchParams({ engine: 'google_product', product_id: productId, api_key: serpApiKey() });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal: AbortSignal.timeout(envInt('AYROVI_PRODUCT_ENRICH_TIMEOUT_MS', 3500, 800, 10_000)),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json() as any;
  return payload?.product_results ?? null;
}

/* ── Enrichissement d'UNE fiche ────────────────────────────────────────────── */

export async function enrichProduct(
  title: string,
  options: { fetchers?: Partial<ProductFetchers>; now?: number } = {},
): Promise<ProductEnrichment> {
  if (!title?.trim() || !enabled()) return EMPTY_ENRICHMENT;

  const now = options.now ?? Date.now();
  const cached = readCache(title, now);
  if (cached) return cached;

  const findProduct = options.fetchers?.findProduct ?? serpApiFind;
  const loadProduct = options.fetchers?.loadProduct ?? serpApiLoad;
  const deadline = envInt('AYROVI_PRODUCT_ENRICH_DEADLINE_MS', DEFAULT_DEADLINE_MS, 500, 15_000);

  const work = (async (): Promise<ProductEnrichment> => {
    const found = await findProduct(title);
    // La preuve avant les photos : sans recouvrement fort, c'est un autre produit.
    if (!found || titleOverlap(title, found.title) < MATCH_THRESHOLD) return EMPTY_ENRICHMENT;

    const product = await loadProduct(found.productId);
    if (!product) return EMPTY_ENRICHMENT;

    const value: ProductEnrichment = {
      images: readImages(product),
      sizes: readSizes(product),
      description: String(product?.description || '').trim().slice(0, 600) || null,
    };
    // On ne mémorise que ce qui a réellement apporté quelque chose.
    if (value.images.length || value.sizes.length || value.description) writeCache(title, value, now);
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
