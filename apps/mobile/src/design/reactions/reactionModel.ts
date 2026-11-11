/**
 * Z-Reactions — famille OFFICIELLE d'interaction (décision du propriétaire, 11/11/2026).
 *
 * Un seul bouton partout (Reel, vidéo, publication, story) :
 *  • TOUCHER       : aucune réaction ⇒ J'aime ; une réaction posée ⇒ retirée ;
 *  • APPUI LONG    : sélecteur J'aime · J'adore · Je n'aime pas (re-choisir = retirer) ;
 *  • DOUBLE-TAP sur le média : TOUJOURS J'adore (jamais de retrait) + cœurs rouges.
 *
 * Ce module est PUR (aucun import React Native) : vitest le teste directement.
 */

export type ContentReaction = 'like' | 'love' | 'dislike';

/** Ordre d'affichage du sélecteur (gauche → droite, inversé en arabe par la mise en page). */
export const REACTION_ORDER: readonly ContentReaction[] = ['like', 'love', 'dislike'];

/** Délai d'appui long (ms) — assez court pour être découvert, assez long pour ne pas gêner le toucher. */
export const REACTION_LONG_PRESS_MS = 320;

/** Fenêtre du double-tap (ms) : au-delà, deux touchers sont deux gestes distincts. */
export const DOUBLE_TAP_WINDOW_MS = 260;

export function parseReaction(value: unknown): ContentReaction | null {
  return value === 'like' || value === 'love' || value === 'dislike' ? value : null;
}

/** Toucher simple du bouton. */
export function tapReaction(current: ContentReaction | null): ContentReaction | null {
  return current ? null : 'like';
}

/** Choix dans le sélecteur : re-choisir la réaction posée la retire. */
export function pickReaction(current: ContentReaction | null, choice: ContentReaction): ContentReaction | null {
  return current === choice ? null : choice;
}

/** Double-tap sur le média : J'adore, idempotent (comme Instagram). */
export function doubleTapReaction(): ContentReaction {
  return 'love';
}

/** Une réaction est « positive » (comptée dans le compteur affiché). */
export function isPositive(reaction: ContentReaction | null): boolean {
  return reaction === 'like' || reaction === 'love';
}

/**
 * Compteur affiché (J'aime + J'adore) après un changement optimiste.
 * Jamais négatif, même si le compteur reçu était en retard.
 */
export function optimisticCount(count: number, before: ContentReaction | null, after: ContentReaction | null): number {
  const delta = (isPositive(after) ? 1 : 0) - (isPositive(before) ? 1 : 0);
  return Math.max(0, (Number.isFinite(count) ? count : 0) + delta);
}

/** Réaction lue dans une réponse serveur (`reaction`, ou les booléens historiques). */
export function reactionFromServer(payload: { reaction?: unknown; liked?: unknown; loved?: unknown; disliked?: unknown }): ContentReaction | null {
  const direct = parseReaction(payload.reaction);
  if (direct) return direct;
  if (payload.loved === true) return 'love';
  if (payload.disliked === true) return 'dislike';
  if (payload.liked === true) return 'like';
  return null;
}

/** Clé i18n de l'étiquette d'un choix du sélecteur. */
export function reactionLabelKey(reaction: ContentReaction): 'social.like' | 'social.love' | 'social.dislike' {
  return reaction === 'like' ? 'social.like' : reaction === 'love' ? 'social.love' : 'social.dislike';
}

/** Glyphe de la famille (`ReelGlyph`) pour une réaction. */
export function reactionGlyph(reaction: ContentReaction | null): 'like' | 'heart' | 'dislike' {
  return reaction === 'love' ? 'heart' : reaction === 'dislike' ? 'dislike' : 'like';
}

/**
 * Détecteur de double-tap PUR : on lui donne l'horodatage de chaque toucher,
 * il répond `double` si le précédent est dans la fenêtre, sinon `single`.
 * Le composant retarde l'action simple de `DOUBLE_TAP_WINDOW_MS` pour pouvoir l'annuler.
 */
export function createTapClassifier(windowMs = DOUBLE_TAP_WINDOW_MS) {
  let last = -Infinity;
  return (at: number): 'single' | 'double' => {
    if (at - last <= windowMs) {
      last = -Infinity;
      return 'double';
    }
    last = at;
    return 'single';
  };
}
