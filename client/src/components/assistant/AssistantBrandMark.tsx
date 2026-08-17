import React from 'react';
import { AyroviMotion, type AyroviMotionState } from '../AyroviMotion';

interface AssistantBrandMarkProps {
  state?: AyroviMotionState;
  size?: number;
  className?: string;
  label?: string;
}

/** AYROVI assistant badge using the semantic Dark Teal motion identity. */
export const AssistantBrandMark: React.FC<AssistantBrandMarkProps> = ({
  state = 'idle',
  size = 36,
  className = '',
  label,
}) => (
  <span
    className={`assistant-motion-badge ${className}`}
    data-active={state !== 'idle'}
    style={{ width: size, height: size }}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    <AyroviMotion state={state} size={Math.round(size * 0.58)} />
  </span>
);
