/**
 * Case à cocher en ligne (label + input) — primitive du design system AYROVI.
 *
 * Extraite en P3/T2 : le markup est celui que les écrans écrivaient à la main, repris tel quel,
 * pour qu'une seule implémentation porte le concept. Le style vient de admin/admin.css (aucun
 * littéral de couleur dans cette feuille) ; aucune classe nouvelle n'est introduite ici.
 */
import React from 'react';
export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled, children }) => (
  <label className="admin-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span />{children}</label>
);
