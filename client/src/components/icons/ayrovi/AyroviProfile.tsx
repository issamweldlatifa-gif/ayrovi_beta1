import * as React from 'react';
import { AYROVI_ICON_SIGNATURE, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/**
 * Traced from the attached profile crop via scripts/ayrovi-image-to-svg.py
 * Stroke in 24-grid = 1.147 (not 2).
 */
const STROKE = 1.147;

export const AyroviProfile = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviProfile(
  { strokeWidth = STROKE, ...props },
  ref,
) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Profile" strokeWidth={strokeWidth} {...props}>
      <circle cx="11.179" cy="6.661" r="3.909" />
      <path d="M3.189 20.606 L3.394 19.991 L3.599 19.376 L3.804 18.762 L4.009 18.147 L4.419 17.532 L4.828 16.918 L5.443 16.303 L6.058 15.688 L6.673 15.278 L7.287 14.869 L7.902 14.459 L8.517 14.254 L9.131 14.049 L9.746 13.844 L10.361 13.844 L10.975 13.844 L11.590 13.844 L12.205 13.844 L12.820 13.844 L13.434 14.049 L14.049 14.254 L14.664 14.459 L15.278 14.869 L15.893 15.074 L16.508 15.483 L17.123 16.098 L17.737 16.713 L17.942 17.123" />
      <circle cx="19.283" cy="19.970" r="1.546" fill={AYROVI_ICON_SIGNATURE} stroke="none" data-ayrovi-signature="true" />
    </AyroviSvg>
  );
});
