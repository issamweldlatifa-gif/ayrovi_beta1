import React, { forwardRef, useId } from 'react';
import glyphs from './glyphs.json';
import identity from './identity.json';

export type EditorialIconName = keyof typeof glyphs;
export interface EditorialIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'children'> {
  name: EditorialIconName;
  size?: number | string;
  title?: string;
  direction?: 'ltr' | 'rtl';
}

/** Static local geometry only; never takes SVG/HTML supplied by CMS or a customer. */
export const EditorialIcon = forwardRef<SVGSVGElement, EditorialIconProps>(function EditorialIcon(
  { name, size = identity.geometry.iconGrid, title, direction = 'ltr', className, ...props }, ref,
) {
  const id = useId();
  const titleId = `${id}-icon-title`;
  const glyph = glyphs[name];
  const named = Boolean(title || props['aria-label'] || props['aria-labelledby']);
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={identity.geometry.iconStroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeMiterlimit={3}
      focusable="false"
      role={named ? 'img' : undefined}
      aria-hidden={named ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      {...props}
      className={['ay-editorial-icon', className].filter(Boolean).join(' ')}
      data-editorial-icon={name}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <g transform={direction === 'rtl' && glyph.mirrorRtl ? 'translate(24 0) scale(-1 1)' : undefined}>
        {glyph.shapes.map((shape, index) => React.createElement(shape.tag, { ...shape.attrs, key: index }))}
      </g>
    </svg>
  );
});
