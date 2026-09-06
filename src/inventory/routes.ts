/**
 * AYROVI Inventory (P2.2) — API du back-office.
 *
 * Monté sous `/api/admin/inventory` par le routeur admin existant : il hérite du cookie
 * de session (`Path=/api/admin`) et rien ici n'est atteignable anonymement. Chaque route
 * compose les deux gardes existantes — `requireAdmin(db)` (session + CSRF sur les
 * écritures) puis le moteur de permissions ERP pour `inventory:<action>` sur la bonne
 * ressource (refus tracé) — au lieu d'inventer une troisième garde.
 *
 * Contrats respectés :
 *  • la liste de stock parle le dialecte du framework (`page`, `page_size`/`pageSize`,
 *  `search`, `status`, `sort`, `direction`) : `ResourceWorkspace` la rend sans écran dédié ;
 *  • aucune route n'écrit une quantité directement : `PUT /stock/:id` ne touche que le
 *  point de commande et l'archivage ; le mouvement est le seul verbe qui déplace le stock ;
 *  • aucune route ne modifie ni ne supprime un mouvement : le journal est append-only ;
 *  • `crm_warehouse_dispatches` n'est ni lu ni écrit ici (fusion = P4.1, décision prise).
 */
import { Router, type Request, type Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { AdminIdentity } from '../admin/auth';
import { can } from '../erp-core/permissions';
import { statusVocabulary } from '../domain/statuses';
import { bootstrapInventory } from './bootstrap';
import { requireInventory } from './permissions';
import {
  archiveStockItem, createStockItem, getStockItem, listLocations, listMovements, listStock,
  recordMovement, stockSummary, updateStockItem,
} from './stock';
import {
  approveStocktake, createStocktake, getStocktake, listStocktakes, recordCount, rejectStocktake, submitStocktake,
} from './stocktakes';
import { inventoryContext } from './audit';
import { isIdentifier, locationField, parseMovement } from './validation';
import {
  INVENTORY_ACTIONS, INVENTORY_ERRORS, INVENTORY_MODULE_KEY, INVENTORY_RESOURCES,
  MOVEMENT_DIRECTIONS, MOVEMENT_REASONS, STOCKTAKE_STATUSES,
} from './types';

type InventoryRequest = Request & { admin?: AdminIdentity };

/** code → HTTP status : une réponse contrôlée pour chaque refus, jamais un 500. */
const STATUS_BY_CODE: Record<string, number> = {
  [INVENTORY_ERRORS.NOT_FOUND]: 404,
  [INVENTORY_ERRORS.ITEM_NOT_FOUND]: 404,
  [INVENTORY_ERRORS.PRODUCT_NOT_FOUND]: 404,
  [INVENTORY_ERRORS.STOCKTAKE_NOT_FOUND]: 404,
  [INVENTORY_ERRORS.LINE_NOT_FOUND]: 404,
  [INVENTORY_ERRORS.DUPLICATE]: 409,
  [INVENTORY_ERRORS.CONFLICT]: 409,
  [INVENTORY_ERRORS.IMMUTABLE]: 409,
  [INVENTORY_ERRORS.ALREADY_APPROVED]: 409,
  [INVENTORY_ERRORS.NOT_SUBMITTED]: 409,
  [INVENTORY_ERRORS.EMPTY_LINES]: 409,
  [INVENTORY_ERRORS.PERMISSION_DENIED]: 403,
};

type Outcome<T = unknown> = { ok?: boolean; value?: T; code?: string; message?: string };

function answer(res: Response, result: Outcome) {
  if (result.ok) return res.json({ success: true, data: result.value ?? null });
  const code = result.code || INVENTORY_ERRORS.VALIDATION;
  const status = STATUS_BY_CODE[code] ?? 400;
  return res.status(status).json({ success: false, code, error: result.message || 'Requête refusée par le module de stock.' });
}

/** Un seul endroit lit la page/le tri/les filtres — la liste et le journal ne divergent pas. */
function listParams(req: Request) {
  return {
    search: req.query.search, location: req.query.location, status: req.query.status, low: req.query.low,
    productId: req.query.product_id, itemId: req.query.item_id, stocktakeId: req.query.stocktake_id,
    reason: req.query.reason, from: req.query.from, to: req.query.to,
    page: req.query.page, pageSize: req.query.pageSize ?? req.query.page_size,
    sort: req.query.sort, direction: req.query.direction,
  };
}

export function createInventoryRouter(db: QatafoDatabase): Router {
  const router = Router();

  // Même convention d'amorçage à la demande que le catalogue : celui qui monte le module
  // obtient le schéma, la numérotation et les grants, une seule fois, et un échec ici ne
  // fait jamais tomber le back office (le constructeur de la base a déjà essayé).
  let booted = false;
  router.use((req, _res, next) => {
    if (booted || req.path === '/health') return next();
    booted = true;
    try { bootstrapInventory(db); } catch { /* schéma déjà assuré au démarrage */ }
    return next();
  });
  router.get('/health', (_req, res) => {
    const report = (() => { try { return bootstrapInventory(db); } catch (error: any) { return { error: String(error?.message || error) }; } })();
    res.json({ success: true, data: { module: INVENTORY_MODULE_KEY, ...report } });
  });

  const actorOf = (req: InventoryRequest) => ({
    id: req.admin?.id ?? null,
    name: req.admin?.name ?? null,
    ipAddress: req.ip || null,
  });

  /** Ce que le rôle appelant peut faire, calculé par `can()` — la source de vérité du grisage. */
  const capabilitiesFor = (req: InventoryRequest) => {
    const role = req.admin?.role ?? null;
    const employee = req.erpEmployee ?? null;
    const out: Record<string, Record<string, boolean>> = {};
    for (const resource of INVENTORY_RESOURCES) {
      const perResource: Record<string, boolean> = {};
      for (const action of INVENTORY_ACTIONS) {
        perResource[action] = can(db, role, { module: INVENTORY_MODULE_KEY, action, resourceType: resource, employee }).allowed;
      }
      out[resource] = perResource;
    }
    return out;
  };

  router.get('/meta', requireInventory(db, 'read', 'stock_item'), (req: InventoryRequest, res: Response) => {
    res.json({
      success: true,
      data: {
        module: INVENTORY_MODULE_KEY,
        capabilities: capabilitiesFor(req),
        directions: MOVEMENT_DIRECTIONS,
        reasons: MOVEMENT_REASONS,
        stocktakeStatuses: STOCKTAKE_STATUSES,
        // Les libellés viennent du vocabulaire partagé, jamais d'une copie locale.
        statusVocabulary: {
          stocktake: statusVocabulary('inventory.stocktake') ?? STOCKTAKE_STATUSES,
          movement: statusVocabulary('inventory.movement') ?? MOVEMENT_DIRECTIONS,
        },
        locations: listLocations(db),
        summary: stockSummary(db),
      },
    });
  });

  // ---------- Lignes de stock ----------
  router.get('/stock', requireInventory(db, 'read', 'stock_item'), (req, res) => {
    res.json({ success: true, ...listStock(db, listParams(req)) });
  });

  router.get('/stock/:id', requireInventory(db, 'read', 'stock_item'), (req, res) => {
    const item = getStockItem(db, req.params.id);
    if (!item) return answer(res, { ok: false, code: INVENTORY_ERRORS.ITEM_NOT_FOUND, message: 'Ligne de stock introuvable.' });
    res.json({ success: true, data: item });
  });

  router.post('/stock', requireInventory(db, 'create', 'stock_item'), (req: InventoryRequest, res) => {
    const body = (req.body ?? {}) as Record<string, any>;
    const location = locationField(body.location);
    if (!location.ok) return answer(res, location);
    answer(res, createStockItem(db, {
      productId: isIdentifier(body.product_id) ? String(body.product_id) : undefined,
      productCode: String(body.product_code ?? '').trim() || undefined,
      variantId: body.variant_id ? String(body.variant_id) : null,
      location: String(location.value),
      quantity: Number(body.quantity ?? 0),
      reorderPoint: Number(body.reorder_point ?? body.reorderPoint ?? 0),
      actor: actorOf(req),
      context: inventoryContext(db, req),
    }));
  });

  /** Édition limitée volontairement : point de commande et archivage. Jamais la quantité. */
  const updateStock = (req: InventoryRequest, res: Response) => {
    const body = (req.body ?? {}) as Record<string, any>;
    if (body.quantity !== undefined || body.stock !== undefined || body.location !== undefined) {
      return answer(res, {
        ok: false, code: INVENTORY_ERRORS.CONFLICT,
        message: 'Une quantité et un emplacement ne s’éditent pas : la quantité passe par un mouvement, l’emplacement fait l’identité de la ligne.',
      });
    }
    answer(res, updateStockItem(db, String(req.params.id), {
      reorderPoint: body.reorder_point ?? body.reorderPoint,
      status: body.status,
      actor: actorOf(req),
      context: inventoryContext(db, req),
    }));
  };
  router.put('/stock/:id', requireInventory(db, 'update', 'stock_item'), updateStock);
  router.patch('/stock/:id', requireInventory(db, 'update', 'stock_item'), updateStock);

  router.delete('/stock/:id', requireInventory(db, 'update', 'stock_item'), (req: InventoryRequest, res) => {
    answer(res, archiveStockItem(db, String(req.params.id), actorOf(req), inventoryContext(db, req)));
  });

  // ---------- Mouvements ----------
  router.get('/movements', requireInventory(db, 'read', 'stock_movement'), (req, res) => {
    res.json({ success: true, ...listMovements(db, { ...listParams(req), direction: req.query.direction }) });
  });

  /** Le seul verbe qui déplace une quantité (hors validation d'inventaire). */
  router.post('/movements', requireInventory(db, 'write', 'stock_movement'), (req: InventoryRequest, res) => {
    const parsed = parseMovement(db, (req.body ?? {}) as Record<string, any>);
    if (!parsed.ok) return answer(res, parsed);
    const input = parsed.value as NonNullable<typeof parsed.value>;
    answer(res, recordMovement(db, {
      ...input,
      actor: actorOf(req),
      employeeId: req.erpEmployee?.id ?? null,
      context: inventoryContext(db, req),
    }));
  });

  // ---------- Inventaires physiques ----------
  router.get('/stocktakes', requireInventory(db, 'read', 'stocktake'), (req, res) => {
    res.json({ success: true, ...listStocktakes(db, listParams(req)) });
  });

  router.get('/stocktakes/:id', requireInventory(db, 'read', 'stocktake'), (req, res) => {
    const stocktake = getStocktake(db, String(req.params.id));
    if (!stocktake.id) return answer(res, { ok: false, code: INVENTORY_ERRORS.STOCKTAKE_NOT_FOUND, message: 'Inventaire introuvable.' });
    res.json({ success: true, data: stocktake });
  });

  router.post('/stocktakes', requireInventory(db, 'create', 'stocktake'), (req: InventoryRequest, res) => {
    const body = (req.body ?? {}) as Record<string, any>;
    const location = locationField(body.location);
    if (!location.ok) return answer(res, location);
    answer(res, createStocktake(db, {
      location: String(location.value),
      note: String(body.note ?? ''),
      includeZeroQuantity: body.include_zero_quantity !== false && body.includeZeroQuantity !== false,
      actor: actorOf(req),
      context: inventoryContext(db, req),
    }));
  });

  router.put('/stocktakes/:id/lines/:lineId', requireInventory(db, 'update', 'stocktake'), (req: InventoryRequest, res) => {
    const body = (req.body ?? {}) as Record<string, any>;
    answer(res, recordCount(db, {
      stocktakeId: String(req.params.id),
      lineId: String(req.params.lineId),
      countedQuantity: body.counted_quantity ?? body.countedQuantity,
      comment: body.comment ?? body.note ?? '',
      actor: actorOf(req),
      context: inventoryContext(db, req),
    }));
  });

  router.post('/stocktakes/:id/submit', requireInventory(db, 'update', 'stocktake'), (req: InventoryRequest, res) => {
    answer(res, submitStocktake(db, String(req.params.id), actorOf(req), inventoryContext(db, req)));
  });

  /** Décision : droit séparé, parce que valider l'écart de tout le monde n'est pas compter. */
  router.post('/stocktakes/:id/approve', requireInventory(db, 'approve', 'stocktake'), (req: InventoryRequest, res) => {
    answer(res, approveStocktake(db, String(req.params.id), actorOf(req), inventoryContext(db, req)));
  });

  router.post('/stocktakes/:id/reject', requireInventory(db, 'approve', 'stocktake'), (req: InventoryRequest, res) => {
    const body = (req.body ?? {}) as Record<string, any>;
    answer(res, rejectStocktake(db, String(req.params.id), {
      reason: body.reason ?? body.note,
      actor: actorOf(req),
      context: inventoryContext(db, req),
    }));
  });

  // ---------- Verrous explicites ----------
  // Le journal ne se modifie pas : la route répond 409 avec la raison plutôt que 404, pour
  // qu'un client qui « nettoierait » des mouvements soit freiné par le contrat, pas par le hasard.
  const immutable = (_req: Request, res: Response) => res.status(409).json({
    success: false, code: INVENTORY_ERRORS.IMMUTABLE,
    error: 'Le journal des mouvements est append-only : une erreur se corrige par un mouvement ADJUST, jamais par une modification.',
  });
  router.put('/movements/:id', requireInventory(db, 'write', 'stock_movement'), immutable);
  router.patch('/movements/:id', requireInventory(db, 'write', 'stock_movement'), immutable);
  router.delete('/movements/:id', requireInventory(db, 'write', 'stock_movement'), immutable);

  return router;
}
