import { useEffect, useRef, useState } from 'react';

export const normalizeAudioLevel = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** A bounded, settling animation: no perpetual RAF loop when the signal is unchanged. */
export function useSmoothedLevel(value: number) {
  const target = normalizeAudioLevel(value);
  const current = useRef(target);
  const [level, setLevel] = useState(target);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(query.matches);
    update(); query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    let frame: number | undefined;
    if (reduceMotion || Math.abs(target - current.current) < .001) {
      current.current = target; setLevel(target); return;
    }
    const update = () => {
      const next = current.current + (target - current.current) * .35;
      const settled = Math.abs(target - next) < .001;
      current.current = settled ? target : next;
      setLevel(current.current);
      if (!settled) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [target, reduceMotion]);
  return level;
}
