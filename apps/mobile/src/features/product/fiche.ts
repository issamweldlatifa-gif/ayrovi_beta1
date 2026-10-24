/**
 * GRANDE FICHE — règles pures (24/10/2026).
 *
 * Planche de référence : `docs/design/bigcard/mockup-sticky-24-10.png`
 * (mécanique) + `mockup-gallery-24-10.png` (galerie, sections, feuille de taille).
 *
 * Ce fichier ne dessine rien : il décide. Tout ce qui peut être faux sans se voir
 * à l'écran (seuil de l'en-tête, ordre de la galerie, disparition des sections
 * vides) est ici, donc testable sans monter React Native.
 *
 * ── Les trois règles du propriétaire ────────────────────────────────────────
 *  1. **La photo ne bouge pas**, c'est la feuille blanche qui monte par-dessus
 *     (mécanique `position: sticky` de la planche) : photo fixe de 430, feuille
 *     qui la recouvre de 16, en-tête transparent puis plein.
 *  2. **Une donnée absente disparaît** : un attribut vide, une description vide
 *     ou une section sans contenu ne produit ni ligne, ni « — », ni section
 *     vide. Une section vide est un mensonge poli.
 *  3. **Le prix vient du serveur** : la fiche affiche `finalPrice`, elle ne
 *     recompose jamais un total.
 *
 * Décisions du 24/10 : CTA **noir** (pas violet), photo **430**, trois sections
 * possibles (Caractéristiques · Description · Détail du prix), chacune masquée
 * si elle n'a rien à montrer.
 */
import type { CatalogAttribute } from '@/api/catalog';

export const FICHE = {
  /** Hauteur de la photo. Décision du propriétaire : 430 (et non 380). */
  imageHeight: 430,
  /** Hauteur de l'en-tête transparent (même cote que le reste de l'app). */
  headerHeight: 54,
  /** La feuille recouvre la photo de 16 : les coins arrondis se voient. */
  overlap: 16,
  /** Rayon du haut de la feuille. */
  sheetRadius: 20,
  /** Hauteur de la barre d'achat fixe, hors zone sûre. */
  ctaHeight: 64,
  /** Diamètre d'un point de galerie. */
  dot: 6,
  /** Marge intérieure de la feuille. */
  gutter: 16,
  /** Écart entre deux blocs de la feuille. */
  blockGap: 20,
} as const;

/**
 * L'en-tête devient-il plein ?
 *
 * Il bascule quand la feuille atteint le bas de l'en-tête : la photo commence à
 * sortir par le haut. Avant, l'en-tête flotte sur l'image (transparent).
 */
export function headerIsSolid(offsetY: number): boolean {
  return offsetY >= FICHE.imageHeight - FICHE.headerHeight - FICHE.overlap;
}

/** Progression 0→1 de l'en-tête, pour un fond interpolé sans saut visible. */
export function headerProgress(offsetY: number): number {
  const start = FICHE.imageHeight - FICHE.headerHeight - FICHE.overlap - 40;
  const end = FICHE.imageHeight - FICHE.headerHeight - FICHE.overlap;
  if (!Number.isFinite(offsetY) || offsetY <= start) return 0;
  if (offsetY >= end) return 1;
  return (offsetY - start) / (end - start);
}

/** Décalage de la feuille : elle recouvre la photo de `overlap`. */
export function sheetOffset(): number {
  return FICHE.imageHeight - FICHE.overlap;
}

export type GalleryKind = 'image' | 'video';

export interface GalleryItem {
  kind: GalleryKind;
  url: string;
}

/**
 * Galerie : les photos d'abord, la vidéo ensuite — une seule liste pour la
 * visionneuse (mêmes gestes pour une photo et pour une vidéo, comme sur la
 * planche galerie). Les vides et les doublons sortent.
 */
export function galleryItems(images: string[], videos: string[] = []): GalleryItem[] {
  const seen = new Set<string>();
  const out: GalleryItem[] = [];
  for (const [kind, list] of [['image', images], ['video', videos]] as Array<[GalleryKind, string[]]>) {
    for (const raw of list) {
      const url = String(raw ?? '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ kind, url });
    }
  }
  return out;
}

export interface SpecRow {
  key: string;
  label: string;
  value: string;
}

/**
 * Lignes de la section « Caractéristiques ».
 *
 * Le libellé vient du CRM (`catalogue_attributes.label`). Sans valeur, la ligne
 * n'existe pas. Deux attributs qui porteraient le même libellé restent deux
 * lignes distinctes (la clé les sépare) : on ne fusionne jamais deux faits.
 */
export function specRows(attributes: CatalogAttribute[] | null | undefined): SpecRow[] {
  const out: SpecRow[] = [];
  const seen = new Set<string>();
  for (const attribute of attributes ?? []) {
    const key = String(attribute?.key ?? '').trim();
    const value = String(attribute?.value ?? '').trim();
    if (!key || !value || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: String(attribute?.label ?? '').trim() || key, value });
  }
  return out;
}

