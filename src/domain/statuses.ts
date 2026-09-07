/**
 * AYROVI Back Office (P2.0) — vocabulaires de statut partagés.
 *
 * Anomalie mesurée en Discovery (DUP-03) : le vocabulaire des statuts de commande vivait en
 * 127 occurrences sur 7 fichiers (CHECK de la DDL, handlers admin, routes customer,
 * `client/src/types.ts`, `AdminApp.tsx`, `components.tsx`, `CustomerAccountPage.tsx`).
 * Ce fichier n'REMPLACE aucun CHECK ni aucune validation existante — il fournit la liste des
 * états et leurs libellés FR/AR aux nouveaux écrans du framework, pour qu'ils cessent d'en
 * inventer. Les contraintes de la base restent la seule autorité d'intégrité.
 */

/** Commandes (`orders.status`) — identique au CHECK de `database.ts:41`. */
export const ORDER_STATUSES = ['CREATED', 'AWAITING_DEPOSIT', 'AWAITING_PAYMENT_VERIFICATION', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const;

/** Paiement (`orders.payment_status`) — identique au CHECK de `database.ts:42`. */
export const PAYMENT_STATUSES = ['PENDING', 'PENDING_VERIFICATION', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'REJECTED', 'REFUNDED'] as const;

/** Catalogue (P2.1) : le produit est publié, retiré ou archivé — jamais effacé physiquement. */
export const CATALOGUE_PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export const CATALOGUE_ENTRY_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;

/** Support : cycle court, tel que validé par `PUT /assistant-support/:id`. */
export const SUPPORT_STATUSES = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

/** Revues Lens (`ayrovix_review_requests.status`), tel que validé par l'API admin. */
export const AYROVIX_REVIEW_STATUSES = ['PENDING', 'IN_REVIEW', 'QUOTED', 'REJECTED', 'CANCELLED'] as const;

/** P2.2 — le stock ne réinvente pas ses libellés : il ajoute deux vocabulaires au registre. */
export const INVENTORY_STOCKTAKE_STATUSES = ['DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export const INVENTORY_MOVEMENT_DIRECTIONS = ['IN', 'OUT', 'ADJUST'] as const;

/** P2.3 — achats : la commande et le bon de réception ajoutent leurs états au registre. */
export const PURCHASING_ORDER_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const;
export const PURCHASING_RECEIPT_STATUSES = ['DRAFT', 'POSTED', 'DISCARDED'] as const;
export const PURCHASING_QUALITIES = ['GOOD', 'DAMAGED', 'REJECTED'] as const;

/** CRM 360 (E1/E2) — les vocabulaires du module relationnel, une seule source pour les libellés. */
export const CRM_PARTY_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export const CRM_CONTACT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const CRM_ACTIVITY_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;
export const CRM_ACTIVITY_KINDS = ['CALL', 'MEETING', 'EMAIL', 'MESSAGE', 'VISIT', 'FOLLOW_UP', 'INTERNAL', 'OTHER'] as const;
export const CRM_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'] as const;
export const CRM_ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const;
export const CRM_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

/** Le framework ne connaît qu'un petit nombre de tons de badge — un seul rendu pour tout le back office. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_BY_STATUS: Record<string, StatusTone> = {
  ACTIVE: 'success', PAID: 'success', DELIVERED: 'success', PUBLISHED: 'success', COMPLETED: 'success', CONFIRMED: 'success', VERIFIED: 'success', AVAILABLE: 'success', RESOLVED: 'success', CLOSED: 'success', SENT: 'success',
  DRAFT: 'neutral', PENDING: 'neutral', NOT_STARTED: 'neutral', INACTIVE: 'neutral', NONE: 'neutral',
  SCHEDULED: 'info', PREPARING: 'info', IN_REVIEW: 'info', PROCESSING: 'info', QUEUED: 'info', REVIEW: 'info', PARTIAL: 'info', OUT_FOR_DELIVERY: 'info', SHIPPED: 'info', IN_TRANSIT: 'info',
  APPROVED: 'success', PARTIALLY_RECEIVED: 'info', RECEIVED: 'success', POSTED: 'success', DISCARDED: 'neutral', GOOD: 'success', DAMAGED: 'warning', IN: 'success', COUNTING: 'info', SUBMITTED: 'info', ADJUST: 'info', OK: 'success', LOW: 'warning', OUT: 'danger',
  // CRM 360 : les nouveaux états du relationnel — même registre de tons, pas de palette dédiée.
  OPEN: 'neutral', WAITING: 'warning', URGENT: 'danger', HIGH: 'warning',
  AWAITING_DEPOSIT: 'warning', AWAITING_PAYMENT_VERIFICATION: 'warning', PENDING_VERIFICATION: 'warning', PENDING_MANUAL: 'warning', LIMITED: 'warning', NEEDS_REVIEW: 'warning', PARTIALLY_PAID: 'warning', QUOTED: 'warning',
  CANCELLED: 'danger', FAILED: 'danger', REJECTED: 'danger', OUT_OF_STOCK: 'danger', ARCHIVED: 'danger', EXPIRED: 'danger', REFUNDED: 'warning', RETURNED: 'warning', SEND_FAILED: 'danger', BLOCKED: 'danger',
};

export function statusTone(status: string | null | undefined): StatusTone {
  return TONE_BY_STATUS[String(status ?? '').toUpperCase()] ?? 'neutral';
}

/** Libellés — un seul endroit pour le FR et l'AR des états métier. */
export const STATUS_LABELS: Record<string, { fr: string; ar: string }> = {
  CREATED: { fr: 'Créée', ar: 'تم الإنشاء' },
  AWAITING_DEPOSIT: { fr: 'Acompte attendu', ar: 'بانتظار العربون' },
  AWAITING_PAYMENT_VERIFICATION: { fr: 'Vérification du paiement', ar: 'جارٍ التحقق من الدفع' },
  CONFIRMED: { fr: 'Confirmée', ar: 'مؤكد' },
  PREPARING: { fr: 'En préparation', ar: 'قيد التحضير' },
  SHIPPED: { fr: 'Expédiée', ar: 'تم الشحن' },
  IN_TRANSIT: { fr: 'En transit', ar: 'قيد العبور' },
  OUT_FOR_DELIVERY: { fr: 'En livraison', ar: 'قيد التوصيل' },
  DELIVERED: { fr: 'Livrée', ar: 'تم التسليم' },
  CANCELLED: { fr: 'Annulée', ar: 'ملغى' },
  PENDING: { fr: 'En attente', ar: 'قيد الانتظار' },
  PENDING_VERIFICATION: { fr: 'À vérifier', ar: 'بانتظار التحقق' },
  PAID: { fr: 'Payé', ar: 'مدفوع' },
  PARTIALLY_PAID: { fr: 'Partiellement payé', ar: 'مدفوع جزئيًا' },
  FAILED: { fr: 'Échoué', ar: 'فاشل' },
  REJECTED: { fr: 'Refusée', ar: 'مرفوض' },
  REFUNDED: { fr: 'Remboursé', ar: 'مسترجع' },
  DRAFT: { fr: 'Brouillon', ar: 'مسودة' },
  SCHEDULED: { fr: 'Programmé', ar: 'مجدول' },
  ACTIVE: { fr: 'Actif', ar: 'نشط' },
  INACTIVE: { fr: 'Inactif', ar: 'غير نشط' },
  ARCHIVED: { fr: 'Archivé', ar: 'مؤرشف' },
  PUBLISHED: { fr: 'Publié', ar: 'منشور' },
  EXPIRED: { fr: 'Expiré', ar: 'منتهي' },
  AVAILABLE: { fr: 'Disponible', ar: 'متاح' },
  LIMITED: { fr: 'Stock limité', ar: 'مخزون محدود' },
  OUT_OF_STOCK: { fr: 'Épuisé', ar: 'غير متوفر' },
  COUNTING: { fr: 'Comptage en cours', ar: 'جارٍ العد' },
  SUBMITTED: { fr: 'Soumis', ar: 'مقدَّم' },
  APPROVED: { fr: 'Validé', ar: 'معتمد' },
  IN: { fr: 'Entrée', ar: 'إدخال' },
  OUT: { fr: 'Sortie', ar: 'إخراج' },
  ADJUST: { fr: 'Ajustement', ar: 'تسوية' },
  LOW: { fr: 'Stock bas', ar: 'مخزون منخفض' },
  OK: { fr: 'En stock', ar: 'متوفر' },
  PARTIALLY_RECEIVED: { fr: 'Partiellement reçue', ar: 'مستلمة جزئيًا' },
  RECEIVED: { fr: 'Reçue', ar: 'مستلمة' },
  POSTED: { fr: 'Affichée', ar: 'مسجّلة' },
  DISCARDED: { fr: 'Écartée', ar: 'مُبعَدة' },
  GOOD: { fr: 'Conforme', ar: 'سليم' },
  DAMAGED: { fr: 'Endommagé', ar: 'تالف' },
  IN_PROGRESS: { fr: 'En cours', ar: 'قيد المعالجة' },
  RESOLVED: { fr: 'Résolu', ar: 'تم الحل' },
  CLOSED: { fr: 'Clôturé', ar: 'مغلق' },
  // CRM 360 — états et priorités du module relationnel.
  OPEN: { fr: 'Ouvert', ar: 'مفتوح' },
  WAITING: { fr: 'En attente', ar: 'قيد الانتظار' },
  COMPLETED: { fr: 'Terminé', ar: 'مكتمل' },
  NORMAL: { fr: 'Normale', ar: 'عادية' },
  HIGH: { fr: 'Haute', ar: 'عالية' },
  URGENT: { fr: 'Urgente', ar: 'عاجلة' },
};

export function statusLabel(status: string | null | undefined, locale: 'fr' | 'ar' = 'fr'): string {
  const key = String(status ?? '').toUpperCase();
  return STATUS_LABELS[key]?.[locale] ?? key ?? '—';
}

/** Vocabulaires adressables par clé depuis un descripteur de ressource. */
export const STATUS_VOCABULARIES: Record<string, readonly string[]> = {
  'sales.order': ORDER_STATUSES,
  'finance.payment': PAYMENT_STATUSES,
  'catalogue.product': CATALOGUE_PRODUCT_STATUSES,
  'catalogue.status': CATALOGUE_ENTRY_STATUSES,
  'ayrovix.review': AYROVIX_REVIEW_STATUSES,
  'support.ticket': SUPPORT_STATUSES,
  'inventory.stocktake': INVENTORY_STOCKTAKE_STATUSES,
  'inventory.movement': INVENTORY_MOVEMENT_DIRECTIONS,
  'purchasing.order': PURCHASING_ORDER_STATUSES,
  'purchasing.receipt': PURCHASING_RECEIPT_STATUSES,
  'purchasing.quality': PURCHASING_QUALITIES,
  'crm.party': CRM_PARTY_STATUSES,
  'crm.contact': CRM_CONTACT_STATUSES,
  'crm.activity': CRM_ACTIVITY_STATUSES,
  'crm.activity.kind': CRM_ACTIVITY_KINDS,
  'crm.task': CRM_TASK_STATUSES,
  'crm.issue': CRM_ISSUE_STATUSES,
  'crm.priority': CRM_PRIORITIES,
};

export function statusVocabulary(key: string | undefined): readonly string[] | undefined {
  return key ? STATUS_VOCABULARIES[key] : undefined;
}
