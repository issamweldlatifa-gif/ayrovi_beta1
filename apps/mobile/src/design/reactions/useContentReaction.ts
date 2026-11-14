/**
 * État d'une réaction Z-Reactions sur UN contenu (Reel, publication, story).
 *
 *  • OPTIMISTE : l'icône, l'effet et le compteur changent AU TOUCHER ;
 *  • « le dernier geste gagne » : des touchers rapprochés ne déclenchent pas une
 *    rafale de requêtes contradictoires — une seule requête vole à la fois, et la
 *    dernière intention est envoyée quand elle revient ;
 *  • ÉCHEC ⇒ retour au dernier état CONFIRMÉ par le serveur + message ;
 *  • 401 ou visiteur ⇒ `onAuthRequired` (feuille de connexion), rien n'est écrit.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { sendInteraction, type InteractionResult } from '@/api/social';
import { isApiError } from '@/api/errors';
import { playInteractionSound } from '@/design/feedback/interactionSounds';
import {
  doubleTapReaction,
  optimisticCount,
  pickReaction,
  reactionFromServer,
  tapReaction,
  type ContentReaction,
} from './reactionModel';

export interface ContentReactionOptions {
  targetId: string;
  /** Réaction connue au montage (feed serveur) — `null` si aucune. */
  initial: ContentReaction | null;
  /** Compteur affiché connu au montage (J'aime + J'adore). */
  initialCount: number;
  signedIn: boolean;
  sessionId?: string;
  onAuthRequired: () => void;
  /** Notifié après confirmation serveur (mise à jour des caches de liste). */
  onSettled?: (reaction: ContentReaction | null, count: number, result: InteractionResult) => void;
  /** Envoi injectable (tests). */
  send?: typeof sendInteraction;
}

export interface ContentReactionState {
  reaction: ContentReaction | null;
  count: number;
  pending: boolean;
  error: boolean;
  /** Toucher simple du bouton. */
  tap: () => void;
  /** Choix dans le sélecteur d'appui long. */
  pick: (choice: ContentReaction) => void;
  /** Double-tap sur le média : J'adore (idempotent). Renvoie false si refusé (visiteur). */
  love: () => boolean;
}

export function useContentReaction({
  targetId, initial, initialCount, signedIn, sessionId, onAuthRequired, onSettled, send = sendInteraction,
}: ContentReactionOptions): ContentReactionState {
  const [reaction, setReaction] = useState<ContentReaction | null>(initial);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const shown = useRef({ reaction: initial, count: initialCount });
  const confirmed = useRef({ reaction: initial, count: initialCount });
  const desired = useRef<{ value: ContentReaction | null } | null>(null);
  const flying = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Le feed peut se rafraîchir : on adopte ses valeurs tant que rien ne vole.
  useEffect(() => {
    if (flying.current || desired.current) return;
    shown.current = { reaction: initial, count: initialCount };
    confirmed.current = { reaction: initial, count: initialCount };
    setReaction(initial);
    setCount(initialCount);
  }, [targetId, initial, initialCount]);

  const latest = useRef({ targetId, sessionId, onAuthRequired, onSettled, send });
  latest.current = { targetId, sessionId, onAuthRequired, onSettled, send };

  const flush = useCallback(async () => {
    if (flying.current) return;
    flying.current = true;
    if (alive.current) setPending(true);
    try {
      while (desired.current) {
        const { value } = desired.current;
        desired.current = null;
        const { targetId: id, sessionId: session, send: post } = latest.current;
        const result = await post({ type: 'reaction', targetId: id, reaction: value, sessionId: session || undefined });
        const serverReaction = reactionFromServer(result);
        const serverCount = result.reactionsCount ?? result.likesCount;
        confirmed.current = { reaction: serverReaction, count: serverCount };
        // Un geste plus récent attend : on ne l'écrase pas avec l'ancienne réponse.
        if (!desired.current && alive.current) {
          shown.current = confirmed.current;
          setReaction(serverReaction);
          setCount(serverCount);
          latest.current.onSettled?.(serverReaction, serverCount, result);
        }
      }
    } catch (failure) {
      desired.current = null;
      if (alive.current) {
        shown.current = confirmed.current;
        setReaction(confirmed.current.reaction);
        setCount(confirmed.current.count);
        if (isApiError(failure) && failure.status === 401) latest.current.onAuthRequired();
        else setError(true);
      }
    } finally {
      flying.current = false;
      if (alive.current) setPending(false);
    }
  }, []);

  const apply = useCallback((next: ContentReaction | null) => {
    const before = shown.current;
    if (before.reaction === next) return;
    const after = { reaction: next, count: optimisticCount(before.count, before.reaction, next) };
    shown.current = after;
    // 14/11 : ton court quand on POSE J'aime / J'adore (geste de l'utilisateur
    // seulement — jamais au retrait, jamais au retour du serveur).
    if (next === 'like' || next === 'love') playInteractionSound('like');
    setError(false);
    setReaction(after.reaction);
    setCount(after.count);
    desired.current = { value: next };
    void flush();
  }, [flush]);

  const tap = useCallback(() => {
    if (!signedIn) { onAuthRequired(); return; }
    apply(tapReaction(shown.current.reaction));
  }, [signedIn, onAuthRequired, apply]);

  const pick = useCallback((choice: ContentReaction) => {
    if (!signedIn) { onAuthRequired(); return; }
    apply(pickReaction(shown.current.reaction, choice));
  }, [signedIn, onAuthRequired, apply]);

  const love = useCallback(() => {
    if (!signedIn) { onAuthRequired(); return false; }
    apply(doubleTapReaction());
    return true;
  }, [signedIn, onAuthRequired, apply]);

  return { reaction, count, pending, error, tap, pick, love };
}
