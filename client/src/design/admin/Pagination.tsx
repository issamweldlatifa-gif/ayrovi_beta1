/**
 * Pagination — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';
import { ArrowLeft, ArrowRight } from '../../components/QatafoIcons';

export const Pagination: React.FC<{ page: number; totalPages: number; total: number; onChange: (page: number) => void }> = ({ page, totalPages, total, onChange }) => (
  <div className="admin-pagination">
    <span>{total} résultat{total === 1 ? '' : 's'}</span>
    <div>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Page précédente" title="Page précédente"><ArrowLeft size={17} /></button>
      <strong>{page} / {Math.max(totalPages, 1)}</strong>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Page suivante" title="Page suivante"><ArrowRight size={17} /></button>
    </div>
  </div>
);
