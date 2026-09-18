import React from 'react';
import { twMerge } from 'tailwind-merge';

/**
 * AYROVI DS v1.0 — Toast.
 * Retour visuel court : succès (vert), erreur (rouge), info (neutre).
 * Calque 60 (au-dessus de tout). Auto-fermeture gérée par l'appelant.
 */
export type ToastTone = 'success' | 'danger' | 'info';

const TONES: Record<ToastTone, string> = {
  success: 'border-success/30 bg-success-soft text-success',
  danger: 'border-danger/30 bg-danger-soft text-danger',
  info: 'border-line bg-white text-ink',
};

export const Toast: React.FC<{ tone?: ToastTone; children: React.ReactNode; className?: string }> = ({ tone = 'info', children, className }) => (
  <div
    role="status"
    aria-live="polite"
    className={twMerge(
      'pointer-events-auto inline-flex max-w-sm items-center gap-2 rounded-control border px-3.5 py-2.5 text-xs font-bold shadow-card',
      TONES[tone],
      className,
    )}
  >
    {children}
  </div>
);
