import React from 'react';
import { Badge, type BadgeVariant } from './Badge';

/**
 * ZAYROVI DS v1.0 — StatusBadge.
 * Statuts d'ordre/paiement : vert = abouti, rouge = bloqué/échec,
 * gris = en attente, encre = confirmé. Pas de violet (le violet = action).
 */
const TONE_BY_STATUS: Record<string, BadgeVariant> = {
  PAID: 'success', CONFIRMED: 'dark', COMPLETED: 'success', DELIVERED: 'success', SUCCESS: 'success',
  PENDING: 'subtle', IN_PROGRESS: 'subtle', PROCESSING: 'subtle', AWAITING: 'subtle', WAITING: 'subtle',
  FAILED: 'danger', CANCELLED: 'danger', REJECTED: 'danger', REFUNDED: 'subtle',
};

export const StatusBadge: React.FC<{ status: string; label?: string }> = ({ status, label }) => (
  <Badge variant={TONE_BY_STATUS[String(status || '').toUpperCase()] ?? 'subtle'}>
    {label || status}
  </Badge>
);
