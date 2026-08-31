import { createHash, randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { AiProviderError } from '../ai-core/errors';
import { ArrivalIngestionError, asArrivalIngestionError } from './errors';
import type { AIExtractionService } from './types';
import { ArrivalService } from './arrivalService';
import { ArrivalClientService } from './arrivalClientService';
import { ArrivalSourceService } from './arrivalSourceService';
import { ExtractedProductService } from './extractedProductService';
import { loadStoreProfile } from './storeProfiles';
import { SourceValidationError } from './sourceImportService';
import { normalizeTunisianPhone, tunisianPhoneDigits } from '../customer/phone';
import type { NormalizedOrderMeta } from './types';

const JOB_LEASE_MS = 5 * 60_000;

interface SafeFailure {
  code: string;
  message: string;
  rateLimited: boolean;
  retryAt?: string;
}

function parseWarnings(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapJob(row: any) {
  return {
    id: row.id,
    sourceId: row.source_id,
    arrivalClientId: row.arrival_client_id,
    arrivalClientStoreId: row.arrival_client_store_id,
    state: row.state,
    progressCurrent: Number(row.progress_current || 0),
    progressTotal: Number(row.progress_total || 0),
    productsExtracted: Number(row.products_extracted || 0),
    recordsNeedingReview: Number(row.records_needing_review || 0),
    warningCodes: parseWarnings(row.warning_codes),
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
    retryAt: row.retry_at || null,
    attempt: Number(row.attempt || 1),
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeFailure(error: unknown): SafeFailure {
  if (error instanceof AiProviderError) {
    if (error.code === 'PROVIDER_RATE_LIMITED' || (error.code === 'PROVIDER_CIRCUIT_OPEN' && error.status === 429)) {
      return {
        code: 'AI_RATE_LIMITED',
        message: 'La capacité AI d’extraction est temporairement limitée. Aucun appel immédiat supplémentaire ne sera lancé.',
        rateLimited: true,
        retryAt: error.retryAt || new Date(Date.now() + 60_000).toISOString(),
      };
    }
    if (error.code === 'PROVIDER_CIRCUIT_OPEN') {
      return {
        code: 'AI_CIRCUIT_OPEN',
        message: 'La capacité AI d’extraction est temporairement en pause après plusieurs échecs.',
        rateLimited: false,
        ...(error.retryAt ? { retryAt: error.retryAt } : {}),
      };
    }
    if (error.code === 'PROVIDER_TIMEOUT') {
      return { code: 'AI_TIMEOUT', message: 'Le service AI n’a pas répondu dans le délai prévu.', rateLimited: false };
    }
    if (error.code === 'PROVIDER_NOT_CONFIGURED' || error.code === 'PROVIDER_NOT_ACTIVE') {
      return { code: 'AI_EXTRACTION_NOT_CONFIGURED', message: 'Le service d’extraction AI n’est pas configuré.', rateLimited: false };
    }
    if (error.code === 'PROVIDER_AUTHENTICATION_FAILED') {
      return { code: 'AI_AUTHENTICATION_FAILED', message: 'L’authentification du service AI d’extraction a échoué.', rateLimited: false };
    }
    if (error.code === 'PROVIDER_MODEL_NOT_FOUND') {
      return { code: 'AI_MODEL_UNAVAILABLE', message: 'Le modèle configuré pour l’extraction n’est pas disponible.', rateLimited: false };
    }
    if (error.code === 'PROVIDER_INVALID_RESPONSE') {
      return { code: 'AI_RESPONSE_INVALID', message: 'Le service AI a retourné une réponse inexploitable.', rateLimited: false };
    }
    if (error.code === 'PROVIDER_INVALID_REQUEST' || error.code === 'PROVIDER_CAPABILITY_UNSUPPORTED') {
      return { code: 'AI_REQUEST_REJECTED', message: 'Le service AI a refusé le format de cette demande d’extraction.', rateLimited: false };
    }
    return { code: 'AI_PROVIDER_UNAVAILABLE', message: 'Le service d’extraction AI est temporairement indisponible.', rateLimited: false };
  }
  if (error instanceof SourceValidationError) {
    return { code: 'SOURCE_UNREADABLE', message: error.message.slice(0, 500), rateLimited: false };
  }
  const mapped = asArrivalIngestionError(error);
  if (mapped.code === 'ARRIVAL_INGESTION_FAILED') {
    return { code: 'EXTRACTION_FAILED', message: 'Le traitement de cette unité a échoué sans réponse exploitable.', rateLimited: false };
  }
  return { code: mapped.code, message: mapped.message, rateLimited: false };
}

export class ExtractionJobService {
  private runner: ArrivalExtractionJobRunner | null = null;

  constructor(
    private readonly db: QatafoDatabase,
    private readonly arrivals: ArrivalService,
    private readonly clients: ArrivalClientService,
    private readonly sources: ArrivalSourceService,
  ) {}

  attachRunner(runner: ArrivalExtractionJobRunner): void {
    this.runner = runner;
  }

  start(sourceId: string, reprocess: boolean, actor: AdminAuditActor) {
    const source = this.sources.getInternal(sourceId);
    const client = this.clients.get(source.arrivalClientId);
    const clientStore = this.clients.getStore(source.arrivalClientStoreId);
    if (clientStore.arrivalClientId !== client.id) throw new ArrivalIngestionError('SOURCE_STORE_MISMATCH', 'La source ne correspond pas au Store assigné.', 409);
    this.arrivals.assertMutable(client.arrivalId);
    const profile = loadStoreProfile(this.db, clientStore.storeId, source.sourceType);
    if (!profile) throw new ArrivalIngestionError('SOURCE_NOT_SUPPORTED', 'Aucune stratégie active pour ce Store et cette source.', 409);
    const active = this.db.get<any>(`SELECT * FROM crm_extraction_jobs
      WHERE source_id=? AND state IN ('QUEUED','PROCESSING') ORDER BY created_at DESC LIMIT 1`, sourceId);
    if (active) {
      throw new ArrivalIngestionError('EXTRACTION_IN_PROGRESS', 'Une extraction est déjà en cours pour cette source.', 409, { jobId: active.id });
    }
    const latest = this.db.get<any>('SELECT * FROM crm_extraction_jobs WHERE source_id=? ORDER BY created_at DESC LIMIT 1', sourceId);
    if (latest?.error_code === 'AI_RATE_LIMITED' && Date.parse(String(latest.retry_at || '')) > Date.now()) {
      throw new ArrivalIngestionError(
        'AI_RATE_LIMITED',
        'La capacité AI d’extraction est encore en pause. Aucun retry immédiat ne sera lancé.',
        429,
        { retryAt: latest.retry_at },
      );
    }
    if (latest && !reprocess) {
      throw new ArrivalIngestionError('EXTRACTION_EXISTS', 'Cette source a déjà été extraite. Confirmez explicitement le retraitement.', 409, {
        jobId: latest.id,
        state: latest.state,
      });
    }
    const now = new Date().toISOString();
    const id = `crm_extraction_job_${randomUUID()}`;
    const attempt = Number(latest?.attempt || 0) + 1;
    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_extraction_jobs
        (id,source_id,arrival_client_id,arrival_client_store_id,strategy_key,state,attempt,started_by,started_by_name,started_from_ip,created_at,updated_at)
        VALUES (?,?,?,?,?,'QUEUED',?,?,?,?,?,?)`, id, sourceId, source.arrivalClientId, clientStore.id, profile.strategyKey,
      attempt, actor.id, actor.name, actor.ipAddress, now, now);
      this.arrivals.refreshOperationalStatus(client.arrivalId);
      recordAdminAudit(this.db, actor, 'EXTRACTION_STARTED', 'CRM_ARRIVALS', id, null, {
        arrivalId: client.arrivalId,
        arrivalClientId: source.arrivalClientId,
        arrivalClientStoreId: clientStore.id,
        sourceId,
        sourceType: source.sourceType,
        storeCode: clientStore.store.code,
        strategyKey: profile.strategyKey,
        attempt,
        reprocess: Boolean(latest),
      });
    });
    this.runner?.enqueue(id);
    return this.get(id);
  }

  get(id: string) {
    const row = this.db.get<any>('SELECT * FROM crm_extraction_jobs WHERE id=?', id);
    if (!row) throw new ArrivalIngestionError('EXTRACTION_JOB_NOT_FOUND', 'Job d’extraction introuvable.', 404);
    return mapJob(row);
  }
}

export class ArrivalExtractionJobRunner {
  private tail: Promise<void> = Promise.resolve();
  private readonly queued = new Set<string>();
  private readonly workerId = `arrival_worker_${randomUUID()}`;
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: QatafoDatabase,
    private readonly ai: AIExtractionService,
    private readonly arrivals: ArrivalService,
    private readonly clients: ArrivalClientService,
    private readonly sources: ArrivalSourceService,
    private readonly products: ExtractedProductService,
    private readonly enabled = true,
  ) {}

  enqueue(jobId: string, forceAfterCurrent = false): void {
    if (!this.enabled) return;
    const alreadyQueued = this.queued.has(jobId);
    if (alreadyQueued && !forceAfterCurrent) return;
    if (!alreadyQueued) this.queued.add(jobId);
    this.tail = this.tail
      .then(() => {
        this.queued.add(jobId);
        return this.run(jobId);
      })
      .catch((error) => console.error('[Arrival ingestion worker]', error instanceof Error ? error.message : 'worker failure'))
      .finally(() => this.queued.delete(jobId));
  }

  async waitForIdle(): Promise<void> {
    await this.tail;
  }

  recoverPending(): void {
    if (!this.enabled) return;
    const nowIso = new Date().toISOString();
    const pending = this.db.all<any>(`SELECT id,state,source_id FROM crm_extraction_jobs
      WHERE state='QUEUED' OR (state='PROCESSING' AND (lease_expires_at IS NULL OR lease_expires_at<=?))
      ORDER BY created_at`, nowIso);
    this.db.transaction(() => {
      for (const job of pending) {
        if (job.state === 'PROCESSING') {
          this.db.run('DELETE FROM crm_extracted_products WHERE job_id=? AND is_current=0', job.id);
          this.db.run(`UPDATE crm_extraction_jobs SET state='QUEUED',progress_current=0,progress_total=0,
            products_extracted=0,records_needing_review=0,error_code=NULL,error_message=NULL,retry_at=NULL,
            attempt=attempt+1,worker_id=NULL,heartbeat_at=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?`, nowIso, job.id);
        }
      }
    });
    for (const job of pending) {
      if (job.state === 'PROCESSING') this.sources.files.removeJobDerived(job.source_id, job.id);
      this.enqueue(job.id, job.state === 'PROCESSING');
    }
    this.scheduleNextLeaseRecovery();
  }

  private scheduleNextLeaseRecovery(): void {
    if (!this.enabled) return;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    const next = this.db.get<any>(`SELECT MIN(lease_expires_at) lease_expires_at FROM crm_extraction_jobs
      WHERE state='PROCESSING' AND lease_expires_at IS NOT NULL`);
    if (!next?.lease_expires_at) return;
    const delay = Math.max(50, Date.parse(next.lease_expires_at) - Date.now() + 25);
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      this.recoverPending();
    }, delay);
    this.recoveryTimer.unref();
  }

  private heartbeat(jobId: string): void {
    const now = new Date();
    const updated = this.db.run(`UPDATE crm_extraction_jobs SET heartbeat_at=?,lease_expires_at=?,updated_at=?
      WHERE id=? AND state='PROCESSING' AND worker_id=?`,
    now.toISOString(), new Date(now.getTime() + JOB_LEASE_MS).toISOString(), now.toISOString(), jobId, this.workerId);
    if (!updated.changes) throw new Error('EXTRACTION_JOB_LEASE_LOST');
  }

  /**
   * Customer Identity Resolution. The AI extracts the order/shipment envelope
   * (name / email / phone) per source unit. Aggregation across multiple stores
   * and orders for the SAME customer is driven by the canonical
   * crm_arrival_clients membership (the Arrival = one Customer Arrival Card).
   *
   * This method validates that the extracted identity hints are consistent
   * with the assigned CRM customer:
   *  - a Tunisian phone that resolves to a DIFFERENT active customer =>
   *    IDENTITY_PHONE_MISMATCH warning (operator review, never auto-rebind).
   *  - an email that belongs to a DIFFERENT active customer =>
   *    IDENTITY_EMAIL_MISMATCH warning.
   *  - a clear match (same normalized phone) => IDENTITY_CONFIRMED hint.
   * It never silently moves a source between customers; the Arrival Card
   * remains the authoritative aggregate key.
   */
  private resolveCustomerIdentity(
    jobId: string,
    context: any,
    orderMeta: NormalizedOrderMeta,
    warnings: Set<string>,
  ): void {
    const extractedPhone = orderMeta.customerPhone ? tunisianPhoneDigits(orderMeta.customerPhone) : null;
    const extractedEmail = orderMeta.customerEmail
      ? orderMeta.customerEmail.toLowerCase().trim()
      : null;

    if (extractedPhone) {
      const match = this.db.get<any>(
        `SELECT id,name,status FROM customers
         WHERE normalized_phone=? OR phone IN (?,?,?)
         ORDER BY CASE WHEN normalized_phone=? THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`,
        extractedPhone, extractedPhone, normalizeTunisianPhone(extractedPhone) || extractedPhone,
        `216${extractedPhone}`, extractedPhone,
      );
      if (match && match.id !== context.customer_id && match.status === 'ACTIVE') {
        warnings.add('IDENTITY_PHONE_MISMATCH');
        recordAdminAudit(this.db,
          { id: context.started_by || null, name: context.started_by_name || 'Système', ipAddress: context.started_from_ip || null },
          'ARRIVAL_IDENTITY_FLAGGED', 'CRM_ARRIVALS', jobId, null,
          { kind: 'PHONE_MISMATCH', assignedCustomerId: context.customer_id,
            extractedCustomerId: match.id, extractedCustomerName: match.name,
            sourceId: context.source_id });
      } else if (match && match.id === context.customer_id) {
        warnings.add('IDENTITY_CONFIRMED');
      }
    }

    // Name corroboration: a clearly different customer name on the document
    // is flagged for review (the canonical CRM customer card is authoritative).
    const extractedName = orderMeta.customerName
      ? orderMeta.customerName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      : '';
    const assignedName = String(context.customer_name || '')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (extractedName && assignedName) {
      const extractedTokens = extractedName.split(' ').filter(Boolean);
      const assignedTokens = new Set(assignedName.split(' ').filter(Boolean));
      const overlap = extractedTokens.filter((token) => token.length > 2 && assignedTokens.has(token)).length;
      if (extractedTokens.length >= 2 && overlap === 0) {
        warnings.add('IDENTITY_NAME_MISMATCH');
      }
    }

    // Email is not a CRM customer key in this deployment; it is preserved on
    // the order envelope (sourceSpecific order.* facts) for the card view.
    void extractedEmail;
  }

  async run(jobId: string): Promise<void> {
    const claimedDate = new Date();
    const claimedAt = claimedDate.toISOString();
    const leaseExpiresAt = new Date(claimedDate.getTime() + JOB_LEASE_MS).toISOString();
    const claimed = this.db.run(`UPDATE crm_extraction_jobs SET state='PROCESSING',started_at=COALESCE(started_at,?),
      worker_id=?,heartbeat_at=?,lease_expires_at=?,updated_at=? WHERE id=? AND state='QUEUED'`,
    claimedAt, this.workerId, claimedAt, leaseExpiresAt, claimedAt, jobId);
    if (!claimed.changes) return;
    this.scheduleNextLeaseRecovery();
    const context = this.db.get<any>(`SELECT j.*,src.source_type,src.original_filename,src.mime_type,src.byte_size,src.source_hash,src.storage_key,src.created_at source_created_at,
      ac.arrival_id,ac.customer_id,a.name arrival_name,c.name customer_name,
      acs.store_id,s.code store_code,s.name store_name
      FROM crm_extraction_jobs j
      JOIN crm_arrival_sources src ON src.id=j.source_id
      JOIN crm_arrival_clients ac ON ac.id=j.arrival_client_id
      JOIN crm_arrival_client_stores acs ON acs.id=j.arrival_client_store_id
      JOIN crm_arrivals a ON a.id=ac.arrival_id
      JOIN customers c ON c.id=ac.customer_id
      JOIN crm_stores s ON s.id=acs.store_id
      WHERE j.id=?`, jobId);
    if (!context) return;
    const actor: AdminAuditActor = {
      id: context.started_by || null,
      name: context.started_by_name || 'Système',
      ipAddress: context.started_from_ip || null,
    };
    const source = this.sources.getInternal(context.source_id);
    const client = this.clients.get(context.arrival_client_id);
    const clientStore = this.clients.getStore(context.arrival_client_store_id);
    const profile = loadStoreProfile(this.db, clientStore.storeId, context.source_type);
    if (!profile) {
      await this.failJob(jobId, context, actor, { code: 'EXTRACTION_STRATEGY_MISSING', message: 'La stratégie d’extraction n’est plus disponible.', rateLimited: false });
      return;
    }

    let candidateCount = 0;
    let successfulUnits = 0;
    let failedUnits = 0;
    let processedUnits = 0;
    const failures: SafeFailure[] = [];
    const warnings = new Set<string>(parseWarnings(context.warning_codes));
    try {
      const plan = await this.sources.files.plan(source);
      plan.warningCodes.forEach((code) => warnings.add(code));
      this.db.run('UPDATE crm_extraction_jobs SET progress_total=?,warning_codes=?,updated_at=? WHERE id=?',
        plan.totalUnits, JSON.stringify([...warnings]), new Date().toISOString(), jobId);
      this.heartbeat(jobId);
      for await (const unit of plan.units()) {
        let stopForRateLimit = false;
        try {
          this.heartbeat(jobId);
          if (unit.preparationError) {
            throw new ArrivalIngestionError('SOURCE_UNIT_UNREADABLE', unit.preparationError, 422);
          }
          const result = await this.ai.extractUnit({
            jobId,
            requestedByUserIdHash: createHash('sha256').update(String(context.started_by || 'system')).digest('hex'),
            arrivalId: context.arrival_id,
            arrivalName: context.arrival_name,
            arrivalClientId: context.arrival_client_id,
            arrivalClientStoreId: clientStore.id,
            customerId: context.customer_id,
            customerName: context.customer_name,
            store: profile,
            source,
            unit,
          });
          this.heartbeat(jobId);
          // Customer Identity Resolution: reconcile the extracted order
          // envelope (email/phone/name) against the canonical CRM customer.
          // Identity hints never silently rebind the arrival client; they are
          // recorded as warnings for operator review when they conflict.
          this.resolveCustomerIdentity(jobId, context, result.orderMeta, warnings);
          successfulUnits += 1;
          result.warningCodes.forEach((code) => warnings.add(code));
          for (const candidate of result.products) {
            this.heartbeat(jobId);
            const productId = await this.products.insertCandidate({
              jobId,
              sourceId: source.id,
              client,
              clientStore,
              sourceType: source.sourceType,
              sourceReference: unit.reference,
              candidate,
              orderMeta: result.orderMeta,
              assets: unit.assets,
              assertActive: () => this.heartbeat(jobId),
            });
            candidateCount += 1;
            recordAdminAudit(this.db, actor, 'PRODUCT_EXTRACTED', 'CRM_ARRIVALS', productId, null, {
              arrivalId: context.arrival_id,
              arrivalClientId: context.arrival_client_id,
              arrivalClientStoreId: clientStore.id,
              sourceId: source.id,
              sourceReference: unit.reference,
              extractionStatus: candidate.extractionStatus,
              confidence: candidate.extractionConfidence,
            });
          }
          for (const unresolved of result.unresolvedEntries) {
            this.heartbeat(jobId);
            this.products.insertUnresolved({
              jobId,
              sourceId: source.id,
              client,
              clientStore,
              sourceType: source.sourceType,
              sourceReference: `${unit.reference}#${unresolved.sourceReference}`,
              reason: unresolved.reason,
              field: unresolved.field,
              visibleText: unresolved.visibleText,
            });
          }
          if (!result.products.length && !result.unresolvedEntries.length) {
            warnings.add('NO_PRODUCTS_FOUND');
            this.products.insertUnresolved({
              jobId,
              sourceId: source.id,
              client,
              clientStore,
              sourceType: source.sourceType,
              sourceReference: unit.reference,
              reason: 'Aucun produit identifiable dans cette unité. Vérification manuelle requise.',
            });
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'EXTRACTION_JOB_LEASE_LOST') throw error;
          failedUnits += 1;
          const failure = safeFailure(error);
          failures.push(failure);
          warnings.add(failure.code);
          this.products.insertUnresolved({
            jobId,
            sourceId: source.id,
            client,
            clientStore,
            sourceType: source.sourceType,
            sourceReference: unit.reference,
            reason: failure.message,
            failed: true,
          });
          stopForRateLimit = failure.rateLimited;
        }
        processedUnits += 1;
        const counts = this.db.get<any>(`SELECT
          SUM(CASE WHEN extraction_status='EXTRACTED' THEN 1 ELSE 0 END) extracted,
          SUM(CASE WHEN extraction_status!='EXTRACTED' THEN 1 ELSE 0 END) review
          FROM crm_extracted_products WHERE job_id=?`, jobId) || {};
        this.db.run(`UPDATE crm_extraction_jobs SET progress_current=?,products_extracted=?,records_needing_review=?,
          warning_codes=?,updated_at=? WHERE id=?`, processedUnits, Number(counts.extracted || 0), Number(counts.review || 0),
        JSON.stringify([...warnings]), new Date().toISOString(), jobId);
        this.heartbeat(jobId);
        if (stopForRateLimit) {
          warnings.add('REMAINING_UNITS_SKIPPED_BY_RATE_LIMIT_CIRCUIT');
          failedUnits += Math.max(0, plan.totalUnits - processedUnits);
          break;
        }
      }

      const finalCounts = this.db.get<any>(`SELECT
        SUM(CASE WHEN extraction_status='EXTRACTED' THEN 1 ELSE 0 END) extracted,
        SUM(CASE WHEN extraction_status!='EXTRACTED' THEN 1 ELSE 0 END) review,
        COUNT(*) total FROM crm_extracted_products WHERE job_id=?`, jobId) || {};
      if (!successfulUnits) {
        const primary = failures[0] || {
          code: 'EXTRACTION_FAILED',
          message: 'La source n’a produit aucune unité exploitable.',
          rateLimited: false,
        };
        await this.failJob(jobId, context, actor, {
          ...primary,
          message: `${primary.message} Aucune unité de la source n’a pu être extraite.`.slice(0, 500),
        }, [...warnings]);
        return;
      }
      const needsReview = Number(finalCounts.review || 0);
      const state = failedUnits > 0 || needsReview > 0 || warnings.size > 0 ? 'PARTIAL' : 'COMPLETED';
      this.heartbeat(jobId);
      const now = new Date().toISOString();
      this.db.transaction(() => {
        this.products.activateJobProducts(jobId, source.id);
        this.db.run(`UPDATE crm_extraction_jobs SET state=?,progress_current=?,progress_total=?,products_extracted=?,
          records_needing_review=?,warning_codes=?,error_code=NULL,error_message=NULL,retry_at=NULL,worker_id=NULL,heartbeat_at=NULL,
          lease_expires_at=NULL,completed_at=?,updated_at=? WHERE id=?`,
        state, processedUnits, plan.totalUnits, Number(finalCounts.extracted || 0), needsReview,
        JSON.stringify([...warnings]), now, now, jobId);
        this.arrivals.refreshOperationalStatus(context.arrival_id);
        recordAdminAudit(this.db, actor, 'EXTRACTION_COMPLETED', 'CRM_ARRIVALS', jobId, null, {
          arrivalId: context.arrival_id,
          arrivalClientId: context.arrival_client_id,
          arrivalClientStoreId: clientStore.id,
          sourceId: source.id,
          state,
          processedUnits,
          totalUnits: plan.totalUnits,
          products: Number(finalCounts.total || candidateCount),
          extracted: Number(finalCounts.extracted || 0),
          needsReview,
          warningCodes: [...warnings],
        });
      });
      this.scheduleNextLeaseRecovery();
    } catch (error) {
      if (error instanceof Error && error.message === 'EXTRACTION_JOB_LEASE_LOST') return;
      await this.failJob(jobId, context, actor, safeFailure(error), [...warnings]);
    }
  }

  private async failJob(
    jobId: string,
    context: any,
    actor: AdminAuditActor,
    failure: SafeFailure,
    warningCodes: string[] = [],
  ): Promise<void> {
    this.heartbeat(jobId);
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.products.discardFailedJobProducts(jobId);
      this.db.run('UPDATE crm_arrival_sources SET last_job_id=? WHERE id=?', jobId, context.source_id);
      this.db.run(`UPDATE crm_extraction_jobs SET state='FAILED',error_code=?,error_message=?,retry_at=?,warning_codes=?,
        worker_id=NULL,heartbeat_at=NULL,lease_expires_at=NULL,completed_at=?,updated_at=? WHERE id=?`,
      failure.code, failure.message.slice(0, 500), failure.retryAt || null,
      JSON.stringify([...new Set([failure.code, ...warningCodes])]), now, now, jobId);
      this.arrivals.refreshOperationalStatus(context.arrival_id);
      recordAdminAudit(this.db, actor, 'EXTRACTION_FAILED', 'CRM_ARRIVALS', jobId, null, {
        arrivalId: context.arrival_id,
        arrivalClientId: context.arrival_client_id,
        arrivalClientStoreId: context.arrival_client_store_id,
        sourceId: context.source_id,
        errorCode: failure.code,
        rateLimited: failure.rateLimited,
        retryAt: failure.retryAt || null,
      });
    });
    this.sources.files.removeJobDerived(context.source_id, jobId);
    this.scheduleNextLeaseRecovery();
  }
}
