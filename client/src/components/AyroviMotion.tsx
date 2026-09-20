import React, { useEffect, useRef, useState } from 'react';
import { Sonim } from './QatafoIcons';

export type AyroviMotionState = 'idle' | 'thinking' | 'analyzing' | 'reasoning' | 'creating';
type RenderedMotionState = AyroviMotionState | 'settling';
interface AyroviMotionProps {
  state?: AyroviMotionState;
  size?: number;
  color?: string;
  className?: string;
  label?: string;
}
/** Compatibility API for SONIM activity. Never a separate logo/geometry exception.
 * The actual AYROVI brand asset is untouched. Activity changes motion, not identity.
 */
export const AyroviMotion: React.FC<AyroviMotionProps> = ({ state = 'idle', size = 28, color = 'currentColor', className = '', label }) => {
  const [renderedState, setRenderedState] = useState<RenderedMotionState>(state);
  const previousState = useRef<AyroviMotionState>(state);
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    if (state === 'idle' && previousState.current !== 'idle') {
      setRenderedState('settling');
      settleTimer = setTimeout(() => setRenderedState('idle'), 680);
    } else { setRenderedState(state); }
    previousState.current = state;
    return () => { if (settleTimer) clearTimeout(settleTimer); };
  }, [state]);
  return <span className={`ayrovi-motion shrink-0 ${className}`} data-state={renderedState} style={{ color }}>
    <Sonim size={size} title={label} />
  </span>;
};
