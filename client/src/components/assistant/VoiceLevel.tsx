import React from 'react';
import { useSmoothedLevel } from '../../hooks/useSmoothedLevel';

/** Data visualization, not an icon: amplitude comes only from the actual audio level. */
export function VoiceLevel({ level, muted = false }: { level: number; muted?: boolean }) {
  const value = useSmoothedLevel(muted ? 0 : level);
  return <svg className="editorial-voice-level" data-visualization="audio-level" aria-hidden="true" focusable="false" viewBox="0 0 100 40" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square">
    <path d={`M10 20 Q30 ${20 - value * 18} 50 20 T90 20`} />
  </svg>;
}
