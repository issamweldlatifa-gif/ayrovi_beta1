import * as React from 'react';
import { AyroviSignature, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/**
 * Retour — left arrow, 3px rounded ┐, signature sitting in the inner crook
 * of the corner (not a terminal glued to the stem end).
 */
export const AyroviBack = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviBack(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Back" {...props}>
      <path d="M10.25 5.35 5 9.5l5.25 4.15" />
      <path d="M5 9.5h10.35a3.15 3.15 0 0 1 3.15 3.15V16.2" />
      <AyroviSignature cx={16.05} cy={13.55} />
    </AyroviSvg>
  );
});
