/**
 * Titre de carte (deux copies identiques réconciliées) — primitive du design system AYROVI.
 *
 * Extraite en P3/T2 : le markup est celui que les écrans écrivaient à la main, repris tel quel,
 * pour qu'une seule implémentation porte le concept. Le style vient de admin/admin.css (aucun
 * littéral de couleur dans cette feuille) ; aucune classe nouvelle n'est introduite ici.
 */
import React from 'react';
export interface CardTitleProps {
  title: string;
  subtitle: string;
}

export const CardTitle: React.FC<CardTitleProps> = ({ title, subtitle }) => (
  <header className="admin-card-title"><div><h3>{title}</h3><p>{subtitle}</p></div></header>
);