/**
 * Sections d'affichage, dans l'ordre du CRM. Le nom vient de la DONNÉE
 * (`catalogue_attributes.section`) : une famille peut donc ajouter sa propre
 * section sans qu'on touche à l'écran.
 */
export const ATTRIBUTE_SECTION_ORDER = ['identite', 'matiere', 'mesures', 'technique', 'beaute', 'pratique'] as const;

export type AttributeSectionKey =
  | 'product.section.identite'
  | 'product.section.matiere'
  | 'product.section.mesures'
  | 'product.section.technique'
  | 'product.section.beaute'
  | 'product.section.pratique'
  | 'product.specs';

/** Clé i18n d'une section ; une section inconnue (ou vide) tombe dans « الخصائص ». */
export function sectionLabelKey(section: string): AttributeSectionKey {
  switch (String(section ?? '').trim()) {
    case 'identite': return 'product.section.identite';
    case 'matiere': return 'product.section.matiere';
    case 'mesures': return 'product.section.mesures';
    case 'technique': return 'product.section.technique';
    case 'beaute': return 'product.section.beaute';
    case 'pratique': return 'product.section.pratique';
    default: return 'product.specs';
  }
}

export interface SpecGroup {
  /** Slug de la section (`matiere`, `mesures`…) ou `specs` pour le fourre-tout. */
  section: string;
  rows: SpecRow[];
}

/**
 * Regroupe les attributs par section, dans l'ordre convenu, et **jette les
 * sections vides**. L'ordre d'un groupe est celui du CRM (`sortOrder`), pas un
 * ordre alphabétique : deux attributs voisins à l'écran restent voisins.
 */
export function specGroups(attributes: CatalogAttribute[] | null | undefined): SpecGroup[] {
  const known = new Set<string>(ATTRIBUTE_SECTION_ORDER);
  const bySection = new Map<string, SpecRow[]>();
  for (const attribute of attributes ?? []) {
    const value = String(attribute?.value ?? '').trim();
    const key = String(attribute?.key ?? '').trim();
    if (!value || !key) continue;
    const raw = String(attribute?.section ?? '').trim();
    const section = known.has(raw) ? raw : 'specs';
    const rows = bySection.get(section) ?? [];
    if (rows.some((row) => row.key === key)) continue;
    rows.push({ key, label: String(attribute?.label ?? '').trim() || key, value });
    bySection.set(section, rows);
  }
  const order = [...ATTRIBUTE_SECTION_ORDER, 'specs'];
  return order
    .filter((section) => (bySection.get(section) ?? []).length > 0)
    .map((section) => ({ section, rows: bySection.get(section)! }));
}

/** Ce que la fiche a réellement à montrer — une section vide n'existe pas. */
export interface FicheSections {
  specs: boolean;
  description: boolean;
  priceDetail: boolean;
}

export function ficheSections(input: {
  attributes?: CatalogAttribute[] | null;
  description?: string | null;
  /** Le détail du prix existe dès qu'un prix publié existe. */
  hasPrice?: boolean;
}): FicheSections {
  return {
    specs: specRows(input.attributes).length > 0,
    description: Boolean(String(input.description ?? '').trim()),
    priceDetail: input.hasPrice === true,
  };
}

/**
 * Tailles de la feuille de choix : on garde **l'ordre du serveur** et on marque
 * les valeurs épuisées sans les retirer — un client qui cherche son 40 doit
 * voir que le 40 est épuisé, pas croire qu'il n'a jamais existé.
 */
export interface SizeChoice {
  value: string;
  available: boolean;
  stock: number | null;
}

export function sizeChoices(
  dimensions: Array<{ key: string; values: SizeChoice[] }> | null | undefined,
): SizeChoice[] {
  const size = (dimensions ?? []).find((dimension) => dimension.key === 'size');
  return size ? size.values : [];
}

/** Le choix est-il complet pour partir au panier ? */
export function selectionReady(needsSize: boolean, needsColor: boolean, size: string, color: string): boolean {
  return (!needsSize || Boolean(size)) && (!needsColor || Boolean(color));
}
