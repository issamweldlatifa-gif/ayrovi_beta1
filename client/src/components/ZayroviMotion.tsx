import React, { useEffect, useRef, useState } from 'react';
import { Sonim } from './QatafoIcons';

export type ZayroviMotionState = 'idle' | 'thinking' | 'analyzing' | 'reasoning' | 'creating';
type RenderedMotionState = ZayroviMotionState | 'settling';
interface ZayroviMotionProps {
  state?: ZayroviMotionState;
  size?: number;
  color?: string;
  className?: string;
  label?: string;
}
/** Compatibility API for SONIM activity. Never a separate logo/geometry exception.
 * The actual ZAYROVI brand asset is untouched. Activity changes motion, not identity.
 */
export const ZayroviMotion: React.FC<ZayroviMotionProps> = ({ state = 'idle', size = 28, color = 'currentColor', className = '', label }) => {
  const [renderedState, setRenderedState] = useState<RenderedMotionState>(state);
  const previousState = useRef<ZayroviMotionState>(state);
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    if (state === 'idle' && previousState.current !== 'idle') {
      setRenderedState('settling');
      settleTimer = setTimeout(() => setRenderedState('idle'), 680);
    } else { setRenderedState(state); }
    previousState.current = state;
    return () => { if (settleTimer) clearTimeout(settleTimer); };
  }, [state]);
  return <span className={`zayrovi-motion shrink-0 ${className}`} data-state={renderedState} style={{ color }}>
    <Sonim size={size} title={label} />
  </span>;
};
