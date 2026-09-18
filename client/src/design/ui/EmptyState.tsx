import React from 'react';
import { twMerge } from 'tailwind-merge';

/**
 * AYROVI DS v1.0 — EmptyState / ErrorState.
 * Le seul vocabulaire des états « rien » et « erreur » : icône dans une pastille
 * surface, titre encre, texte secondaire, action secondaire (jamais orange,
 * sauf CTA principal de l'écran).
 */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  text?: string;
  action?: React.ReactNode;
  tone?: 'neutral' | 'danger';
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, text, action, tone = 'neutral', className }) => (
  <div className={twMerge('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
    {icon && (
      <span className={twMerge(
        'grid h-14 w-14 place-items-center rounded-full border border-line bg-surface',
        tone === 'danger' ? 'text-danger' : 'text-muted',
      )}>
        {icon}
      </span>
    )}
    <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
    {text && <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
