/**
 * MODÈLES DE PUBLICATION (refonte du 13/11/2026).
 *
 * La page Publication de l'application ne montre plus un fil de posts sociaux :
 * elle empile des **blocs** composés dans le CRM, d'après les planches Zalando
 * fournies par le propriétaire. Trois modèles, tous pilotés par le CRM :
 *
 *  • `container`      — bandeau de couleur (titre 2 lignes) puis panneau d'une
 *                       teinte voisine portant une rangée horizontale de cartes
 *                       produit (photo, marque, nom, prix) ; image large facultative.
 *  • `media`          — un média pleine largeur (image OU vidéo : le même modèle
 *                       sert les deux) puis, juste dessous, une rangée de photos
 *                       produit ; titre et sous-titre sous la rangée.
 *  • `sponsored_pair` — deux cartes de MÊME taille côte à côte : à gauche une
 *                       image avec un encart coloré « Sponsorisé / titre /
 *                       sous-titre », à droite une carte produit.
 *
 * Règles fixées par le propriétaire :
 *  • la couleur de fond se choisit dans le CRM avec une palette complète ;
 *  • aucun bouton d'interaction (réaction, commentaire, partage, suivre) pour
 *    l'instant ; la carte « Découvrir plus » est reportée ;
 *  • l'éditeur affiché est toujours « zayrovi team ».
 *
 * Ce module est PUR (aucune base, aucun React) : le serveur, le CRM et
 * l'application lisent les mêmes bornes et les mêmes calculs de couleur.
 */

export const PUBLICATION_BLOCK_KINDS = ['container', 'media', 'sponsored_pair'] as const;
export type PublicationBlockKind = (typeof PUBLICATION_BLOCK_KINDS)[number];

export const PUBLICATION_BLOCK_MEDIA_TYPES = ['image', 'video'] as const;
export type PublicationBlockMediaType = (typeof PUBLICATION_BLOCK_MEDIA_TYPES)[number];

/** Nom d'éditeur affiché sur chaque bloc (consigne du propriétaire, en minuscules). */
export const PUBLICATION_PUBLISHER_NAME = 'zayrovi team';

export const PUBLICATION_BLOCK_LIMITS = {
  title: 80,
  subtitle: 120,
  /** Nombre maximal de blocs actifs renvoyés par la lecture publique. */
  publicBlocks: 40,
  products: {
    container: { min: 1, max: 12 },
    media: { min: 1, max: 12 },
    sponsored_pair: { min: 1, max: 1 },
  },
} as const satisfies {
  title: number;
  subtitle: number;
  publicBlocks: number;
  products: Record<PublicationBlockKind, { min: number; max: number }>;
};

/** Libellés du CRM (français, langue de la console). */
export const PUBLICATION_BLOCK_KIND_LABELS: Record<PublicationBlockKind, string> = {
  container: 'Conteneur coloré + rangée de produits',
  media: 'Image ou vidéo + rangée de produits',
  sponsored_pair: 'Duo sponsorisé (image + carte produit)',
};

/**
 * Encres de l'écran public (texte foncé / papier des cartes). L'application les
 * lit dans ses jetons ; l'aperçu du CRM, qui simule ce même écran, les lit ici.
 */
export const PUBLICATION_PREVIEW_INK = '#111111';
export const PUBLICATION_PREVIEW_PAPER = '#FFFFFF';

/** Couleur de fond proposée par défaut quand le CRM n'en donne pas. */
export const PUBLICATION_BLOCK_DEFAULT_COLOR: Record<PublicationBlockKind, string> = {
  container: '#F2AD11',
  media: '#FFFFFF',
  sponsored_pair: '#4262AD',
};

/**
 * Nuancier rapide du CRM : teintes relevées sur les planches (jaune Vans
 * #F2AD11, rouge adidas, bleu Fred Perry #4262AD, jaune GUESS…) + neutres.
 * Ce n'est qu'un raccourci : le sélecteur complet accepte toute couleur.
 */
export const PUBLICATION_BLOCK_SWATCHES = [
  '#FFFFFF', '#F4F4F4', '#E9E4DC', '#111111',
  '#F2AD11', '#F4C430', '#E4572E', '#D7263D',
  '#8B1A2B', '#4262AD', '#1F3A5F', '#2E7D5B',
  '#C9E4DE', '#F7D6E0', '#B39DDB', '#6D4C41',
] as const;

