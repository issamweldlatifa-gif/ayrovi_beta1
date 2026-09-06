/**
 * TableCell — primitive du design system AYROVI.
 *
 * Une cellule de données du back office : la classe d'alignement se calcule à un seul endroit, ce
 * qui prolonge le correctif P2.1 « un seul rendu de cellule » — le corps de la table ne peut plus
 * diverger de sa cellule. `DataTable` l'utilise ; les listes écrites à la main le peuvent aussi.
 */
import React from 'react';

export interface TableCellProps {
  className?: string;
  align?: 'start' | 'end' | 'center';
  children?: React.ReactNode;
}

export const TableCell: React.FC<TableCellProps> = ({ className, align, children }) => (
  <td className={`${className ?? ''} ${align === 'end' ? 'is-end' : ''}`.trim()}>{children}</td>
);
