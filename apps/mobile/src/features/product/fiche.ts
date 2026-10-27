/**
 * GRANDE FICHE — règles et cotes (réécrite le 25/10/2026, maquette `mockup-complet-25-10.png`).
 *
 * ── D'où viennent les nombres ───────────────────────────────────────────────
 * La maquette est dessinée en 720 × 1600 px, c'est-à-dire **360 × 800 dp** : tout
 * ce fichier divise les pixels de la maquette par deux. Chaque constante porte son
 * origine en commentaire, pour qu'une cote ne puisse pas dériver sans qu'on le voie.
 *
 * ── Les quatre écrans de la maquette ────────────────────────────────────────
 *  1. fiche, position haute : photo + nom souligné + prix + description + ligne « Taille » ;
 *  2. fiche, après défilement : Couleur + vignettes + trois accordéons + livraison + retours + partager ;
 *  3. feuille de taille : recommandation lavande + une ligne par taille du CRM ;
 *  4. photo plein écran : blanc, croix, photo contenue, points.
 *
 * ── Ce qui n'existe plus (décision du propriétaire, 25/10/2026) ─────────────
 *  • **aucun « prix conseillé »**, aucune remise, aucun prix barré, aucune pastille
 *    de pourcentage : un seul prix, celui du serveur ;
 *  • **aucun compte à rebours** de campagne dans la barre d'achat.
 *
 * ── Les règles qui restent ──────────────────────────────────────────────────
 *  • **une donnée absente disparaît** : pas de description ⇒ pas de ligne, pas de
 *    couleur déclarée ⇒ pas de bloc Couleur, pas de deuxième taille ⇒ pas de
 *    feuille de taille (une ligne informative suffit) ;
 *  • **le prix vient du serveur** (`finalPrice`), la fiche ne compose rien ;
 *  • **rien n'est deviné** : une photo de couleur vient du média de la variante,
 *    jamais d'une autre couleur ; une date de livraison vient du délai du CRM.
 */
import type { CatalogAttribute, ProductSheet, SheetDimension, SheetVariant } from '@/api/catalog';

/* ── Cotes de la maquette (px ÷ 2 = dp) ───────────────────────────────────── */

