/**
 * Tons d'interaction — demande du 14/11/2026 : « زيد صوت خفيف كي تعمل J'aime
 * وكي تعلّق ».
 *
 *  • `like`    — « pop » rond de 110 ms quand une réaction est POSÉE (jamais
 *                quand on la retire : le son récompense, il ne punit pas) ;
 *  • `comment` — deux notes claires de 240 ms quand le commentaire est ACCEPTÉ
 *                par le serveur (pas au toucher : un envoi refusé reste muet).
 *
 * Les fichiers viennent de `scripts/make-interaction-tones.mjs` (synthèse
 * déterministe, aucun son tiers sous licence).
 *
 * `expo-audio` est déjà embarqué (enregistrement Sonim). Le mode audio global
 * n'est PAS modifié : le défaut d'expo-audio est `mixWithOthers`, donc la
 * musique de l'utilisateur et le son d'un Reel continuent — le ton se pose
 * par-dessus. Chargement paresseux et silencieux : sans module natif (web,
 * tests), `play` ne fait rien et ne lève jamais.
 */
import type { AudioPlayer } from 'expo-audio';

export type InteractionSound = 'like' | 'comment';

/** Volume des tons : présents sans couvrir une vidéo. */
export const INTERACTION_SOUND_VOLUME = 0.45;

/** Intervalle minimal entre deux tons identiques (rafales de double-tap). */
export const INTERACTION_SOUND_GAP_MS = 120;

const players = new Map<InteractionSound, AudioPlayer>();
const lastPlayed = new Map<InteractionSound, number>();
let disabled = false;

function source(kind: InteractionSound): number {
  // `require` STATIQUE par branche : Metro doit voir chaque fichier.
  return kind === 'like'
    ? (require('../../../assets/sounds/like.wav') as number)
    : (require('../../../assets/sounds/comment.wav') as number);
}

type AudioApi = Pick<typeof import('expo-audio'), 'createAudioPlayer'>;
interface SoundLoader {
  audio: () => AudioApi;
  source: (kind: InteractionSound) => number;
}
const NATIVE_LOADER: SoundLoader = {
  audio: () => require('expo-audio') as AudioApi,
  source,
};
let loader: SoundLoader = NATIVE_LOADER;

function playerFor(kind: InteractionSound): AudioPlayer | null {
  const existing = players.get(kind);
  if (existing) return existing;
  const player = loader.audio().createAudioPlayer(loader.source(kind));
  player.volume = INTERACTION_SOUND_VOLUME;
  players.set(kind, player);
  return player;
}

/** Joue un ton d'interaction ; ne lève jamais. */
export function playInteractionSound(kind: InteractionSound, now: number = Date.now()): boolean {
  if (disabled) return false;
  const last = lastPlayed.get(kind) ?? -Infinity;
  if (now - last < INTERACTION_SOUND_GAP_MS) return false;
  lastPlayed.set(kind, now);
  try {
    const player = playerFor(kind);
    if (!player) return false;
    // Rejouer depuis le début, même si le ton précédent n'est pas fini.
    void player.seekTo(0)?.catch?.(() => undefined);
    player.play();
    return true;
  } catch {
    // Pas de module natif (web, tests, build sans expo-audio) : muet, pour toujours.
    disabled = true;
    return false;
  }
}

/** Tests uniquement : oublie les lecteurs et l'état ; chargeur injectable. */
export function resetInteractionSoundsForTests(custom?: SoundLoader): void {
  players.clear();
  lastPlayed.clear();
  disabled = false;
  loader = custom ?? NATIVE_LOADER;
}
