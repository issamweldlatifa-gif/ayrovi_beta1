import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';
import type { NormalizedProductCandidate, SourceAsset } from './types';
import { ArrivalClientService } from './arrivalClientService';
import { SourceImportService } from './sourceImportService';

const EDITABLE_FIELDS = ['productName', 'sku', 'reference', 'variant', 'color', 'quantity'] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

function parseJson(value: unknown, fallback: unknown) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function cleanNullable(value: unknown, max: number): string | null {
  if (value == null || value === '') return null;
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null;
}

function editableValues(input: Record<string, unknown>, existing?: any): Record<EditableField, string | number | null> {
  const get = (field: EditableField) => field in input ? input[field] : existing?.[field === 'productName' ? 'product_name' : field];
  const quantityValue = get('quantity');
  const quantity = quantityValue == null || quantityValue === '' ? null : Number(quantityValue);
  if (quantity != null && (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000)) {
    throw new ArrivalIngestionError('QUANTITY_INVALID', 'La quantité doit être un entier entre 1 et 10 000.');
  }
  return {
    productName: cleanNullable(get('productName'), 300),
    sku: cleanNullable(get('sku'), 160),
    reference: cleanNullable(get('reference'), 160),
    variant: cleanNullable(get('variant'), 300),
    color: cleanNullable(get('color'), 160),
    quantity,
  };
}

function isValidProduct(row: any): boolean {
  return Boolean((row.product_name || row.sku || row.reference) && Number.isInteger(Number(row.quantity)) && Number(row.quantity) > 0);
}