export const FICHE = {
  /* Écran 1 — photo, nom, prix, description, ligne Taille */
  imageHeight: 581,        // 1162 px : bas de la photo
  photoDotsBottom: 28,     // 1162 − 1106 = 56 px sous les points
  dot: 6,                  // 12 px (point actif)
  dotIdle: 5,              // 10 px
  dotPitch: 13,            // 26 px entre deux points
  gutter: 16,              // 32 px : marge de tout l'écran
  nameTop: 12,             // 1186 − 1162 = 24 px sous la photo
  nameSize: 22,            // 44 px
  nameLine: 26,            // interligne du nom : 44 px de corps, 52 px de ligne
  priceRight: 17,          // 34 px : le prix finit à 17 dp du bord
  priceSize: 20,           // 40 px gras, sur la même ligne que le nom
  underlineGap: 5,         // le filet tombe 5 dp sous le texte
  underlineWidth: 2,       // 4 px
  descriptionGap: 2,       // 1256 − (1249 + 2) ≈ 2 dp
  descriptionSize: 15,     // 30 px
  descriptionLine: 17,     // 1290 − 1256 = 34 px
  descriptionRight: 8,     // 16 px entre le texte et la colonne du prix
  ruleGap: 9,              // 1342 − 1324 = 18 px : filet fin avant « Taille »
  hairline: 1,             // 2 px

  /* Ligne « Taille » (et toute ligne de même facture) */
  rowHeight: 49,           // 1342 → 1440 = 98 px
  rowLabel: 18,            // 36 px
  rowIcon: 24,             // l'icône fait 26 × 48 px
  rowIconStart: 17,        // 46 px → 23 dp : la boîte de 24 dp commence à 17
  rowLabelStart: 57,       // 114 px
  chevronEnd: 12,          // la pointe est à 340 dp, la boîte finit à 348
  chevronSize: 16,         // 26 px de large

  /* Bande grise : le séparateur « plus gros que les autres lignes » */
  band: 9,                 // 18 px

  /* En-tête (écran 2) */
  headerHeight: 60,        // 0 → 173 px (zone sûre exclue)
  headerTitle: 19,         // 38 px
  headerRule: 3,           // 173 → 179 px

  /* Bloc Couleur */
  blockTop: 13,            // 157 − 143.5 = 27 px
  blockBottom: 26,         // 321 → 347 : la respiration avant la bande grise
  colorLabel: 17,          // 34 px
  colorValueGap: 7,        // 14 px entre « Couleur » et sa valeur
  colorRowHeight: 40,      // la ligne « Couleur » avant les vignettes
  tileTop: 7,              // 407 px : les vignettes sous la ligne
  tileWidth: 68,           // 137 px
  tileHeight: 96,          // 192 px
  tileGap: 8,              // 17 px entre deux vignettes
  tileRule: 4,             // 8 px de soulignement violet
  tileLabelGap: 3,         // 606 → 612 px
  tileLabel: 15,           // 30 px

  /* Accordéons (une section d'attributs = un accordéon) */
  accordionHeight: 48,     // 710 → 806 = 96 px
  accordionLabel: 17,      // 34 px

  /* Blocs d'information (livraison, retours) */
  infoTop: 12,             // 1026 − 1018 = 8 px de respiration
  infoTitle: 16,           // 32 px
  infoBody: 15,            // 30 px
  infoLine: 18,            // 36 px de rythme entre deux lignes
  shareHeight: 51,         // 1352 → 1454 = 102 px

  /* Barre d'achat (écrans 1 et 2) */
  barHeight: 71,           // 1458 → 1600 = 142 px
  barPrice: 15,            // 30 px gras
  barButtonWidth: 207,     // 290 → 703 px = 413 px
  barButtonHeight: 48,     // 1480 → 1575 = 95 px
  barButtonRadius: 24,     // rayon 47 px
  barButtonTop: 11,        // 1480 − 1458 = 22 px

  /* Feuille de taille (écran 3) */
  sheetTop: 22,            // 45 px : le voile au-dessus de la feuille
  grabTop: 22,             // 89 px
  grabWidth: 32,           // 328 → 391 px = 63 px
  grabHeight: 4,           // 8 px
  sheetTitleTop: 22,       // 140 px : 47,5 dp sous le haut de la feuille, moins la poignée
  sheetTitle: 17,          // 34 px
  sheetTitleLine: 20,      // interligne du titre de la feuille
  panelTop: 0,             // 181 px : la dalle suit le titre de la feuille
  panelHeight: 66,         // 181 → 313 = 132 px
  panelGutter: 16,         // 32 px de chaque côté
  panelIconStart: 16,      // 64 px
  panelTextStart: 61,      // 154 px (mesuré depuis le bord de la dalle)
  panelText: 15,           // 30 px
  panelLine: 18,           // 252 − 216 = 36 px
  columnsTop: 18,          // 348 px − bas de la dalle
  columnHeader: 12,        // 24 px
  rowsTop: 26,             // 430 px − les en-têtes
  rowSize: 22,             // 44 px
  sizeRowHeight: 48,       // 96 px : les 12 lignes tiennent sur un écran de 800 dp
  rowState: 15,            // 30 px
  rowStateEnd: 21,         // 677 px → 338.5 dp
  rowStateTop: 6,          // base_y + 4 − 430 : l'état descend avec la taille
  rowStrike: 15,           // la barre du barré tombe au milieu du chiffre
  strikeWidth: 1,          // 3 px

  /* Plein écran (écran 4) */
  viewerTop: 140,          // 280 px : haut de la bande photo
  viewerStageBottom: 98,   // 758 − 660 = 98 dp entre la bande et les points
  viewerDotsBottom: 36,    // 800 − 764 = 36 dp sous les points
  viewerDot: 6,            // 12 px
  viewerDotPitch: 12,      // 24 px
  viewerCloseTop: 27,      // 82 px
  viewerCloseStart: 5,     // 37 px
  // La croix de la visionneuse ne porte plus de cote : elle suit `theme.iconSize.md`.

  /** La barre d'achat, zone sûre comprise — la page réserve cette hauteur. */
  ctaHeight: 71,
} as const;

/* ── En-tête : transparent sur la photo, plein dès qu'elle est sortie ─────── */

/** L'en-tête devient-il plein ? (la photo a quitté le haut de l'écran) */
export function headerIsSolid(offsetY: number): boolean {
  return offsetY >= FICHE.imageHeight - FICHE.headerHeight;
}

/** Progression 0→1 du fond de l'en-tête, sur les 40 dp qui précèdent. */
export function headerProgress(offsetY: number): number {
  const end = FICHE.imageHeight - FICHE.headerHeight;
  const start = end - 40;
  if (!Number.isFinite(offsetY) || offsetY <= start) return 0;
  if (offsetY >= end) return 1;
  return (offsetY - start) / (end - start);
}

/**
 * Libellé d'un bloc : ce que le CRM a écrit, sinon celui de l'application.
 *
 * Une chaîne vide n'est pas un libellé — elle laisse la place au texte de
 * l'application. Le CRM ne peut donc pas « effacer » un nom par accident.
 */
