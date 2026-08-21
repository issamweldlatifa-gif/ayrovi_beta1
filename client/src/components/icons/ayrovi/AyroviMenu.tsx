import * as React from 'react';
import { AyroviSignature, AyroviSvg, type AyroviIconProps } from './AyroviIcon';

/** 01 Navigation — Menu: three equal bars, signature dots as right terminals. */
export const AyroviMenu = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviMenu(props, ref) {
  return (
    <AyroviSvg ref={ref} data-ayrovi-icon="Menu" {...props}>
      <path d="M4.5 7h11.2" />
      <path d="M4.5 12h11.2" />
      <path d="M4.5 17h11.2" />
      <AyroviSignature cx={18.85} cy={7} />
      <AyroviSignature cx={18.85} cy={12} />
      <AyroviSignature cx={18.85} cy={17} />
    </AyroviSvg>
  );
});
