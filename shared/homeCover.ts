/**
 * Contrat partagé du « cover » d'accueil (remplace la section « à la une »).
 *
 * Un bloc plein écran sous les onglets : média (image OU vidéo, ou une suite de
 * plusieurs), grand texte posé SUR le média, et bouton contour TRANSPARENT
 * par-dessus (référence « Nouveautés — votre dose hebdomadaire · Je découvre »).
 *
 * Piloté par le CRM : médias téléversés, titre, libellé du bouton, destination,
 * cadence de défilement. Aucune invention côté application : réglage vide ou
 * désactivé ⇒ rien à l'écran.
 *
 * Sans React ni base de données : partagé serveur (routes), CRM (aperçu) et
 * application mobile (rendu + lecture défensive).
 */

export const COVER_SLIDE_TYPES = ['image', 'video'] as const;
export type CoverSlideType = (typeof COVER_SLIDE_TYPES)[number];

/** Destinations fermées : des pages DE L'APPLICATION, jamais du site web. */
export const COVER_DESTINATIONS = ['publications', 'catalog', 'promotions'] as const;
export type CoverDestination = (typeof COVER_DESTINATIONS)[number];

export interface CoverSlide {
  id: string;
  type: CoverSlideType;
  /** URL publique du média (`/uploads/…`), déjà validée côté serveur. */
  url: string;
  /** Image d'attente d'une vidéo (facultative). */
  poster: string;
  alt: string;
}

export interface CoverSettings {
  enabled: boolean;
  /** Grand texte posé sur le média — « \n » = saut de ligne voulu. */
  title: string;
  ctaLabel: string;
  destination: CoverDestination;
  /** Cadence du carrousel quand plusieurs médias (ms). */
  autoplayIntervalMs: number;
}

export const DEFAULT_COVER_SETTINGS: CoverSettings = {
  enabled: true,
  title: '',
  ctaLabel: '',
  destination: 'publications',
  autoplayIntervalMs: 5000,
};

export const MAX_COVER_SLIDES = 10;
export const MAX_COVER_TITLE = 120;
export const MAX_COVER_CTA = 40;
export const MAX_COVER_URL = 300;
export const MAX_COVER_ALT = 120;
export const MIN_COVER_INTERVAL_MS = 2000;
export const MAX_COVER_INTERVAL_MS = 30000;

/** Entrée de média telle que reçue d'un PUT admin, avant normalisation. */
export interface CoverSlideInput {
  id?: unknown;
  type?: unknown;
  url?: unknown;
  poster?: unknown;
  alt?: unknown;
}

const text = (value: unknown, max: number): string =>
  String(value ?? '').trim().slice(0, max);

const clampInterval = (value: unknown, fallback: number): number => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_COVER_INTERVAL_MS, Math.max(MIN_COVER_INTERVAL_MS, n));
};

/**
 * Normalise la liste de médias reçue du CRM. Un média sans URL utilisable est
 * abandonné (jamais de case vide à l'écran) ; l'ordre d'arrivée fait foi.
 * Renvoie `null` si le corps n'est pas une liste (⇒ 400 côté serveur).
 */
export function normalizeCoverSlidesInput(input: unknown): CoverSlide[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;
  const slides: CoverSlide[] = [];
  for (const raw of input.slice(0, MAX_COVER_SLIDES)) {
    const row = (raw && typeof raw === 'object' ? raw : {}) as CoverSlideInput;
    const url = text(row.url, MAX_COVER_URL);
    if (!url) continue;
    const type: CoverSlideType = row.type === 'video' ? 'video' : 'image';
    slides.push({
      id: text(row.id, 60) || `cover-${slides.length + 1}-${type}`,
      type,
      url,
      poster: type === 'video' ? text(row.poster, MAX_COVER_URL) : '',
      alt: text(row.alt, MAX_COVER_ALT),
    });
  }
  return slides;
}

/**
 * Valide un PUT admin : une valeur absente garde l'ancienne — y compris la liste
 * de médias (`slides: null` = inchangée) ; destination inconnue ou médias
 * non-liste ⇒ `null` (l'appelant répond 400).
 */
export function normalizeCoverInput(
  body: Record<string, unknown> | null | undefined,
  existing: CoverSettings,
): { settings: CoverSettings; slides: CoverSlide[] | null } | null {
  const input = body && typeof body === 'object' ? body : {};

  const enabled = input.enabled === undefined
    ? existing.enabled
    : input.enabled === true || input.enabled === 1 || input.enabled === '1';

  let destination = existing.destination;
  if (input.destination !== undefined) {
    if (!COVER_DESTINATIONS.includes(input.destination as CoverDestination)) return null;
    destination = input.destination as CoverDestination;
  }

  // `undefined` = on ne touche pas aux médias ; présent mais illisible = refusé.
  const slides = input.slides === undefined ? null : normalizeCoverSlidesInput(input.slides);
  if (input.slides !== undefined && slides === null) return null;

  return {
    settings: {
      enabled,
      title: input.title === undefined ? existing.title : text(input.title, MAX_COVER_TITLE),
      ctaLabel: input.ctaLabel === undefined ? existing.ctaLabel : text(input.ctaLabel, MAX_COVER_CTA),
      destination,
      autoplayIntervalMs: input.autoplayIntervalMs === undefined
        ? existing.autoplayIntervalMs
        : clampInterval(input.autoplayIntervalMs, existing.autoplayIntervalMs),
    },
    slides,
  };
}

/** Forme publique : liste blanche, rien d'interne. */
export interface CoverPublic extends CoverSettings {
  slides: CoverSlide[];
}

/** Rien ne sort vers l'application si le module est masqué ou sans média. */
export function resolveCoverPublic(settings: CoverSettings, slides: CoverSlide[]): CoverPublic | null {
  if (!settings.enabled || !slides.length) return null;
  return { ...settings, slides };
}
