import { afterEach, describe, expect, test } from 'vitest';
import http from 'node:http';
import { QatafoDatabase } from '../src/db/database';
import { createArrivalIngestionModule } from '../src/arrival-ingestion/routes';

/**
 * CRM -> Warehouse SHIPMENT CARD integration test against a real HTTP
 * warehouse contract (no mocked client): manual shipment creation, confirm,
 * successful transmission, duplicate send, failure+retry, multiple cartons,
 * unique QR/barcode identifiers, and the carrier-status vs integration-status
 * separation.
 */

function startWarehouse(opts: { apiKey: string }) {
  const received: any[] = [];
  const seen = new Map<string, any>();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      if (opts.apiKey && req.headers['x-api-key'] !== opts.apiKey) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Invalid integration credentials.' }));
      }
      if (!req.url?.includes('/api/v1/integrations/arrivals/shipments')) {
        res.writeHead(404); return res.end();
      }
      const shp = json.shipment;
      if (!shp?.id || !Array.isArray(shp.cartons) || shp.cartons.length === 0) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ message: 'bad shipment' }));
      }
      const id = shp.id;
      const isNew = !seen.has(id);
      if (isNew) {
        const code = `WSHP-${id.replace(/\D/g, '').padStart(6, '0')}`;
        seen.set(id, code);
        received.push({ headers: req.headers, body: json });
      }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        success: true, event: 'shipment.created', shipment_id: id,
        warehouse_shipment_id: seen.get(id), status: 'RECEIVED',
        created: isNew, duplicate: !isNew,
      }));
    });
  });
  // Override: first time created true. We'll just re-handle via marker.
  return new Promise<{ url: string; received: any[]; stop: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      resolve({ url: `http://127.0.0.1:${addr.port}`, received, stop: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

const actor = { id: 'admin_1', name: 'Admin', ipAddress: null };
const dbs: QatafoDatabase[] = [];
afterEach(() => { while (dbs.length) dbs.pop()?.close(); });

function seedArrival(db: QatafoDatabase) {
  const now = new Date().toISOString();
  db.run(`INSERT INTO crm_arrivals (id,name,status,created_at,updated_at) VALUES ('arr_s','Arrival Ship','CONFIRMED',?,?) ON CONFLICT(id) DO NOTHING`, now, now);
  return now;
}

describe('Shipment Card -> Warehouse dispatch', () => {
  test('manual create -> confirm -> send creates a warehouse shipment with unique carton ids; double send is idempotent', async () => {
    const wh = await startWarehouse({ apiKey: 'k' });
    process.env.WAREHOUSE_API_URL = wh.url;
    process.env.WAREHOUSE_API_KEY = 'k';
    const db = new QatafoDatabase(':memory:'); dbs.push(db);
    const now = seedArrival(db);
    const mod = createArrivalIngestionModule(db, { autoRunJobs: false });

    const created = mod.shipments.create('arr_s', {
      carrier_code: 'DHL', carrier_name: 'DHL', service_name: 'Express',
      tracking_number: 'TRK123', tracking_status: 'IN_TRANSIT',
      sender_company: 'Example Co', sender_country: 'CN', sender_city: 'Shenzhen',
      destination_country: 'TN', destination_city: 'Tunis', destination_code: 'AYROVI-WH-TN',
      shipped_at: now, estimated_arrival_at: now,
      total_products: 100, total_units: 127,
      cartons: [{}, {}, {}, {}, {}, {}, {}, {}], // 8 cartons, no overrides
    }, actor);

    expect(created.shipment_code).toMatch(/^SHP-\d+$/);
    expect(created.cartons).toHaveLength(8);
    // Unique, stable carton ids with sequential numbering.
    const ctnIds = created.cartons.map((c: any) => c.carton_code);
    expect(new Set(ctnIds).size).toBe(8);
    ctnIds.forEach((id: string, i: number) => {
      expect(id).toMatch(/^CTN-\d+-\d{2}$/);
      expect(id.endsWith(`-${String(i + 1).padStart(2, '0')}`)).toBe(true);
    });
    // QR defaults to the carton id (stable identifier, not whole JSON).
    expect(created.cartons[0].qr_code_value).toBe(created.cartons[0].carton_code);

    const confirmed = mod.shipments.confirm(created.id, actor);
    expect(confirmed.status).toBe('CONFIRMED');

    const sent = await mod.shipmentDispatch.send(created.id, actor);
    expect(sent.status).toBe('SENT');
    expect(sent.warehouse_shipment_id).toMatch(/^WSHP-/);

    // Payload asserts
    const body = wh.received[0].body;
    expect(body.event).toBe('shipment.created');
    expect(body.shipment.carrier.code).toBe('DHL');
    expect(body.shipment.tracking.status).toBe('IN_TRANSIT');
    expect(body.shipment.destination.code).toBe('AYROVI-WH-TN');
    expect(body.shipment.summary.total_cartons).toBe(8);
    expect(body.shipment.cartons).toHaveLength(8);
    expect(wh.received[0].headers['idempotency-key']).toBe(created.shipment_code);

    // Double send -> SAME warehouse shipment, still 1 record, no dup.
    const again = await mod.shipmentDispatch.send(created.id, actor);
    expect(again.warehouse_shipment_id).toBe(sent.warehouse_shipment_id);
    expect(db.all('SELECT * FROM crm_shipment_dispatches')).toHaveLength(1);
    await wh.stop();
  });

  test('cannot confirm a shipment with no cartons', () => {
    const db = new QatafoDatabase(':memory:'); dbs.push(db);
    seedArrival(db);
    const mod = createArrivalIngestionModule(db, { autoRunJobs: false });
    const created = mod.shipments.create('arr_s', { carrier_code: 'DHL' }, actor);
    expect(() => mod.shipments.confirm(created.id, actor)).toThrow(/carton/i);
  });

  test('cannot send before confirmation', async () => {
    const wh = await startWarehouse({ apiKey: 'k' });
    process.env.WAREHOUSE_API_URL = wh.url; process.env.WAREHOUSE_API_KEY = 'k';
    const db = new QatafoDatabase(':memory:'); dbs.push(db);
    seedArrival(db);
    const mod = createArrivalIngestionModule(db, { autoRunJobs: false });
    const created = mod.shipments.create('arr_s', { carrier_code: 'DHL', cartons: [{}] }, actor);
    await expect(mod.shipmentDispatch.send(created.id, actor)).rejects.toMatchObject({ code: 'SHIPMENT_NOT_CONFIRMED' });
    await wh.stop();
  });

  test('warehouse rejects invalid auth -> SEND_FAILED, then retry succeeds', async () => {
    const wh = await startWarehouse({ apiKey: 'correct' });
    process.env.WAREHOUSE_API_URL = wh.url;
    const db = new QatafoDatabase(':memory:'); dbs.push(db);
    seedArrival(db);
    const mod = createArrivalIngestionModule(db, { autoRunJobs: false });
    const created = mod.shipments.create('arr_s', { carrier_code: 'DHL', cartons: [{}, {}] }, actor);
    mod.shipments.confirm(created.id, actor);

    process.env.WAREHOUSE_API_KEY = 'wrong';
    await expect(mod.shipmentDispatch.send(created.id, actor)).rejects.toMatchObject({ code: 'WAREHOUSE_REJECTED' });
    expect(db.get('SELECT status FROM crm_shipment_dispatches').status).toBe('SEND_FAILED');

    process.env.WAREHOUSE_API_KEY = 'correct';
    const retried = await mod.shipmentDispatch.send(created.id, actor);
    expect(retried.status).toBe('SENT');
    expect(retried.attempts).toBe(2);
    await wh.stop();
  });

  test('warehouse unavailable -> SEND_FAILED with WAREHOUSE_UNAVAILABLE', async () => {
    process.env.WAREHOUSE_API_URL = 'http://127.0.0.1:9';
    process.env.WAREHOUSE_API_KEY = 'k';
    const db = new QatafoDatabase(':memory:'); dbs.push(db);
    seedArrival(db);
    const mod = createArrivalIngestionModule(db, { autoRunJobs: false });
    const created = mod.shipments.create('arr_s', { carrier_code: 'DHL', cartons: [{}] }, actor);
    mod.shipments.confirm(created.id, actor);
    await expect(mod.shipmentDispatch.send(created.id, actor)).rejects.toMatchObject({ code: 'WAREHOUSE_UNAVAILABLE' });
    expect(db.get('SELECT status FROM crm_shipment_dispatches').status).toBe('SEND_FAILED');
  });

  test('carrier status does NOT overwrite internal integration status', async () => {
    const wh = await startWarehouse({ apiKey: 'k' });
    process.env.WAREHOUSE_API_URL = wh.url; process.env.WAREHOUSE_API_KEY = 'k';
    const db = new QatafoDatabase(':memory:'); dbs.push(db);
    seedArrival(db);
    const mod = createArrivalIngestionModule(db, { autoRunJobs: false });
    // Carrier says IN_TRANSIT; internal CRM shipment is CONFIRMED then dispatch SENT.
    const created = mod.shipments.create('arr_s', { tracking_status: 'IN_TRANSIT', cartons: [{}] }, actor);
    mod.shipments.confirm(created.id, actor);
    const sent = await mod.shipmentDispatch.send(created.id, actor);
    expect(created.tracking_status).toBe('IN_TRANSIT'); // carrier state
    expect(sent.status).toBe('SENT'); // integration state (separate machine)
    await wh.stop();
  });
});
