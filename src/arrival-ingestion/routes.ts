import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { QatafoDatabase } from '../db/database';
import { requireAdmin } from '../admin/auth';
import { auditActorFromRequest } from '../admin/audit';
import { getAyroviAiCore } from '../ai-core/core';
import { ArrivalIngestionError, asArrivalIngestionError } from './errors';
import { ArrivalService } from './arrivalService';
import { ArrivalClientService } from './arrivalClientService';
import { ArrivalSourceService } from './arrivalSourceService';
import { SourceImportService } from './sourceImportService';
import { AyroviAIExtractionService } from './aiExtractionService';
import { ExtractedProductService } from './extractedProductService';
import { CategoryMasterService } from './categoryMasterService';
import { CategoryClassificationService } from './categoryClassificationService';
import { ArrivalExtractionJobRunner, ExtractionJobService } from './extractionJobService';
import { ArrivalStoreService } from './arrivalStoreService';
import { WarehouseDispatchService } from './warehouseDispatchService';
import { ShipmentService } from './shipmentService';
import { ShipmentDispatchService } from './shipmentDispatchService';
import type { ArrivalIngestionDependencies } from './types';

const sourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 10 },
});

export interface ArrivalIngestionModule {
  router: Router;
  arrivals: ArrivalService;
  clients: ArrivalClientService;
  stores: ArrivalStoreService;
  sources: ArrivalSourceService;
  products: ExtractedProductService;
  jobs: ExtractionJobService;
  runner: ArrivalExtractionJobRunner;
  warehouseDispatch: WarehouseDispatchService;
  shipments: ShipmentService;
  shipmentDispatch: ShipmentDispatchService;
  categories: CategoryMasterService;
  classification: CategoryClassificationService;
}

