/**
 * MetricStrip — primitive du design system AYROVI.
 *
 * Bande de chiffres d'en-tête de module. Deux écrans (Stock P2.2, Achats P2.3) portaient le même
 * shell à quelques libellés près ; le shell vit ici, les écrans ne gardent que leur correspondance
 * données -> cellules. Aucune classe nouvelle : `admin-metrics` / `admin-metric` / `admin-cell-num`
 * sont celles d'admin/admin.css.
 */
import React from 'react';

export interface MetricCell {
  label: string;
  /** Déjà formaté par l'appelant : la primitive ne connaît ni devise ni pourcentage. */
  value: React.ReactNode;
}

export const MetricStrip: React.FC<{ cells: MetricCell[] | null | undefined; note: string }> = ({ cells, note }) => {
  if (!cells || cells.length === 0) return null;
  return (
    <div className="admin-metrics">
      {cells.map((cell) => (
        <div className="admin-metric" key={cell.label}>
          <div><span>{cell.label}</span><strong className="admin-cell-num">{cell.value}</strong><small>{note}</small></div>
        </div>
      ))}
    </div>
  );
};
