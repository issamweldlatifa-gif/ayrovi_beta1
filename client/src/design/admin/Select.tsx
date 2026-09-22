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

/**
 * Nom accessible du champ : un `<select>` posé comme filtre (« Tous les statuts », « Toutes les
 * catégories »…) n'avait ni étiquette ni `aria-label` — un lecteur d'écran annonçait « liste ».
 * Le libellé du premier choix décrit exactement le filtre ; il sert donc de nom par défaut, et un
 * `aria-label` explicite reste prioritaire quand l'appelant en fournit un.
 */
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }> }> = ({ options, ...props }) => {
  const accessibleName = (props as Record<string, unknown>)['aria-label'] || (props as Record<string, unknown>)['aria-labelledby']
    ? undefined : options[0]?.label;
  return (
    <div className="admin-select">
      <select aria-label={accessibleName} {...props}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      <ChevronDown size={16} />
    </div>
  );
};
