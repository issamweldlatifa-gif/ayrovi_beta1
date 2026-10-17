import * as React from 'react';
import { useIconDirection } from '../../../design/editorial/IconDirection';
import { EditorialIcon, type EditorialIconName } from '../../../design/editorial/Icon';
import identity from '../../../design/editorial/identity.json';
import glyphs from '../../../design/editorial/glyphs.json';

/** Compatibility API only. No legacy renderer, geometry, or optional family remains. */
export const ZAYROVI_ICON_SIZE = identity.geometry.iconGrid;
export const ZAYROVI_STROKE = identity.geometry.iconStroke;
export const ZAYROVI_CORNER = identity.geometry.controlRadius;
export type ZayroviIconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
};

export function createZayroviIcon(name: EditorialIconName) {
  const Icon = React.forwardRef<SVGSVGElement, ZayroviIconProps>(function ZayroviNamed(props, ref) {
    const direction = useIconDirection();
    return <EditorialIcon {...props} ref={ref} name={name} direction={direction} data-zayrovi-icon={name}
      className={glyphs[name].mirrorRtl ? props.className?.replace(/(^|\s)rotate-180(?=\s|$)/g, ' ').trim() : props.className} />;
  });
  Icon.displayName = `Zayrovi${name}`;
  return Icon;
}
