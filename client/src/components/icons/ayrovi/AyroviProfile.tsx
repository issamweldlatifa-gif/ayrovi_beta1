import * as React from 'react';
import { AyroviSignature, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** Profil — compact head, open shoulder arc, signature on the right terminus. */
export const AyroviProfile = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviProfile(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Profile" {...props}>
      <circle cx="12" cy="7.45" r="3.2" />
      <path d="M6.4 17.15 Q12 13.05 17.2 16.4" />
      <AyroviSignature cx={17.2} cy={16.4} />
    </AyroviSvg>
  );
});
