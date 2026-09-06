/**
 * PageHeader — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';

/**
 * En-tête d'écran du back office. Il existait en trois copies quasi identiques (AdminApp,
 * CataloguePages, ErpCorePages) qui ne différaient que par l'œil-de-bœuf : une seule
 * implémentation désormais, le libellé du domaine reste un paramètre.
 */

export const PageHeader: React.FC<{ title: string; description: string; action?: React.ReactNode; eyebrow?: string }> = ({
  title, description, action, eyebrow = 'AYROVI ADMIN',
}) => (
  <div className="admin-page-header"><div><span className="admin-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
);
