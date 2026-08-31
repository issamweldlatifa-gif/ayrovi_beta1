import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit } from '../admin/audit';
import type { AdminAuditActor } from '../admin/audit';
import { normalizeTunisianPhone, tunisianPhoneDigits } from '../customer/phone';
import { ArrivalIngestionError } from './errors';
import type { ArrivalService } from './arrivalService';

function mapCustomer(row: any) {
  return {
    id: String(row.customer_id),
    name: String(row.customer_name || ''),
    phone: String(row.customer_phone || ''),
    governorate: String(row.customer_governorate || ''),
    address: String(row.customer_address || ''),
    status: String(row.customer_status || ''),
    active: row.customer_status === 'ACTIVE',
  };
}

function mapStore(row: any) {
  return {
    id: String(row.store_id),
    code: String(row.store_code),
    name: String(row.store_name),
    active: Boolean(row.store_active),
  };
}

function cleanAlias(value: unknown): string | null {
  const alias = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return alias || null;
}

export class ArrivalClientService {
  constructor(
    private readonly db: QatafoDatabase,
    private readonly arrivals: ArrivalService,
  ) {}

  private row(id: string): any {
    const row = this.db.get<any>(`SELECT ac.*,a.status arrival_status,c.name customer_name,c.phone customer_phone,
      c.governorate customer_governorate,c.address customer_address,c.status customer_status
      FROM crm_arrival_clients ac JOIN crm_arrivals a ON a.id=ac.arrival_id
      JOIN customers c ON c.id=ac.customer_id WHERE ac.id=?`, id);
    if (!row) throw new ArrivalIngestionError('ARRIVAL_CLIENT_NOT_FOUND', 'Client Arrival introuvable.', 404);
    return row;
  }

