/**
 * Double-tap sur un média, sans voler le toucher simple.
 *
 * Le toucher simple (pause, ouvrir la visionneuse…) est RETARDÉ de la fenêtre
 * du double-tap ; si un second toucher arrive à temps, il est annulé et c'est
 * `onDouble(x, y)` qui part — avec la position du doigt, pour poser les cœurs
 * exactement sous lui. Sans `onDouble`, le toucher simple part immédiatement
 * (aucun retard imposé aux écrans qui n'ont pas de double-tap).
 */
import { useCallback, useEffect, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { DOUBLE_TAP_WINDOW_MS, createTapClassifier } from './reactionModel';

export function useDoubleTap({ onSingle, onDouble, windowMs = DOUBLE_TAP_WINDOW_MS }: {
  onSingle?: () => void;
  onDouble?: (x: number, y: number) => void;
  windowMs?: number;
}) {
  const classify = useRef(createTapClassifier(windowMs));
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useRef({ onSingle, onDouble });
  handlers.current = { onSingle, onDouble };
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  return useCallback((event?: GestureResponderEvent) => {
    const { onSingle: single, onDouble: double } = handlers.current;
    if (!double) { single?.(); return; }
    const native = event?.nativeEvent;
    const kind = classify.current(Date.now());
    if (kind === 'double') {
      if (pending.current) { clearTimeout(pending.current); pending.current = null; }
      double(native?.locationX ?? 0, native?.locationY ?? 0);
      return;
    }
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => { pending.current = null; handlers.current.onSingle?.(); }, windowMs);
  }, [windowMs]);
}
