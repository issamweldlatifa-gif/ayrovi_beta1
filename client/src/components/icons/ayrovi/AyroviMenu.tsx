import * as React from 'react';
import { AyroviSignature, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** Menu — three equal bars, signature dots as separate right terminals. */
export const AyroviMenu = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviMenu(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Menu" {...props}>
      <path d="M5 8h9.6" />
      <path d="M5 12h9.6" />
      <path d="M5 16h9.6" />
      <AyroviSignature cx={18.15} cy={8} />
      <AyroviSignature cx={18.15} cy={12} />
      <AyroviSignature cx={18.15} cy={16} />
    </AyroviSvg>
  );
});
