import React from 'react';
import { twMerge } from 'tailwind-merge';
import { Badge } from './Badge';

/**
 * AYROVI DS v1.0 — SectionHeader.
 * Rhythm de section standard : eyebrow (optionnel) + titre + sous-titre.
 * Le filet orange de 3px n'apparaît QUE via `accent` (carte de surface).
 */
export interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'start' | 'center';
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ eyebrow, title, subtitle, align = 'start', className }) => (
  <header className={twMerge('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
    {eyebrow && (
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
    )}
    <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h2>
    {subtitle && <p className="mt-3 text-sm leading-6 text-muted sm:text-base">{subtitle}</p>}
  </header>
);
