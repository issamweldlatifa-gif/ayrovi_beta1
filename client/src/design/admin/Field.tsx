/**
 * Field — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';

export const Field: React.FC<{ label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode; full?: boolean }> = ({
  label, hint, required, error, children, full,
}) => (
  <label className={`admin-field ${full ? 'admin-field--full' : ''}`}>
    <span>{label}{required && <em>*</em>}</span>
    {children}
    {hint && <small>{hint}</small>}
    {error && <small className="admin-field-error">{error}</small>}
  </label>
);