  listStores(arrivalClientId: string) {
    this.row(arrivalClientId);
    return this.db.all<any>(`SELECT acs.*,ac.arrival_id,s.code store_code,s.name store_name,s.active store_active
      FROM crm_arrival_client_stores acs
      JOIN crm_arrival_clients ac ON ac.id=acs.arrival_client_id
      JOIN crm_stores s ON s.id=acs.store_id
      WHERE acs.arrival_client_id=? ORDER BY acs.created_at,acs.id`, arrivalClientId).map((row) => ({
      id: String(row.id),
      arrivalClientId: String(row.arrival_client_id),
      arrivalId: String(row.arrival_id),
      storeId: String(row.store_id),
      store: mapStore(row),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  getStore(id: string) {
    const row = this.db.get<any>(`SELECT acs.*,ac.arrival_id,s.code store_code,s.name store_name,s.active store_active
      FROM crm_arrival_client_stores acs
      JOIN crm_arrival_clients ac ON ac.id=acs.arrival_client_id
      JOIN crm_stores s ON s.id=acs.store_id WHERE acs.id=?`, id);
    if (!row) throw new ArrivalIngestionError('ARRIVAL_CLIENT_STORE_NOT_FOUND', 'Store assigné introuvable.', 404);
    return {
      id: String(row.id),
      arrivalClientId: String(row.arrival_client_id),
      arrivalId: String(row.arrival_id),
      storeId: String(row.store_id),
      store: mapStore(row),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  resolveSingleStore(arrivalClientId: string) {
    const stores = this.listStores(arrivalClientId);
    if (!stores.length) throw new ArrivalIngestionError('STORE_REQUIRED', 'Affectez un Store à ce client avant d’ajouter une source.', 409);
    if (stores.length > 1) {
      throw new ArrivalIngestionError(
        'ARRIVAL_CLIENT_STORE_REQUIRED',
        'Sélectionnez le Store auquel cette source appartient.',
        409,
      );
    }
    return stores[0];
  }

  get(id: string) {
    const row = this.row(id);
    const stores = this.listStores(id);
    return {
      id: String(row.id),
      arrivalId: String(row.arrival_id),
      arrivalStatus: String(row.arrival_status),
      customerId: String(row.customer_id),
      storeId: stores[0]?.storeId || null,
      displayAlias: row.display_alias ? String(row.display_alias) : null,
      displayName: row.display_alias ? String(row.display_alias) : String(row.customer_name || ''),
      customer: mapCustomer(row),
      store: stores[0]?.store || null,
      stores,
      // Internal compatibility keys retained during the additive migration.
      arrival_id: String(row.arrival_id),
      arrival_status: String(row.arrival_status),
      customer_id: String(row.customer_id),
      store_id: stores[0]?.storeId || null,
      store_code: stores[0]?.store.code || null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  searchCustomers(searchInput: unknown, limitInput: unknown = 20) {
    const search = String(searchInput || '').trim().slice(0, 100);
    const limit = Math.min(50, Math.max(1, Math.floor(Number(limitInput) || 20)));
    let rows: any[];
    if (search) {
      const phoneSearch = search.replace(/\D/g, '').replace(/^00216/, '').replace(/^216(?=\d{8}$)/, '');
      rows = phoneSearch
        ? this.db.all<any>(`SELECT id,name,phone,status,governorate,address FROM customers
            WHERE status='ACTIVE' AND (name LIKE ? OR phone LIKE ? OR normalized_phone LIKE ?) ORDER BY name LIMIT ?`,
          `%${search}%`, `%${search}%`, `%${phoneSearch}%`, limit)
        : this.db.all<any>(`SELECT id,name,phone,status,governorate,address FROM customers
            WHERE status='ACTIVE' AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT ?`, `%${search}%`, `%${search}%`, limit);
    } else {
      rows = this.db.all<any>(`SELECT id,name,phone,status,governorate,address FROM customers WHERE status='ACTIVE' ORDER BY updated_at DESC LIMIT ?`, limit);
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      status: row.status,
      governorate: row.governorate || '',
      address: row.address || '',
    }));
  }

  add(arrivalId: string, customerIdInput: unknown, actor: AdminAuditActor) {
    this.arrivals.assertMutable(arrivalId);
    const customerId = String(customerIdInput || '').trim();
    const customer = this.db.get<any>('SELECT id,name,phone,status FROM customers WHERE id=?', customerId);
    if (!customer || customer.status !== 'ACTIVE') throw new ArrivalIngestionError('CUSTOMER_INVALID', 'Client introuvable ou inactif.', 404);
    const existing = this.db.get<any>('SELECT id FROM crm_arrival_clients WHERE arrival_id=? AND customer_id=?', arrivalId, customerId);
    if (existing) throw new ArrivalIngestionError('ARRIVAL_CLIENT_DUPLICATE', 'Ce client appartient déjà à cet Arrival.', 409);
    const id = `crm_arrival_client_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_arrival_clients (id,arrival_id,customer_id,store_id,display_alias,created_at,updated_at)
        VALUES (?,?,?,NULL,NULL,?,?)`, id, arrivalId, customerId, now, now);
      recordAdminAudit(this.db, actor, 'CLIENT_ADDED_TO_ARRIVAL', 'CRM_ARRIVALS', id, null, {
        arrivalId, customerId, customerName: customer.name, customerPhone: customer.phone,
      });
      this.arrivals.refreshOperationalStatus(arrivalId);
    });
    return this.arrivals.detail(arrivalId);
  }

  addStore(arrivalClientId: string, storeId: string, actor: AdminAuditActor) {
    const client = this.row(arrivalClientId);
    this.arrivals.assertMutable(client.arrival_id);
    const store = this.db.get<any>('SELECT id,code,name,active FROM crm_stores WHERE id=?', storeId);
    if (!store || !store.active) throw new ArrivalIngestionError('STORE_INVALID', 'Store introuvable ou inactif.', 404);
    const existing = this.db.get<any>(`SELECT id FROM crm_arrival_client_stores
      WHERE arrival_client_id=? AND store_id=?`, arrivalClientId, storeId);
    if (existing) return { item: this.getStore(existing.id), duplicate: true };
    const id = `crm_client_store_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_arrival_client_stores (id,arrival_client_id,store_id,created_at,updated_at)
        VALUES (?,?,?,?,?)`, id, arrivalClientId, storeId, now, now);
      // Keep the first assignment in the legacy column so old read-only clients remain compatible.
      if (!client.store_id) this.db.run('UPDATE crm_arrival_clients SET store_id=?,updated_at=? WHERE id=?', storeId, now, arrivalClientId);
      recordAdminAudit(this.db, actor, 'ARRIVAL_CLIENT_STORE_ASSIGNED', 'CRM_ARRIVALS', arrivalClientId,
        null, { arrivalId: client.arrival_id, assignmentId: id, storeId, storeCode: store.code });
      this.arrivals.refreshOperationalStatus(client.arrival_id);
    });
    return { item: this.getStore(id), duplicate: false };
  }

