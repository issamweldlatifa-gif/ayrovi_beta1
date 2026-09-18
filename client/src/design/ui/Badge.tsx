import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * AYROVI DS v1.0 — Badge.
 * Règle de la charte : un badge est JAMAIS une pastille orange pleine.
 * Fond blanc/gris, filet fin, encre noire ou secondaire.
 * Variantes `onDark` pour les surfaces sombres (Lens, hero).
 */
export type BadgeVariant = 'neutral' | 'subtle' | 'dark' | 'success' | 'danger' | 'onDark';

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'border-line bg-white text-ink',
  subtle: 'border-line bg-surface text-muted',
  dark: 'border-ink-deep bg-ink-deep text-white',
  success: 'border-success/30 bg-success-soft text-success',
  danger: 'border-danger/30 bg-danger-soft text-danger',
  onDark: 'border-white/25 bg-white/10 text-white',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'neutral', className, ...props }, ref,
) {
  return (
    <span
      ref={ref}
      className={twMerge(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-chip border px-2.5 py-1 text-xs font-bold leading-none tracking-wide',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
});
