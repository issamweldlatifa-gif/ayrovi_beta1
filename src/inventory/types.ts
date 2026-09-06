/**
 * AYROVI Inventory (P2.2) — vocabulaire du module.
 *
 * Le contrat de la phase, écrit ici pour être lisible avant le code :
 *  • la quantité n'existe que dans `inventory_stock_items`. `products` ne gagne aucune
 *  colonne de stock — un produit est une fiche, le stock est un état par emplacement ;
 *  • un mouvement ne se modifie jamais et ne se supprime jamais : la table est un
 *  journalappend-only, toute correction est un mouvement de plus (c'est ce qui rend
 *  l'inventaire auditable plutôt que « recalculable ») ;
 *  • une quantité ne devient jamais négative : la refuse au service ET à la base ;
 *  • l'inventaire physique (stocktake) est le seul chemin qui applique un écart, et il
 *  passe par une approbation explicite (`inventory:approve`) ;
 *  • `crm_warehouse_dispatches` (cartons CRM) reste le système du commerce arrival :
 *  P2.2 ne le lit pas, ne l'écrit pas, ne le fusionne pas.
 */

/** Clé de module dans le registre ERP (`ERP_MODULES`) et dans `erp_role_permissions`. */
export const INVENTORY_MODULE_KEY = 'inventory';

/**
 * Actions du moteur d'autorisation pour ce module — dans le VOCABULAIRE du moteur
 * (`ERP_ACTIONS` de src/erp-core/permissions.ts), pas un verbe parallèle :
 * `write` est le droit d'écrire un mouvement (entrée, sortie, ajustement motivé),
 * `approve` celui de trancher un inventaire. Un verbe inventé ici aurait créé un
 * second dialecte de permissions, précisément ce que P1 a fermé.
 */
export const INVENTORY_ACTIONS = ['read', 'create', 'update', 'write', 'approve'] as const;
export type InventoryAction = (typeof INVENTORY_ACTIONS)[number];

/** Types de ressource — un par surface, pour que la matrice puisse griser finement. */
export const INVENTORY_RESOURCES = ['stock_item', 'stock_movement', 'stocktake'] as const;
export type InventoryResource = (typeof INVENTORY_RESOURCES)[number];

/** Sens d'un mouvement. Un ajustement est signé par son écart, jamais par sa direction. */
export const MOVEMENT_DIRECTIONS = ['IN', 'OUT', 'ADJUST'] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

/** Cycle de vie d'un inventaire physique. */
export const STOCKTAKE_STATUSES = ['DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number];

/** Rôles d'une ligne de stock : ce que la ligne couvre, pas qui la détient. */
export const STOCK_ITEM_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type StockItemStatus = (typeof STOCK_ITEM_STATUSES)[number];

/** Origine d'un mouvement — permet de savoir qui a écrit sans second journal. */
export const MOVEMENT_REASONS = [
  'RECEPTION', 'SALE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGE', 'LOSS',
  'STOCKTAKE_VARIANCE', 'OPENING_BALANCE', 'CORRECTION', 'OTHER',
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Codes d'erreur — chaque réponse de l'API est contrôlée, jamais un 500. */
export const INVENTORY_ERRORS = {
  VALIDATION: 'INVENTORY_VALIDATION',
  NOT_FOUND: 'INVENTORY_NOT_FOUND',
  ITEM_NOT_FOUND: 'INVENTORY_ITEM_NOT_FOUND',
  PRODUCT_NOT_FOUND: 'INVENTORY_PRODUCT_NOT_FOUND',
  STOCKTAKE_NOT_FOUND: 'INVENTORY_STOCKTAKE_NOT_FOUND',
  LINE_NOT_FOUND: 'INVENTORY_STOCKTAKE_LINE_NOT_FOUND',
  DUPLICATE: 'INVENTORY_DUPLICATE_ITEM',
  CONFLICT: 'INVENTORY_CONFLICT',
  NEGATIVE_STOCK: 'INVENTORY_NEGATIVE_STOCK',
  IMMUTABLE: 'INVENTORY_MOVEMENT_IMMUTABLE',
  ALREADY_APPROVED: 'INVENTORY_STOCKTAKE_ALREADY_DECIDED',
  NOT_SUBMITTED: 'INVENTORY_STOCKTAKE_NOT_SUBMITTED',
  EMPTY_LINES: 'INVENTORY_STOCKTAKE_EMPTY',
  PERMISSION_DENIED: 'INVENTORY_PERMISSION_DENIED',
} as const;

/** Garde-fou matériel : un mouvement ne pèse pas 10 millions de pièces. */
export const MAX_MOVEMENT_QUANTITY = 1_000_000;
export const MAX_REASON_LENGTH = 500;
