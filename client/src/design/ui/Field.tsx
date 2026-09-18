import React from 'react';
import { twMerge } from 'tailwind-merge';

/**
 * AYROVI DS v1.0 — Field / Input / Select / Textarea.
 * Champ standard : label encre secondaire, fond surface, filet 1px,
 * focus VISIBLE (ring 2px encre + filet encre) — jamais outline-none sans
 * substitut. Erreur : filet + ring danger. Hauteur de contrôle 44px min.
 */
const controlBase =
  'w-full min-h-11 rounded-control border border-line bg-surface px-3.5 py-2.5 text-sm font-semibold text-ink ' +
  'placeholder:font-medium placeholder:text-muted/80 transition-[border-color,box-shadow] duration-140 ' +
  'focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-surface/60';

export const fieldErrorClass = 'border-danger focus:border-danger focus:ring-danger/15';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, hint, error, required, htmlFor, children, className }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-xs font-bold text-muted">
      <span>{label}</span>
      {required && <span aria-hidden className="text-danger">*</span>}
    </label>
    {children}
    {error
      ? <p className="mt-1 text-xs font-semibold text-danger" role="alert">{error}</p>
      : hint ? <p className="mt-1 text-xs font-medium text-muted">{hint}</p> : null}
  </div>
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...props }, ref,
) {
  return <input ref={ref} className={twMerge(controlBase, invalid && fieldErrorClass, className)} {...props} />;
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, className, children, ...props }, ref,
) {
  return (
    <select ref={ref} className={twMerge(controlBase, 'appearance-none bg-[length:1.1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9', invalid && fieldErrorClass, className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666666' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6.2 9 12 15.4 17.8 9'/%3E%3C/svg%3E\")" }}
      {...props}
    >{children}</select>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, ...props }, ref,
) {
  return <textarea ref={ref} className={twMerge(controlBase, 'resize-none', invalid && fieldErrorClass, className)} {...props} />;
});
