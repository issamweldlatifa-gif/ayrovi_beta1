/**
 * Son des vidéos Publication — 15/11 (« زر كون حاله مفعل اول متحل فيديو وحريف
 * نجم طفيه ») : le son est ACTIF quand la vidéo démarre, le client peut le
 * couper d'un geste.
 *
 * Le choix vaut pour toute la session (comme Instagram) : couper le son d'une
 * vidéo ne le fait pas revenir à la suivante, le rallumer le rallume partout.
 * Rien n'est écrit sur le disque : chaque ouverture de l'application repart
 * son actif, selon la consigne. Module PUR (aucun import natif).
 */

export const PUBLICATION_SOUND_DEFAULT_ON = true;

let soundOn = PUBLICATION_SOUND_DEFAULT_ON;
const listeners = new Set<() => void>();

export function publicationSoundOn(): boolean {
  return soundOn;
}

export function setPublicationSoundOn(next: boolean): void {
  if (next === soundOn) return;
  soundOn = next;
  for (const listener of [...listeners]) listener();
}

export function togglePublicationSound(): boolean {
  setPublicationSoundOn(!soundOn);
  return soundOn;
}

export function subscribePublicationSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Tests : remet l'état de départ (son actif). */
export function resetPublicationSound(): void {
  soundOn = PUBLICATION_SOUND_DEFAULT_ON;
  for (const listener of [...listeners]) listener();
}
