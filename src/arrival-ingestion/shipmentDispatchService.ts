import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';

/**
 * Sends a Shipment Card to the Warehouse Core over the SAME integration
 * infrastructure used for Customer Arrival Cards (real server-to-server HTTPS,
 * x-api-key service auth, Idempotency-Key header). No mock.
 *
 * Configuration is shared with the customer-card sender:
 *   WAREHOUSE_API_URL, WAREHOUSE_API_KEY  (server-side only).
 *
 * Idempotency: the shipment code (SHP-...) is stable and is also sent as the
 * Idempotency-Key, so a double-send / retry resolves to the SAME Warehouse
 * Shipment (WSHP-...).
 */

export type ShipmentDispatchStatus = 'READY_TO_SEND' | 'SENDING' | 'SENT' | 'SEND_FAILED';

const ENDPOINT_PATH = '/api/v1/integrations/arrivals/shipments';

export class ShipmentDispatchError extends ArrivalIngestionError {
  constructor(public code: string, message: string, public httpStatus?: number) {
    // External/upstream failure -> never 401 to the admin UI (would force logout).
    super(code, message, 502);
    this.name = 'ShipmentDispatchError';
  }
}

export class ShipmentDispatchService {
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

  private getRow(shipmentCode: string) {
    return this.db.get<any>('SELECT * FROM crm_shipment_dispatches WHERE card_id=?', shipmentCode) ?? null;
  }

  status(shipmentId: string) {
    const s = this.db.get<any>('SELECT shipment_code FROM crm_shipments WHERE id=?', shipmentId);
    if (!s) return null;
    const row = this.getRow(s.shipment_code);
    return { configured: this.isConfigured(), ...(row || {}) };
  }

  /** Build the structured Shipment Card payload from the CRM shipment + cartons. */
  buildPayload(shipmentId: string) {
    const s = this.db.get<any>(
      `SELECT s.*, a.name arrival_name, a.status arrival_status
       FROM crm_shipments s JOIN crm_arrivals a ON a.id=s.arrival_id WHERE s.id=?`,
      shipmentId,
    );
    if (!s) throw new ArrivalIngestionError('SHIPMENT_NOT_FOUND', 'Envoi introuvable.', 404);
    const cartons = this.db.all<any>(
      'SELECT * FROM crm_shipment_cartons WHERE shipment_id=? ORDER BY carton_number ASC',
      shipmentId,
    );

    const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
    const payload = {
      event: 'shipment.created' as const,
      schema_version: '1.0',
      arrival: { id: s.arrival_id, reference: s.arrival_name || s.arrival_id },
      shipment: {
        id: s.shipment_code,
        reference: s.reference || null,
        source: { type: s.source_type, reference: s.source_reference || null },
        carrier: s.carrier_code || s.carrier_name
          ? { id: s.carrier_id || s.carrier_code || null, name: s.carrier_name || null, code: s.carrier_code || null, service: s.service_name || null }
          : null,
        tracking: s.tracking_number
          ? { tracking_number: s.tracking_number, tracking_url: s.tracking_url || null, status: s.tracking_status || 'UNKNOWN' }
          : null,
        sender: s.sender_name || s.sender_company
          ? { name: s.sender_name || null, company: s.sender_company || null, country: s.sender_country || null, city: s.sender_city || null }
          : null,
        destination: s.destination_country || s.destination_city || s.destination_code
          ? { country: s.destination_country || null, city: s.destination_city || null, code: s.destination_code || null }
          : null,
        dates: {
          created_at: iso(s.created_at),
          shipped_at: iso(s.shipped_at),
          estimated_arrival_at: iso(s.estimated_arrival_at),
          actual_arrival_at: iso(s.actual_arrival_at),
        },
        summary: {
          total_cartons: s.total_cartons || cartons.length,
          total_products: s.total_products || 0,
          total_units: s.total_units || 0,
          total_weight: s.total_weight ?? null,
          weight_unit: s.weight_unit || null,
        },
        cartons: cartons.map((c) => ({
          id: c.carton_code,
          reference: c.carton_reference || null,
          qr_code_value: c.qr_code_value || c.carton_code,
          barcode_value: c.barcode_value || null,
          carton_number: c.carton_number,
          total_cartons: c.total_cartons,
          weight: c.weight ?? null,
          weight_unit: c.weight_unit || null,
          dimensions: { length: c.length ?? null, width: c.width ?? null, height: c.height ?? null, unit: c.dimension_unit || null },
        })),
      },
    };
    return { shipment: s, cartons, payload };
  }

