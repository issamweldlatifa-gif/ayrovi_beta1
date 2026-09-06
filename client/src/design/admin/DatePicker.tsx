/**
 * DatePicker — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React, { useMemo } from 'react';
import { Calendar } from '../../components/QatafoIcons';

export const DatePicker: React.FC<{ value?: string; onChange: (value: string) => void; required?: boolean }> = ({ value, onChange, required }) => {
  const localValue = useMemo(() => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }, [value]);
  return <div className="admin-date-input"><Calendar size={18} /><input type="datetime-local" value={localValue} required={required} onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : '')} /></div>;
};
