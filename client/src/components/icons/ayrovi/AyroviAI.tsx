import * as React from 'react';
import { AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/**
 * 05 AI & Outils — AYROVI AI.
 * Four-point sparkle with a smaller companion sparkle. No orange: the reference
 * does not place a signature accent on this mark.
 */
export const AyroviAI = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviAI(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="AI" {...props}>
      <path d="M11.2 3.1c.18 4.55 3.35 7.72 7.9 7.9-4.55.18-7.72 3.35-7.9 7.9-.18-4.55-3.35-7.72-7.9-7.9 4.55-.18 7.72-3.35 7.9-7.9Z" />
      <path d="M18.55 3.35c.08 1.12.78 1.82 1.9 1.9-1.12.08-1.82.78-1.9 1.9-.08-1.12-.78-1.82-1.9-1.9 1.12-.08 1.82-.78 1.9-1.9Z" />
    </AyroviSvg>
  );
});
