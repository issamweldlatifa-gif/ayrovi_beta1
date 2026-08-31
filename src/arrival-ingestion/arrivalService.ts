import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';

function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function jobRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    state: row.state,
    progressCurrent: Number(row.progress_current || 0),
    progressTotal: Number(row.progress_total || 0),
    productsExtracted: Number(row.products_extracted || 0),
    recordsNeedingReview: Number(row.records_needing_review || 0),
    warningCodes: parseJsonArray(row.warning_codes),
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
    attempt: Number(row.attempt || 1),
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sourceRow(row: any, latestJob?: any) {
  return {
    id: row.id,
    arrivalClientId: row.arrival_client_id,
    sourceType: row.source_type,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size || 0),
    sourceHash: row.source_hash,
    createdAt: row.created_at,
    latestJob: jobRow(latestJob),
  };
}

export class ArrivalService {
  constructor(private readonly db: QatafoDatabase) {}

  assertMutable(arrivalId: string): any {
    const arrival = this.db.get<any>('SELECT * FROM crm_arrivals WHERE id=?', arrivalId);
    if (!arrival) throw new ArrivalIngestionError('ARRIVAL_NOT_FOUND', 'Arrival introuvable.', 404);
    if (arrival.status === 'CONFIRMED') {
      throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est confirmé et ne peut plus être modifié.', 409);
    }
    return arrival;
  }

