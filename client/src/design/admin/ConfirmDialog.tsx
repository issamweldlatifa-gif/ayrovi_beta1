/**
 * ConfirmDialog — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';
import { Trash2 } from '../../components/QatafoIcons';
import { Button } from './Button';
import { Modal } from './Modal';

export const ConfirmDialog: React.FC<{ open: boolean; title?: string; message: string; confirmLabel?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }> = ({
  open, title = 'Confirmer cette action', message, confirmLabel = 'Confirmer', busy, onConfirm, onCancel,
}) => (
  <Modal open={open} title={title} onClose={onCancel} footer={<><Button variant="secondary" onClick={onCancel}>Annuler</Button><Button variant="danger" busy={busy} onClick={onConfirm}><Trash2 size={17} />{confirmLabel}</Button></>}>
    <p className="admin-confirm-message">{message}</p>
  </Modal>
);
