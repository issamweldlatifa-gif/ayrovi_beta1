import React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'cta';
export type ButtonSize = 'sm' | 'md' | 'icon';

/* AYROVI DS v1.0 — 4 variantes, une seule hiérarchie :
   cta (orange, unique par écran, texte encre) > primary (noir) > secondary (blanc) > ghost. */
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'ay-runtime-button--primary border border-ink bg-ink text-white shadow-xs hover:bg-ink-deep',
  secondary: 'ay-runtime-button--secondary border border-line bg-white text-ink hover:bg-surface',
  ghost: 'ay-runtime-button--ghost border border-transparent bg-transparent text-ink hover:bg-surface',
  cta: 'ay-btn-cta border border-cta bg-cta text-cta-ink hover:border-cta-hover hover:bg-cta-hover active:border-cta-active active:bg-cta-active',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 py-2 text-xs',
  md: 'min-h-12 px-5 py-3 text-sm',
  icon: 'h-11 w-11 p-0',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return twMerge(clsx(
    'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2',
    variantClasses[variant],
    sizeClasses[size],
    className,
  ));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...props} />;
});
