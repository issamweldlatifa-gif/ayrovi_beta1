/**
 * Modal — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React, { useEffect } from 'react';
import { X } from '../../components/QatafoIcons';

export const Modal: React.FC<{ open: boolean; title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; footer?: React.ReactNode; eyebrow?: string }> = ({
  open, title, children, onClose, wide, footer, eyebrow = 'AYROVI CMS',
}) => {
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', escape); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`admin-modal ${wide ? 'admin-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><div><span>{eyebrow}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Fermer"><X /></button></header>
        <div className="admin-modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
};
