/**
 * Toast — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';
import { Check } from '../../components/QatafoIcons';

export const Toast: React.FC<{ message: string; tone?: 'success' | 'error' }> = ({ message, tone = 'success' }) => (
  <div className={`admin-toast admin-toast--${tone}`} role="status">{tone === 'success' && <Check size={17} />}{message}</div>
);
