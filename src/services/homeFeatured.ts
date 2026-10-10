/**
 * Section « à la une » de l'accueil mobile — logique pure (sans base).
 *
 *  • réglages : activée ou non, source (« la plus récente » ou « une publication choisie »),
 *    libellé du bouton ;
 *  • seule une publication PUBLIÉE et dont la date est passée peut sortir vers l'application
 *    (même règle que la liste publique des publications) ;
 *  • une publication choisie qui n'est plus publiée ⇒ rien : on n'affiche jamais une
 *    publication que l'admin n'a pas validée, ni une autre à sa place.
 */

export const FEATURED_SOURCES = ['latest', 'pinned'] as const;
export type FeaturedSource = (typeof FEATURED_SOURCES)[number];

export interface FeaturedSettings {
  enabled: boolean;
  source: FeaturedSource;
  publicationId: string;
  ctaLabel: string;
}

/** Ligne de la table `publications`, telle que lue par le service. */
export interface FeaturedCandidate {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  publish_at: string;
  status: string;
}

/** Forme publique : liste blanche, rien d'interne (ni statut, ni notes). */
export interface FeaturedPublic {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
}

export const DEFAULT_FEATURED_SETTINGS: FeaturedSettings = {
  enabled: true,
  source: 'latest',
  publicationId: '',
  ctaLabel: '',
};

const MAX_CTA = 40;
const MAX_ID = 120;

/**
 * Valide une entrée d'admin. Une valeur absente garde l'ancienne ; une valeur
 * invalide est refusée par le retour `null` (l'appelant répond 400).
 */
export function normalizeFeaturedInput(
  body: Record<string, unknown> | null | undefined,
  existing: FeaturedSettings,
): FeaturedSettings | null {
  const input = body && typeof body === 'object' ? body : {};

  const enabled = input.enabled === undefined
    ? existing.enabled
    : input.enabled === true || input.enabled === 1 || input.enabled === '1';

  let source: FeaturedSource = existing.source;
  if (input.source !== undefined) {
    if (!FEATURED_SOURCES.includes(input.source as FeaturedSource)) return null;
    source = input.source as FeaturedSource;
  }

  const publicationId = input.publicationId === undefined
    ? existing.publicationId
    : String(input.publicationId ?? '').trim().slice(0, MAX_ID);

  // Une publication choisie est obligatoire pour la source « pinned ».
  if (source === 'pinned' && !publicationId) return null;

  const ctaLabel = input.ctaLabel === undefined
    ? existing.ctaLabel
    : String(input.ctaLabel ?? '').trim().slice(0, MAX_CTA);

  return { enabled, source, publicationId: source === 'pinned' ? publicationId : '', ctaLabel };
}

/** Date lisible, ou `null` si elle ne l'est pas (une date illisible n'est jamais « passée »). */
function publishedTime(value: string): number | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** Publications réellement sorties : statut « publie » et date atteinte. */
export function publishedCandidates(rows: readonly FeaturedCandidate[], now: number): FeaturedCandidate[] {
  return rows.filter((row) => {
    if (row.status !== 'publie') return false;
    const time = publishedTime(row.publish_at);
    return time !== null && time <= now;
  });
}

/**
 * La publication à montrer sur l'accueil, ou `null` (rien à afficher).
 * Pure : la base n'est lue qu'au niveau de la route.
 */
export function resolveFeaturedPublication(
  settings: FeaturedSettings,
  rows: readonly FeaturedCandidate[],
  now: number,
): FeaturedPublic | null {
  if (!settings.enabled) return null;
  const live = publishedCandidates(rows, now);

  let chosen: FeaturedCandidate | undefined;
  if (settings.source === 'pinned') {
    chosen = live.find((row) => row.id === settings.publicationId);
  } else {
    // La plus récente d'abord ; une date illisible compte pour la plus ancienne.
    const rank = (row: FeaturedCandidate) => publishedTime(row.publish_at) ?? Number.NEGATIVE_INFINITY;
    chosen = [...live].sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? 1 : -1))[0];
  }
  if (!chosen) return null;

  return {
    id: chosen.id,
    title: chosen.title,
    subtitle: chosen.subtitle,
    imageUrl: chosen.image_url,
  };
}
