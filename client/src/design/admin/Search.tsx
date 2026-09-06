/**
 * Search — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';
import { Search as SearchIcon, X } from '../../components/QatafoIcons';

export const Search: React.FC<{ value: string; onChange: (value: string) => void; placeholder?: string }> = ({ value, onChange, placeholder = 'Rechercher…' }) => (
  <label className="admin-search">
    <SearchIcon size={18} />
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    {value && <button type="button" onClick={() => onChange('')} aria-label="Effacer"><X size={15} /></button>}
  </label>
);
