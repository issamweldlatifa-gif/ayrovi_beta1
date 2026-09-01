import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';

/**
 * Sends a Customer Arrival Card to the Warehouse Core over its integration
 * API. This is a real server-to-server HTTPS call — never a mock. The Warehouse
 * stores the card as an EXPECTED arrival (goods are not physically received).
 *
 * Configuration (server-side environment only; never exposed to the frontend):
 *   WAREHOUSE_API_URL   e.g. https://warehouse.example.com
 *   WAREHOUSE_API_KEY   static integration secret (x-api-key)
 *
 * Idempotency: the card id is stable (`card_<arrivalClientId>`) and is also
 * sent as the `Idempotency-Key` header, so a retried double-send resolves to
 * the SAME Expected Arrival in the Warehouse.
 */

export type DispatchStatus = 'READY_TO_SEND' | 'SENDING' | 'SENT' | 'SEND_FAILED';

const ENDPOINT_PATH = '/api/v1/integrations/arrivals/customer-cards';

export class WarehouseDispatchError extends ArrivalIngestionError {
  constructor(
    public code: string,
    message: string,
    public httpStatus?: number,
  ) {
    // The upstream Warehouse rejecting a card is an EXTERNAL/upstream failure,
    // never an admin-session failure. We always surface HTTP 502 (Bad Gateway)
    // to the CRM admin UI so the global "401 => session expired => logout"
    // handler does NOT sign the admin out. The real upstream status (401/503/…)
    // is preserved separately in `httpStatus` / the dispatch record for audit.
    super(code, message, 502);
    this.name = 'WarehouseDispatchError';
  }
}

interface DispatchRow {
  id: string;
  arrival_id: string;
  arrival_client_id: string;
  card_id: string;
  status: DispatchStatus;
  warehouse_arrival_id: string | null;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  idempotency_key: string | null;
  sent_at: string | null;
  sent_by: string | null;
  attempts: number;
  payload_summary: string | null;
  created_at: string;
  updated_at: string;
}

export class WarehouseDispatchService {
  constructor(private readonly db: QatafoDatabase) {}

  isConfigured(): boolean {
    return Boolean(this.apiBaseUrl());
  }

  private apiBaseUrl(): string {
    return String(process.env.WAREHOUSE_API_URL || '').replace(/\/+$/, '');
  }

  private apiKey(): string {
    return String(process.env.WAREHOUSE_API_KEY || '').trim();
  }

  /** Stable card id — the idempotency anchor on both sides. */
  private cardId(arrivalClientId: string): string {
    return `card_${arrivalClientId}`;
  }

