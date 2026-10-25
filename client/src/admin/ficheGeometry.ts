/**
 * APERÇU DE LA FICHE — les cotes de la maquette, côté CRM.
 *
 * ── Pourquoi une copie ──────────────────────────────────────────────────────
 * La maquette `docs/design/cardproduit/mockup-complet-25-10.png` est dessinée en
 * 720 × 1600 px, c'est-à-dire 360 × 800 dp. L'application en tire ses cotes dans
 * `apps/mobile/src/features/product/fiche.ts`. Le CRM ne peut pas importer ce
 * fichier (deux applications, deux `tsconfig`) : il en garde donc une copie
 * **caractère pour caractère**, verrouillée par
 * `tests/fiche-geometry-parity.test.ts` — si l'un bouge sans l'autre, la CI casse.
 *
 * ── Ce que ça garantit au propriétaire ──────────────────────────────────────
 * L'aperçu du CRM n'est pas une « illustration » : c'est la géométrie réelle de
 * l'application. Ce panneau ne contient QUE des cotes techniques — aucun champ de
 * saisie ne les touche. Le propriétaire règle le contenu (titre, prix, libellés,
 * sections, quantité) ; la taille de l'image, des lignes et des boutons reste
 * gelée parce qu'elle vient de la maquette, pas d'un réglage.
 */

export const FICHE_GEOMETRY = {
  /* Écran 1 — photo, nom, prix, description, ligne Taille (px ÷ 2) */
  imageHeight: 581,
  photoDotsBottom: 28,
  dot: 6,
  dotIdle: 5,
  dotPitch: 13,
  gutter: 16,
  nameTop: 12,
  nameSize: 22,
  nameLine: 26,
  priceRight: 17,
  priceSize: 20,
  underlineGap: 5,
  underlineWidth: 2,
  descriptionGap: 2,
  descriptionSize: 15,
  descriptionLine: 17,
  descriptionRight: 8,
  ruleGap: 9,
  hairline: 1,

  /* Ligne « Taille » */
  rowHeight: 49,
  rowLabel: 18,
  rowIcon: 24,
  rowIconStart: 17,
  rowLabelStart: 57,
  chevronEnd: 12,
  chevronSize: 16,

  /* Bande grise */
  band: 9,

  /* En-tête */
  headerHeight: 60,
  headerTitle: 19,
  headerRule: 3,

  /* Bloc Couleur */
  blockTop: 13,
  blockBottom: 26,
  colorLabel: 17,
  colorValueGap: 7,
  colorRowHeight: 40,
  tileTop: 7,
  tileWidth: 68,
  tileHeight: 96,
  tileGap: 8,
  tileRule: 4,
  tileLabelGap: 3,
  tileLabel: 15,

  /* Accordéons */
  accordionHeight: 48,
  accordionLabel: 17,

  /* Blocs d'information */
  infoTop: 12,
  infoTitle: 16,
  infoBody: 15,
  infoLine: 18,
  shareHeight: 51,

  /* Barre d'achat */
  barHeight: 71,
  barPrice: 15,
  barButtonWidth: 207,
  barButtonHeight: 48,
  barButtonRadius: 24,
  barButtonTop: 11,

  /* Feuille de taille */
  sheetTop: 22,
  grabTop: 22,
  grabWidth: 32,
  grabHeight: 4,
  sheetTitleTop: 22,
  sheetTitle: 17,
  sheetTitleLine: 20,
  panelTop: 0,
  panelHeight: 66,
  panelGutter: 16,
  panelIconStart: 16,
  panelTextStart: 61,
  panelText: 15,
  panelLine: 18,
  columnsTop: 18,
  columnHeader: 12,
  rowsTop: 26,
  rowSize: 22,
  sizeRowHeight: 48,
  rowState: 15,
  rowStateEnd: 21,
  rowStateTop: 6,
  rowStrike: 15,
  strikeWidth: 1,

  /* Plein écran */
  viewerTop: 140,
  viewerStageBottom: 98,
  viewerDotsBottom: 36,
  viewerDot: 6,
  viewerDotPitch: 12,
  viewerCloseTop: 27,
  viewerCloseStart: 5,
  viewerCloseSize: 32,

  /** La barre d'achat, zone sûre comprise — la page réserve cette hauteur. */
  ctaHeight: 71,
} as const;

/** Largeur de la maquette : 720 px ÷ 2. L'aperçu se rend à cette largeur, en dp. */
export const FICHE_WIDTH = 360;

/**
 * Ce que le CRM affiche comme « verrous » : les cotes que personne ne règle.
 * Une seule liste, lue dans `FICHE_GEOMETRY` — jamais recopiée à la main.
 */
export const FICHE_LOCKS = [
  { label: 'Photo', value: `${FICHE_GEOMETRY.imageHeight} dp` },
  { label: 'Nom du produit', value: `${FICHE_GEOMETRY.nameSize} dp` },
  { label: 'Ligne « Taille »', value: `${FICHE_GEOMETRY.rowHeight} dp` },
  { label: 'Séparateur gris', value: `${FICHE_GEOMETRY.band} dp` },
  { label: 'Vignette couleur', value: `${FICHE_GEOMETRY.tileWidth} × ${FICHE_GEOMETRY.tileHeight} dp` },
  { label: 'Accordéon', value: `${FICHE_GEOMETRY.accordionHeight} dp` },
  { label: 'Barre d’achat', value: `${FICHE_GEOMETRY.barHeight} dp` },
  {
    label: 'Bouton',
    value: `${FICHE_GEOMETRY.barButtonWidth} × ${FICHE_GEOMETRY.barButtonHeight} dp · r${FICHE_GEOMETRY.barButtonRadius}`,
  },
] as const;
