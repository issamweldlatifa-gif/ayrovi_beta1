import * as React from 'react';

/**
 * AYROVI Icon System — base.
 * Style: monoline fine (Zalando-like) on a 24 grid.
 * Stroke 1.5 via --ayrovi-icon-stroke (proportional at every display size).
 * Monochrome strict (Zalando-like) : currentColor uniquement, aucun accent.
 */
export const AYROVI_ICON_SIZE = 24;
export const AYROVI_STROKE = 1.5;
export const AYROVI_CORNER = 3;
export type AyroviIconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
};

export const AyroviSvg = React.forwardRef<SVGSVGElement, AyroviIconProps>(
  ({ size = AYROVI_ICON_SIZE, strokeWidth = AYROVI_STROKE, className, color, title, children, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      overflow="visible"
      className={['ayrovi-icon', className].filter(Boolean).join(' ')}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  ),
);
AyroviSvg.displayName = 'AyroviSvg';

export function createAyroviIcon(name: string, body: React.ReactNode) {
  const Icon = React.forwardRef<SVGSVGElement, AyroviIconProps>(function AyroviNamed(props, ref) {
    return (
      <AyroviSvg ref={ref} data-ayrovi-icon={name} {...props}>
        {body}
      </AyroviSvg>
    );
  });
  Icon.displayName = `Ayrovi${name}`;
  return Icon;
}