  /**
   * Build the structured Customer Arrival Card payload for ONE arrival client
   * (one customer), aggregating the customer's products across ALL their
   * stores. Each product keeps its own store info (store-agnostic).
   */
  buildCard(arrivalId: string, arrivalClientId: string) {
    const client = this.db.get<any>(`SELECT ac.id,ac.arrival_id,ac.customer_id,ac.display_alias,
        a.name arrival_name,a.status arrival_status,
        c.name customer_name,c.phone customer_phone
      FROM crm_arrival_clients ac
      JOIN crm_arrivals a ON a.id=ac.arrival_id
      JOIN customers c ON c.id=ac.customer_id
      WHERE ac.id=?`, arrivalClientId);
    if (!client) throw new ArrivalIngestionError('ARRIVAL_CLIENT_NOT_FOUND', 'Client Arrival introuvable.', 404);
    if (client.arrival_id !== arrivalId) {
      throw new ArrivalIngestionError('ARRIVAL_CLIENT_MISMATCH', 'Ce client n’appartient pas à cet Arrival.', 409);
    }

    const products = this.db.all<any>(`SELECT
        product_name, sku, reference, variant, color, size, quantity,
        store_id, store_code, store_name
      FROM (
        SELECT p.product_name, p.sku, p.reference, p.variant, p.color, p.size, p.quantity,
          s.id store_id, s.code store_code, s.name store_name
        FROM crm_extracted_products p
        JOIN crm_arrival_client_stores acs ON acs.id=p.arrival_client_store_id
        JOIN crm_stores s ON s.id=acs.store_id
        WHERE p.arrival_client_id=? AND p.is_current=1 AND p.extraction_status='EXTRACTED'
      ) ORDER BY store_name, sku`, arrivalClientId);

    const cardId = this.cardId(arrivalClientId);
    const payload = {
      event: 'customer_arrival_card.created' as const,
      arrival: {
        id: client.arrival_id,
        reference: client.arrival_name || client.arrival_id,
      },
      customer_arrival_card: {
        id: cardId,
        customer: {
          id: client.customer_id,
          name: client.display_alias || client.customer_name,
        },
        // Card-level store is left null for a multi-store customer; each
        // product carries its own store. Single-store cards still set it too.
        store: (() => {
          const stores = new Set(products.map((p) => p.store_id).filter(Boolean));
          if (stores.size === 1) {
            const one = products.find((p) => p.store_id);
            return { id: one.store_id, name: one.store_name };
          }
          return null;
        })(),
        products: products.map((p) => ({
          product_id: null,
          sku: p.sku || null,
          reference: p.reference || null,
          product_name: p.product_name || null,
          quantity: Math.max(1, Number(p.quantity) || 1),
          variant: p.variant || null,
          color: p.color || null,
          size: p.size ?? null,
        })),
      },
    };
    return { client, products, cardId, payload };
  }

  private getRow(arrivalClientId: string): DispatchRow | null {
    const cardId = this.cardId(arrivalClientId);
    return this.db.get<DispatchRow>('SELECT * FROM crm_warehouse_dispatches WHERE card_id=?', cardId) ?? null;
  }

  /** Current send state of a card (for the UI), or null if never attempted. */
  status(arrivalClientId: string): (DispatchRow & { configured: boolean }) | null {
    const row = this.getRow(arrivalClientId);
    if (!row) return null;
    return { ...row, configured: this.isConfigured() };
  }

