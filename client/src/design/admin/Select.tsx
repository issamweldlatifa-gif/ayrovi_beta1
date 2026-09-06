/**
 * Select — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';
import { ChevronDown } from '../../components/QatafoIcons';

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }> }> = ({ options, ...props }) => (
  <div className="admin-select"><select {...props}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16} /></div>
);
