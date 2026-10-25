/**
 * BROUILLON DE LA FICHE — les règles pures de l'éditeur produit.
 *
 * Ce fichier ne touche ni au DOM ni au réseau : il décide seulement *ce qui sera
 * écrit*. C'est la partie qu'on peut prouver par des tests (voir
 * `tests/fiche-draft.test.ts`), parce que c'est là que se cachent les erreurs
 * silencieuses : une liste de tailles mal découpée, un SKU impossible, une
 * variante recréée deux fois, un libellé vide publié comme s'il existait.
 *
 * Rappel de la maquette : les COTES ne sont pas ici (elles sont gelées dans
 * `ficheGeometry.ts`). Ici, uniquement le CONTENU.
 */

/** Nombre maximal de valeurs dans une liste saisie (tailles, couleurs). */
export const TOKEN_LIST_MAX = 30;
/** Longueur maximale d'une valeur (même limite que la fiche côté serveur). */
export const TOKEN_MAX = 40;

/**
 * Découpe une saisie libre en valeurs propres.
 * « 39, 40   41 » et « 39 40 41 » et « 39\n40\n41 » donnent la même chose :
 * trois tailles. Les doublons (insensibles à la casse) disparaissent, l'ordre de
 * saisie est conservé, et une valeur vide n'existe pas.
 */
export function tokenList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text ?? '').split(/[,;\n\r\t]+|\s{2,}|\s+/)) {
    const value = raw.replace(/\s+/g, ' ').trim().slice(0, TOKEN_MAX);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= TOKEN_LIST_MAX) break;
  }
  return out;
}

/** Partie « SKU » d'un texte : A-Z, 0-9, « . », « _ », « - », majuscules. */
function skuPart(text: string, fallback: string): string {
  const part = String(text ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
  return part || fallback;
}

/**
 * SKU d'une variante : base du produit + taille + couleur.
 * Un SKU vide n'existe jamais (le serveur refuse), et deux produits ne peuvent
 * pas produire le même préfixe : le slug du produit est unique.
 */
export function skuFor(baseSku: string, size: string, color: string, sizeIndex = 0, colorIndex = 0): string {
  const head = skuPart(baseSku, 'PRD').slice(0, 40);
  const parts = [head];
  if (size.trim()) parts.push(skuPart(size, `S${sizeIndex + 1}`));
  if (color.trim()) parts.push(skuPart(color, `C${colorIndex + 1}`));
  const sku = parts.join('-').slice(0, 64).replace(/[-._]+$/g, '');
  // Un SKU d'un seul caractère est refusé par le serveur (2 minimum).
  return sku.length >= 2 ? sku : `${sku}X`;
}

export interface VariantPlanEntry {
  sku: string;
  size: string;
  color: string;
}

/**
 * Variantes à CRÉER pour que la fiche montre les tailles et les couleurs saisies.
 *
 * Le produit cartésien tailles × couleurs est créé, moins les couples qui
 * existent déjà : enregistrer deux fois la même fiche ne crée pas de doublon,
 * et retirer une taille de la liste n'archive rien (supprimer une variante est un
 * geste explicite, il n'a pas sa place dans un formulaire de contenu).
 *
 * Aucune taille et aucune couleur ⇒ aucune variante : la fiche n'affichera ni
 * ligne « Taille » ni bloc couleur, elle ne montrera pas de choix vide.
 */
export function variantPlan(
  existing: ReadonlyArray<{ size?: string | null; color?: string | null }>,
  sizes: string[],
  colors: string[],
  baseSku: string,
): VariantPlanEntry[] {
  // Aucun axe déclaré ⇒ aucune variante : on ne crée pas une ligne vide.
  if (sizes.length === 0 && colors.length === 0) return [];
  const have = new Set(
    (existing ?? []).map((variant) => `${String(variant?.size ?? '').trim().toLowerCase()}|${String(variant?.color ?? '').trim().toLowerCase()}`),
  );
  const sizeAxis = sizes.length > 0 ? sizes : [''];
  const colorAxis = colors.length > 0 ? colors : [''];
  const plan: VariantPlanEntry[] = [];
  const usedSku = new Set<string>();
  sizeAxis.forEach((size, sizeIndex) => {
    colorAxis.forEach((color, colorIndex) => {
      const key = `${size.trim().toLowerCase()}|${color.trim().toLowerCase()}`;
      if (have.has(key)) return;
      let sku = skuFor(baseSku, size, color, sizeIndex, colorIndex);
      let attempt = 2;
      while (usedSku.has(sku)) {
        sku = `${skuFor(baseSku, size, color, sizeIndex, colorIndex).slice(0, 60)}-${attempt}`;
        attempt += 1;
      }
      usedSku.add(sku);
      plan.push({ sku, size, color });
    });
  });
  return plan;
}

/**
 * Vignettes du bloc couleur — même règle que l'application
 * (`colorTiles` dans `apps/mobile/src/features/product/fiche.ts`) : une seule
 * couleur déclarée n'est pas un choix, donc pas de bande de vignettes ; et une
 * couleur sans photo propre s'affiche en pastille nommée, jamais avec la photo
 * d'une autre couleur.
 */
export function colorTiles(colors: string[], imageByColor: Record<string, string> = {}): Array<{ color: string; image: string | null }> {
  if (colors.length < 2) return [];
  return colors.map((color) => {
    const image = String(imageByColor[color] ?? '').trim();
    return { color, image: image ? image : null };
  });
}

/** Slugs et libellés de section : le libellé vide n'est pas publié. */
export function cleanSectionLabels(labels: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, label] of Object.entries(labels ?? {})) {
    const key = String(slug ?? '').trim();
    const text = String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, TOKEN_MAX);
    if (!key || !text) continue;
    out[key] = text;
  }
  return out;
}

/**
 * Charge utile `fiche_labels` : les clés absentes le restent (l'application
 * retombe alors sur son propre mot), jamais une chaîne vide qui écraserait le
 * libellé de l'application par du néant.
 */
export function ficheLabelsPayload(size: string, color: string, sections: Record<string, string>) {
  const payload: { size?: string; color?: string; sections?: Record<string, string> } = {};
  const sizeLabel = String(size ?? '').replace(/\s+/g, ' ').trim().slice(0, TOKEN_MAX);
  const colorLabel = String(color ?? '').replace(/\s+/g, ' ').trim().slice(0, TOKEN_MAX);
  if (sizeLabel) payload.size = sizeLabel;
  if (colorLabel) payload.color = colorLabel;
  const cleaned = cleanSectionLabels(sections);
  if (Object.keys(cleaned).length > 0) payload.sections = cleaned;
  return payload;
}

/**
 * Un prix de vente affichable : un nombre fini, strictement positif, arrondi au
 * centime. `null` sinon — et publier sans prix est refusé (une fiche sans prix
 * n'est pas commandable : le serveur répond `NO_PRICE`).
 */
export function salePrice(value: string | number): number | null {
  const raw = String(value ?? '').replace(',', '.').trim();
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 100) / 100;
}