  /**
   * Send (or retry sending) a Customer Arrival Card to the Warehouse.
   * - Guards: only after the Arrival is CONFIRMED and the client has at least
   *   one extracted product.
   * - Idempotent: an already-SENT card is returned as-is (duplicate guard).
   * - On failure records SEND_FAILED (error + HTTP status) so the UI can retry.
   */
  async send(arrivalId: string, arrivalClientId: string, actor: AdminAuditActor): Promise<DispatchRow> {
    if (!this.isConfigured()) {
      throw new WarehouseDispatchError(
        'WAREHOUSE_NOT_CONFIGURED',
        'L’envoi vers l’entrepôt n’est pas configuré (WAREHOUSE_API_URL manquant).',
      );
    }

    const { payload, cardId, products } = this.buildCard(arrivalId, arrivalClientId);
    const arrival = this.db.get<any>('SELECT status FROM crm_arrivals WHERE id=?', arrivalId);
    if (!arrival) throw new ArrivalIngestionError('ARRIVAL_NOT_FOUND', 'Arrival introuvable.', 404);
    if (arrival.status !== 'CONFIRMED') {
      throw new ArrivalIngestionError(
        'ARRIVAL_NOT_CONFIRMED',
        'Confirmez l’Arrival avant d’envoyer la carte client vers l’entrepôt.',
        409,
      );
    }
    if (!products.length) {
      throw new ArrivalIngestionError('NO_EXTRACTED_PRODUCTS', 'Aucun produit extrait/approuvé à envoyer.', 409);
    }

    const existing = this.getRow(arrivalClientId);
    if (existing?.status === 'SENT') {
      // Already sent — idempotent no-op returning the stored warehouse id.
      return existing;
    }

    const now = new Date().toISOString();
    const id = existing?.id ?? `crm_dispatch_${randomUUID()}`;
    const attempts = (existing?.attempts || 0) + 1;
    const summary = JSON.stringify({
      products: products.length,
      units: products.reduce((s, p) => s + (Number(p.quantity) || 0), 0),
      stores: [...new Set(products.map((p) => p.store_name).filter(Boolean))],
    });

    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_warehouse_dispatches
        (id,arrival_id,arrival_client_id,card_id,status,attempts,payload_summary,created_at,updated_at)
        VALUES (?,?,?,?, 'SENDING',?,?,?,?)
        ON CONFLICT(card_id) DO UPDATE SET status='SENDING', attempts=?, updated_at=?`,
      id, arrivalId, arrivalClientId, cardId, attempts, summary, now, now,
      attempts, now);
    });

    let response: any;
    let httpStatus = 0;
    try {
      const controller = AbortSignal.timeout(20_000);
      const res = await fetch(`${this.apiBaseUrl()}${ENDPOINT_PATH}`, {
        method: 'POST',
        signal: controller as unknown as AbortSignal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey(),
          'idempotency-key': cardId,
        },
        body: JSON.stringify(payload),
      });
      httpStatus = res.status;
      const text = await res.text().catch(() => '');
      try { response = text ? JSON.parse(text) : {}; } catch { response = {}; }
      if (!res.ok) {
        const message = String(response?.message || response?.error || `Warehouse HTTP ${res.status}`).slice(0, 500);
        throw new WarehouseDispatchError(response?.code || 'WAREHOUSE_REJECTED', message, res.status);
      }
    } catch (error) {
      if (error instanceof WarehouseDispatchError) {
        this.markFailed(arrivalClientId, error.code, error.message, httpStatus, actor, arrivalId);
        throw error;
      }
      const message = (error instanceof Error ? error.message : 'Warehouse unavailable').slice(0, 500);
      const err = new WarehouseDispatchError('WAREHOUSE_UNAVAILABLE', message, 0);
      this.markFailed(arrivalClientId, err.code, message, 0, actor, arrivalId);
      throw err;
    }

    const warehouseArrivalId = String(
      response?.warehouse_arrival_id || response?.warehouseArrivalId || '',
    ).slice(0, 160);
    const sentAt = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`UPDATE crm_warehouse_dispatches SET
        status='SENT', warehouse_arrival_id=?, http_status=?, error_code=NULL, error_message=NULL,
        idempotency_key=?, sent_at=?, sent_by=?, updated_at=? WHERE card_id=?`,
      warehouseArrivalId || null, httpStatus, cardId, sentAt, actor.id, sentAt, cardId);
      recordAdminAudit(this.db, actor, 'ARRIVAL_SENT_TO_WAREHOUSE', 'CRM_ARRIVALS', arrivalId, null, {
        operation: 'CUSTOMER_ARRIVAL_CARD_SENT',
        arrivalClientId,
        cardId,
        warehouseArrivalId,
        products: products.length,
        httpStatus,
        duplicate: Boolean(response?.duplicate),
      });
    });

    return this.getRow(arrivalClientId)!;
  }

  private markFailed(
    arrivalClientId: string,
    code: string,
    message: string,
    httpStatus: number,
    actor: AdminAuditActor,
    arrivalId: string,
  ): void {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`UPDATE crm_warehouse_dispatches SET
        status='SEND_FAILED', http_status=?, error_code=?, error_message=?, updated_at=? WHERE card_id=?`,
      httpStatus || null, code, message.slice(0, 500), now, this.cardId(arrivalClientId));
      recordAdminAudit(this.db, actor, 'ARRIVAL_SEND_FAILED', 'CRM_ARRIVALS', arrivalId, null, {
        operation: 'CUSTOMER_ARRIVAL_CARD_SEND_FAILED',
        arrivalClientId,
        cardId: this.cardId(arrivalClientId),
        errorCode: code,
        httpStatus,
      });
    });
  }
}
