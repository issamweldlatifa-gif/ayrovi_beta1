/**
 * Button — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';
import { Loader2 } from '../../components/QatafoIcons';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }> = ({
  variant = 'primary', busy, className = '', children, disabled, ...props
}) => (
  <button className={`admin-button admin-button--${variant} ${className}`} disabled={disabled || busy} {...props}>
    {busy && <Loader2 className="admin-spin" size={17} />}{children}
  </button>
);