export function pickLabel(fromCrm: string | null | undefined, fallback: string): string {
  const text = String(fromCrm ?? '').trim();
  return text || fallback;
}

/* ── Galerie ──────────────────────────────────────────────────────────────── */

export type GalleryKind = 'image' | 'video';

export interface GalleryItem {
  kind: GalleryKind;
  url: string;
}

/**
 * Galerie : les photos d'abord, la vidéo ensuite — une seule liste pour les
 * points de la fiche et pour la visionneuse plein écran. Les vides et les
 * doublons sortent.
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

/* ── Caractéristiques : une section par famille du CRM ─────────────────────── */

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

/**
 * L'icône officielle (Ionicons, la famille embarquée du projet) de chaque
 * section. Une section inconnue prend l'étiquette générique : aucune ligne de la
 * fiche ne se retrouve sans icône.
 */
export type SectionIcon = 'pricetag-outline' | 'shirt-outline' | 'body-outline'
  | 'construct-outline' | 'sparkles-outline' | 'shield-checkmark-outline' | 'list-outline';

export function sectionIcon(section: string): SectionIcon {
  switch (String(section ?? '').trim()) {
    case 'identite': return 'pricetag-outline';
    case 'matiere': return 'shirt-outline';
    case 'mesures': return 'body-outline';
    case 'technique': return 'construct-outline';
    case 'beaute': return 'sparkles-outline';
    case 'pratique': return 'shield-checkmark-outline';
    default: return 'list-outline';
  }
}

export interface SpecGroup {
  /** Slug de la section (`matiere`, `mesures`…) ou `specs` pour le fourre-tout. */
  section: string;
  /** Nom écrit par le CRM (`ficheLabels.sections[slug]`), sinon `null`. */
  title: string | null;
  rows: SpecRow[];
}

/**
 * Regroupe les attributs par section, **dans l'ordre du CRM**, et jette les
 * sections vides. Une section inventée dans le CRM (`section: "matiere_bio"`)
 * garde son propre bloc : c'est le propriétaire qui décide du découpage, pas une
 * liste écrite ici. L'ordre d'un groupe est celui du CRM (`sortOrder`).
 */
