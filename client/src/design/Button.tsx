import React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'cta';
export type ButtonSize = 'sm' | 'md' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'ay-runtime-button--primary border border-brand bg-brand text-white shadow-card hover:border-brand-dark hover:bg-brand-dark',
  secondary: 'ay-runtime-button--secondary border border-brand bg-white text-brand-dark hover:bg-brand/5',
  ghost: 'ay-runtime-button--ghost border border-transparent bg-transparent text-brand-dark hover:bg-brand/5',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 py-2 text-xs',
  md: 'min-h-12 px-5 py-3 text-sm',
  icon: 'h-11 w-11 p-0',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return twMerge(clsx(
    'inline-flex items-center justify-center gap-2 rounded-control font-extrabold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
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