  async send(shipmentId: string, actor: AdminAuditActor) {
    if (!this.isConfigured()) {
      throw new ShipmentDispatchError('WAREHOUSE_NOT_CONFIGURED', 'L’envoi vers l’entrepôt n’est pas configuré (WAREHOUSE_API_URL manquant).');
    }
    const { shipment, cartons, payload } = this.buildPayload(shipmentId);
    const cardId = shipment.shipment_code;

    if (shipment.status !== 'CONFIRMED') {
      throw new ArrivalIngestionError('SHIPMENT_NOT_CONFIRMED', 'Confirmez l’envoi avant de le transmettre à l’entrepôt.', 409);
    }
    if (!cartons.length) {
      throw new ArrivalIngestionError('SHIPMENT_NO_CARTONS', 'Aucun carton à envoyer.', 409);
    }

    const existing = this.getRow(cardId);
    if (existing?.status === 'SENT') return existing;

    const now = new Date().toISOString();
    const id = existing?.id ?? `crm_ship_dispatch_${randomUUID()}`;
    const attempts = (existing?.attempts || 0) + 1;
    const summary = JSON.stringify({ cartons: cartons.length, tracking: shipment.tracking_number, carrier: shipment.carrier_code });

    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO crm_shipment_dispatches (id,shipment_id,card_id,status,attempts,payload_summary,created_at,updated_at)
         VALUES (?,?,?, 'SENDING',?,?,?,?)
         ON CONFLICT(card_id) DO UPDATE SET status='SENDING', attempts=?, updated_at=?`,
        id, shipmentId, cardId, attempts, summary, now, now, attempts, now,
      );
    });

    let response: any;
    let httpStatus = 0;
    try {
      const res = await fetch(`${this.apiBaseUrl()}${ENDPOINT_PATH}`, {
        method: 'POST',
        signal: AbortSignal.timeout(20_000) as unknown as AbortSignal,
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
        throw new ShipmentDispatchError(response?.code || 'WAREHOUSE_REJECTED', message, res.status);
      }
    } catch (error) {
      if (error instanceof ShipmentDispatchError) {
        this.markFailed(cardId, shipment.arrival_id, error.code, error.message, httpStatus, actor, shipmentId);
        throw error;
      }
      const message = (error instanceof Error ? error.message : 'Warehouse unavailable').slice(0, 500);
      const err = new ShipmentDispatchError('WAREHOUSE_UNAVAILABLE', message, 0);
      this.markFailed(cardId, shipment.arrival_id, err.code, message, 0, actor, shipmentId);
      throw err;
    }

    const warehouseShipmentId = String(response?.warehouse_shipment_id || response?.warehouseShipmentId || '').slice(0, 160);
    const sentAt = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(
        `UPDATE crm_shipment_dispatches SET status='SENT', warehouse_shipment_id=?, http_status=?,
           error_code=NULL, error_message=NULL, idempotency_key=?, sent_at=?, sent_by=?, updated_at=? WHERE card_id=?`,
        warehouseShipmentId || null, httpStatus, cardId, sentAt, actor.id, sentAt, cardId,
      );
      recordAdminAudit(this.db, actor, 'SHIPMENT_SENT_TO_WAREHOUSE', 'CRM_ARRIVALS', shipment.arrival_id, shipmentId, {
        shipmentCode: cardId, warehouseShipmentId, cartons: cartons.length, httpStatus,
      });
    });
    return this.getRow(cardId)!;
  }

  private markFailed(cardId: string, arrivalId: string, code: string, message: string, httpStatus: number, actor: AdminAuditActor, shipmentId: string) {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(
        `UPDATE crm_shipment_dispatches SET status='SEND_FAILED', http_status=?, error_code=?, error_message=?, updated_at=? WHERE card_id=?`,
        httpStatus || null, code, message.slice(0, 500), now, cardId,
      );
      recordAdminAudit(this.db, actor, 'SHIPMENT_SEND_FAILED', 'CRM_ARRIVALS', arrivalId, shipmentId, {
        shipmentCode: cardId, errorCode: code, httpStatus,
      });
    });
  }
}
