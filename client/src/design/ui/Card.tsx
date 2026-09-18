import React from 'react';
import { twMerge } from 'tailwind-merge';

/**
 * AYROVI DS v1.0 — Card.
 * Surface `#F8F9FA` + filet `#EAEAEA` + rayon carte 16px.
 * `accent` ajoute le filet d'identité de 3px (orange) sur le bord amont —
 * l'unique façon pour une carte de « porter » la marque.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: boolean;
  plain?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { accent = false, plain = false, className, ...props }, ref,
) {
  return (
    <div
      ref={ref}
      className={twMerge(
        'rounded-card border bg-surface text-ink',
        accent ? 'ay-surface-card' : 'border-line',
        plain && 'bg-white',
        className,
      )}
      {...props}
    />
  );
});
