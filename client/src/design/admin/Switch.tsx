/**
 * Interrupteur (bouton à bascule) — primitive du design system AYROVI.
 *
 * Extraite en P3/T2 : le markup est celui que les écrans écrivaient à la main, repris tel quel,
 * pour qu'une seule implémentation porte le concept. Le style vient de admin/admin.css (aucun
 * littéral de couleur dans cette feuille) ; aucune classe nouvelle n'est introduite ici.
 */
import React from 'react';
export interface SwitchProps {
  checked: boolean;
  /** Le parent décide de la persistance : la primitive ne fait que signaler le changement. */
  onChange: () => void;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, onLabel, offLabel, disabled, children }) => (
  <button type="button" disabled={disabled} className={`admin-switch ${checked ? 'is-on' : ''}`} onClick={onChange}><i /><span>{children ?? (checked ? onLabel : offLabel)}</span></button>
);
