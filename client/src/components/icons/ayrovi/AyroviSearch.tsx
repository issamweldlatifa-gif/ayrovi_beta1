import * as React from 'react';
import { AYROVI_ICON_SIGNATURE, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** Recherche — monoline lens; short orange handle is the signature accent. */
export const AyroviSearch = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviSearch(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Search" {...props}>
      <circle cx="10.5" cy="10.5" r="5.85" />
      <path d="m15.05 15.05 3.35 3.35" stroke={AYROVI_ICON_SIGNATURE} data-ayrovi-accent="true" />
    </AyroviSvg>
  );
});
