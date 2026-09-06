/**
 * StatusBadge — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React from 'react';

const statusLabels: Record<string, string> = {
  ACTIVE: 'Actif', INACTIVE: 'Inactif', DRAFT: 'Brouillon', SCHEDULED: 'Programmé', COMPLETED: 'Terminé', ARCHIVED: 'Archivé',
  PUBLISHED: 'Publié', EXPIRED: 'Expiré', AVAILABLE: 'Disponible', LIMITED: 'Limité', OUT_OF_STOCK: 'Épuisé',
  CREATED: 'Créée', AWAITING_DEPOSIT: 'Acompte attendu', AWAITING_PAYMENT_VERIFICATION: 'Vérification paiement',
  CONFIRMED: 'Confirmée', PREPARING: 'En préparation', SHIPPED: 'Expédiée', IN_TRANSIT: 'En transit',
  OUT_FOR_DELIVERY: 'En livraison', DELIVERED: 'Livrée', CANCELLED: 'Annulée', PAID: 'Payé',
  PENDING: 'En attente', PENDING_VERIFICATION: 'À vérifier', PARTIALLY_PAID: 'Partiellement payé', IN_REVIEW: 'En cours', QUOTED: 'Devis envoyé', REJECTED: 'Refusée', FAILED: 'Échoué', REFUNDED: 'Remboursé', RETURNED: 'Retourné',
  STANDARD: 'Standard', EXPRESS: 'Express', SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', CONTENT_MANAGER: 'Contenu', ORDER_MANAGER: 'Commandes',
  // حالات العربون (dépôt)
  NONE: '—', SUBMITTED: 'Preuve reçue', VERIFIED: 'Prix confirmé', PENDING_MANUAL: 'À vérifier manuellement',
  PROCESSING: 'Extraction en cours', REVIEW: 'En révision', QUEUED: 'En file', PARTIAL: 'Partiel',
  EXTRACTED: 'Extrait', NEEDS_REVIEW: 'À vérifier', NOT_STARTED: 'Non démarré',
};


export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const normalized = String(status || '').toUpperCase();
  const tone = ['ACTIVE','PAID','DELIVERED','PUBLISHED','AVAILABLE','COMPLETED','QUOTED','VERIFIED','EXTRACTED','CONFIRMED'].includes(normalized) ? 'success'
    : ['CANCELLED','FAILED','OUT_OF_STOCK','ARCHIVED','EXPIRED','BLOCKED','REJECTED'].includes(normalized) ? 'danger'
      : ['SCHEDULED','AWAITING_DEPOSIT','AWAITING_PAYMENT_VERIFICATION','PENDING','PENDING_VERIFICATION','PENDING_MANUAL','LIMITED','EXPRESS','QUEUED','PROCESSING','PARTIAL','REVIEW','NEEDS_REVIEW'].includes(normalized) ? 'warning' : 'neutral';
  return <span className={`status-badge status-badge--${tone}`}>{statusLabels[normalized] || status}</span>;
};
