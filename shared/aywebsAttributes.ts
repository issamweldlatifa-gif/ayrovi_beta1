/**
 * AYWEBs — LE NOM D'UN ATTRIBUT N'EST PAS SON IDENTITÉ (26/10/2026).
 *
 * ── Le fait mesuré ────────────────────────────────────────────────────────
 * La MÊME fiche Zalando s'ajoutait depuis le WEB et PAS depuis l'application :
 * l'application recevait « Choisissez toutes les options requises : le serveur
 * refuse un ajout sans choix explicite » (`VARIANT_REQUIRED`) alors que la
 * taille 36 était bien choisie à l'écran.
 *
 * ── La cause ──────────────────────────────────────────────────────────────
 * Les deux côtés ne nomment pas la même dimension pareil : la capture du
 * navigateur publie le nom AFFICHÉ par la page (« Taille », « Couleur »), alors
 * que la lecture serveur publie le nom de la DONNÉE (« size », « color »).
 * `ayWebsSplitVariantSelection` comparait les noms caractère par caractère :
 * `taille` n'étant pas publié, la sélection partait en « métadonnée », le choix
 * devenait vide côté serveur, et l'ajout était refusé. Ce n'est pas une
 * tolérance nouvelle sur les VALEURS (elles restent comparées exactement) :
 * c'est la reconnaissance que `Taille`, `size`, `Größe`, `مقاس` et `size`
 * désignent la même dimension.
 *
 * Rien n'est inventé : une dimension inconnue garde son nom normalisé, et deux
 * noms qui ne sont pas synonymes ne fusionnent jamais.
 */

/** Dimensions reconnues. Toute autre clé garde son propre nom normalisé. */
export type AyWebsAttributeDimension = 'size' | 'color';

interface Synonym {
  dimension: AyWebsAttributeDimension;
  /** Test appliqué au nom normalisé (minuscules, sans accents). */
  pattern: RegExp;
}

const SYNONYMS: Synonym[] = [
  {
    dimension: 'size',
    pattern: /^(size|taille|pointure|gross?e|groesse|talla|taglia|misura|maat|rozmiar|storlek|koko|velicina|размер|مقاس|قياس|المقاس|الحجم|size_?eu|size_?us|size_?uk)$/,
  },
  {
    dimension: 'color',
    pattern: /^(colou?r|couleur|farbe|colore|kleur|cor|kolor|farg|цвет|لون|اللون)$/,
  },
];

/** Minuscules, sans accents, espaces compactés : `Größe` → `grosse`. */
export function ayWebsAttributeKey(name: unknown): string {
  return String(name ?? '')
    /* `ß` ne se décompose pas en NFD et restait tel quel : `Größe` ne pouvait
       donc pas rejoindre `grosse`/`size`. */
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

/**
 * La dimension d'un nom d'attribut, ou `null` quand ce n'est pas une dimension
 * reconnue (matière, contenance, « nombre de pièces »… restent distincts).
 */
export function ayWebsAttributeDimension(name: unknown): AyWebsAttributeDimension | null {
  const key = ayWebsAttributeKey(name);
  if (!key) return null;
  for (const entry of SYNONYMS) {
    if (entry.pattern.test(key)) return entry.dimension;
  }
  /* « Size (EU) », « Couleur 1 »… : le premier mot suffit. */
  const first = key.split(' ')[0];
  for (const entry of SYNONYMS) {
    if (first && entry.pattern.test(first)) return entry.dimension;
  }
  return null;
}

/** Les deux noms désignent-ils la même dimension ? */
export function ayWebsSameAttribute(left: unknown, right: unknown): boolean {
  const a = ayWebsAttributeDimension(left);
  const b = ayWebsAttributeDimension(right);
  if (a && b) return a === b;
  const lk = ayWebsAttributeKey(left);
  const rk = ayWebsAttributeKey(right);
  if (!lk || !rk) return false;
  return lk === rk || lk.replace(/\s+/g, '') === rk.replace(/\s+/g, '');
}

/**
 * Traduit une sélection (nom envoyé par le client) vers les noms PUBLIÉS par le
 * serveur. Les noms inconnus de la publication restent tels quels : l'appelant
 * décide quoi en faire (aujourd'hui : métadonnée d'affichage).
 */
export function ayWebsAlignAttributes(
  published: ReadonlyArray<string>,
  attributes: Record<string, string> | null | undefined,
): { aligned: Record<string, string>; unmatched: Record<string, string> } {
  const aligned: Record<string, string> = {};
  const unmatched: Record<string, string> = {};
  if (!attributes) return { aligned, unmatched };
  for (const [rawKey, rawValue] of Object.entries(attributes)) {
    const value = String(rawValue ?? '').trim();
    if (!value) continue;
    const exact = published.find((name) => ayWebsAttributeKey(name) === ayWebsAttributeKey(rawKey));
    if (exact) {
      aligned[exact] = value;
      continue;
    }
    const synonym = published.find((name) => ayWebsSameAttribute(name, rawKey));
    if (synonym) {
      aligned[synonym] = value;
      continue;
    }
    unmatched[rawKey] = value;
  }
  return { aligned, unmatched };
}
