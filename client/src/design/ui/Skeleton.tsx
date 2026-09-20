import { Loader2 } from '../../components/QatafoIcons';
import React from 'react';
import { twMerge } from 'tailwind-merge';

/** AYROVI DS v1.0 — Skeleton : chargement, fond surface, pulsation douce. */
export const Skeleton: React.FC<{ className?: string; circle?: boolean }> = ({ className, circle = false }) => (
  <div
    aria-hidden
    className={twMerge(
      'animate-pulse bg-surface',
      circle ? 'rounded-full' : 'rounded-control',
      className,
    )}
  />
);

/** AYROVI DS v1.0 — Spinner : chargement inline, encre secondaire. */
export const Spinner: React.FC<{ className?: string; label?: string }> = ({ className, label = 'Chargement…' }) => (
  <span role="status" aria-label={label}><Loader2 className={twMerge('h-5 w-5 animate-spin', className)} /></span>
);
