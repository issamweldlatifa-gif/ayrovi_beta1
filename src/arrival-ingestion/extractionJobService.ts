import { createHash, randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { AiProviderError } from '../ai-core/errors';
import { ArrivalIngestionError, asArrivalIngestionError } from './errors';
import type { AIExtractionService } from './types';
import { ArrivalService, jobRow } from './arrivalService';
import { ArrivalClientService } from './arrivalClientService';
import { ArrivalSourceService } from './arrivalSourceService';
import { ExtractedProductService } from './extractedProductService';
import { loadStoreProfile } from './storeProfiles';

const JOB_LEASE_MS = 5 * 60_000;

function parseWarnings(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function safeFailure(error: unknown): { code: string; message: string; rateLimited: boolean } {
  if (error instanceof AiProviderError) {
    if (error.code === 'PROVIDER_RATE_LIMITED' || (error.code === 'PROVIDER_CIRCUIT_OPEN' && error.status === 429)) {
      return { code: 'AI_RATE_LIMITED', message: 'Le quota AI est temporairement indisponible. Réessayez après le délai indiqué par le service.', rateLimited: true };
    }
    if (error.code === 'PROVIDER_TIMEOUT') return { code: 'AI_TIMEOUT', message: 'Le service AI n’a pas répondu dans le délai prévu.', rateLimited: false };
    if (error.code === 'PROVIDER_NOT_CONFIGURED' || error.code === 'PROVIDER_AUTHENTICATION_FAILED') {
      return { code: 'AI_EXTRACTION_NOT_CONFIGURED', message: 'Le service d’extraction AI n’est pas configuré.', rateLimited: false };
    }
    return { code: 'AI_PROVIDER_UNAVAILABLE', message: 'Le service d’extraction AI est temporairement indisponible.', rateLimited: false };
  }
  const mapped = asArrivalIngestionError(error);
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
    this.arrivals.assertMutable(client.arrival_id);
    if (!client.store_id) throw new ArrivalIngestionError('STORE_REQUIRED', 'Sélectionnez le magasin avant l’extraction.', 409);
    const profile = loadStoreProfile(this.db, client.store_id, source.sourceType);
    if (!profile) throw new ArrivalIngestionError('SOURCE_NOT_SUPPORTED', 'Aucune stratégie active pour ce magasin et cette source.', 409);
    const active = this.db.get<any>(`SELECT * FROM crm_extraction_jobs
      WHERE source_id=? AND state IN ('QUEUED','PROCESSING') ORDER BY created_at DESC LIMIT 1`, sourceId);
    if (active) {
      throw new ArrivalIngestionError('EXTRACTION_IN_PROGRESS', 'Une extraction est déjà en cours pour cette source.', 409, { jobId: active.id });
    }
    const latest = this.db.get<any>('SELECT * FROM crm_extraction_jobs WHERE source_id=? ORDER BY created_at DESC LIMIT 1', sourceId);
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
        (id,source_id,arrival_client_id,strategy_key,state,attempt,started_by,started_by_name,started_from_ip,created_at,updated_at)
        VALUES (?,?,?,?,'QUEUED',?,?,?,?,?,?)`, id, sourceId, source.arrivalClientId, profile.strategyKey,
      attempt, actor.id, actor.name, actor.ipAddress, now, now);
      this.arrivals.refreshOperationalStatus(client.arrival_id);
      recordAdminAudit(this.db, actor, 'EXTRACTION_STARTED', 'CRM_ARRIVALS', id, null, {
        arrivalId: client.arrival_id,
        arrivalClientId: source.arrivalClientId,
        sourceId,
        sourceType: source.sourceType,
        storeCode: client.store_code,
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
    return jobRow(row);
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
    const now = new Date();
    const nowIso = now.toISOString();
    const pending = this.db.all<any>(`SELECT id,state,source_id FROM crm_extraction_jobs
      WHERE state='QUEUED' OR (state='PROCESSING' AND (lease_expires_at IS NULL OR lease_expires_at<=?))
      ORDER BY created_at`, nowIso);
    this.db.transaction(() => {
      for (const job of pending) {
        if (job.state === 'PROCESSING') {
          this.db.run('DELETE FROM crm_extracted_products WHERE job_id=? AND is_current=0', job.id);
          this.db.run(`UPDATE crm_extraction_jobs SET state='QUEUED',progress_current=0,progress_total=0,
            products_extracted=0,records_needing_review=0,attempt=attempt+1,worker_id=NULL,heartbeat_at=NULL,
            lease_expires_at=NULL,updated_at=? WHERE id=?`, nowIso, job.id);
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
      ac.arrival_id,ac.customer_id,ac.store_id,a.name arrival_name,c.name customer_name,
      s.code store_code,s.name store_name
      FROM crm_extraction_jobs j
      JOIN crm_arrival_sources src ON src.id=j.source_id
      JOIN crm_arrival_clients ac ON ac.id=j.arrival_client_id
      JOIN crm_arrivals a ON a.id=ac.arrival_id
      JOIN customers c ON c.id=ac.customer_id
      JOIN crm_stores s ON s.id=ac.store_id
      WHERE j.id=?`, jobId);
    if (!context) return;
    const actor: AdminAuditActor = {
      id: context.started_by || null,
      name: context.started_by_name || 'Système',
      ipAddress: context.started_from_ip || null,
    };
    const source = this.sources.getInternal(context.source_id);
    const client = this.clients.get(context.arrival_client_id);
    const profile = loadStoreProfile(this.db, context.store_id, context.source_type);
    if (!profile) {
      await this.failJob(jobId, context, actor, { code: 'EXTRACTION_STRATEGY_MISSING', message: 'La stratégie d’extraction n’est plus disponible.', rateLimited: false });
      return;
    }

    let candidateCount = 0;
    let successfulUnits = 0;
    let failedUnits = 0;
    let processedUnits = 0;
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
            customerId: context.customer_id,
            customerName: context.customer_name,
            store: profile,
            source,
            unit,
          });
          this.heartbeat(jobId);
          successfulUnits += 1;
          result.warningCodes.forEach((code) => warnings.add(code));
          for (const candidate of result.products) {
            this.heartbeat(jobId);
            const productId = await this.products.insertCandidate({
              jobId,
              sourceId: source.id,
              client,
              sourceType: source.sourceType,
              sourceReference: unit.reference,
              candidate,
              assets: unit.assets,
              assertActive: () => this.heartbeat(jobId),
            });
            candidateCount += 1;
            recordAdminAudit(this.db, actor, 'PRODUCT_EXTRACTED', 'CRM_ARRIVALS', productId, null, {
              arrivalId: context.arrival_id,
              arrivalClientId: context.arrival_client_id,
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
              sourceType: source.sourceType,
              sourceReference: `${unit.reference}#${unresolved.sourceReference}`,
              reason: unresolved.reason,
              visibleText: unresolved.visibleText,
            });
          }
          if (!result.products.length && !result.unresolvedEntries.length) {
            warnings.add('NO_PRODUCTS_FOUND');
            this.products.insertUnresolved({
              jobId,
              sourceId: source.id,
              client,
              sourceType: source.sourceType,
              sourceReference: unit.reference,
              reason: 'Aucun produit identifiable dans cette unité. Vérification manuelle requise.',
            });
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'EXTRACTION_JOB_LEASE_LOST') throw error;
          failedUnits += 1;
          const failure = safeFailure(error);
          warnings.add(failure.code);
          this.products.insertUnresolved({
            jobId,
            sourceId: source.id,
            client,
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
        await this.failJob(jobId, context, actor, {
          code: warnings.has('AI_RATE_LIMITED') ? 'AI_RATE_LIMITED' : 'EXTRACTION_FAILED',
          message: warnings.has('AI_RATE_LIMITED')
            ? 'Le quota AI est temporairement indisponible. Aucun nouvel appel n’a été relancé.'
            : 'Aucune unité de la source n’a pu être extraite.',
          rateLimited: warnings.has('AI_RATE_LIMITED'),
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
          records_needing_review=?,warning_codes=?,error_code=NULL,error_message=NULL,worker_id=NULL,heartbeat_at=NULL,
          lease_expires_at=NULL,completed_at=?,updated_at=? WHERE id=?`,
        state, processedUnits, plan.totalUnits, Number(finalCounts.extracted || 0), needsReview,
        JSON.stringify([...warnings]), now, now, jobId);
        this.arrivals.refreshOperationalStatus(context.arrival_id);
        recordAdminAudit(this.db, actor, 'EXTRACTION_COMPLETED', 'CRM_ARRIVALS', jobId, null, {
          arrivalId: context.arrival_id,
          arrivalClientId: context.arrival_client_id,
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
    failure: { code: string; message: string; rateLimited: boolean },
    warningCodes: string[] = [],
  ): Promise<void> {
    this.heartbeat(jobId);
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.products.discardFailedJobProducts(jobId);
      this.db.run('UPDATE crm_arrival_sources SET last_job_id=? WHERE id=?', jobId, context.source_id);
      this.db.run(`UPDATE crm_extraction_jobs SET state='FAILED',error_code=?,error_message=?,warning_codes=?,
        worker_id=NULL,heartbeat_at=NULL,lease_expires_at=NULL,completed_at=?,updated_at=? WHERE id=?`,
      failure.code, failure.message.slice(0, 500), JSON.stringify([...new Set(warningCodes)]), now, now, jobId);
      this.arrivals.refreshOperationalStatus(context.arrival_id);
      recordAdminAudit(this.db, actor, 'EXTRACTION_FAILED', 'CRM_ARRIVALS', jobId, null, {
        arrivalId: context.arrival_id,
        arrivalClientId: context.arrival_client_id,
        sourceId: context.source_id,
        errorCode: failure.code,
        rateLimited: failure.rateLimited,
      });
    });
    this.sources.files.removeJobDerived(context.source_id, jobId);
    this.scheduleNextLeaseRecovery();
  }
}
