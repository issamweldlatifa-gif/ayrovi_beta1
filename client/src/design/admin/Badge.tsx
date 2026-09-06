/**
 * Pastille d'état libre (le statut métier passe par StatusBadge) — primitive du design system AYROVI.
 *
 * Extraite en P3/T2 : le markup est celui que les écrans écrivaient à la main, repris tel quel,
 * pour qu'une seule implémentation porte le concept. Le style vient de admin/admin.css (aucun
 * littéral de couleur dans cette feuille) ; aucune classe nouvelle n'est introduite ici.
 */
import React from 'react';
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', children }) => (
  <span className={`admin-badge ${tone === 'neutral' ? '' : `is-${tone}`}`}>{children}</span>
);
