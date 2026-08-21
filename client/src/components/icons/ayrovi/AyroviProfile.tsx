import * as React from 'react';
import { AyroviSignature, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** Profil — head ring + open shoulder arc, signature capping the right terminus. */
export const AyroviProfile = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviProfile(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Profile" {...props}>
      <circle cx="12" cy="8" r="3.9" />
      <path d="M6.05 18.2 Q12 13.35 17.95 18.2" />
      <AyroviSignature cx={17.95} cy={18.2} />
    </AyroviSvg>
  );
});
