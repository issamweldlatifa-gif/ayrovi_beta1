import * as React from 'react';
import { AyroviSignature, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** Menu — three bars, three signature terminals. */
export const AyroviMenu = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviMenu(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Menu" {...props}>
      <path d="M4.5 8h11" />
      <path d="M4.5 12h11" />
      <path d="M4.5 16h11" />
      <AyroviSignature cx={18.35} cy={8} />
      <AyroviSignature cx={18.35} cy={12} />
      <AyroviSignature cx={18.35} cy={16} />
    </AyroviSvg>
  );
});
