import React, { useEffect, useRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { X } from '../../components/QatafoIcons';

/**
 * AYROVI DS v1.0 — Modal.
 * Dialog centré : calque 50, rayon carte, ombre overlay, Escape + clic calque,
 * focus initial, scroll verrouillé.
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, labelledBy, children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <div className="absolute inset-0 bg-ink-deep/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={twMerge('relative w-full max-w-md rounded-card border border-line bg-white p-6 shadow-overlay outline-none', className)}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-icon text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
};