  create(nameInput: unknown, actor: AdminAuditActor) {
    const name = String(nameInput || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (name.length < 2) throw new ArrivalIngestionError('ARRIVAL_NAME_REQUIRED', 'Le nom de l’Arrival est requis.');
    const now = new Date().toISOString();
    const id = `crm_arrival_${randomUUID()}`;
    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_arrivals (id,name,status,created_at,updated_at)
        VALUES (?,?,'DRAFT',?,?)`, id, name, now, now);
      recordAdminAudit(this.db, actor, 'ARRIVAL_CREATED', 'CRM_ARRIVALS', id, null, { name, status: 'DRAFT' });
    });
    return this.get(id);
  }

  get(id: string): any {
    const row = this.db.get<any>('SELECT * FROM crm_arrivals WHERE id=?', id);
    if (!row) throw new ArrivalIngestionError('ARRIVAL_NOT_FOUND', 'Arrival introuvable.', 404);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmedAt: row.confirmed_at || null,
      confirmedBy: row.confirmed_by || null,
    };
  }

  list(input: { search?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input.pageSize) || 20)));
    const search = String(input.search || '').trim().slice(0, 100);
    const where = search ? 'WHERE a.name LIKE ?' : '';
    const params = search ? [`%${search}%`] : [];
    const total = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_arrivals a ${where}`, ...params)?.count || 0);
    const rows = this.db.all<any>(`SELECT a.*,
      COUNT(DISTINCT ac.id) customer_count,
      COUNT(DISTINCT CASE WHEN p.is_current=1 THEN p.id END) product_count
      FROM crm_arrivals a
      LEFT JOIN crm_arrival_clients ac ON ac.arrival_id=a.id
      LEFT JOIN crm_extracted_products p ON p.arrival_id=a.id
      ${where}
      GROUP BY a.id ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        confirmedAt: row.confirmed_at || null,
        summary: {
          customers: Number(row.customer_count || 0),
          products: Number(row.product_count || 0),
        },
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  detail(id: string) {
    const arrival = this.get(id);
    const clientRows = this.db.all<any>(`SELECT ac.*,c.name customer_name,c.phone customer_phone,c.status customer_status,
      s.code store_code,s.name store_name,s.active store_active
      FROM crm_arrival_clients ac
      JOIN customers c ON c.id=ac.customer_id
      LEFT JOIN crm_stores s ON s.id=ac.store_id
      WHERE ac.arrival_id=? ORDER BY ac.created_at`, id);
    const clients = clientRows.map((row) => {
      const sourceRows = this.db.all<any>(`SELECT * FROM crm_arrival_sources WHERE arrival_client_id=? ORDER BY created_at DESC`, row.id);
      const sources = sourceRows.map((source) => {
        const latestJob = source.last_job_id
          ? this.db.get<any>('SELECT * FROM crm_extraction_jobs WHERE id=?', source.last_job_id)
          : this.db.get<any>('SELECT * FROM crm_extraction_jobs WHERE source_id=? ORDER BY created_at DESC LIMIT 1', source.id);
        return sourceRow(source, latestJob);
      });
      const productSummary = this.db.get<any>(`SELECT COUNT(*) total,
        SUM(CASE WHEN extraction_status='EXTRACTED' THEN 1 ELSE 0 END) extracted,
        SUM(CASE WHEN extraction_status='NEEDS_REVIEW' THEN 1 ELSE 0 END) needs_review,
        SUM(CASE WHEN extraction_status='FAILED' THEN 1 ELSE 0 END) failed,
        SUM(CASE WHEN approved_at IS NOT NULL THEN 1 ELSE 0 END) approved
        FROM crm_extracted_products WHERE arrival_client_id=? AND is_current=1`, row.id) || {};
      const states = sources.map((source) => source.latestJob?.state).filter(Boolean);
      const extractionStatus = states.some((state) => state === 'QUEUED' || state === 'PROCESSING') ? 'PROCESSING'
        : Number(productSummary.needs_review || 0) > 0 || Number(productSummary.failed || 0) > 0 ? 'NEEDS_REVIEW'
          : states.some((state) => state === 'FAILED') ? 'FAILED'
            : Number(productSummary.total || 0) > 0 ? 'COMPLETED'
              : 'NOT_STARTED';
      return {
        id: row.id,
        arrivalId: row.arrival_id,
        customer: {
          id: row.customer_id,
          name: row.customer_name,
          phone: row.customer_phone,
          status: row.customer_status,
        },
        store: row.store_id ? {
          id: row.store_id,
          code: row.store_code,
          name: row.store_name,
          active: Boolean(row.store_active),
        } : null,
        extractionStatus,
        products: {
          total: Number(productSummary.total || 0),
          extracted: Number(productSummary.extracted || 0),
          needsReview: Number(productSummary.needs_review || 0),
          failed: Number(productSummary.failed || 0),
          approved: Number(productSummary.approved || 0),
        },
        sources,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
    const summary = {
      customers: clients.length,
      products: clients.reduce((sum, client) => sum + client.products.total, 0),
      completed: clients.filter((client) => client.extractionStatus === 'COMPLETED').length,
      needsReview: clients.filter((client) => client.extractionStatus === 'NEEDS_REVIEW').length,
      processing: clients.filter((client) => client.extractionStatus === 'PROCESSING').length,
      failed: clients.filter((client) => client.extractionStatus === 'FAILED').length,
      notStarted: clients.filter((client) => client.extractionStatus === 'NOT_STARTED').length,
    };
    return { ...arrival, summary, clients };
  }

  refreshOperationalStatus(arrivalId: string): void {
    const arrival = this.db.get<any>('SELECT status FROM crm_arrivals WHERE id=?', arrivalId);
    if (!arrival || arrival.status === 'CONFIRMED') return;
    const active = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_extraction_jobs j
      JOIN crm_arrival_clients ac ON ac.id=j.arrival_client_id
      WHERE ac.arrival_id=? AND j.state IN ('QUEUED','PROCESSING')`, arrivalId)?.count || 0);
    const jobs = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_extraction_jobs j
      JOIN crm_arrival_clients ac ON ac.id=j.arrival_client_id WHERE ac.arrival_id=?`, arrivalId)?.count || 0);
    const status = active > 0 ? 'PROCESSING' : jobs > 0 ? 'REVIEW' : 'DRAFT';
    this.db.run('UPDATE crm_arrivals SET status=?,updated_at=? WHERE id=?', status, new Date().toISOString(), arrivalId);
  }

  confirm(id: string, actor: AdminAuditActor) {
    const arrival = this.assertMutable(id);
    const clients = this.db.all<any>(`SELECT ac.*,c.id valid_customer,c.status customer_status,s.active store_active
      FROM crm_arrival_clients ac
      LEFT JOIN customers c ON c.id=ac.customer_id
      LEFT JOIN crm_stores s ON s.id=ac.store_id WHERE ac.arrival_id=?`, id);
    const issues: Array<{ code: string; clientId?: string; count?: number }> = [];
    if (!clients.length) issues.push({ code: 'NO_CLIENTS' });
    for (const client of clients) {
      if (!client.valid_customer || client.customer_status !== 'ACTIVE') issues.push({ code: 'INVALID_CUSTOMER', clientId: client.id });
      if (!client.store_id || !client.store_active) issues.push({ code: 'STORE_REQUIRED', clientId: client.id });
      const sources = this.db.all<any>('SELECT * FROM crm_arrival_sources WHERE arrival_client_id=?', client.id);
      if (!sources.length) issues.push({ code: 'SOURCE_REQUIRED', clientId: client.id });
      for (const source of sources) {
        const job = source.last_job_id ? this.db.get<any>('SELECT * FROM crm_extraction_jobs WHERE id=?', source.last_job_id) : null;
        if (!job) issues.push({ code: 'EXTRACTION_REQUIRED', clientId: client.id });
        else if (['QUEUED','PROCESSING','FAILED'].includes(job.state)) issues.push({ code: `EXTRACTION_${job.state}`, clientId: client.id });
        else if (Number(job.progress_total || 0) > Number(job.progress_current || 0)) {
          issues.push({ code: 'EXTRACTION_INCOMPLETE', clientId: client.id });
        }
      }
      const count = Number(this.db.get<any>('SELECT COUNT(*) count FROM crm_extracted_products WHERE arrival_client_id=? AND is_current=1', client.id)?.count || 0);
      if (!count) issues.push({ code: 'PRODUCTS_REQUIRED', clientId: client.id });
    }
    const activeJobs = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_extraction_jobs j
      JOIN crm_arrival_clients ac ON ac.id=j.arrival_client_id
      WHERE ac.arrival_id=? AND j.state IN ('QUEUED','PROCESSING')`, id)?.count || 0);
    if (activeJobs) issues.push({ code: 'EXTRACTIONS_IN_PROGRESS', count: activeJobs });
    const invalidProducts = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_extracted_products
      WHERE arrival_id=? AND is_current=1 AND (
        extraction_status!='EXTRACTED' OR approved_at IS NULL OR quantity IS NULL OR quantity<1
        OR (product_name IS NULL AND sku IS NULL AND reference IS NULL)
      )`, id)?.count || 0);
    if (invalidProducts) issues.push({ code: 'PRODUCTS_NEED_REVIEW', count: invalidProducts });
    if (issues.length) {
      throw new ArrivalIngestionError(
        'ARRIVAL_CONFIRMATION_BLOCKED',
        'L’Arrival contient encore des éléments à résoudre avant confirmation.',
        409,
        { issues },
      );
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`UPDATE crm_arrivals SET status='CONFIRMED',confirmed_at=?,confirmed_by=?,updated_at=? WHERE id=?`, now, actor.id, now, id);
      recordAdminAudit(this.db, actor, 'ARRIVAL_CONFIRMED', 'CRM_ARRIVALS', id,
        { status: arrival.status }, { status: 'CONFIRMED', customerCount: clients.length });
    });
    return this.detail(id);
  }
}

export { jobRow, sourceRow };
