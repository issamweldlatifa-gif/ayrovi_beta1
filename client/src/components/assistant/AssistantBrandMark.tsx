import React from 'react';
import { ZayroviMotion, type ZayroviMotionState } from '../ZayroviMotion';

interface AssistantBrandMarkProps {
  state?: ZayroviMotionState;
  size?: number;
  className?: string;
  label?: string;
}

/** SONIM feature icon; the same canonical drawing as navigation and activity. */
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
    <ZayroviMotion state={state} size={Math.round(size * 0.58)} />
  </span>
);
