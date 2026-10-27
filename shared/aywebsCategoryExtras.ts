/**
 * Catégories AJOUTÉES à une boutique, en plus de celles du registre.
 *
 * ── Pourquoi ce fichier (27/10/2026) ────────────────────────────────────────
 * La section catégories de l'accueil AYWEBs montre désormais six familles
 * éditoriales, dont deux qui n'existaient pas encore comme catégories :
 * **« Casques et écouteurs »** (`audio`) et **« Activités de plein air »**
 * (`outdoor`). Sans cette table, leurs tuiles seraient des portes qui n'ouvrent
 * sur rien : le client touche « Casques et écouteurs » et la section 3 répond
 * « aucune boutique ».
 *
 * La règle est la même que partout ailleurs : **on ne devine pas**. Une boutique
 * ne reçoit `audio` que si l'enseigne vend réellement du son (Amazon, Fnac,
 * Darty, Samsung, Sony, Logitech, Razer…) et `outdoor` que si elle vend du
 * matériel de plein air (Decathlon, REI, Backcountry, The North Face…). Aucun
 * rayon n'est déduit de la présence d'un autre rayon.
 *
 * Table séparée (et non des lignes réécrites) pour deux raisons :
 *   • elle s'applique aux DEUX listes — registre et catalogue — sans importer
 *     l'une dans l'autre (pas de cycle entre `aywebsStores` et
 *     `aywebsStoreCatalog`) ;
 *   • elle se lit d'un coup d'œil : c'est la liste des boutiques qui font du son
 *     et de celles qui font du plein air.
 */

/** Identifiants de boutique → catégories supplémentaires. */
export const EXTRA_STORE_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
  /* ── Casques et écouteurs ─────────────────────────────────────────────── */
  amazon: ['audio'],
  'best-buy': ['audio'],
  newegg: ['audio'],
  mediamarkt: ['audio'],
  saturn: ['audio'],
  coolblue: ['audio'],
  currys: ['audio'],
  fnac: ['audio'],
  darty: ['audio'],
  ldlc: ['audio'],
  samsung: ['audio'],
  sony: ['audio'],
  logitech: ['audio'],
  razer: ['audio'],
  corsair: ['audio'],
  steelseries: ['audio'],
  hyperx: ['audio'],
  apple: ['audio'],

  /* ── Activités de plein air ───────────────────────────────────────────── */
  decathlon: ['outdoor'],
  rei: ['outdoor'],
  backcountry: ['outdoor'],
  'the-north-face': ['outdoor'],
  snowleader: ['outdoor'],
  'trek-bikes': ['outdoor'],
  'chain-reaction-cycles': ['outdoor'],
  wiggle: ['outdoor'],
  'sports-direct': ['outdoor'],
  'bass-pro-shops': ['outdoor'],
  'cabela-s': ['outdoor'],
  osprey: ['outdoor'],
  patagonia: ['outdoor'],
  'mountain-warehouse': ['outdoor'],
  'peak-design': ['outdoor'],
  'sea-to-summit': ['outdoor'],
  'eagle-creek': ['outdoor'],
  garmin: ['outdoor'],
  columbia: ['outdoor'],
};

/**
 * Rend la liste des catégories d'une boutique, supplément compris.
 *
 * Sans doublon et sans réordonner : les catégories déclarées gardent leur
 * place (la première sert de « catégorie principale » aux listes), les
 * supplémentaires sont ajoutées à la fin.
 */
export function withExtraCategories<T extends { id: string; categories: readonly string[] }>(store: T): T {
  const extra = EXTRA_STORE_CATEGORIES[store.id];
  if (!extra || extra.length === 0) return store;
  const merged = [...store.categories];
  for (const id of extra) if (!merged.includes(id)) merged.push(id);
  return { ...store, categories: merged };
}
