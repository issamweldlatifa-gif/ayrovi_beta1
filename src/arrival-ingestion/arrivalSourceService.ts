import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';
import { ArrivalClientService } from './arrivalClientService';
import { loadStoreProfile } from './storeProfiles';
import { SourceImportService, SourceValidationError, validateSourcePayload } from './sourceImportService';
import type { ArrivalSourceRecord, ArrivalSourceType } from './types';

const SOURCE_TYPES = new Set<ArrivalSourceType>(['PDF', 'EMAIL', 'IMAGE', 'INVOICE']);

function sourceRow(row: any, latestJob: any) {
  return {
    id: row.id,
    arrivalClientId: row.arrival_client_id,
    arrivalClientStoreId: row.arrival_client_store_id,
    sourceType: row.source_type,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    sourceHash: row.source_hash,
    createdAt: row.created_at,
    latestJob: latestJob ? {
      id: latestJob.id,
      state: latestJob.state,
      progressCurrent: Number(latestJob.progress_current || 0),
      progressTotal: Number(latestJob.progress_total || 0),
      productsExtracted: Number(latestJob.products_extracted || 0),
      recordsNeedingReview: Number(latestJob.records_needing_review || 0),
      warningCodes: (() => {
        try { return JSON.parse(latestJob.warning_codes || '[]'); } catch { return []; }
      })(),
      errorCode: latestJob.error_code || null,
      errorMessage: latestJob.error_message || null,
      retryAt: latestJob.retry_at || null,
      attempt: Number(latestJob.attempt || 1),
      startedAt: latestJob.started_at || null,
      completedAt: latestJob.completed_at || null,
      createdAt: latestJob.created_at || null,
      updatedAt: latestJob.updated_at || null,
    } : null,
  };
}

export class ArrivalSourceService {
  constructor(
    private readonly db: QatafoDatabase,
    private readonly clients: ArrivalClientService,
    readonly files: SourceImportService,
  ) {}

  getInternal(id: string): ArrivalSourceRecord & { storageKey: string } {
    const row = this.db.get<any>('SELECT * FROM crm_arrival_sources WHERE id=?', id);
    if (!row) throw new ArrivalIngestionError('SOURCE_NOT_FOUND', 'Source introuvable.', 404);
    if (!row.arrival_client_store_id) {
      throw new ArrivalIngestionError('SOURCE_STORE_ASSIGNMENT_MISSING', 'Cette source historique doit être rattachée à un Store.', 409);
    }
    return {
      id: row.id,
      arrivalClientId: row.arrival_client_id,
      arrivalClientStoreId: row.arrival_client_store_id,
      sourceType: row.source_type,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size),
      sourceHash: row.source_hash,
      storageKey: row.storage_key,
      createdAt: row.created_at,
    };
  }

  create(input: {
    arrivalClientId?: string;
    arrivalClientStoreId?: string;
    sourceType: unknown;
    buffer: Buffer;
    originalFilename?: string;
    claimedMime?: string;
  }, actor: AdminAuditActor) {
    const assignment = input.arrivalClientStoreId
      ? this.clients.getStore(input.arrivalClientStoreId)
      : this.clients.resolveSingleStore(String(input.arrivalClientId || ''));
    if (input.arrivalClientId && assignment.arrivalClientId !== input.arrivalClientId) {
      throw new ArrivalIngestionError('ARRIVAL_CLIENT_STORE_MISMATCH', 'Le Store ne correspond pas à ce client Arrival.', 409);
    }
    const client = this.clients.get(assignment.arrivalClientId);
    if (client.arrivalStatus === 'CONFIRMED') throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est déjà confirmé.', 409);
    const sourceType = String(input.sourceType || '').toUpperCase() as ArrivalSourceType;
    if (!SOURCE_TYPES.has(sourceType)) throw new ArrivalIngestionError('SOURCE_TYPE_INVALID', 'Type de source invalide.');
    const profile = loadStoreProfile(this.db, assignment.storeId, sourceType);
    if (!profile) {
      throw new ArrivalIngestionError('SOURCE_NOT_SUPPORTED', 'Ce type de source n’est pas activé pour ce Store.', 409);
    }
    let validated: ReturnType<typeof validateSourcePayload>;
    try {
      validated = validateSourcePayload({
        sourceType,
        buffer: input.buffer,
        originalFilename: input.originalFilename,
        claimedMime: input.claimedMime,
      });
    } catch (error) {
      if (error instanceof SourceValidationError) {
        throw new ArrivalIngestionError(error.code, error.message, 415);
      }
      throw error;
    }
    const duplicate = this.db.get<any>(`SELECT * FROM crm_arrival_sources
      WHERE arrival_client_id=? AND source_hash=?`, assignment.arrivalClientId, validated.sourceHash);
    if (duplicate) {
      if (duplicate.arrival_client_store_id !== assignment.id) {
        throw new ArrivalIngestionError(
          'SOURCE_ALREADY_ASSIGNED_OTHER_STORE',
          'Cette source identique est déjà rattachée à un autre Store de ce client.',
          409,
        );
      }
      const latestJob = duplicate.last_job_id
        ? this.db.get<any>('SELECT * FROM crm_extraction_jobs WHERE id=?', duplicate.last_job_id)
        : null;
      return { duplicate: true, source: sourceRow(duplicate, latestJob) };
    }
    const id = `crm_source_${randomUUID()}`;
    let storageKey = '';
    try {
      storageKey = this.files.storeOriginal(id, validated.buffer, validated.extension);
      const now = new Date().toISOString();
      this.db.transaction(() => {
        this.db.run(`INSERT INTO crm_arrival_sources
          (id,arrival_client_id,arrival_client_store_id,source_type,original_filename,mime_type,byte_size,source_hash,storage_key,uploaded_by,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, assignment.arrivalClientId, assignment.id, sourceType,
        validated.originalFilename, validated.mimeType, validated.buffer.length, validated.sourceHash, storageKey, actor.id, now);
        recordAdminAudit(this.db, actor, 'SOURCE_UPLOADED', 'CRM_ARRIVALS', id, null, {
          arrivalId: client.arrivalId,
          arrivalClientId: assignment.arrivalClientId,
          arrivalClientStoreId: assignment.id,
          sourceType,
          storeCode: assignment.store.code,
          filename: validated.originalFilename,
          bytes: validated.buffer.length,
          sourceHash: validated.sourceHash,
        });
      });
      const created = this.db.get<any>('SELECT * FROM crm_arrival_sources WHERE id=?', id);
      return { duplicate: false, source: sourceRow(created, null) };
    } catch (error) {
      if (storageKey) this.files.removeSourceDirectory(id);
      throw error;
    }
  }

  content(id: string): { buffer: Buffer; mimeType: string; filename: string } {
    const source = this.getInternal(id);
    return {
      buffer: this.files.read(source.storageKey),
      mimeType: source.mimeType,
      filename: source.originalFilename,
    };
  }
}
