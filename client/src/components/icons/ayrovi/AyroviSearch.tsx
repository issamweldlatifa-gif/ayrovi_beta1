import * as React from 'react';
import { AYROVI_ICON_SIGNATURE, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** 02 Action — Recherche: monoline lens; the handle is the signature accent. */
export const AyroviSearch = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviSearch(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Search" {...props}>
      <circle cx="10.4" cy="10.4" r="6.15" />
      <path d="m15.15 15.15 4.55 4.55" stroke={AYROVI_ICON_SIGNATURE} data-ayrovi-accent="true" />
    </AyroviSvg>
  );
});
