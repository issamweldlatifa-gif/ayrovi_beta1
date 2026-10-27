/**
 * Quelles boutiques ont un logo OFFICIEL embarqué dans l'application ?
 *
 * ── Pourquoi cette liste existe (27/10/2026) ─────────────────────────────────
 * Le registre déclare `logo: '/stores/<id>.png'`, mais ce dossier n'a jamais été
 * servi : chaque carte de boutique affichait donc son initiale, pas sa marque.
 * Le client a envoyé les logos officiels et demandé « un logo par boutique ».
 *
 * Deux conséquences :
 *   1. les fichiers vivent dans `assets/aywebs/brands/` (thème clair) et
 *      `assets/aywebs/brands-dark/` (thème sombre) : aucun appel réseau, le logo
 *      s'affiche hors ligne et ne dépend plus du serveur ;
 *   2. cette liste est PURE — pas un seul `require` — pour être vérifiable en
 *      test : chaque identifiant du registre marques doit y figurer.
 *
 * Le rapprochement se fait sur l'identifiant du registre, jamais sur l'ordre
 * d'affichage ni sur une position dans une grille.
 */

export const STORE_LOGO_IDS = [
  'adidas',
  'aliexpress',
  'amazon',
  'asics',
  'calvin-klein',
  'champion',
  'chanel',
  'converse',
  'louis-vuitton',
  'new-balance',
  'nike',
  'puma',
  'sephora',
  'shein',
  'temu',
  'the-north-face',
  'under-armour',
  'vans',
  'zara',
] as const;

export type StoreLogoId = (typeof STORE_LOGO_IDS)[number];

/**
 * Autres écritures d'une même marque → identifiant de logo.
 *
 * Sert quand le serveur publie un libellé différent de l'identifiant du
 * registre (« New Balance » vs `new-balance`, « The North Face » vs
 * `the-north-face`, « LV »…). On ne devine jamais : un nom absent de cette
 * table ne reçoit AUCUN logo, la carte retombe sur son initiale.
 */
const ALIASES: Readonly<Record<string, StoreLogoId>> = {
  'adidas-fr': 'adidas',
  'calvinklein': 'calvin-klein',
  'ck': 'calvin-klein',
  'lv': 'louis-vuitton',
  'louisvuitton': 'louis-vuitton',
  'newbalance': 'new-balance',
  'north-face': 'the-north-face',
  'northface': 'the-north-face',
  'the-northface': 'the-north-face',
  'thenorthface': 'the-north-face',
  'ua': 'under-armour',
  'underarmour': 'under-armour',
  'aliexpress-com': 'aliexpress',
};

/** « The North Face » → `the-north-face` ; accents retirés, ponctuation en tirets. */
export function normaliseStoreKey(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const KNOWN = new Set<string>(STORE_LOGO_IDS);

function resolve(keys: readonly string[]): StoreLogoId | null {
  for (const key of keys) {
    if (!key) continue;
    if (KNOWN.has(key)) return key as StoreLogoId;
    const alias = ALIASES[key];
    if (alias) return alias;
  }
  return null;
}

/**
 * Identifiant de logo d'une boutique, ou `null`.
 *
 * L'identifiant serveur passe avant le nom affiché : deux boutiques peuvent
 * partager un libellé, jamais un identifiant.
 */
export function storeLogoId(store: { id?: string; name?: string; displayName?: string } | null | undefined): StoreLogoId | null {
  if (!store) return null;
  return resolve([
    normaliseStoreKey(store.id || ''),
    normaliseStoreKey(store.displayName || ''),
    normaliseStoreKey(store.name || ''),
  ]);
}