  // Compatibility for the former one-store endpoint. Before any source exists,
  // it retains the historical replace behavior. Multi-store callers use POST
  // /clients/:id/stores so an old UI cannot silently create extra assignments.
  selectStore(arrivalClientId: string, storeIdInput: string, actor: AdminAuditActor) {
    const client = this.row(arrivalClientId);
    this.arrivals.assertMutable(client.arrival_id);
    const storeId = String(storeIdInput || '').trim();
    const store = this.db.get<any>('SELECT id,code,name,active FROM crm_stores WHERE id=? AND active=1', storeId);
    if (!store) throw new ArrivalIngestionError('STORE_INVALID', 'Sélectionnez un Store actif.', 400);
    const assignments = this.listStores(arrivalClientId);
    if (assignments.some((assignment) => assignment.storeId === storeId)) return this.arrivals.detail(client.arrival_id);
    if (!assignments.length) {
      this.addStore(arrivalClientId, storeId, actor);
      return this.arrivals.detail(client.arrival_id);
    }
    if (assignments.length > 1) {
      throw new ArrivalIngestionError('MULTI_STORE_ENDPOINT_REQUIRED', 'Ajoutez le Store avec l’action « Add Store ».', 409);
    }
    const sourceCount = Number(this.db.get<any>(
      'SELECT COUNT(*) count FROM crm_arrival_sources WHERE arrival_client_store_id=?', assignments[0].id,
    )?.count || 0);
    if (sourceCount) {
      throw new ArrivalIngestionError(
        'STORE_CHANGE_BLOCKED',
        'Ce Store possède déjà une source. Utilisez « Add Store » pour en affecter un autre.',
        409,
      );
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run('UPDATE crm_arrival_client_stores SET store_id=?,updated_at=? WHERE id=?', storeId, now, assignments[0].id);
      this.db.run('UPDATE crm_arrival_clients SET store_id=?,updated_at=? WHERE id=?', storeId, now, arrivalClientId);
      recordAdminAudit(this.db, actor, 'ARRIVAL_CLIENT_STORE_SELECTED', 'CRM_ARRIVALS', arrivalClientId,
        { assignmentId: assignments[0].id, storeId: assignments[0].storeId },
        { assignmentId: assignments[0].id, storeId, storeCode: store.code });
      this.arrivals.refreshOperationalStatus(client.arrival_id);
    });
    return this.arrivals.detail(client.arrival_id);
  }

  removeStore(arrivalClientId: string, assignmentId: string, actor: AdminAuditActor) {
    const client = this.row(arrivalClientId);
    this.arrivals.assertMutable(client.arrival_id);
    const assignment = this.getStore(assignmentId);
    if (assignment.arrivalClientId !== arrivalClientId) {
      throw new ArrivalIngestionError('ARRIVAL_CLIENT_STORE_NOT_FOUND', 'Store assigné introuvable.', 404);
    }
    const sourceCount = Number(this.db.get<any>(
      'SELECT COUNT(*) count FROM crm_arrival_sources WHERE arrival_client_store_id=?', assignmentId,
    )?.count || 0);
    if (sourceCount) {
      throw new ArrivalIngestionError('ARRIVAL_CLIENT_STORE_IN_USE', 'Retirez d’abord les sources de ce Store.', 409, { sourceCount });
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run('DELETE FROM crm_arrival_client_stores WHERE id=?', assignmentId);
      if (client.store_id === assignment.storeId) {
        const replacement = this.db.get<any>(`SELECT store_id FROM crm_arrival_client_stores
          WHERE arrival_client_id=? ORDER BY created_at,id LIMIT 1`, arrivalClientId);
        this.db.run('UPDATE crm_arrival_clients SET store_id=?,updated_at=? WHERE id=?', replacement?.store_id || null, now, arrivalClientId);
      }
      recordAdminAudit(this.db, actor, 'ARRIVAL_CLIENT_STORE_UNASSIGNED', 'CRM_ARRIVALS', arrivalClientId,
        { assignmentId, storeId: assignment.storeId, storeCode: assignment.store.code }, null);
      this.arrivals.refreshOperationalStatus(client.arrival_id);
    });
    return this.get(arrivalClientId);
  }

  setAlias(arrivalClientId: string, value: unknown, actor: AdminAuditActor) {
    const client = this.row(arrivalClientId);
    this.arrivals.assertMutable(client.arrival_id);
    const alias = cleanAlias(value);
    const before = client.display_alias ? String(client.display_alias) : null;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run('UPDATE crm_arrival_clients SET display_alias=?,updated_at=? WHERE id=?', alias, now, arrivalClientId);
      recordAdminAudit(this.db, actor, 'ARRIVAL_CLIENT_ALIAS_UPDATED', 'CRM_ARRIVALS', arrivalClientId,
        { displayAlias: before, canonicalCustomerName: client.customer_name },
        { displayAlias: alias, canonicalCustomerName: client.customer_name });
    });
    return this.get(arrivalClientId);
  }

  unlink(arrivalClientId: string, actor: AdminAuditActor) {
    const client = this.row(arrivalClientId);
    this.arrivals.assertMutable(client.arrival_id);
    const sourceIds = this.db.all<any>('SELECT id FROM crm_arrival_sources WHERE arrival_client_id=?', arrivalClientId)
      .map((row) => String(row.id));
    const counts = {
      stores: Number(this.db.get<any>('SELECT COUNT(*) count FROM crm_arrival_client_stores WHERE arrival_client_id=?', arrivalClientId)?.count || 0),
      sources: sourceIds.length,
      jobs: Number(this.db.get<any>('SELECT COUNT(*) count FROM crm_extraction_jobs WHERE arrival_client_id=?', arrivalClientId)?.count || 0),
      products: Number(this.db.get<any>('SELECT COUNT(*) count FROM crm_extracted_products WHERE arrival_client_id=?', arrivalClientId)?.count || 0),
    };
    const activeJobs = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_extraction_jobs
      WHERE arrival_client_id=? AND state IN ('QUEUED','PROCESSING')`, arrivalClientId)?.count || 0);
    if (activeJobs) throw new ArrivalIngestionError('ARRIVAL_CLIENT_JOB_ACTIVE', 'Attendez la fin de l’extraction avant de dissocier ce client.', 409);

    this.db.transaction(() => {
      // FK cascades remove only this Arrival membership and its operational data.
      // The canonical customers row is RESTRICT-protected and is never edited/deleted here.
      this.db.run('DELETE FROM crm_arrival_clients WHERE id=?', arrivalClientId);
      recordAdminAudit(this.db, actor, 'ARRIVAL_CLIENT_UNLINKED', 'CRM_ARRIVALS', arrivalClientId,
        {
          arrivalId: client.arrival_id,
          customerId: client.customer_id,
          canonicalCustomerName: client.customer_name,
          displayAlias: client.display_alias || null,
          removedOperationalCounts: counts,
        },
        { customerPreserved: true });
      this.arrivals.refreshOperationalStatus(client.arrival_id);
    });
    return { arrivalId: String(client.arrival_id), customerId: String(client.customer_id), sourceIds, removedOperationalCounts: counts };
  }

  createAndAdd(arrivalId: string, input: { name: string; phone: string; governorate?: string; address?: string }, actor: AdminAuditActor) {
    const name = String(input.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 160);
    if (name.length < 2) throw new ArrivalIngestionError('CUSTOMER_NAME_REQUIRED', 'Saisissez le nom du client.', 400);
    const phone = normalizeTunisianPhone(String(input.phone || ''));
    const phoneDigits = tunisianPhoneDigits(String(input.phone || ''));
    if (!phone || !phoneDigits) throw new ArrivalIngestionError('CUSTOMER_PHONE_INVALID', 'Saisissez un numéro tunisien valide à 8 chiffres.', 400);
    const governorate = String(input.governorate || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const address = String(input.address || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const now = new Date().toISOString();
    let arrivalClientId = '';
    let customerCreated = false;
    this.db.transaction(() => {
      this.arrivals.assertMutable(arrivalId);
      let customer = this.db.get<any>(`SELECT id,name,status FROM customers
        WHERE normalized_phone=? OR phone IN (?,?,?,?)
        ORDER BY CASE WHEN normalized_phone=? THEN 0 ELSE 1 END,updated_at DESC LIMIT 1`,
      phoneDigits, phoneDigits, phone, `216${phoneDigits}`, `00216${phoneDigits}`, phoneDigits);
      if (customer && customer.status !== 'ACTIVE') {
        throw new ArrivalIngestionError('CUSTOMER_INVALID', 'Ce numéro appartient à un client CRM inactif ou bloqué.', 409);
      }
      if (!customer) {
        const customerId = `customer_${randomUUID()}`;
        this.db.run(`INSERT INTO customers
          (id,name,phone,normalized_phone,governorate,address,registered_at,status,updated_at)
          VALUES (?,?,?,?,?,?,?,'ACTIVE',?)`, customerId, name, phone, phoneDigits, governorate, address, now, now);
        customer = { id: customerId, name, status: 'ACTIVE' };
        customerCreated = true;
        recordAdminAudit(this.db, actor, 'CUSTOMER_CREATED', 'CRM_ARRIVALS', customerId, null, {
          origin: 'ARRIVAL_INGESTION', arrivalId,
        });
      }
      const membership = this.db.get<any>('SELECT id FROM crm_arrival_clients WHERE arrival_id=? AND customer_id=?', arrivalId, customer.id);
      if (membership) throw new ArrivalIngestionError('ARRIVAL_CLIENT_DUPLICATE', 'Ce client appartient déjà à cet Arrival.', 409);
      arrivalClientId = `crm_arrival_client_${randomUUID()}`;
      this.db.run(`INSERT INTO crm_arrival_clients (id,arrival_id,customer_id,store_id,display_alias,created_at,updated_at)
        VALUES (?,?,?,NULL,NULL,?,?)`, arrivalClientId, arrivalId, customer.id, now, now);
      recordAdminAudit(this.db, actor, 'CLIENT_ADDED_TO_ARRIVAL', 'CRM_ARRIVALS', arrivalClientId, null, {
        arrivalId, customerId: customer.id, customerName: customer.name, customerCreatedFromArrival: customerCreated,
      });
    });
    return { detail: this.arrivals.detail(arrivalId), customerCreated, item: this.get(arrivalClientId) };
  }
}
