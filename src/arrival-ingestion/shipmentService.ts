import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';

/**
 * Shipment Cards in the Arrival CRM.
 *
 * A Shipment Card is a distinct business object from a Customer Arrival Card:
 * it carries physical shipping information (carrier, tracking, sender, dates,
 * cartons). One Arrival has one or more Shipments; each Shipment has one or
 * more Cartons. Product quantities remain summary-only here — the detailed
 * product lines stay on the Customer Arrival Cards.
 *
 * Lifecycle (internal, separate from carrier tracking status):
 *   DRAFT  -> editable
 *   CONFIRMED -> ready to transmit; payload frozen for editing
 * Transmission state lives in crm_shipment_dispatches (see ShipmentDispatchService).
 */

export interface ShipmentInput {
  reference?: string | null;
  source_type?: 'MANUAL' | 'CARRIER_API' | 'IMPORT' | 'OTHER';
  source_reference?: string | null;
  carrier_name?: string | null;
  carrier_code?: string | null;
  carrier_id?: string | null;
  service_name?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  tracking_status?: string | null;
  sender_name?: string | null;
  sender_company?: string | null;
  sender_country?: string | null;
  sender_city?: string | null;
  destination_country?: string | null;
  destination_city?: string | null;
  destination_code?: string | null;
  shipped_at?: string | null;
  estimated_arrival_at?: string | null;
  actual_arrival_at?: string | null;
  total_products?: number;
  total_units?: number;
  total_weight?: number | null;
  weight_unit?: string | null;
  cartons?: Array<{
    reference?: string | null;
    qr_code_value?: string | null;
    barcode_value?: string | null;
    carton_number?: number;
    weight?: number | null;
    weight_unit?: string | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    dimension_unit?: string | null;
  }>;
}

const SHP_PREFIX = 'SHP-';
const CTN_PREFIX = 'CTN-';

/**
 * Accept both a flat field set (carrier_name, tracking_number, ...) and the
 * nested normalized shape used by the integration envelope
 * (carrier:{name,code,...}, tracking:{tracking_number,...}, sender, destination,
 * dates). Nested values fill in only the flat keys that were not supplied, so
 * the two never conflict and the DB row always has the flattened columns.
 */
function normalizeShipmentInput(raw: ShipmentInput): ShipmentInput {
  const input: any = { ...raw };
  const n = (v: unknown) => (v === undefined || v === '' ? null : v);
  const carrier = (raw as any).carrier;
  if (carrier && typeof carrier === 'object') {
    input.carrier_id ??= n(carrier.id);
    input.carrier_name ??= n(carrier.name);
    input.carrier_code ??= n(carrier.code);
    input.service_name ??= n(carrier.service_name ?? carrier.service ?? carrier.serviceName);
  }
  const tracking = (raw as any).tracking;
  if (tracking && typeof tracking === 'object') {
    input.tracking_number ??= n(tracking.tracking_number ?? tracking.trackingNumber);
    input.tracking_url ??= n(tracking.tracking_url ?? tracking.trackingUrl);
    input.tracking_status ??= n(tracking.status ?? tracking.tracking_status);
  }
  const sender = (raw as any).sender;
  if (sender && typeof sender === 'object') {
    input.sender_name ??= n(sender.name);
    input.sender_company ??= n(sender.company);
    input.sender_country ??= n(sender.country);
    input.sender_city ??= n(sender.city);
  }
  const dest = (raw as any).destination;
  if (dest && typeof dest === 'object') {
    input.destination_country ??= n(dest.country);
    input.destination_city ??= n(dest.city);
    input.destination_code ??= n(dest.destination_code ?? dest.code);
  }
  const dates = (raw as any).dates;
  if (dates && typeof dates === 'object') {
    input.shipped_at ??= n(dates.shipped_at ?? dates.shippedAt);
    input.estimated_arrival_at ??= n(dates.estimated_arrival_at ?? dates.estimatedArrivalAt);
    input.actual_arrival_at ??= n(dates.actual_arrival_at ?? dates.actualArrivalAt);
  }
  const summary = (raw as any).summary;
  if (summary && typeof summary === 'object') {
    input.total_products ??= summary.total_products ?? summary.totalProducts;
    input.total_units ??= summary.total_units ?? summary.totalUnits;
    input.total_weight ??= summary.total_weight ?? summary.totalWeight;
    input.weight_unit ??= n(summary.weight_unit ?? summary.weightUnit);
  }
  if ((raw as any).shipment_reference && !input.reference) {
    input.reference = (raw as any).shipment_reference;
  }
  return input as ShipmentInput;
}