/* ── Couleurs ─────────────────────────────────────────────────────────────── */

/** `#abc`, `#AABBCC` (avec ou sans #) → `#AABBCC` ; sinon `null`. */
export function normalizeHexColor(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim().replace(/^#/, '') : '';
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split('').map((c) => c + c).join('').toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHexColor(hex) ?? '#FFFFFF';
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Luminance relative WCAG 2.x (0 = noir, 1 = blanc). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mélange `hex` avec `target` (0 = inchangé, 1 = `target`). */
export function mixColor(hex: string, target: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/**
 * Encre lisible sur un fond : celle des deux (`dark`, `light`) qui contraste le
 * plus. Le CRM choisit une couleur ; le texte suit, sans réglage à oublier.
 */
export function readableInk(background: string, dark: string, light: string): string {
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

/**
 * Panneau du modèle `container` quand le CRM ne fixe pas sa couleur : même
 * teinte que le bandeau, éclaircie sur un fond clair (planche Vans : #F2AD11 →
 * #FACF67, ≈ 40 % de blanc) et assombrie sur un fond soutenu (planche adidas :
 * rouge vif → bordeaux, ≈ 40 % de noir).
 */
export function containerPanelColor(background: string): string {
  const bg = normalizeHexColor(background) ?? PUBLICATION_BLOCK_DEFAULT_COLOR.container;
  return relativeLuminance(bg) >= 0.3 ? mixColor(bg, '#FFFFFF', 0.4) : mixColor(bg, '#000000', 0.4);
}

/** Un fond « blanc » ne demande ni marge colorée ni encadré. */
export function isNearWhite(hex: string): boolean {
  return relativeLuminance(hex) >= 0.94;
}

/* ── Saisie du CRM ────────────────────────────────────────────────────────── */

export interface PublicationBlockInput {
  kind: PublicationBlockKind;
  title: string;
  subtitle: string;
  bg_color: string;
  /** '' = calculée depuis `bg_color` (modèle `container` seulement). */
  panel_color: string;
  sponsored: boolean;
  media_type: PublicationBlockMediaType | '';
  media_url: string;
  poster_url: string;
  product_ids: string[];
  active: boolean;
}

export type MediaLinkCheck = (value: unknown, kind: PublicationBlockMediaType) =>
  | { ok: true; url: string }
  | { ok: false; error: string };

export type PublicationBlockValidation =
  | { ok: true; value: PublicationBlockInput }
  | { ok: false; error: string };

const text = (value: unknown, max: number) =>
  (typeof value === 'string' ? value : value == null ? '' : String(value)).replace(/\s+/g, ' ').trim().slice(0, max);

const bool = (value: unknown, fallback: boolean) =>
  value === undefined ? fallback : value === true || value === 1 || value === '1' || value === 'true';

export function isPublicationBlockKind(value: unknown): value is PublicationBlockKind {
  return typeof value === 'string' && (PUBLICATION_BLOCK_KINDS as readonly string[]).includes(value);
}

/** Identifiants produit : chaînes non vides, sans doublon, ordre conservé, bornés. */
export function normalizeBlockProductIds(value: unknown, max: number): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
  const out: string[] = [];
  for (const entry of raw) {
    const id = typeof entry === 'string' ? entry.trim() : '';
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Valide et normalise un bloc venu du CRM. `existing` permet une mise à jour
 * partielle (champ absent = valeur enregistrée). L'existence et la vendabilité
 * des produits sont vérifiées par le serveur (base), pas ici.
 */
export function normalizePublicationBlockInput(
  body: Record<string, unknown> | null | undefined,
  existing: Partial<PublicationBlockInput> | undefined,
  checkLink: MediaLinkCheck,
): PublicationBlockValidation {
  const input = body ?? {};
  const pick = <K extends keyof PublicationBlockInput>(key: K): unknown =>
    input[key] !== undefined ? input[key] : existing?.[key];

  const kind = pick('kind');
  if (!isPublicationBlockKind(kind)) return { ok: false, error: 'Modèle inconnu : choisissez un des trois modèles.' };

  const title = text(pick('title'), PUBLICATION_BLOCK_LIMITS.title);
  if (title.length < 2) return { ok: false, error: 'Le titre est obligatoire (2 caractères minimum).' };
  const subtitle = text(pick('subtitle'), PUBLICATION_BLOCK_LIMITS.subtitle);

  const rawColor = pick('bg_color');
  const bg = rawColor === undefined || rawColor === '' ? PUBLICATION_BLOCK_DEFAULT_COLOR[kind] : normalizeHexColor(rawColor);
  if (!bg) return { ok: false, error: 'Couleur de fond invalide (format #RRGGBB).' };

  const rawPanel = kind === 'container' ? pick('panel_color') : '';
  const panel = rawPanel === undefined || rawPanel === '' || rawPanel === null ? '' : normalizeHexColor(rawPanel);
  if (panel === null) return { ok: false, error: 'Couleur du panneau invalide (format #RRGGBB).' };

  // Média : obligatoire pour `media` et `sponsored_pair`, facultatif (image large) pour `container`.
  const rawType = pick('media_type');
  let mediaType: PublicationBlockMediaType | '' = rawType === 'video' ? 'video' : rawType === 'image' ? 'image' : '';
  if (kind === 'sponsored_pair' || kind === 'container') mediaType = mediaType ? 'image' : '';
  const mediaInput = pick('media_url');
  let mediaUrl = '';
  if (mediaInput !== undefined && mediaInput !== null && String(mediaInput).trim()) {
    const checked = checkLink(mediaInput, mediaType === 'video' ? 'video' : 'image');
    if (checked.ok === false) return { ok: false, error: checked.error };
    mediaUrl = checked.url;
  }
  if (mediaUrl && !mediaType) mediaType = 'image';
  if (!mediaUrl) mediaType = '';
  if ((kind === 'media' || kind === 'sponsored_pair') && !mediaUrl) {
    return { ok: false, error: kind === 'media' ? 'Ajoutez une image ou une vidéo.' : 'Ajoutez l’image de la carte sponsorisée.' };
  }
  let posterUrl = '';
  const posterInput = mediaType === 'video' ? pick('poster_url') : '';
  if (posterInput !== undefined && posterInput !== null && String(posterInput).trim()) {
    const checked = checkLink(posterInput, 'image');
    if (checked.ok === false) return { ok: false, error: checked.error };
    posterUrl = checked.url;
  }

  const limits = PUBLICATION_BLOCK_LIMITS.products[kind];
  const productIds = normalizeBlockProductIds(pick('product_ids'), limits.max);
  if (productIds.length < limits.min) {
    return {
      ok: false,
      error: kind === 'sponsored_pair'
        ? 'Choisissez le produit affiché à droite de la carte sponsorisée.'
        : 'Choisissez au moins un produit pour la rangée.',
    };
  }

  return {
    ok: true,
    value: {
      kind,
      title,
      subtitle,
      bg_color: bg,
      panel_color: panel,
      sponsored: bool(pick('sponsored'), kind === 'sponsored_pair'),
      media_type: mediaType,
      media_url: mediaUrl,
      poster_url: posterUrl,
      product_ids: productIds,
      active: bool(pick('active'), true),
    },
  };
}

/* ── Lecture publique ─────────────────────────────────────────────────────── */

export interface PublicationBlockProduct {
  id: string;
  name: string;
  brand: string;
  image: string;
  price: number;
  currency: string;
  stockStatus: string;
  available: boolean;
}

export interface PublicationBlockPublic {
  id: string;
  kind: PublicationBlockKind;
  title: string;
  subtitle: string;
  /** Fond du bloc (bandeau pour `container`, encart pour `sponsored_pair`). */
  bgColor: string;
  /** Panneau du `container` (déjà résolu : saisi ou calculé). */
  panelColor: string;
  sponsored: boolean;
  media: { type: PublicationBlockMediaType; url: string; poster: string } | null;
  products: PublicationBlockProduct[];
  publisher: { name: string };
}

/** Un bloc sans assez de produits vendables n'est pas montré (jamais de carte vide). */
export function isRenderablePublicationBlock(block: { kind: PublicationBlockKind; products: readonly unknown[]; media: PublicationBlockPublic['media'] }): boolean {
  if (block.kind === 'sponsored_pair') return block.products.length >= 1 && !!block.media;
  if (block.kind === 'media') return !!block.media && block.products.length >= 1;
  return block.products.length >= 1;
}
