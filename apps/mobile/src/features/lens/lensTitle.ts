/**
 * Lens — titre PRODUIT, pas titre de page (28/10/2026).
 *
 * ── Ce que le client a vu ──────────────────────────────────────────────────
 * Chercher « chèque cadeau » sur Zalando remontait des cartes dont le titre
 * était celui de la PAGE du site — et non du produit :
 *
 *     « Zalando — QUAND LA MAGIE OPÈRE - Chèque cadeau »
 *     « Amazon.fr: Chaussures de running Homme »
 *     « Acheter Robe fleurie sur SHEIN »
 *
 * Le nom de la boutique est déjà écrit en gras juste au-dessus : le répéter
 * dans le titre volait deux lignes de texte utile et rendait la recherche
 * floue (« Zalando » apparaît dans TOUS les titres, donc filtrer par titre ne
 * distinguait plus rien).
 *
 * `productTitle` retire la partie « page » et garde la partie « produit » :
 * le segment qui nomme le marchand, son domaine, et les verbes d'achat
 * (« Acheter… », « Buy… ») disparaissent. Quand il ne reste rien — un titre
 * qui n'était QUE le nom de la boutique — on rend le titre d'origine plutôt
 * qu'une carte vide.
 */
/** Forme minimale d'une fiche : le titre, et de quoi reconnaître le marchand. */
export interface TitledCandidate {
  title: string;
  source?: string;
  sourceUrl?: string;
}

/** Séparateurs de titre de page : « Nike Air | Zalando », « X — Zalando ». */
const HARD_SEPARATORS = /(\s+[|•·—–]\s+|\s+-\s+|:\s+)/;

/** Suffixes de domaine après le nom de la boutique : `amazon.FR`, `zalando.de`. */
const SITE_SUFFIXES = new Set([
  'fr', 'france', 'com', 'de', 'es', 'it', 'co', 'uk', 'be', 'ch', 'ca', 'us', 'eu',
  'nl', 'pt', 'pl', 'se', 'tn', 'ma', 'dz', 'eg', 'sa', 'ae', 'tr', 'jp', 'cn',
  'net', 'shop', 'store', 'boutique', 'officiel', 'official', 'online',
]);

/**
 * Enseignes dont le nom peut apparaître SEUL comme segment de titre, même si
 * la fiche ne dit pas d'où elle vient. Liste courte et lisible : elle ne sert
 * qu'à nettoyer un titre, jamais à classer une fiche (le classement, lui, lit
 * le DOMAINE — voir `lensRanking.ts`).
 */
const KNOWN_STORES = new Set([
  'zalando', 'amazon', 'ebay', 'temu', 'aliexpress', 'shein', 'fnac', 'cdiscount',
  'zara', 'asos', 'nike', 'adidas', 'sephora', 'decathlon', 'ikea', 'noon', 'jumia',
  'alibaba', 'etsy', 'walmart', 'rakuten', 'carrefour', 'boulanger', 'darty', 'kiabi',
  'uniqlo', 'mango', 'bershka', 'pullandbear', 'stradivarius', 'oysho', 'footlocker',
  'jdsports', 'courir', 'mytek', 'tunisianet', 'mediamarkt', 'saturn', 'otto', 'bol',
  'target', 'bestbuy', 'argos', 'hm', 'laredoute', 'veepee', 'showroomprive',
]);

/** Verbes d'achat en tête de titre de page. */
const BUY_VERBS = /^(acheter|achetez|buy|commander|commandez|order|shop|kaufen|comprar)\s+/i;

/** « sur Zalando », « at Amazon » : la queue n'est retirée que si c'est un marchand. */
const TRAILING_VENDOR = /\s+(sur|at|chez|on|by)\s+([^|•·—–]+)$/i;

/** Normalisation de comparaison : accents, casse, ponctuation, `www.`. */
function normalize(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Compaction : « Amazon.fr » → `amazonfr`, « H&M » → `hm`. */
const compact = (value: string): string => normalize(value).replace(/\s+/g, '');

/** Noms sous lesquels le marchand de CETTE fiche peut signer un titre. */
function merchantTokens(candidate: TitledCandidate): string[] {
  const tokens = new Set<string>();
  const add = (value: string) => {
    const key = compact(value);
    if (key.length >= 2) tokens.add(key);
  };
  add(String(candidate.source ?? ''));
  try {
    const host = new URL(String(candidate.sourceUrl ?? '')).hostname;
    for (const label of host.split('.')) add(label);
  } catch {
    // adresse illisible : `source` suffit
  }
  return [...tokens];
}

/** Ce segment nomme-t-il la boutique (et rien d'autre) ? */
function isMerchantSegment(segment: string, tokens: string[]): boolean {
  const key = compact(segment);
  if (!key) return true;
  if (KNOWN_STORES.has(key)) return true;
  for (const token of tokens) {
    if (key === token) return true;
    /* « zalando france », « amazonfr », « shein tn » : le nom + un suffixe de
       pays/domaine. Un produit dont le nom COMMENCE par la marque de la
       boutique (« Zalando Essentials Hoodie ») n'est pas concerné : il reste
       des mots après le suffixe. */
    if (key.startsWith(token)) {
      const rest = key.slice(token.length);
      if (!rest) return true;
      if (SITE_SUFFIXES.has(rest)) return true;
    }
  }
  return false;
}

/**
 * Le titre produit d'une fiche.
 *
 * Aucune invention : on retire des morceaux, on n'ajoute jamais de mot. Un
 * titre déjà propre ressort identique (espaces normalisés).
 */
export function productTitle(raw: string, candidate: TitledCandidate = { title: raw }): string {
  const clean = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const tokens = merchantTokens({ ...candidate, title: clean });

  // 1 — segments de titre de page : « Produit | Boutique », « Boutique : Produit ».
  const parts = clean.split(HARD_SEPARATORS);
  const kept: string[] = [];
  for (const part of parts) {
    if (HARD_SEPARATORS.test(part)) { kept.push(part); continue; }
    if (isMerchantSegment(part, tokens)) continue;
    kept.push(part);
  }
  let title = kept.join('').replace(HARD_SEPARATORS, ' ').replace(/\s+/g, ' ').trim();

  // 2 — « … sur Zalando » / « … at Amazon » : la queue saute si c'est un marchand.
  const tail = TRAILING_VENDOR.exec(title);
  if (tail && isMerchantSegment(tail[2], tokens)) {
    title = title.slice(0, tail.index).trim();
  }

  // 3 — « Acheter Robe fleurie » → « Robe fleurie ».
  const withoutVerb = title.replace(BUY_VERBS, '').trim();
  if (withoutVerb) title = withoutVerb;

  // 4 — jamais de carte sans titre : si tout a été retiré, on rend l'original.
  return title || clean;
}

/** Comparaison de recherche : accents et casse ignorés, sur des mots entiers. */
export function titleMatches(title: string, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return normalize(title).includes(needle);
}
