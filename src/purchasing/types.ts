/**
 * AYROVI Purchasing (P2.3) — vocabulaire du module.
 *
 * Le contrat de la phase, écrit avant le code :
 *  • le module achète, il ne décrète jamais une quantité : une réception POSTÉE écrit des
 *  mouvements via `recordMovement` du module Stock (P2.2). Aucun `UPDATE inventory_*` ici ;
 *  • la sur-réception est refusée, la réception partielle est normale ;
 *  • le dommage est reçu PUIS sorti (deux mouvements tracés), jamais « non reçu » : ce qui
 *  est physiquement dans le magasin doit apparaître dans le journal ;
 *  • `arrival-ingestion` n'est pas réécrit : le lien commande ↔ arrivage est porté par mes
 *  propres colonnes (`purchase_orders.arrival_id`, `goods_receipts.arrival_id`), aucune table
 *  du CRM n'est modifiée ;
 *  • le coût d'achat ne touche pas le prix de vente : `products.final_price` reste la
 *  prérogative du moteur Prix & taux (P1/P2.1). Le coût alimente la commande, pas la vitrine.
 */

/** Clé de module dans le registre ERP et dans `erp_role_permissions`. */
export const PURCHASING_MODULE_KEY = 'purchasing';

/**
 * Actions : uniquement le vocabulaire du moteur (`ERP_ACTIONS` de src/erp-core/permissions.ts).
 * `write` = recevoir/mouvementer, `approve` = engager l'argent — deux droits distincts.
 */
export const PURCHASING_ACTIONS = ['read', 'create', 'update', 'write', 'approve'] as const;
export type PurchasingAction = (typeof PURCHASING_ACTIONS)[number];

export const PURCHASING_RESOURCES = ['supplier', 'purchase_order', 'purchase_order_line', 'goods_receipt'] as const;
export type PurchasingResource = (typeof PURCHASING_RESOURCES)[number];

/** Cycle de vie d'une commande d'achat. */
export const PO_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

/** Une réception se poste ou se jette ; elle ne se modifie jamais après affichage. */
export const RECEIPT_STATUSES = ['DRAFT', 'POSTED', 'DISCARDED'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

/** État d'une ligne d'une commande : ce qui reste à recevoir est une lecture, pas une colonne. */
export const PO_LINE_STATES = ['PENDING', 'PARTIAL', 'COMPLETE'] as const;

/** Qualité constatée à la réception. */
export const RECEIPT_QUALITIES = ['GOOD', 'DAMAGED', 'REJECTED'] as const;
export type ReceiptQuality = (typeof RECEIPT_QUALITIES)[number];

/** Devises admises au paiement fournisseur — mêmes que le module Prix (aucune liste parallele). */
export const PURCHASE_CURRENCIES = ['TND', 'EUR', 'USD'] as const;
export type PurchaseCurrency = (typeof PURCHASE_CURRENCIES)[number];

export const SUPPLIER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const PURCHASING_ERRORS = {
  VALIDATION: 'PURCHASING_VALIDATION',
  NOT_FOUND: 'PURCHASING_NOT_FOUND',
  SUPPLIER_NOT_FOUND: 'PURCHASING_SUPPLIER_NOT_FOUND',
  ORDER_NOT_FOUND: 'PURCHASING_ORDER_NOT_FOUND',
  LINE_NOT_FOUND: 'PURCHASING_LINE_NOT_FOUND',
  RECEIPT_NOT_FOUND: 'PURCHASING_RECEIPT_NOT_FOUND',
  PRODUCT_NOT_FOUND: 'PURCHASING_PRODUCT_NOT_FOUND',
  ARRIVAL_NOT_FOUND: 'PURCHASING_ARRIVAL_NOT_FOUND',
  DUPLICATE: 'PURCHASING_DUPLICATE',
  CONFLICT: 'PURCHASING_CONFLICT',
  OVER_RECEIPT: 'PURCHASING_OVER_RECEIPT',
  IMMUTABLE: 'PURCHASING_RECEIPT_IMMUTABLE',
  NOT_APPROVED: 'PURCHASING_ORDER_NOT_APPROVED',
  ALREADY_DECIDED: 'PURCHASING_ORDER_ALREADY_DECIDED',
  EMPTY_LINES: 'PURCHASING_ORDER_HAS_NO_LINES',
  NOTHING_TO_RECEIVE: 'PURCHASING_NOTHING_TO_RECEIVE',
  PERMISSION_DENIED: 'PURCHASING_PERMISSION_DENIED',
} as const;

/** Bornes matérielles : une faute de frappe n'est pas un engagement fournisseur. */
export const MAX_LINE_QUANTITY = 100_000;
export const MAX_UNIT_COST = 1_000_000;
export const MAX_LINES_PER_ORDER = 200;
