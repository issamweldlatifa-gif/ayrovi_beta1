/**
 * Form — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';

export const Form: React.FC<{ children: React.ReactNode; onSubmit: React.FormEventHandler; className?: string }> = ({ children, onSubmit, className = '' }) => (
  <form className={`admin-form ${className}`} onSubmit={onSubmit}>{children}</form>
);
