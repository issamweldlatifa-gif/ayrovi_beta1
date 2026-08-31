import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function aggregateExtractionStatus(stores: Array<{ extractionStatus: string }>): string {
  const states = stores.map((store) => store.extractionStatus);
  if (states.includes('PROCESSING') || states.includes('QUEUED')) return 'PROCESSING';
  if (states.includes('NEEDS_REVIEW')) return 'NEEDS_REVIEW';
  if (states.includes('FAILED')) return 'FAILED';
  if (states.length && states.every((state) => state === 'COMPLETED')) return 'COMPLETED';
  return 'NOT_STARTED';
}

export class ArrivalService {
  constructor(private readonly db: QatafoDatabase) {}

  list(input: { search?: string; page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input.pageSize) || 20)));
    const search = String(input.search || '').trim().slice(0, 100);
    const where = search ? 'WHERE a.name LIKE ?' : '';
    const params = search ? [`%${search}%`] : [];
    const total = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_arrivals a ${where}`, ...params)?.count || 0);
    const rows = this.db.all<any>(`SELECT a.*,
      COUNT(DISTINCT ac.id) customer_count,
      COUNT(DISTINCT acs.id) store_count,
      COUNT(DISTINCT CASE WHEN p.is_current=1 THEN p.id END) product_count
      FROM crm_arrivals a
      LEFT JOIN crm_arrival_clients ac ON ac.arrival_id=a.id
      LEFT JOIN crm_arrival_client_stores acs ON acs.arrival_client_id=ac.id
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
          stores: Number(row.store_count || 0),
          products: Number(row.product_count || 0),
        },
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  get(id: string) {
    const row = this.db.get<any>('SELECT * FROM crm_arrivals WHERE id=?', id);
    if (!row) throw new ArrivalIngestionError('ARRIVAL_NOT_FOUND', 'Arrival introuvable.', 404);
    return row;
  }

  create(nameInput: unknown, actor: AdminAuditActor) {
    const cleanName = String(nameInput || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (cleanName.length < 2) throw new ArrivalIngestionError('ARRIVAL_NAME_REQUIRED', 'Le nom de l’Arrival est requis.');
    const id = `crm_arrival_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_arrivals (id,name,status,created_at,updated_at)
        VALUES (?,?, 'DRAFT', ?,?)`, id, cleanName, now, now);
      recordAdminAudit(this.db, actor, 'ARRIVAL_CREATED', 'CRM_ARRIVALS', id, null, { name: cleanName, status: 'DRAFT' });
    });
    return this.detail(id);
  }

  assertMutable(id: string) {
    const arrival = this.get(id);
    if (arrival.status === 'CONFIRMED') {
      throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est confirmé et ne peut plus être modifié.', 409);
    }
    return arrival;
  }

  detail(id: string) {
    const arrival = this.get(id);
    const clientRows = this.db.all<any>(`SELECT ac.*,c.name customer_name,c.phone customer_phone,
      c.governorate customer_governorate,c.address customer_address,c.status customer_status
      FROM crm_arrival_clients ac JOIN customers c ON c.id=ac.customer_id
      WHERE ac.arrival_id=? ORDER BY ac.created_at`, id);
    const assignmentRows = this.db.all<any>(`SELECT acs.*,s.code store_code,s.name store_name,s.active store_active
      FROM crm_arrival_client_stores acs
      JOIN crm_arrival_clients ac ON ac.id=acs.arrival_client_id
      JOIN crm_stores s ON s.id=acs.store_id
      WHERE ac.arrival_id=? ORDER BY acs.created_at,acs.id`, id);
    const sourceRows = this.db.all<any>(`SELECT src.*,
      j.id job_id,j.state job_state,j.progress_current,j.progress_total,j.products_extracted,
      j.records_needing_review,j.warning_codes,j.error_code,j.error_message,j.retry_at,j.attempt,
      j.started_at,j.completed_at,j.created_at job_created_at,j.updated_at job_updated_at
      FROM crm_arrival_sources src
      LEFT JOIN crm_extraction_jobs j ON j.id=(
        SELECT latest.id FROM crm_extraction_jobs latest
        WHERE latest.source_id=src.id ORDER BY latest.created_at DESC LIMIT 1
      )
      JOIN crm_arrival_clients ac ON ac.id=src.arrival_client_id
      WHERE ac.arrival_id=? ORDER BY src.created_at DESC`, id);
    const productRows = this.db.all<any>(`SELECT arrival_client_store_id,
      COUNT(*) total,
      SUM(CASE WHEN approved_at IS NULL THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN approved_at IS NOT NULL THEN 1 ELSE 0 END) approved,
      SUM(CASE WHEN extraction_status='EXTRACTED' THEN 1 ELSE 0 END) extracted,
      SUM(CASE WHEN extraction_status='NEEDS_REVIEW' THEN 1 ELSE 0 END) needs_review,
      SUM(CASE WHEN extraction_status='FAILED' THEN 1 ELSE 0 END) failed
      FROM crm_extracted_products WHERE arrival_id=? AND is_current=1
      GROUP BY arrival_client_store_id`, id);
    const productByStore = new Map(productRows.map((row) => [String(row.arrival_client_store_id || ''), row]));

    const clients = clientRows.map((row) => {
      const stores = assignmentRows.filter((assignment) => assignment.arrival_client_id === row.id).map((assignment) => {
        const sources = sourceRows.filter((source) => source.arrival_client_store_id === assignment.id).map((source) => ({
          id: source.id,
          sourceType: source.source_type,
          originalFilename: source.original_filename,
          mimeType: source.mime_type,
          byteSize: Number(source.byte_size),
          sourceHash: source.source_hash,
          createdAt: source.created_at,
          latestJob: source.job_id ? {
            id: source.job_id,
            state: source.job_state,
            progressCurrent: Number(source.progress_current || 0),
            progressTotal: Number(source.progress_total || 0),
            productsExtracted: Number(source.products_extracted || 0),
            recordsNeedingReview: Number(source.records_needing_review || 0),
            warningCodes: parseStringArray(source.warning_codes),
            errorCode: source.error_code || null,
            errorMessage: source.error_message || null,
            retryAt: source.retry_at || null,
            attempt: Number(source.attempt || 1),
            startedAt: source.started_at || null,
            completedAt: source.completed_at || null,
            createdAt: source.job_created_at || null,
            updatedAt: source.job_updated_at || null,
          } : null,
        }));
        const summary = productByStore.get(String(assignment.id)) || {};
        const productSummary = {
          total: Number(summary.total || 0),
          pending: Number(summary.pending || 0),
          approved: Number(summary.approved || 0),
          extracted: Number(summary.extracted || 0),
          failed: Number(summary.failed || 0),
          needsReview: Number(summary.needs_review || 0),
        };
        const currentJob = sources.find((source) => source.latestJob?.state === 'PROCESSING' || source.latestJob?.state === 'QUEUED')?.latestJob
          || sources.find((source) => source.latestJob)?.latestJob || null;
        const sourceStates = sources.map((source) => source.latestJob?.state).filter(Boolean);
        const extractionStatus = sourceStates.includes('PROCESSING') || sourceStates.includes('QUEUED')
          ? 'PROCESSING'
          : productSummary.pending > 0 || productSummary.needsReview > 0
            ? 'NEEDS_REVIEW'
            : sourceStates.includes('FAILED')
              ? 'FAILED'
              : productSummary.total > 0 && productSummary.pending === 0
                ? 'COMPLETED'
                : 'NOT_STARTED';
        return {
          id: assignment.id,
          arrivalClientId: assignment.arrival_client_id,
          storeId: assignment.store_id,
          store: {
            id: assignment.store_id,
            code: assignment.store_code,
            name: assignment.store_name,
            active: Boolean(assignment.store_active),
          },
          sources,
          currentJob,
          extractionStatus,
          products: productSummary,
          createdAt: assignment.created_at,
          updatedAt: assignment.updated_at,
        };
      });
      const productSummary = stores.reduce((total, assignment) => ({
        total: total.total + assignment.products.total,
        pending: total.pending + assignment.products.pending,
        approved: total.approved + assignment.products.approved,
        extracted: total.extracted + assignment.products.extracted,
        failed: total.failed + assignment.products.failed,
        needsReview: total.needsReview + assignment.products.needsReview,
      }), { total: 0, pending: 0, approved: 0, extracted: 0, failed: 0, needsReview: 0 });
      const alias = row.display_alias ? String(row.display_alias) : null;
      return {
        id: row.id,
        arrivalId: row.arrival_id,
        customerId: row.customer_id,
        displayAlias: alias,
        displayName: alias || row.customer_name,
        customer: {
          id: row.customer_id,
          name: row.customer_name,
          phone: row.customer_phone,
          governorate: row.customer_governorate || '',
          address: row.customer_address || '',
          status: row.customer_status,
          active: row.customer_status === 'ACTIVE',
        },
        stores,
        // Compatibility projection for older consumers. New callers must use stores[].
        storeId: stores[0]?.storeId || null,
        store: stores[0]?.store || null,
        sources: stores.flatMap((assignment) => assignment.sources),
        currentJob: stores.find((assignment) => assignment.currentJob)?.currentJob || null,
        extractionStatus: aggregateExtractionStatus(stores),
        products: productSummary,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    const issues: Array<Record<string, unknown>> = [];
    if (!clients.length) issues.push({ code: 'CLIENT_REQUIRED', message: 'Ajoutez au moins un client.' });
    for (const client of clients) {
      if (!client.customer.active) issues.push({ code: 'CUSTOMER_INACTIVE', clientId: client.id, message: `${client.displayName}: client inactif.` });
      if (!client.stores.length) issues.push({ code: 'STORE_REQUIRED', clientId: client.id, message: `${client.displayName}: aucun Store affecté.` });
      for (const assignment of client.stores) {
        if (!assignment.store.active) {
          issues.push({ code: 'STORE_INVALID', clientId: client.id, clientStoreId: assignment.id, message: `${client.displayName} · ${assignment.store.name}: Store inactif.` });
        }
        if (!assignment.sources.length) {
          issues.push({ code: 'STORE_SOURCE_REQUIRED', clientId: client.id, clientStoreId: assignment.id, message: `${client.displayName} · ${assignment.store.name}: ajoutez une source.` });
        }
        for (const source of assignment.sources) {
          if (!source.latestJob) {
            issues.push({ code: 'EXTRACTION_REQUIRED', clientId: client.id, clientStoreId: assignment.id, sourceId: source.id, message: `${client.displayName} · ${assignment.store.name}: lancez l’extraction.` });
          } else if (source.latestJob.state === 'FAILED') {
            issues.push({ code: 'EXTRACTION_FAILED', clientId: client.id, clientStoreId: assignment.id, sourceId: source.id, errorCode: source.latestJob.errorCode, message: source.latestJob.errorMessage || 'L’extraction a échoué.' });
          } else if (source.latestJob.state === 'QUEUED' || source.latestJob.state === 'PROCESSING') {
            issues.push({ code: `EXTRACTION_${source.latestJob.state}`, clientId: client.id, clientStoreId: assignment.id, sourceId: source.id, message: 'Une extraction est encore en cours.' });
          } else if (source.latestJob.progressTotal > source.latestJob.progressCurrent) {
            issues.push({ code: 'EXTRACTION_INCOMPLETE', clientId: client.id, clientStoreId: assignment.id, sourceId: source.id, message: 'Toutes les unités de la source ne sont pas traitées.' });
          }
        }
        if (!assignment.products.total) {
          issues.push({ code: 'PRODUCTS_REQUIRED', clientId: client.id, clientStoreId: assignment.id, message: `${client.displayName} · ${assignment.store.name}: aucune ligne produit extraite.` });
        }
        if (assignment.products.pending > 0) {
          issues.push({ code: 'PRODUCT_REVIEW_REQUIRED', clientId: client.id, clientStoreId: assignment.id, message: `${client.displayName} · ${assignment.store.name}: ${assignment.products.pending} ligne(s) à réviser.` });
        }
      }
    }
    const invalidProducts = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_extracted_products
      WHERE arrival_id=? AND is_current=1 AND (
        extraction_status!='EXTRACTED' OR approved_at IS NULL OR
        quantity IS NULL OR quantity<=0 OR (product_name IS NULL AND sku IS NULL AND reference IS NULL)
      )`, id)?.count || 0);
    if (invalidProducts) issues.push({ code: 'PRODUCT_DATA_INVALID', count: invalidProducts, message: `${invalidProducts} ligne(s) produit sont incomplètes ou non revues.` });

    const allStores = clients.flatMap((client) => client.stores);
    return {
      id: arrival.id,
      name: arrival.name,
      status: arrival.status,
      confirmedAt: arrival.confirmed_at || null,
      confirmedBy: arrival.confirmed_by || null,
      createdAt: arrival.created_at,
      updatedAt: arrival.updated_at,
      clients,
      summary: {
        customers: clients.length,
        stores: allStores.length,
        products: clients.reduce((sum, client) => sum + client.products.total, 0),
        completed: clients.filter((client) => client.extractionStatus === 'COMPLETED').length,
        needsReview: clients.filter((client) => client.extractionStatus === 'NEEDS_REVIEW').length,
        processing: clients.filter((client) => client.extractionStatus === 'PROCESSING').length,
        failed: clients.filter((client) => client.extractionStatus === 'FAILED').length,
        notStarted: clients.filter((client) => client.extractionStatus === 'NOT_STARTED').length,
      },
      counts: {
        clients: clients.length,
        stores: allStores.length,
        sources: allStores.reduce((sum, store) => sum + store.sources.length, 0),
        products: clients.reduce((sum, client) => sum + client.products.total, 0),
        pendingReview: clients.reduce((sum, client) => sum + client.products.pending, 0),
      },
      confirmation: {
        canConfirm: arrival.status !== 'CONFIRMED' && issues.length === 0,
        issues,
      },
    };
  }

  refreshOperationalStatus(id: string) {
    const arrival = this.get(id);
    if (arrival.status === 'CONFIRMED') return;
    const activeJobs = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_extraction_jobs j
      JOIN crm_arrival_clients ac ON ac.id=j.arrival_client_id
      WHERE ac.arrival_id=? AND j.state IN ('QUEUED','PROCESSING')`, id)?.count || 0);
    const jobs = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_extraction_jobs j
      JOIN crm_arrival_clients ac ON ac.id=j.arrival_client_id WHERE ac.arrival_id=?`, id)?.count || 0);
    const nextStatus = activeJobs > 0 ? 'PROCESSING' : jobs > 0 ? 'REVIEW' : 'DRAFT';
    this.db.run('UPDATE crm_arrivals SET status=?,updated_at=? WHERE id=?', nextStatus, new Date().toISOString(), id);
  }

  confirm(id: string, actor: AdminAuditActor) {
    this.assertMutable(id);
    const details = this.detail(id);
    if (!details.confirmation.canConfirm) {
      throw new ArrivalIngestionError('ARRIVAL_CONFIRMATION_BLOCKED', 'L’Arrival ne peut pas être confirmé.', 409, {
        issues: details.confirmation.issues,
      });
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`UPDATE crm_arrivals SET status='CONFIRMED',confirmed_at=?,confirmed_by=?,updated_at=? WHERE id=?`,
        now, actor.id, now, id);
      recordAdminAudit(this.db, actor, 'ARRIVAL_CONFIRMED', 'CRM_ARRIVALS', id,
        { status: details.status }, { status: 'CONFIRMED', confirmedAt: now, counts: details.counts });
    });
    return this.detail(id);
  }
}
