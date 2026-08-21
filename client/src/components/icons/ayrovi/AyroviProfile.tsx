import * as React from 'react';
import { AyroviSignature, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** 03 Compte — Profil: compact head + open shoulder arc, signature on the right terminus. */
export const AyroviProfile = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviProfile(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Profile" {...props}>
      <circle cx="12" cy="7.6" r="3.35" />
      <path d="M6.2 18.7c1.05-3.35 3.15-5.05 5.8-5.05 1.55 0 2.95.6 4.15 1.75" />
      <AyroviSignature cx={16.55} cy={15.85} />
    </AyroviSvg>
  );
});
