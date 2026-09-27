import React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'cta';
export type ButtonSize = 'sm' | 'md' | 'icon';

/* AYROVI customer DS v3.1 — primary actions use the capsule shape; secondary controls stay softly rounded. */
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'ay-runtime-button--primary rounded-full border border-ink bg-ink text-white shadow-xs hover:bg-ink-deep',
  secondary: 'ay-runtime-button--secondary rounded-control border border-line bg-white text-ink hover:bg-surface',
  ghost: 'ay-runtime-button--ghost rounded-control border border-transparent bg-transparent text-ink hover:bg-surface',
  cta: 'ay-btn-cta rounded-full border border-cta bg-cta text-cta-ink hover:border-cta-hover hover:bg-cta-hover active:border-cta-active active:bg-cta-active',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 py-2 text-xs',
  md: 'min-h-12 px-5 py-3 text-sm',
  icon: 'ay-icon-only h-11 w-11 min-h-11 min-w-11 rounded-full border-0 bg-transparent p-0 text-inherit shadow-none hover:bg-transparent',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  const resolvedVariant = size === 'icon' ? 'ghost' : variant;
  return twMerge(clsx(
    'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2',
    variantClasses[resolvedVariant],
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
