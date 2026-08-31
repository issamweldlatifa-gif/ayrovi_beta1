import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';
import { sourceRow } from './arrivalService';
import { ArrivalClientService } from './arrivalClientService';
import { loadStoreProfile } from './storeProfiles';
import { SourceImportService, SourceValidationError, validateSourcePayload } from './sourceImportService';
import type { ArrivalSourceRecord, ArrivalSourceType } from './types';

const SOURCE_TYPES = new Set<ArrivalSourceType>(['PDF', 'EMAIL', 'IMAGE', 'INVOICE']);

export class ArrivalSourceService {
  constructor(
    private readonly db: QatafoDatabase,
    private readonly clients: ArrivalClientService,
    readonly files: SourceImportService,
  ) {}

  getInternal(id: string): ArrivalSourceRecord & { storageKey: string } {
    const row = this.db.get<any>('SELECT * FROM crm_arrival_sources WHERE id=?', id);
    if (!row) throw new ArrivalIngestionError('SOURCE_NOT_FOUND', 'Source introuvable.', 404);
    return {
      id: row.id,
      arrivalClientId: row.arrival_client_id,
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
    arrivalClientId: string;
    sourceType: unknown;
    buffer: Buffer;
    originalFilename?: string;
    claimedMime?: string;
  }, actor: AdminAuditActor) {
    const client = this.clients.get(input.arrivalClientId);
    if (client.arrival_status === 'CONFIRMED') throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est déjà confirmé.', 409);
    if (!client.store_id) throw new ArrivalIngestionError('STORE_REQUIRED', 'Sélectionnez le magasin avant d’ajouter la source.', 409);
    const sourceType = String(input.sourceType || '').toUpperCase() as ArrivalSourceType;
    if (!SOURCE_TYPES.has(sourceType)) throw new ArrivalIngestionError('SOURCE_TYPE_INVALID', 'Type de source invalide.');
    const profile = loadStoreProfile(this.db, client.store_id, sourceType);
    if (!profile) {
      throw new ArrivalIngestionError('SOURCE_NOT_SUPPORTED', 'Ce type de source n’est pas activé pour ce magasin.', 409);
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
      WHERE arrival_client_id=? AND source_hash=?`, input.arrivalClientId, validated.sourceHash);
    if (duplicate) {
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
          (id,arrival_client_id,source_type,original_filename,mime_type,byte_size,source_hash,storage_key,uploaded_by,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, id, input.arrivalClientId, sourceType, validated.originalFilename,
        validated.mimeType, validated.buffer.length, validated.sourceHash, storageKey, actor.id, now);
        recordAdminAudit(this.db, actor, 'SOURCE_UPLOADED', 'CRM_ARRIVALS', id, null, {
          arrivalId: client.arrival_id,
          arrivalClientId: input.arrivalClientId,
          sourceType,
          storeCode: client.store_code,
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