export function mapExtractedProduct(row: any) {
  return {
    id: row.id,
    jobId: row.job_id || null,
    sourceId: row.source_id,
    arrivalClientId: row.arrival_client_id,
    arrivalClientStoreId: row.arrival_client_store_id,
    arrivalId: row.arrival_id,
    customerId: row.customer_id,
    storeId: row.store_id,
    productName: row.product_name || null,
    sku: row.sku || null,
    reference: row.reference || null,
    variant: row.variant || null,
    color: row.color || null,
    quantity: row.quantity == null ? null : Number(row.quantity),
    productImage: row.product_image_storage_key ? `/api/admin/arrival-ingestion/products/${row.id}/image` : null,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    extractionConfidence: Number(row.extraction_confidence || 0),
    extractionStatus: row.extraction_status,
    fieldEvidence: parseJson(row.field_evidence, {}),
    sourceSpecific: parseJson(row.source_specific, []),
    // raw_extracted is retained server-side for audit/reprocessing and never
    // crosses the AYROVI contract into the Administration frontend.
    reviewReasons: parseJson(row.review_reasons, []),
    manualEdits: parseJson(row.manual_edits, {}),
    approvedAt: row.approved_at || null,
    approvedBy: row.approved_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ExtractedProductService {
  constructor(
    private readonly db: QatafoDatabase,
    private readonly clients: ArrivalClientService,
    private readonly files: SourceImportService,
  ) {}

  private refreshJobCounts(jobId: string | null | undefined): void {
    if (!jobId) return;
    const counts = this.db.get<any>(`SELECT
      SUM(CASE WHEN extraction_status='EXTRACTED' THEN 1 ELSE 0 END) extracted,
      SUM(CASE WHEN extraction_status!='EXTRACTED' THEN 1 ELSE 0 END) review
      FROM crm_extracted_products WHERE job_id=? AND is_current=1`, jobId) || {};
    this.db.run(`UPDATE crm_extraction_jobs SET products_extracted=?,records_needing_review=?,updated_at=? WHERE id=?`,
      Number(counts.extracted || 0), Number(counts.review || 0), new Date().toISOString(), jobId);
  }

  list(clientId: string) {
    this.clients.get(clientId);
    return this.db.all<any>(`SELECT * FROM crm_extracted_products
      WHERE arrival_client_id=? AND is_current=1 ORDER BY created_at,id`, clientId).map(mapExtractedProduct);
  }

  listByStore(clientId: string, clientStoreId: string) {
    const assignment = this.clients.getStore(clientStoreId);
    if (assignment.arrivalClientId !== clientId) throw new ArrivalIngestionError('ARRIVAL_CLIENT_STORE_MISMATCH', 'Le Store ne correspond pas à ce client Arrival.', 409);
    return this.db.all<any>(`SELECT * FROM crm_extracted_products
      WHERE arrival_client_id=? AND arrival_client_store_id=? AND is_current=1 ORDER BY created_at,id`,
    clientId, clientStoreId).map(mapExtractedProduct);
  }

  getInternal(id: string): any {
    const row = this.db.get<any>('SELECT * FROM crm_extracted_products WHERE id=? AND is_current=1', id);
    if (!row) throw new ArrivalIngestionError('PRODUCT_NOT_FOUND', 'Produit extrait introuvable.', 404);
    return row;
  }

  async insertCandidate(input: {
    jobId: string;
    sourceId: string;
    client: any;
    clientStore: any;
    sourceType: string;
    sourceReference: string;
    candidate: NormalizedProductCandidate;
    assets: SourceAsset[];
    assertActive?: () => void;
  }): Promise<string> {
    const id = `crm_extracted_product_${randomUUID()}`;
    const asset = input.candidate.productImageRef
      ? input.assets.find((item) => item.id === input.candidate.productImageRef)
      : undefined;
    const imageStorageKey = asset
      ? await this.files.persistProductImage({
        sourceId: input.sourceId,
        jobId: input.jobId,
        productId: id,
        asset,
        region: input.candidate.productImageRegion,
      }).catch(() => null)
      : null;
    try {
      input.assertActive?.();
    } catch (error) {
      if (imageStorageKey) this.files.remove(imageStorageKey);
      throw error;
    }
    const now = new Date().toISOString();
    this.db.run(`INSERT INTO crm_extracted_products
      (id,job_id,source_id,arrival_client_id,arrival_client_store_id,arrival_id,customer_id,store_id,
       product_name,sku,reference,variant,color,quantity,product_image_storage_key,
       source_type,source_reference,extraction_confidence,extraction_status,
       field_evidence,source_specific,raw_extracted,review_reasons,is_current,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
    id, input.jobId, input.sourceId, input.client.id, input.clientStore.id, input.client.arrival_id,
    input.client.customer_id, input.clientStore.storeId,
    input.candidate.productName, input.candidate.sku, input.candidate.reference, input.candidate.variant,
    input.candidate.color, input.candidate.quantity, imageStorageKey, input.sourceType, input.sourceReference,
    input.candidate.extractionConfidence, input.candidate.extractionStatus,
    JSON.stringify(input.candidate.fieldEvidence), JSON.stringify(input.candidate.sourceSpecific),
    JSON.stringify(input.candidate.raw), JSON.stringify(input.candidate.reviewReasons), now, now);
    return id;
  }

  insertUnresolved(input: {
    jobId: string;
    sourceId: string;
    client: any;
    clientStore?: any;
    sourceType: string;
    sourceReference: string;
    reason: string;
    visibleText?: string | null;
    failed?: boolean;
  }): string {
    const id = `crm_extracted_product_${randomUUID()}`;
    const now = new Date().toISOString();
    const status = input.failed ? 'FAILED' : 'NEEDS_REVIEW';
    const clientStore = input.clientStore || (() => {
      const source = this.db.get<any>('SELECT arrival_client_store_id FROM crm_arrival_sources WHERE id=?', input.sourceId);
      if (!source?.arrival_client_store_id) throw new ArrivalIngestionError('SOURCE_STORE_ASSIGNMENT_MISSING', 'Cette source doit être rattachée à un Store.', 409);
      return this.clients.getStore(source.arrival_client_store_id);
    })();
    this.db.run(`INSERT INTO crm_extracted_products
      (id,job_id,source_id,arrival_client_id,arrival_client_store_id,arrival_id,customer_id,store_id,
       source_type,source_reference,extraction_confidence,extraction_status,
       field_evidence,source_specific,raw_extracted,review_reasons,is_current,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,0,?,'{}','[]',?,?,0,?,?)`,
    id, input.jobId, input.sourceId, input.client.id, clientStore.id, input.client.arrival_id, input.client.customer_id,
    clientStore.storeId, input.sourceType, input.sourceReference, status,
    JSON.stringify({ visibleText: input.visibleText || null }), JSON.stringify([String(input.reason).slice(0, 500)]), now, now);
    return id;
  }

  /** Caller owns the finalization transaction with job state + audit. */
  activateJobProducts(jobId: string, sourceId: string): void {
    const now = new Date().toISOString();
    this.db.run(`UPDATE crm_extracted_products SET is_current=0,superseded_at=?,superseded_by_job_id=?,updated_at=?
      WHERE source_id=? AND is_current=1 AND (job_id IS NULL OR job_id!=?)`, now, jobId, now, sourceId, jobId);
    this.db.run('UPDATE crm_extracted_products SET is_current=1,updated_at=? WHERE job_id=?', now, jobId);
    this.db.run('UPDATE crm_arrival_sources SET last_job_id=? WHERE id=?', jobId, sourceId);
  }

  discardFailedJobProducts(jobId: string): void {
    this.db.run('UPDATE crm_extracted_products SET is_current=0,product_image_storage_key=NULL,updated_at=? WHERE job_id=?', new Date().toISOString(), jobId);
  }

  createManual(clientId: string, input: Record<string, unknown>, actor: AdminAuditActor) {
    const client = this.clients.get(clientId);
    if (client.arrival_status === 'CONFIRMED') throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est déjà confirmé.', 409);
    const sourceId = String(input.sourceId || '').trim();
    const source = this.db.get<any>('SELECT * FROM crm_arrival_sources WHERE id=? AND arrival_client_id=?', sourceId, clientId);
    if (!source) throw new ArrivalIngestionError('SOURCE_NOT_FOUND', 'Sélectionnez la source du produit manquant.', 404);
    if (!source.arrival_client_store_id) throw new ArrivalIngestionError('SOURCE_STORE_ASSIGNMENT_MISSING', 'Cette source doit être rattachée à un Store.', 409);
    const clientStore = this.clients.getStore(source.arrival_client_store_id);
    const values = editableValues(input);
    const id = `crm_extracted_product_${randomUUID()}`;
    const now = new Date().toISOString();
    const evidence = Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, values[field] == null ? null : 'Saisie manuelle par un administrateur après consultation de la source.']));
    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_extracted_products
        (id,job_id,source_id,arrival_client_id,arrival_client_store_id,arrival_id,customer_id,store_id,
         product_name,sku,reference,variant,color,quantity,source_type,source_reference,
         extraction_confidence,extraction_status,field_evidence,source_specific,raw_extracted,
         review_reasons,manual_edits,is_current,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? ,?,'[]','{}',? ,?,1,?,?)`,
      id, source.last_job_id || null, source.id, clientId, clientStore.id, client.arrival_id, client.customer_id, clientStore.storeId,
      values.productName, values.sku, values.reference, values.variant, values.color, values.quantity,
      source.source_type, `${source.id}#manual`, 1, 'NEEDS_REVIEW', JSON.stringify(evidence),
      JSON.stringify(['MANUAL_RECORD_REQUIRES_APPROVAL']), JSON.stringify(values), now, now);
      this.refreshJobCounts(source.last_job_id);
      recordAdminAudit(this.db, actor, 'PRODUCT_UPDATED', 'CRM_ARRIVALS', id, null, {
        operation: 'MANUAL_PRODUCT_CREATED', arrivalId: client.arrival_id, arrivalClientId: clientId, sourceId,
      });
    });
    return mapExtractedProduct(this.getInternal(id));
  }

  update(id: string, input: Record<string, unknown>, actor: AdminAuditActor) {
    const existing = this.getInternal(id);
    const client = this.clients.get(existing.arrival_client_id);
    if (client.arrival_status === 'CONFIRMED') throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est déjà confirmé.', 409);
    const values = editableValues(input, existing);
    const oldValues = editableValues({}, existing);
    const edits = parseJson(existing.manual_edits, {}) as Record<string, unknown>;
    const evidence = parseJson(existing.field_evidence, {}) as Record<string, unknown>;
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of EDITABLE_FIELDS) {
      if (oldValues[field] !== values[field]) {
        changed[field] = { from: oldValues[field], to: values[field] };
        edits[field] = { value: values[field], actorId: actor.id, at: new Date().toISOString() };
        evidence[field] = values[field] == null ? null : 'Correction manuelle par un administrateur après consultation de la source.';
      }
    }
    if (!Object.keys(changed).length) return mapExtractedProduct(existing);
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`UPDATE crm_extracted_products SET product_name=?,sku=?,reference=?,variant=?,color=?,quantity=?,
        extraction_status='NEEDS_REVIEW',approved_at=NULL,approved_by=NULL,review_reasons=?,manual_edits=?,field_evidence=?,updated_at=? WHERE id=?`,
      values.productName, values.sku, values.reference, values.variant, values.color, values.quantity,
      JSON.stringify(['MANUAL_CHANGE_REQUIRES_APPROVAL']), JSON.stringify(edits), JSON.stringify(evidence), now, id);
      this.refreshJobCounts(existing.job_id);
      recordAdminAudit(this.db, actor, 'PRODUCT_UPDATED', 'CRM_ARRIVALS', id, oldValues, { ...values, changedFields: Object.keys(changed) });
    });
    return mapExtractedProduct(this.getInternal(id));
  }

  approve(id: string, actor: AdminAuditActor) {
    const existing = this.getInternal(id);
    const client = this.clients.get(existing.arrival_client_id);
    if (client.arrival_status === 'CONFIRMED') throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est déjà confirmé.', 409);
    if (!isValidProduct(existing)) {
      throw new ArrivalIngestionError('PRODUCT_INVALID', 'Ajoutez une identité produit et une quantité valide avant approbation.', 409);
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`UPDATE crm_extracted_products SET extraction_status='EXTRACTED',review_reasons='[]',
        approved_at=?,approved_by=?,updated_at=? WHERE id=?`, now, actor.id, now, id);
      this.refreshJobCounts(existing.job_id);
      recordAdminAudit(this.db, actor, 'PRODUCT_UPDATED', 'CRM_ARRIVALS', id,
        { extractionStatus: existing.extraction_status, approved: Boolean(existing.approved_at) },
        { extractionStatus: 'EXTRACTED', approved: true });
    });
    return mapExtractedProduct(this.getInternal(id));
  }

  approveAll(clientId: string, actor: AdminAuditActor) {
    const client = this.clients.get(clientId);
    if (client.arrival_status === 'CONFIRMED') throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est déjà confirmé.', 409);
    const rows = this.db.all<any>('SELECT * FROM crm_extracted_products WHERE arrival_client_id=? AND is_current=1', clientId);
    const valid = rows.filter(isValidProduct);
    const toApprove = valid.filter((row) => row.extraction_status !== 'EXTRACTED' || !row.approved_at);
    const jobIds = new Set(toApprove.map((row) => String(row.job_id || '')).filter(Boolean));
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const row of toApprove) {
        this.db.run(`UPDATE crm_extracted_products SET extraction_status='EXTRACTED',review_reasons='[]',
          approved_at=?,approved_by=?,updated_at=? WHERE id=?`, now, actor.id, now, row.id);
        recordAdminAudit(this.db, actor, 'PRODUCT_UPDATED', 'CRM_ARRIVALS', row.id,
          { extractionStatus: row.extraction_status, approved: Boolean(row.approved_at) },
          { extractionStatus: 'EXTRACTED', approved: true, operation: 'BATCH_APPROVAL' });
      }
      for (const jobId of jobIds) this.refreshJobCounts(jobId);
    });
    return { approved: toApprove.length, unresolved: rows.length - valid.length, products: this.list(clientId) };
  }

  approveAllByStore(clientId: string, clientStoreId: string, actor: AdminAuditActor) {
    const client = this.clients.get(clientId);
    if (client.arrival_status === 'CONFIRMED') throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est déjà confirmé.', 409);
    const assignment = this.clients.getStore(clientStoreId);
    if (assignment.arrivalClientId !== clientId) throw new ArrivalIngestionError('ARRIVAL_CLIENT_STORE_MISMATCH', 'Le Store ne correspond pas à ce client Arrival.', 409);
    const rows = this.db.all<any>(`SELECT * FROM crm_extracted_products
      WHERE arrival_client_id=? AND arrival_client_store_id=? AND is_current=1`, clientId, clientStoreId);
    const valid = rows.filter(isValidProduct);
    const toApprove = valid.filter((row) => row.extraction_status !== 'EXTRACTED' || !row.approved_at);
    const jobIds = new Set(toApprove.map((row) => String(row.job_id || '')).filter(Boolean));
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const row of toApprove) {
        this.db.run(`UPDATE crm_extracted_products SET extraction_status='EXTRACTED',review_reasons='[]',
          approved_at=?,approved_by=?,updated_at=? WHERE id=?`, now, actor.id, now, row.id);
        recordAdminAudit(this.db, actor, 'PRODUCT_UPDATED', 'CRM_ARRIVALS', row.id,
          { extractionStatus: row.extraction_status, approved: Boolean(row.approved_at) },
          { extractionStatus: 'EXTRACTED', approved: true, operation: 'STORE_BATCH_APPROVAL', arrivalClientStoreId: clientStoreId });
      }
      for (const jobId of jobIds) this.refreshJobCounts(jobId);
    });
    return { approved: toApprove.length, unresolved: rows.length - valid.length, products: this.listByStore(clientId, clientStoreId) };
  }

  image(id: string): Buffer {
    const row = this.getInternal(id);
    if (!row.product_image_storage_key) throw new ArrivalIngestionError('PRODUCT_IMAGE_NOT_FOUND', 'Ce produit ne possède pas d’image source.', 404);
    return this.files.read(row.product_image_storage_key);
  }
}