export class ShipmentService {
  constructor(private readonly db: QatafoDatabase) {}

  // ---------- codes ----------
  private nextCode(prefix: string, table: string, col: string, start: number): string {
    const row = this.db.get<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`);
    const base = start + (row?.n || 0) + 1;
    for (let i = 0; i < 6; i += 1) {
      const code = `${prefix}${String(base + i).padStart(6, '0')}`;
      const clash = this.db.get(`SELECT ${col} FROM ${table} WHERE ${col}=?`, code);
      if (!clash) return code;
    }
    return `${prefix}R${Date.now().toString().slice(-6)}`;
  }

  // ---------- read ----------
  list(arrivalId: string) {
    return this.db.all<any>(
      `SELECT s.*,
         (SELECT status FROM crm_shipment_dispatches d WHERE d.card_id=s.shipment_code) dispatch_status,
         (SELECT warehouse_shipment_id FROM crm_shipment_dispatches d WHERE d.card_id=s.shipment_code) warehouse_shipment_id,
         (SELECT COUNT(*) FROM crm_shipment_cartons c WHERE c.shipment_id=s.id) carton_count
       FROM crm_shipments s WHERE s.arrival_id=? ORDER BY s.created_at DESC`,
      arrivalId,
    );
  }

  get(id: string) {
    const shipment = this.db.get<any>(`SELECT * FROM crm_shipments WHERE id=?`, id);
    if (!shipment) throw new ArrivalIngestionError('SHIPMENT_NOT_FOUND', 'Envoi introuvable.', 404);
    shipment.cartons = this.db.all<any>(
      `SELECT * FROM crm_shipment_cartons WHERE shipment_id=? ORDER BY carton_number ASC`,
      id,
    );
    shipment.dispatch = this.db.get<any>(
      `SELECT * FROM crm_shipment_dispatches WHERE card_id=?`,
      shipment.shipment_code,
    ) || null;
    return shipment;
  }

  // ---------- create ----------
  create(arrivalId: string, rawInput: ShipmentInput, actor: AdminAuditActor) {
    const arrival = this.db.get<any>(`SELECT id,status,name FROM crm_arrivals WHERE id=?`, arrivalId);
    if (!arrival) throw new ArrivalIngestionError('ARRIVAL_NOT_FOUND', 'Arrival introuvable.', 404);

    const input = normalizeShipmentInput(rawInput);
    const now = new Date().toISOString();
    const id = `crm_shipment_${randomUUID()}`;
    const code = this.nextCode(SHP_PREFIX, 'crm_shipments', 'shipment_code', 144);
    const cartons = input.cartons ?? [];

    const cols = `id,shipment_code,arrival_id,status,reference,source_type,source_reference,
       carrier_name,carrier_code,carrier_id,service_name,tracking_number,tracking_url,tracking_status,
       sender_name,sender_company,sender_country,sender_city,
       destination_country,destination_city,destination_code,
       shipped_at,estimated_arrival_at,actual_arrival_at,
       total_cartons,total_products,total_units,total_weight,weight_unit,
       created_by,created_at,updated_at`;
    const vals: any[] = [
      id, code, arrivalId, 'DRAFT',
      input.reference || null,
      input.source_type || 'MANUAL', input.source_reference || null,
      input.carrier_name || null, input.carrier_code || null, input.carrier_id || null, input.service_name || null,
      input.tracking_number || null, input.tracking_url || null, input.tracking_status || 'UNKNOWN',
      input.sender_name || null, input.sender_company || null, input.sender_country || null, input.sender_city || null,
      input.destination_country || null, input.destination_city || null, input.destination_code || null,
      input.shipped_at || null, input.estimated_arrival_at || null, input.actual_arrival_at || null,
      cartons.length, Number(input.total_products) || 0, Number(input.total_units) || 0,
      input.total_weight ?? null, input.weight_unit || null,
      actor.id, now, now,
    ];
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO crm_shipments (${cols}) VALUES (${vals.map(() => '?').join(',')})`,
        ...vals,
      );
      this.replaceCartons(id, code, cartons, now);
      recordAdminAudit(this.db, actor, 'SHIPMENT_CREATED', 'CRM_ARRIVALS', arrivalId, id, { shipmentCode: code, cartons: cartons.length });
    });
    return this.get(id);
  }

  // ---------- update (only while DRAFT) ----------
  update(id: string, rawInput: ShipmentInput, actor: AdminAuditActor) {
    const existing = this.get(id);
    if (existing.status !== 'DRAFT') {
      throw new ArrivalIngestionError('SHIPMENT_LOCKED', 'Un envoi confirmé ne peut plus être modifié.', 409);
    }
    const input = normalizeShipmentInput(rawInput);
    const now = new Date().toISOString();
    const cartons = input.cartons;
    this.db.transaction(() => {
      this.db.run(
        `UPDATE crm_shipments SET
           reference=COALESCE(?,reference), source_type=COALESCE(?,source_type), source_reference=?,
           carrier_name=?,carrier_code=?,carrier_id=?,service_name=?,
           tracking_number=?,tracking_url=?,tracking_status=?,
           sender_name=?,sender_company=?,sender_country=?,sender_city=?,
           destination_country=?,destination_city=?,destination_code=?,
           shipped_at=?,estimated_arrival_at=?,actual_arrival_at=?,
           total_products=?,total_units=?,total_weight=?,weight_unit=?,updated_at=?
         WHERE id=?`,
        input.reference ?? undefined, input.source_type ?? undefined, input.source_reference ?? null,
        input.carrier_name ?? null, input.carrier_code ?? null, input.carrier_id ?? null, input.service_name ?? null,
        input.tracking_number ?? null, input.tracking_url ?? null, input.tracking_status ?? null,
        input.sender_name ?? null, input.sender_company ?? null, input.sender_country ?? null, input.sender_city ?? null,
        input.destination_country ?? null, input.destination_city ?? null, input.destination_code ?? null,
        input.shipped_at ?? null, input.estimated_arrival_at ?? null, input.actual_arrival_at ?? null,
        input.total_products != null ? Number(input.total_products) : existing.total_products,
        input.total_units != null ? Number(input.total_units) : existing.total_units,
        input.total_weight ?? null, input.weight_unit ?? null,
        now, id,
      );
      if (Array.isArray(cartons)) {
        this.db.run(`DELETE FROM crm_shipment_cartons WHERE shipment_id=?`, id);
        this.replaceCartons(id, existing.shipment_code, cartons, now);
        this.db.run(`UPDATE crm_shipments SET total_cartons=?, updated_at=? WHERE id=?`, cartons.length, now, id);
      }
      recordAdminAudit(this.db, actor, 'SHIPMENT_EDITED', 'CRM_ARRIVALS', existing.arrival_id, id, { shipmentCode: existing.shipment_code });
    });
    return this.get(id);
  }

  private replaceCartons(shipmentId: string, shipmentCode: string, cartons: NonNullable<ShipmentInput['cartons']>, now: string) {
    cartons.forEach((c, index) => {
      const cartonNumber = Number(c.carton_number) || index + 1;
      const totalCartons = cartons.length;
      const ctnId = `crm_carton_${randomUUID()}`;
      // Stable carton code derived from shipment code + carton number, e.g.
      // SHP-2026-000145 / carton 1 -> CTN-2026000145-01. The QR encodes this id.
      const cartonCode = `${CTN_PREFIX}${shipmentCode.replace(/\D/g, '')}-${String(cartonNumber).padStart(2, '0')}`;
      const qr = c.qr_code_value?.trim() || cartonCode;
      this.db.run(
        `INSERT INTO crm_shipment_cartons
          (id,shipment_id,carton_code,carton_reference,qr_code_value,barcode_value,carton_number,total_cartons,
           weight,weight_unit,length,width,height,dimension_unit,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ctnId, shipmentId, cartonCode,
        c.reference || null, qr, c.barcode_value || null, cartonNumber, totalCartons,
        c.weight ?? null, c.weight_unit || null,
        c.length ?? null, c.width ?? null, c.height ?? null, c.dimension_unit || null,
        now, now,
      );
    });
  }

  // ---------- confirm ----------
  confirm(id: string, actor: AdminAuditActor) {
    const shipment = this.get(id);
    if (shipment.status === 'CONFIRMED') return shipment;
    if (!shipment.cartons.length) {
      throw new ArrivalIngestionError('SHIPMENT_NO_CARTONS', 'Ajoutez au moins un carton avant de confirmer.', 409);
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`UPDATE crm_shipments SET status='CONFIRMED', confirmed_by=?, confirmed_at=?, updated_at=? WHERE id=?`,
        actor.id, now, now, id);
      recordAdminAudit(this.db, actor, 'SHIPMENT_CONFIRMED', 'CRM_ARRIVALS', shipment.arrival_id, id, { shipmentCode: shipment.shipment_code });
    });
    return this.get(id);
  }
}
