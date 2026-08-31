import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';
import { ArrivalService } from './arrivalService';

export class ArrivalClientService {
  constructor(
    private readonly db: QatafoDatabase,
    private readonly arrivals: ArrivalService,
  ) {}

  get(id: string): any {
    const row = this.db.get<any>(`SELECT ac.*,a.status arrival_status,c.name customer_name,c.status customer_status,
      s.code store_code,s.name store_name,s.active store_active
      FROM crm_arrival_clients ac
      JOIN crm_arrivals a ON a.id=ac.arrival_id
      JOIN customers c ON c.id=ac.customer_id
      LEFT JOIN crm_stores s ON s.id=ac.store_id WHERE ac.id=?`, id);
    if (!row) throw new ArrivalIngestionError('ARRIVAL_CLIENT_NOT_FOUND', 'Client Arrival introuvable.', 404);
    return row;
  }

  add(arrivalId: string, customerIdInput: unknown, actor: AdminAuditActor) {
    this.arrivals.assertMutable(arrivalId);
    const customerId = String(customerIdInput || '').trim();
    const customer = this.db.get<any>('SELECT id,name,status FROM customers WHERE id=?', customerId);
    if (!customer || customer.status !== 'ACTIVE') {
      throw new ArrivalIngestionError('CUSTOMER_INVALID', 'Sélectionnez un client CRM actif.', 400);
    }
    const existing = this.db.get<any>('SELECT id FROM crm_arrival_clients WHERE arrival_id=? AND customer_id=?', arrivalId, customerId);
    if (existing) throw new ArrivalIngestionError('ARRIVAL_CLIENT_DUPLICATE', 'Ce client appartient déjà à cet Arrival.', 409);
    const id = `crm_arrival_client_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_arrival_clients (id,arrival_id,customer_id,created_at,updated_at)
        VALUES (?,?,?,?,?)`, id, arrivalId, customerId, now, now);
      recordAdminAudit(this.db, actor, 'CLIENT_ADDED_TO_ARRIVAL', 'CRM_ARRIVALS', id, null, {
        arrivalId, customerId, customerName: customer.name,
      });
    });
    return this.arrivals.detail(arrivalId);
  }

  selectStore(clientId: string, storeIdInput: unknown, actor: AdminAuditActor) {
    const client = this.get(clientId);
    this.arrivals.assertMutable(client.arrival_id);
    const storeId = String(storeIdInput || '').trim();
    const store = this.db.get<any>('SELECT id,code,name,active FROM crm_stores WHERE id=? AND active=1', storeId);
    if (!store) throw new ArrivalIngestionError('STORE_INVALID', 'Sélectionnez un magasin actif.', 400);
    if (client.store_id && client.store_id !== storeId) {
      const sources = Number(this.db.get<any>('SELECT COUNT(*) count FROM crm_arrival_sources WHERE arrival_client_id=?', clientId)?.count || 0);
      if (sources) {
        throw new ArrivalIngestionError(
          'STORE_CHANGE_BLOCKED',
          'Le magasin ne peut plus être remplacé après l’ajout d’une source. Ajoutez un autre client Arrival si nécessaire.',
          409,
        );
      }
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run('UPDATE crm_arrival_clients SET store_id=?,updated_at=? WHERE id=?', storeId, now, clientId);
      recordAdminAudit(this.db, actor, 'ARRIVAL_CLIENT_STORE_SELECTED', 'CRM_ARRIVALS', clientId,
        { storeId: client.store_id || null }, { storeId, storeCode: store.code });
    });
    return this.arrivals.detail(client.arrival_id);
  }

  searchCustomers(searchInput: unknown, limitInput: unknown) {
    const search = String(searchInput || '').trim().slice(0, 100);
    const limit = Math.min(50, Math.max(1, Math.floor(Number(limitInput) || 20)));
    const rows = search
      ? this.db.all<any>(`SELECT id,name,phone,status FROM customers
          WHERE status='ACTIVE' AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT ?`, `%${search}%`, `%${search}%`, limit)
      : this.db.all<any>(`SELECT id,name,phone,status FROM customers WHERE status='ACTIVE' ORDER BY updated_at DESC LIMIT ?`, limit);
    return rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, status: row.status }));
  }
}