export function specGroups(
  attributes: CatalogAttribute[] | null | undefined,
  labels?: Record<string, string> | null,
): SpecGroup[] {
  const known = new Set<string>(ATTRIBUTE_SECTION_ORDER);
  const bySection = new Map<string, SpecRow[]>();
  const order: string[] = [];
  for (const attribute of attributes ?? []) {
    const value = String(attribute?.value ?? '').trim();
    const key = String(attribute?.key ?? '').trim();
    if (!value || !key) continue;
    const raw = String(attribute?.section ?? '').trim();
    const section = known.has(raw) || raw ? raw : 'specs';
    const rows = bySection.get(section) ?? [];
    if (rows.some((row) => row.key === key)) continue;
    if (rows.length === 0) order.push(section);
    rows.push({ key, label: String(attribute?.label ?? '').trim() || key, value });
    bySection.set(section, rows);
  }
  /** Les six sections connues d'abord (ordre du design), les autres ensuite. */
  const sorted = [
    ...ATTRIBUTE_SECTION_ORDER.filter((section) => bySection.has(section)),
    ...order.filter((section) => !known.has(section) && section !== 'specs'),
  ];
  if (bySection.has('specs') && !sorted.includes('specs')) sorted.push('specs');
  return sorted.map((section) => ({
    section,
    title: String(labels?.[section] ?? '').trim() || null,
    rows: bySection.get(section)!,
  }));
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

/* ── Choix : taille, couleur ──────────────────────────────────────────────── */

/**
 * Tailles de la feuille : on garde **l'ordre du serveur** et on marque les
 * valeurs épuisées sans les retirer — un client qui cherche son 40 doit voir que
 * le 40 est épuisé, pas croire qu'il n'a jamais existé.
 */
export interface SizeChoice {
  value: string;
  available: boolean;
  stock: number | null;
}

/** Une ligne de la feuille de taille, telle qu'elle s'affiche. */
export interface SizeRow extends SizeChoice {
  /** « Dernier article » — seulement quand le stock restant vaut exactement 1. */
  state: 'last' | null;
}

export function sizeChoices(
  dimensions: Array<{ key: string; values: SizeChoice[] }> | null | undefined,
): SizeChoice[] {
  const size = (dimensions ?? []).find((dimension) => dimension.key === 'size');
  return size ? size.values : [];
}

/**
 * Les lignes de la feuille de taille. L'état « dernier article » est une
 * **lecture du stock du serveur** (`stock === 1`), jamais une décoration : sans
 * ligne de stock, `stock` vaut `null` et aucun état n'est annoncé.
 */
export function sizeRows(choices: SizeChoice[] | null | undefined): SizeRow[] {
  return (choices ?? []).map((choice) => ({
    value: choice.value,
    available: choice.available,
    stock: choice.stock,
    state: choice.stock === 1 ? 'last' : null,
  }));
}

/** Une seule taille déclarée ⇒ aucun choix : la ligne informative remplace la feuille. */
export function hasSizeChoice(choices: SizeChoice[] | null | undefined): boolean {
  return (choices ?? []).length > 1;
}

/** Le produit n'a qu'une taille : on l'annonce, on n'ouvre pas de feuille. */
export function singleSize(choices: SizeChoice[] | null | undefined): string | null {
  const list = choices ?? [];
  return list.length === 1 ? list[0].value : null;
}

/**
 * Vignettes de couleur (écran 2).
 *
 * La photo vient du **média de la variante** (`catalogue_media.variant_id`, publié
 * par la fiche comme `variant.images`). Si le CRM n'a pas rattaché de photo à la
 * couleur, la vignette reste le nom de la couleur — on n'emprunte jamais la photo
 * d'une autre couleur pour faire joli.
 */
export interface ColorTile {
  color: string;
  available: boolean;
  /** Première photo de la couleur, ou `null` quand le CRM n'en déclare pas. */
  image: string | null;
}

export function colorTiles(
  sheet: Pick<ProductSheet, 'dimensions' | 'variants'> | null | undefined,
): ColorTile[] {
  const values = (sheet?.dimensions ?? []).find((dimension) => dimension.key === 'color')?.values ?? [];
  if (values.length < 2) return [];
  const variants: SheetVariant[] = sheet?.variants ?? [];
  return values.map((value) => {
    const matching = variants.filter((variant) => variant.color === value.value);
    const withImage = matching.find((variant) => (variant.images ?? []).length > 0);
    return {
      color: value.value,
      available: value.available,
      image: withImage?.images?.[0] ?? null,
    };
  });
}

/** Valeur unique d'une dimension — `''` quand il y a un vrai choix à faire. */
export function singleDimensionValue(
  dimensions: SheetDimension[] | null | undefined,
  key: 'size' | 'color',
): string {
  const values = (dimensions ?? []).find((dimension) => dimension.key === key)?.values ?? [];
  return values.length === 1 ? values[0].value : '';
}

/** Le choix est-il complet pour partir au panier ? */
export function selectionReady(needsSize: boolean, needsColor: boolean, size: string, color: string): boolean {
  return (!needsSize || Boolean(size)) && (!needsColor || Boolean(color));
}

/**
 * Jours ouvrés : la Tunisie travaille du lundi au vendredi. Une date de
 * livraison qui tomberait un samedi serait une promesse qu'on ne peut pas tenir.
 */
export function addBusinessDays(from: Date, count: number): Date {
  const date = new Date(from.getTime());
  let left = Math.max(0, Math.floor(count));
  while (left > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return date;
}

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const;
const MONTHS_AR = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] as const;

/** « 30 octobre » — deux mots, sans dépendre d'`Intl`. */
export function formatDay(date: Date, locale: 'fr' | 'ar'): string {
  const months = locale === 'ar' ? MONTHS_AR : MONTHS_FR;
  return `${date.getDate()} ${months[date.getMonth()] ?? ''}`.trim();
}

/**
 * Fenêtre de livraison affichée sous « Livraison rapide ».
 *
 * Le délai vient **du CRM** (`delivery_delay`, par exemple « 5 à 8 jours
 * ouvrés ») ; l'écran n'ajoute que la date du jour. Aucun nombre lisible ⇒
 * `null`, et la ligne de dates disparaît : on n'annonce pas une date inventée.
 */
export function deliveryWindow(
  delay: string | null | undefined,
  now: Date,
  locale: 'fr' | 'ar',
): { from: string; to: string } | null {
  const numbers = String(delay ?? '').match(/\d+/g)?.map(Number).filter((value) => Number.isFinite(value)) ?? [];
  if (numbers.length === 0) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return {
    from: formatDay(addBusinessDays(now, min), locale),
    to: formatDay(addBusinessDays(now, max), locale),
  };
}

/** « 30 octobre - 04 novembre » — la ligne telle qu'elle s'écrit. */
export function deliveryLine(
  delay: string | null | undefined,
  now: Date,
  locale: 'fr' | 'ar',
): string | null {
  const window = deliveryWindow(delay, now, locale);
  return window ? `${window.from} - ${window.to}` : null;
}
