import * as React from 'react';
import { AyroviSignature, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** 01 Navigation — Retour: left arrow, 3px rounded drop, signature at the stem end. */
export const AyroviBack = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviBack(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Back" {...props}>
      <path d="M10 6.25 4.75 11.25 10 16.25" />
      <path d="M4.75 11.25H15.25A3.25 3.25 0 0 1 18.5 14.5V18.4" />
      <AyroviSignature cx={16.55} cy={18.4} />
    </AyroviSvg>
  );
});
