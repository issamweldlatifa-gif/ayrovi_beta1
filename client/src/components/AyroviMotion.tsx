import React, { useEffect, useRef, useState } from 'react';

export type AyroviMotionState = 'idle' | 'thinking' | 'analyzing' | 'reasoning' | 'creating';
type RenderedMotionState = AyroviMotionState | 'settling';

interface AyroviMotionProps {
  state?: AyroviMotionState;
  size?: number;
  color?: string;
  className?: string;
  label?: string;
}

const PIECES = [
  '29.35,0 23.91,5.43 23.91,17.61 29.78,12.17 47.17,29.13 47.17,17.39',
  '70.65,0.22 62.61,0.22 54.13,8.70 62.39,9.13 62.61,33.48 70.87,25.22',
  '99.78,29.35 94.35,23.91 82.17,23.91 87.61,29.78 70.65,47.17 82.39,47.17',
  '99.57,70.65 99.57,62.61 91.30,54.35 90.65,62.39 66.52,62.61 74.57,70.87',
  '52.61,70.65 52.61,82.39 70.43,99.78 75.87,94.35 75.87,82.17 70,87.61',
  '37.17,66.52 28.91,74.57 29.13,99.57 37.17,99.57 45.65,91.09 37.39,90.65',
  '29.13,52.61 17.39,52.61 0,70.43 5.43,75.87 17.61,75.87 12.17,70',
  '0.22,29.13 0.22,37.17 8.70,45.65 9.13,37.39 33.26,37.17 25.22,28.91',
];

const VECTORS = [
  { x: '0%', y: '-2.2%' },
  { x: '1.55%', y: '-1.55%' },
  { x: '2.2%', y: '0%' },
  { x: '1.55%', y: '1.55%' },
  { x: '0%', y: '2.2%' },
  { x: '-1.55%', y: '1.55%' },
  { x: '-2.2%', y: '0%' },
  { x: '-1.55%', y: '-1.55%' },
];

/**
 * The eight-part AYROVI mark, vectorized from the supplied brand reference.
 * Every active state returns through a neutral `settling` phase before the
 * subtle idle breath resumes, so no state snaps back to the resting mark.
 */
export const AyroviMotion: React.FC<AyroviMotionProps> = ({
  state = 'idle',
  size = 28,
  color = 'currentColor',
  className = '',
  label,
}) => {
  const [renderedState, setRenderedState] = useState<RenderedMotionState>(state);
  const previousState = useRef<AyroviMotionState>(state);

  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    if (state === 'idle' && previousState.current !== 'idle') {
      setRenderedState('settling');
      settleTimer = setTimeout(() => setRenderedState('idle'), 680);
    } else {
      setRenderedState(state);
    }
    previousState.current = state;
    return () => { if (settleTimer) clearTimeout(settleTimer); };
  }, [state]);

  return (
    <svg
      viewBox="-5 -5 110 110"
      width={size}
      height={size}
      className={`ayrovi-motion shrink-0 ${className}`}
      data-state={renderedState}
      fill={color}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <circle cx="50" cy="50" r="5.5" className="ayrovi-motion__center" />
      {PIECES.map((points, index) => {
        const vector = VECTORS[index];
        const style = {
          '--piece-index': index,
          '--piece-delay': `${index * -105}ms`,
          '--piece-sequence-delay': `${index * 70}ms`,
          '--piece-create-delay': `${index * 42}ms`,
          '--piece-x': vector.x,
          '--piece-y': vector.y,
          '--piece-turn': index % 2 ? '4deg' : '-4deg',
          '--piece-counter-turn': index % 2 ? '-2.2deg' : '2.2deg',
        } as React.CSSProperties;
        return <polygon key={points} className="ayrovi-motion__piece" points={points} style={style} />;
      })}
    </svg>
  );
};