export function createArrivalIngestionModule(
  db: QatafoDatabase,
  dependencies: ArrivalIngestionDependencies = {},
): ArrivalIngestionModule {
  const files = new SourceImportService(dependencies.sourceRoot);
  // Official Category Master (DB-backed, never hardcoded) + the AI classifier
  // that may only choose from it. Both share the extraction adapter. They are
  // built first because ArrivalService/ProductService/WarehouseDispatch enforce
  // the category gate through the same instance.
  const categories = new CategoryMasterService(db);
  const aiCore = getAyroviAiCore();
  const aiAdapter = dependencies.aiAdapter || aiCore.responses();
  const classification = new CategoryClassificationService(db, categories, aiAdapter);
  const arrivals = new ArrivalService(db, classification);
  const clients = new ArrivalClientService(db, arrivals);
  const stores = new ArrivalStoreService(db);
  const sources = new ArrivalSourceService(db, clients, files);
  const ai = new AyroviAIExtractionService(aiAdapter);
  const warehouseDispatch = new WarehouseDispatchService(db, classification);
  const shipments = new ShipmentService(db);
  const shipmentDispatch = new ShipmentDispatchService(db);
  const products = new ExtractedProductService(db, clients, files, classification);
  const jobs = new ExtractionJobService(db, arrivals, clients, sources);
  const runner = new ArrivalExtractionJobRunner(
    db, ai, arrivals, clients, sources, products, dependencies.autoRunJobs !== false, classification,
  );
  jobs.attachRunner(runner);

  const router = Router();

  router.get('/ai/status', requireAdmin(db, 'commerce:read'), (_req, res) => {
    const coreReadiness = aiCore.responsesReadiness('arrival-ingestion', aiAdapter);
    const lastFailure = db.get<any>(`SELECT error_code,error_message,retry_at,updated_at
      FROM crm_extraction_jobs WHERE state='FAILED' ORDER BY updated_at DESC LIMIT 1`);
    const persistedRatePause = lastFailure?.error_code === 'AI_RATE_LIMITED'
      && Date.parse(String(lastFailure.retry_at || '')) > Date.now();
    const circuitOpen = coreReadiness.circuitOpen || persistedRatePause;
    const retryAt = persistedRatePause ? String(lastFailure.retry_at) : coreReadiness.retryAt;
    const state = persistedRatePause ? 'PAUSED_RATE_LIMIT' : coreReadiness.state;
    res.json({
      success: true,
      data: {
        capability: 'arrival-ingestion',
        configured: coreReadiness.configured,
        state,
        circuitOpen,
        retryAllowed: coreReadiness.configured && !circuitOpen,
        retryAt,
        message: state === 'READY' ? 'La capacité AI d’extraction est prête.'
          : state === 'NOT_CONFIGURED' ? 'La capacité AI d’extraction n’est pas configurée.'
            : state === 'PAUSED_RATE_LIMIT' ? 'La capacité AI est en pause après une limitation. Aucun retry immédiat.'
              : 'La capacité AI est temporairement en pause après plusieurs échecs.',
        lastFailure: lastFailure ? {
          errorCode: lastFailure.error_code,
          errorMessage: lastFailure.error_message,
          retryAt: lastFailure.retry_at || null,
          occurredAt: lastFailure.updated_at,
        } : null,
      },
    });
  });

  router.get('/stores', requireAdmin(db, 'commerce:read'), (_req, res) => {
    res.json({ success: true, data: stores.list() });
  });

  router.post('/stores', requireAdmin(db, 'settings:write'), (req, res) => {
    res.status(201).json({ success: true, data: stores.create(req.body || {}, auditActorFromRequest(req)) });
  });

  router.patch('/stores/:id', requireAdmin(db, 'settings:write'), (req, res) => {
    res.json({ success: true, data: stores.update(req.params.id, req.body || {}, auditActorFromRequest(req)) });
  });

  // ---- Category Master (official AYROVI product taxonomy) ----
  // The taxonomy is DATA, never code: Administration imports/edits the official
  // AYROVI Warehouse Core list. The AI classifier may only pick from the ACTIVE
  // entries returned here; an empty master means nothing can be classified.
  router.get('/categories', requireAdmin(db, 'commerce:read'), (req, res) => {
    const includeInactive = String(req.query.includeInactive ?? 'true') !== 'false';
    res.json({
      success: true,
      data: {
        available: categories.isAvailable(),
        aiConfigured: classification.aiConfigured(),
        confidenceThreshold: classification.confidenceThreshold(),
        gateEnabled: classification.gateEnabled(),
        categories: categories.list(includeInactive),
      },
    });
  });

  router.post('/categories', requireAdmin(db, 'settings:write'), (req, res, next) => {
    try {
      res.status(201).json({ success: true, data: categories.create(req.body || {}, auditActorFromRequest(req)) });
    } catch (error) { next(error); }
  });

  /** Bulk upsert of the official master (idempotent on `code`). */
  router.post('/categories/import', requireAdmin(db, 'settings:write'), (req, res, next) => {
    try {
      const entries = Array.isArray(req.body?.categories) ? req.body.categories : req.body;
      res.json({ success: true, data: categories.importMaster(entries, auditActorFromRequest(req)) });
    } catch (error) { next(error); }
  });

  router.patch('/categories/:code', requireAdmin(db, 'settings:write'), (req, res, next) => {
    try {
      res.json({ success: true, data: categories.update(req.params.code, req.body || {}, auditActorFromRequest(req)) });
    } catch (error) { next(error); }
  });

  router.get('/customers', requireAdmin(db, 'commerce:read'), (req, res) => {
    res.json({ success: true, data: clients.searchCustomers(req.query.search, req.query.limit) });
  });

  router.get('/arrivals', requireAdmin(db, 'commerce:read'), (req, res) => {
    const result = arrivals.list({ search: String(req.query.search || ''), page: Number(req.query.page), pageSize: Number(req.query.pageSize) });
    res.json({ success: true, ...result });
  });

  router.post('/arrivals', requireAdmin(db, 'orders:write'), (req, res) => {
    res.status(201).json({ success: true, data: arrivals.create(req.body?.name, auditActorFromRequest(req)) });
  });

  router.get('/arrivals/:id', requireAdmin(db, 'commerce:read'), (req, res) => {
    res.json({ success: true, data: arrivals.detail(req.params.id) });
  });

  router.post('/arrivals/:id/clients', requireAdmin(db, 'orders:write'), (req, res) => {
    const actor = auditActorFromRequest(req);
    if (req.body?.customer && typeof req.body.customer === 'object') {
      const result = clients.createAndAdd(req.params.id, req.body.customer, actor);
      res.status(201).json({ success: true, data: result.detail, meta: { customerCreated: result.customerCreated } });
      return;
    }
    res.status(201).json({ success: true, data: clients.add(req.params.id, req.body?.customerId, actor) });
  });

  router.post('/arrivals/:id/confirm', requireAdmin(db, 'orders:write'), (req, res) => {
    res.json({ success: true, data: arrivals.confirm(req.params.id, auditActorFromRequest(req)) });
  });

  // ---- Warehouse integration: send a Customer Arrival Card to the Warehouse ----
  // Real server-to-server POST to the Warehouse Core API (WAREHOUSE_API_URL /
  // WAREHOUSE_API_KEY). Idempotent on the card id; failures record SEND_FAILED
  // and can be retried.
  router.get('/arrivals/:id/warehouse-config', requireAdmin(db, 'commerce:read'), (req, res) => {
    const arrival = arrivals.get(req.params.id);
    res.json({
      success: true,
      data: {
        warehouseConfigured: warehouseDispatch.isConfigured(),
        clients: db.all<any>(`SELECT ac.id, c.name customer_name, ac.display_alias,
            (SELECT COUNT(*) FROM crm_extracted_products p WHERE p.arrival_client_id=ac.id AND p.is_current=1 AND p.extraction_status='EXTRACTED') product_count
          FROM crm_arrival_clients ac JOIN customers c ON c.id=ac.customer_id
          WHERE ac.arrival_id=? ORDER BY ac.created_at`, arrival.id).map((row) => ({
          id: row.id,
          customerName: row.display_alias || row.customer_name,
          productCount: Number(row.product_count || 0),
          dispatch: warehouseDispatch.status(row.id),
        })),
      },
    });
  });

  router.get('/clients/:id/warehouse-dispatch', requireAdmin(db, 'commerce:read'), (req, res) => {
    clients.get(req.params.id);
    res.json({ success: true, data: { configured: warehouseDispatch.isConfigured(), dispatch: warehouseDispatch.status(req.params.id) } });
  });

  router.post('/clients/:id/send-to-warehouse', requireAdmin(db, 'orders:write'), async (req, res, next) => {
    try {
      const client = clients.get(req.params.id);
      const dispatch = await warehouseDispatch.send(
        client.arrivalId,
        req.params.id,
        auditActorFromRequest(req),
      );
      res.json({
        success: true,
        data: {
          status: dispatch.status,
          warehouseArrivalId: dispatch.warehouse_arrival_id,
          cardId: dispatch.card_id,
          httpStatus: dispatch.http_status,
          sentAt: dispatch.sent_at,
          attempts: dispatch.attempts,
          errorCode: dispatch.error_code,
          errorMessage: dispatch.error_message,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ---- Shipment Cards (physical shipping info) -> Warehouse ----
  router.get('/arrivals/:id/shipments', requireAdmin(db, 'commerce:read'), (req, res) => {
    // ensures arrival exists
    arrivals.get(req.params.id);
    res.json({ success: true, data: { configured: shipmentDispatch.isConfigured(), shipments: shipments.list(req.params.id) } });
  });

  router.post('/arrivals/:id/shipments', requireAdmin(db, 'orders:write'), (req, res, next) => {
    try {
      const created = shipments.create(req.params.id, req.body || {}, auditActorFromRequest(req));
      res.json({ success: true, data: created });
    } catch (error) { next(error); }
  });

  router.get('/shipments/:id', requireAdmin(db, 'commerce:read'), (req, res, next) => {
    try { res.json({ success: true, data: shipments.get(req.params.id) }); }
    catch (error) { next(error); }
  });

  router.patch('/shipments/:id', requireAdmin(db, 'orders:write'), (req, res, next) => {
    try { res.json({ success: true, data: shipments.update(req.params.id, req.body || {}, auditActorFromRequest(req)) }); }
    catch (error) { next(error); }
  });

  router.post('/shipments/:id/confirm', requireAdmin(db, 'orders:write'), (req, res, next) => {
    try { res.json({ success: true, data: shipments.confirm(req.params.id, auditActorFromRequest(req)) }); }
    catch (error) { next(error); }
  });

  router.get('/shipments/:id/dispatch', requireAdmin(db, 'commerce:read'), (req, res) => {
    res.json({ success: true, data: shipmentDispatch.status(req.params.id) });
  });

  router.post('/shipments/:id/send-to-warehouse', requireAdmin(db, 'orders:write'), async (req, res, next) => {
    try {
      const dispatch = await shipmentDispatch.send(req.params.id, auditActorFromRequest(req));
      res.json({
        success: true,
        data: {
          status: dispatch.status,
          warehouseShipmentId: dispatch.warehouse_shipment_id,
          cardId: dispatch.card_id,
          httpStatus: dispatch.http_status,
          sentAt: dispatch.sent_at,
          attempts: dispatch.attempts,
          errorCode: dispatch.error_code,
          errorMessage: dispatch.error_message,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // Compatibility endpoint: storeId still adds the first/another Store. New
  // callers use /clients/:id/stores and displayAlias for Arrival-only naming.
  router.patch('/clients/:id', requireAdmin(db, 'orders:write'), (req, res) => {
    const actor = auditActorFromRequest(req);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'displayAlias')) {
      const item = clients.setAlias(req.params.id, req.body?.displayAlias, actor);
      res.json({ success: true, data: arrivals.detail(item.arrivalId) });
      return;
    }
    res.json({ success: true, data: clients.selectStore(req.params.id, req.body?.storeId, actor) });
  });

  router.delete('/clients/:id', requireAdmin(db, 'orders:write'), (req, res) => {
    const result = clients.unlink(req.params.id, auditActorFromRequest(req));
    for (const sourceId of result.sourceIds) {
      try { files.removeSourceDirectory(sourceId); } catch (error) {
        console.error('[Arrival ingestion cleanup]', sourceId, error instanceof Error ? error.message : 'cleanup failed');
      }
    }
    res.json({ success: true, data: arrivals.detail(result.arrivalId), meta: {
      customerPreserved: true,
      customerId: result.customerId,
      removedOperationalCounts: result.removedOperationalCounts,
    } });
  });

  router.post('/clients/:id/stores', requireAdmin(db, 'orders:write'), (req, res) => {
    const assignment = clients.addStore(req.params.id, String(req.body?.storeId || ''), auditActorFromRequest(req));
    const client = clients.get(req.params.id);
    res.status(assignment.duplicate ? 200 : 201).json({
      success: true,
      data: arrivals.detail(client.arrivalId),
      meta: { duplicate: assignment.duplicate, assignmentId: assignment.item.id },
    });
  });

  router.delete('/clients/:id/stores/:assignmentId', requireAdmin(db, 'orders:write'), (req, res) => {
    const client = clients.removeStore(req.params.id, req.params.assignmentId, auditActorFromRequest(req));
    res.json({ success: true, data: arrivals.detail(client.arrivalId) });
  });

  const importSource = (req: Request, res: Response, next: NextFunction) => {
    try {
      const emailContent = typeof req.body?.emailContent === 'string' ? req.body.emailContent : '';
      const file = req.file;
      const buffer = file?.buffer || Buffer.from(emailContent, 'utf8');
      const result = sources.create({
        arrivalClientId: req.params.id,
        arrivalClientStoreId: req.params.assignmentId || req.body?.arrivalClientStoreId,
        sourceType: req.body?.sourceType,
        buffer,
        originalFilename: file?.originalname || 'email-content.txt',
        claimedMime: file?.mimetype || (/<[a-z][\s\S]*>/i.test(emailContent) ? 'text/html' : 'text/plain'),
      }, auditActorFromRequest(req));
      res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  router.post('/clients/:id/sources', requireAdmin(db, 'orders:write'), sourceUpload.single('source'), importSource);
  router.post('/clients/:id/stores/:assignmentId/sources', requireAdmin(db, 'orders:write'), sourceUpload.single('source'), importSource);

  router.get('/sources/:id/content', requireAdmin(db, 'commerce:read'), (req, res) => {
    const source = sources.content(req.params.id);
    res.setHeader('Content-Type', source.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(source.filename)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(source.buffer);
  });

  router.post('/sources/:id/extractions', requireAdmin(db, 'orders:write'), (req, res) => {
    const job = jobs.start(req.params.id, req.body?.reprocess === true, auditActorFromRequest(req));
    res.status(202).json({ success: true, data: job });
  });

  router.get('/jobs/:id', requireAdmin(db, 'commerce:read'), (req, res) => {
    res.json({ success: true, data: jobs.get(req.params.id) });
  });

  router.get('/clients/:id/products', requireAdmin(db, 'commerce:read'), (req, res) => {
    const assignmentId = String(req.query.arrivalClientStoreId || '');
    res.json({ success: true, data: assignmentId ? products.listByStore(req.params.id, assignmentId) : products.list(req.params.id) });
  });

  router.get('/clients/:id/stores/:assignmentId/products', requireAdmin(db, 'commerce:read'), (req, res) => {
    res.json({ success: true, data: products.listByStore(req.params.id, req.params.assignmentId) });
  });

  router.post('/clients/:id/products', requireAdmin(db, 'orders:write'), (req, res) => {
    res.status(201).json({ success: true, data: products.createManual(req.params.id, req.body || {}, auditActorFromRequest(req)) });
  });

  router.post('/clients/:id/products/approve-all', requireAdmin(db, 'orders:write'), (req, res) => {
    const assignmentId = String(req.body?.arrivalClientStoreId || '');
    res.json({ success: true, data: assignmentId
      ? products.approveAllByStore(req.params.id, assignmentId, auditActorFromRequest(req))
      : products.approveAll(req.params.id, auditActorFromRequest(req)) });
  });

  router.post('/clients/:id/stores/:assignmentId/products/approve-all', requireAdmin(db, 'orders:write'), (req, res) => {
    res.json({ success: true, data: products.approveAllByStore(req.params.id, req.params.assignmentId, auditActorFromRequest(req)) });
  });

  router.patch('/products/:id', requireAdmin(db, 'orders:write'), (req, res) => {
    res.json({ success: true, data: products.update(req.params.id, req.body || {}, auditActorFromRequest(req)) });
  });

  router.post('/products/:id/approve', requireAdmin(db, 'orders:write'), (req, res) => {
    res.json({ success: true, data: products.approve(req.params.id, auditActorFromRequest(req)) });
  });

  // ---- AI Category classification (SKU/reference + product name -> master) ----
  // On-demand counterpart of the automatic post-extraction pass. Every result is
  // validated against the official master server-side; nothing is trusted.
  router.post('/clients/:id/classify', requireAdmin(db, 'orders:write'), async (req, res, next) => {
    try {
      clients.get(req.params.id);
      const outcome = await classification.classifyCard(
        req.params.id,
        auditActorFromRequest(req),
        { force: req.body?.force === true },
      );
      res.json({ success: true, data: outcome });
    } catch (error) { next(error); }
  });

  router.post('/products/:id/classify', requireAdmin(db, 'orders:write'), async (req, res, next) => {
    try {
      const outcome = await classification.classifyProduct(
        req.params.id,
        auditActorFromRequest(req),
        { force: req.body?.force === true },
      );
      res.json({ success: true, data: outcome });
    } catch (error) { next(error); }
  });

  /** Manual review step: only an official, ACTIVE master code is accepted. */
  router.patch('/products/:id/category', requireAdmin(db, 'orders:write'), (req, res, next) => {
    try {
      const data = classification.setManualCategory(req.params.id, {
        categoryCode: req.body?.categoryCode,
        subcategoryCode: req.body?.subcategoryCode,
      }, auditActorFromRequest(req));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  });

  router.delete('/products/:id/category', requireAdmin(db, 'orders:write'), (req, res, next) => {
    try {
      res.json({ success: true, data: classification.clearCategory(req.params.id, auditActorFromRequest(req)) });
    } catch (error) { next(error); }
  });

  router.get('/products/:id/image', requireAdmin(db, 'commerce:read'), (req, res) => {
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(products.image(req.params.id));
  });

  // Jobs are durable. A process restart resumes queued/interrupted work without
  // reusing a provider response as canonical state.
  if (dependencies.autoRunJobs !== false) runner.recoverPending();

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'La source dépasse la limite de 20 Mo.' : 'Le fichier ne peut pas être importé.';
      return res.status(413).json({ success: false, code: error.code, error: message });
    }
    const mapped = error instanceof ArrivalIngestionError ? error : asArrivalIngestionError(error);
    if (mapped.status >= 500) console.error('[Arrival ingestion]', mapped.code);
    return res.status(mapped.status).json({
      success: false,
      code: mapped.code,
      error: mapped.message,
      ...(mapped.details ? { details: mapped.details } : {}),
    });
  });

  return {
    router, arrivals, clients, stores, sources, products, jobs, runner,
    warehouseDispatch, shipments, shipmentDispatch, categories, classification,
  };
}

export function createArrivalIngestionRouter(db: QatafoDatabase, dependencies: ArrivalIngestionDependencies = {}): Router {
  return createArrivalIngestionModule(db, dependencies).router;
}
