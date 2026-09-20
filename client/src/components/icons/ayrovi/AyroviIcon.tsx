import * as React from 'react';
import { useIconDirection } from '../../../design/editorial/IconDirection';
import { EditorialIcon, type EditorialIconName } from '../../../design/editorial/Icon';
import identity from '../../../design/editorial/identity.json';
import glyphs from '../../../design/editorial/glyphs.json';

/** Compatibility API only. No legacy renderer, geometry, or optional family remains. */
export const AYROVI_ICON_SIZE = identity.geometry.iconGrid;
export const AYROVI_STROKE = identity.geometry.iconStroke;
export const AYROVI_CORNER = identity.geometry.controlRadius;
export type AyroviIconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
};

export function createAyroviIcon(name: EditorialIconName) {
  const Icon = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviNamed(props, ref) {
    const direction = useIconDirection();
    return <EditorialIcon {...props} ref={ref} name={name} direction={direction} data-ayrovi-icon={name}
      className={glyphs[name].mirrorRtl ? props.className?.replace(/(^|\s)rotate-180(?=\s|$)/g, ' ').trim() : props.className} />;
  });
  Icon.displayName = `Ayrovi${name}`;
  return Icon;
}
