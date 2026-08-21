import * as React from 'react';
import { AyroviSignature, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** Profil — fills the 24 grid; stroke scales with size (same line as the crop). */
export const AyroviProfile = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviProfile(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Profile" {...props}>
      <circle cx="12" cy="7.35" r="4.55" />
      <path d="M4.75 19.45 Q12 12.55 19.25 19.45" />
      <AyroviSignature cx={19.25} cy={19.45} />
    </AyroviSvg>
  );
});
