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
import { ArrivalExtractionJobRunner, ExtractionJobService } from './extractionJobService';
import { listStoreProfiles } from './storeProfiles';
import type { ArrivalIngestionDependencies } from './types';

const sourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 10 },
});

export interface ArrivalIngestionModule {
  router: Router;
  arrivals: ArrivalService;
  clients: ArrivalClientService;
  sources: ArrivalSourceService;
  products: ExtractedProductService;
  jobs: ExtractionJobService;
  runner: ArrivalExtractionJobRunner;
}

export function createArrivalIngestionModule(
  db: QatafoDatabase,
  dependencies: ArrivalIngestionDependencies = {},
): ArrivalIngestionModule {
  const files = new SourceImportService(dependencies.sourceRoot);
  const arrivals = new ArrivalService(db);
  const clients = new ArrivalClientService(db, arrivals);
  const sources = new ArrivalSourceService(db, clients, files);
  const ai = new AyroviAIExtractionService(dependencies.aiAdapter || getAyroviAiCore().responses());
  const products = new ExtractedProductService(db, clients, files);
  const jobs = new ExtractionJobService(db, arrivals, clients, sources);
  const runner = new ArrivalExtractionJobRunner(db, ai, arrivals, clients, sources, products, dependencies.autoRunJobs !== false);
  jobs.attachRunner(runner);

  const router = Router();

  router.get('/stores', requireAdmin(db, 'commerce:read'), (_req, res) => {
    res.json({ success: true, data: listStoreProfiles(db) });
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

  router.patch('/clients/:id', requireAdmin(db, 'orders:write'), (req, res) => {
    res.json({ success: true, data: clients.selectStore(req.params.id, req.body?.storeId, auditActorFromRequest(req)) });
  });

  router.post('/clients/:id/sources', requireAdmin(db, 'orders:write'), sourceUpload.single('source'), (req, res, next) => {
    try {
      const emailContent = typeof req.body?.emailContent === 'string' ? req.body.emailContent : '';
      const file = req.file;
      const buffer = file?.buffer || Buffer.from(emailContent, 'utf8');
      const result = sources.create({
        arrivalClientId: req.params.id,
        sourceType: req.body?.sourceType,
        buffer,
        originalFilename: file?.originalname || 'email-content.txt',
        claimedMime: file?.mimetype || (/<[a-z][\s\S]*>/i.test(emailContent) ? 'text/html' : 'text/plain'),
      }, auditActorFromRequest(req));
      res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

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
    res.json({ success: true, data: products.list(req.params.id) });
  });

  router.post('/clients/:id/products', requireAdmin(db, 'orders:write'), (req, res) => {
    res.status(201).json({ success: true, data: products.createManual(req.params.id, req.body || {}, auditActorFromRequest(req)) });
  });

  router.post('/clients/:id/products/approve-all', requireAdmin(db, 'orders:write'), (req, res) => {
    res.json({ success: true, data: products.approveAll(req.params.id, auditActorFromRequest(req)) });
  });

  router.patch('/products/:id', requireAdmin(db, 'orders:write'), (req, res) => {
    res.json({ success: true, data: products.update(req.params.id, req.body || {}, auditActorFromRequest(req)) });
  });

  router.post('/products/:id/approve', requireAdmin(db, 'orders:write'), (req, res) => {
    res.json({ success: true, data: products.approve(req.params.id, auditActorFromRequest(req)) });
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

  return { router, arrivals, clients, sources, products, jobs, runner };
}

export function createArrivalIngestionRouter(db: QatafoDatabase, dependencies: ArrivalIngestionDependencies = {}): Router {
  return createArrivalIngestionModule(db, dependencies).router;
}
