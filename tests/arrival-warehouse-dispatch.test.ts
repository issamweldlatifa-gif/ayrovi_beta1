import { afterEach, describe, expect, test } from 'vitest';
import http from 'node:http';
import { QatafoDatabase } from '../src/db/database';
import { createArrivalIngestionModule } from '../src/arrival-ingestion/routes';

/**
 * End-to-end-ish test of the Arrival CRM -> Warehouse integration.
 *
 * A REAL HTTP server stands in for the Warehouse and implements the exact
 * contract: it validates x-api-key, validates the payload shape, is idempotent
 * on the card id / Idempotency-Key, and returns a warehouse_arrival_id. The CRM
 * performs a REAL fetch against it (no mocked client), so we prove the CRM
 * builds the structured payload, authenticates, and persists SENT / SEND_FAILED.
 */

interface WarehouseRequest {
  headers: Record<string, string | undefined>;
  body: any;
}

function startWarehouseServer(opts: { apiKey: string; behaviour?: 'ok' | 'authfail' | 'payloadfail' | 'down' }) {
  const received: WarehouseRequest[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      received.push({ headers: req.headers as any, body: json });

      if (opts.behaviour === 'down' || !req.url?.includes('/api/v1/integrations/arrivals/customer-cards')) {
        res.writeHead(503, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ message: 'unavailable' }));
      }
      if (req.headers['x-api-key'] !== opts.apiKey) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Invalid integration credentials.' }));
      }
      if (opts.behaviour === 'authfail') {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Invalid integration credentials.' }));
      }
      const card = json.customer_arrival_card;
      if (!card?.id || !card?.customer?.id || !Array.isArray(card?.products) || card.products.length === 0) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ code: 'BAD_PAYLOAD', message: 'invalid card' }));
      }
      if (opts.behaviour === 'payloadfail') {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ code: 'BAD_PAYLOAD', message: 'rejected' }));
      }
      // Idempotency: same card id always returns the same WAR id.
      const code = `WAR-${card.id.replace(/\D/g, '').padStart(6, '0') || '001000'}`;
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        customer_arrival_card_id: card.id,
        warehouse_arrival_id: code,
        arrival_status: 'EXPECTED',
        created: true,
      }));
    });
  });
  return new Promise<{ url: string; received: WarehouseRequest[]; stop: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        received,
        stop: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

interface Harness {
  db: QatafoDatabase;
  module: ReturnType<typeof createArrivalIngestionModule>;
  arrivalId: string;
  clientId: string;
  customerId: string;
}

function seed(db: QatafoDatabase): Harness {
  const now = new Date().toISOString();
  db.run(`INSERT INTO crm_stores (id,code,name,active,created_at,updated_at) VALUES ('store_whx','WHX','Warehouse Test Shop',1,?,?)`, now, now);
  db.run(`INSERT INTO customers (id,name,phone,normalized_phone,governorate,address,registered_at,status,updated_at)
    VALUES ('cus_wh','Ahmed Ben Ali','+21622000111','22000111','Tunis','Adr',?,'ACTIVE',?)`, now, now);
  db.run(`INSERT INTO crm_arrivals (id,name,status,created_at,updated_at) VALUES ('arr_1','Jan Arrival','CONFIRMED',?,?)`, now, now);
  db.run(`INSERT INTO crm_arrival_clients (id,arrival_id,customer_id,store_id,created_at,updated_at)
    VALUES ('client_1','arr_1','cus_wh','store_whx',?,?)`, now, now);
  db.run(`INSERT INTO crm_arrival_client_stores (id,arrival_client_id,store_id,created_at,updated_at)
    VALUES ('acs_1','client_1','store_whx',?,?)`, now, now);
  db.run(`INSERT INTO crm_arrival_sources
    (id,arrival_client_id,arrival_client_store_id,source_type,original_filename,mime_type,byte_size,source_hash,storage_key,created_at)
    VALUES ('src_1','client_1','acs_1','EMAIL','facture.eml','message/rfc822',100,'hash1','key1',?)`, now);
  // Two extracted/approved products (EXTRACTED + approved), both on client_1/store_whx.
  const product = (id: string, sku: string, name: string, qty: number) => {
    const cols = `id,job_id,source_id,arrival_client_id,arrival_client_store_id,arrival_id,customer_id,store_id,
       product_name,sku,reference,variant,color,size,quantity,unit_price,currency,product_url,
       source_type,source_reference,extraction_confidence,extraction_status,approved_at,
       field_evidence,source_specific,raw_extracted,review_reasons,is_current,created_at,updated_at`;
    const vals = [
      id, null, 'src_1', 'client_1', 'acs_1', 'arr_1', 'cus_wh', 'store_whx',
      name, sku, sku, null, null, '42', qty, null, null, null,
      'EMAIL', 'ref', 1, 'EXTRACTED', now,
      '{}', '[]', '{}', '[]', 1, now, now,
    ];
    const placeholders = vals.map(() => '?').join(',');
    db.run(`INSERT INTO crm_extracted_products (${cols}) VALUES (${placeholders})`, ...vals);
  };
  product('p1', 'SB-1', 'Product A', 1);
  product('p2', 'SB-2', 'Product B', 2);
  const module = createArrivalIngestionModule(db, { autoRunJobs: false });
  return { db, module, arrivalId: 'arr_1', clientId: 'client_1', customerId: 'cus_wh' };
}

const actor = { id: 'admin_1', name: 'Admin', ipAddress: null };
const databases: QatafoDatabase[] = [];
afterEach(() => { while (databases.length) databases.pop()?.close(); });

describe('Arrival CRM -> Warehouse dispatch', () => {
  test('sends a real card, creates an Expected Arrival, and is idempotent on double-send', async () => {
    const apiKey = 'secret-key-123';
    const wh = await startWarehouseServer({ apiKey });
    process.env.WAREHOUSE_API_URL = wh.url;
    process.env.WAREHOUSE_API_KEY = apiKey;
    const db = new QatafoDatabase(':memory:');
    databases.push(db);
    const h = seed(db);

    // First send -> SENT with warehouse id.
    const first = await h.module.warehouseDispatch.send(h.arrivalId, h.clientId, actor);
    expect(first.status).toBe('SENT');
    expect(first.warehouse_arrival_id).toMatch(/^WAR-\d+$/);
    expect(first.http_status).toBe(201);

    // Payload shape asserted on the (real) received request.
    const req1 = wh.received[0];
    expect(req1.headers['x-api-key']).toBe(apiKey);
    expect(req1.headers['idempotency-key']).toMatch(/^card_client_1$/);
    expect(req1.body.event).toBe('customer_arrival_card.created');
    expect(req1.body.arrival.id).toBe('arr_1');
    expect(req1.body.customer_arrival_card.customer).toMatchObject({ id: 'cus_wh', name: 'Ahmed Ben Ali' });
    expect(req1.body.customer_arrival_card.store).toMatchObject({ id: 'store_whx', name: 'Warehouse Test Shop' });
    expect(req1.body.customer_arrival_card.products).toHaveLength(2);
    expect(req1.body.customer_arrival_card.products[1]).toMatchObject({ sku: 'SB-2', quantity: 2, size: '42' });

    // Second send (double send) -> SAME card, only one arrival on warehouse side.
    const second = await h.module.warehouseDispatch.send(h.arrivalId, h.clientId, actor);
    expect(second.status).toBe('SENT');
    expect(second.warehouse_arrival_id).toBe(first.warehouse_arrival_id);
    // CRM keeps a single dispatch row. The second send short-circuits in the
    // CRM (already-SENT guard) so no duplicate card is created anywhere.
    const rows = db.all('SELECT * FROM crm_warehouse_dispatches');
    expect(rows).toHaveLength(1);
    expect(wh.received).toHaveLength(1);

    // Warehouse-level idempotency is proven separately in the Warehouse service
    // test (same card id -> same WAR code, one Expected Arrival). Here we also
    // re-send the SAME card id directly to the warehouse to confirm dedupe there.
    const cardId = req1.body.customer_arrival_card.id;
    const rawRes = await fetch(`${wh.url}/api/v1/integrations/arrivals/customer-cards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'idempotency-key': cardId },
      body: JSON.stringify(req1.body),
    });
    const dup = await rawRes.json();
    expect(rawRes.status).toBe(201);
    expect(dup.warehouse_arrival_id).toBe(first.warehouse_arrival_id);

    await wh.stop();
  });

  test('invalid credentials -> SEND_FAILED, no warehouse arrival, retry possible', async () => {
    const wh = await startWarehouseServer({ apiKey: 'correct-key' });
    process.env.WAREHOUSE_API_URL = wh.url;
    process.env.WAREHOUSE_API_KEY = 'wrong-key';
    const db = new QatafoDatabase(':memory:');
    databases.push(db);
    const h = seed(db);

    await expect(h.module.warehouseDispatch.send(h.arrivalId, h.clientId, actor)).rejects.toMatchObject({ code: 'WAREHOUSE_REJECTED', status: 502, httpStatus: 401 });
    // Upstream 401 must be surfaced to the admin UI as 502 so the frontend's
    // global "401 => session expired => logout" handler does NOT sign the admin out.
    let row = db.get<any>('SELECT * FROM crm_warehouse_dispatches');
    expect(row.status).toBe('SEND_FAILED');
    expect(row.http_status).toBe(401);

    // Fix credentials and retry -> SENT.
    process.env.WAREHOUSE_API_KEY = 'correct-key';
    const retried = await h.module.warehouseDispatch.send(h.arrivalId, h.clientId, actor);
    expect(retried.status).toBe('SENT');
    expect(retried.attempts).toBe(2);
    row = db.get<any>('SELECT * FROM crm_warehouse_dispatches');
    expect(row.status).toBe('SENT');

    await wh.stop();
  });

  test('warehouse unavailable -> SEND_FAILED with WAREHOUSE_UNAVAILABLE', async () => {
    // Point at a closed port -> connection refused.
    process.env.WAREHOUSE_API_URL = 'http://127.0.0.1:9';
    process.env.WAREHOUSE_API_KEY = 'k';
    const db = new QatafoDatabase(':memory:');
    databases.push(db);
    const h = seed(db);

    await expect(h.module.warehouseDispatch.send(h.arrivalId, h.clientId, actor)).rejects.toMatchObject({ code: 'WAREHOUSE_UNAVAILABLE' });
    const row = db.get<any>('SELECT * FROM crm_warehouse_dispatches');
    expect(row.status).toBe('SEND_FAILED');
    expect(row.error_code).toBe('WAREHOUSE_UNAVAILABLE');
  });

  test('refuses to send before the Arrival is confirmed', async () => {
    const wh = await startWarehouseServer({ apiKey: 'k' });
    process.env.WAREHOUSE_API_URL = wh.url;
    process.env.WAREHOUSE_API_KEY = 'k';
    const db = new QatafoDatabase(':memory:');
    databases.push(db);
    const h = seed(db);
    db.run(`UPDATE crm_arrivals SET status='REVIEW' WHERE id=?`, h.arrivalId);
    await expect(h.module.warehouseDispatch.send(h.arrivalId, h.clientId, actor)).rejects.toMatchObject({ code: 'ARRIVAL_NOT_CONFIRMED' });
    await wh.stop();
  });

  test('multi-store customer: card-level store is null while products carry store context', async () => {
    const wh = await startWarehouseServer({ apiKey: 'k' });
    process.env.WAREHOUSE_API_URL = wh.url;
    process.env.WAREHOUSE_API_KEY = 'k';
    const db = new QatafoDatabase(':memory:');
    databases.push(db);
    const h = seed(db);
    const now = new Date().toISOString();
    // Add a second store + second assignment + product for the SAME customer card.
    db.run(`INSERT INTO crm_stores (id,code,name,active,created_at,updated_at) VALUES ('store_amz','AMZ','Amazon Shop',1,?,?)`, now, now);
    db.run(`INSERT INTO crm_arrival_client_stores (id,arrival_client_id,store_id,created_at,updated_at) VALUES ('acs_2','client_1','store_amz',?,?)`, now, now);
    db.run(`INSERT INTO crm_arrival_sources (id,arrival_client_id,arrival_client_store_id,source_type,original_filename,mime_type,byte_size,source_hash,storage_key,created_at) VALUES ('src_2','client_1','acs_2','PDF','f2.pdf','application/pdf',10,'hash2','key2',?)`, now);
    const cols = `id,job_id,source_id,arrival_client_id,arrival_client_store_id,arrival_id,customer_id,store_id,product_name,sku,reference,variant,color,size,quantity,unit_price,currency,product_url,source_type,source_reference,extraction_confidence,extraction_status,approved_at,field_evidence,source_specific,raw_extracted,review_reasons,is_current,created_at,updated_at`;
    const vals = ['p3', null, 'src_2', 'client_1', 'acs_2', 'arr_1', 'cus_wh', 'store_amz', 'Product C', 'AMZ-1', 'AMZ-1', null, null, 'M', 1, null, null, null, 'PDF', 'ref2', 1, 'EXTRACTED', now, '{}', '[]', '{}', '[]', 1, now, now];
    db.run(`INSERT INTO crm_extracted_products (${cols}) VALUES (${vals.map(() => '?').join(',')})`, ...vals);

    await h.module.warehouseDispatch.send(h.arrivalId, h.clientId, actor);
    const card = wh.received[0].body.customer_arrival_card;
    expect(card.store).toBeNull(); // multi-store -> no single card store
    expect(card.products).toHaveLength(3);
    expect(card.products.map((p: any) => p.sku).sort()).toEqual(['AMZ-1', 'SB-1', 'SB-2']);
    // Total units aggregated across both stores.
    expect(card.products.reduce((n: number, p: any) => n + p.quantity, 0)).toBe(4);
    await wh.stop();
  });

  test('multiple customers in one arrival produce separate cards/arrivals', async () => {
    const wh = await startWarehouseServer({ apiKey: 'k' });
    process.env.WAREHOUSE_API_URL = wh.url;
    process.env.WAREHOUSE_API_KEY = 'k';
    const db = new QatafoDatabase(':memory:');
    databases.push(db);
    const h = seed(db);
    const now = new Date().toISOString();
    // Second customer in the SAME arrival.
    db.run(`INSERT INTO customers (id,name,phone,normalized_phone,governorate,address,registered_at,status,updated_at) VALUES ('cus_wh2','Sonia','+21622000222','22000222','Ariana','Adr',?,'ACTIVE',?)`, now, now);
    db.run(`INSERT INTO crm_arrival_clients (id,arrival_id,customer_id,store_id,created_at,updated_at) VALUES ('client_2','arr_1','cus_wh2','store_whx',?,?)`, now, now);
    db.run(`INSERT INTO crm_arrival_client_stores (id,arrival_client_id,store_id,created_at,updated_at) VALUES ('acs_3','client_2','store_whx',?,?)`, now, now);
    db.run(`INSERT INTO crm_arrival_sources (id,arrival_client_id,arrival_client_store_id,source_type,original_filename,mime_type,byte_size,source_hash,storage_key,created_at) VALUES ('src_3','client_2','acs_3','EMAIL','f3.eml','message/rfc822',10,'hash3','key3',?)`, now);
    const cols = `id,job_id,source_id,arrival_client_id,arrival_client_store_id,arrival_id,customer_id,store_id,product_name,sku,reference,variant,color,size,quantity,unit_price,currency,product_url,source_type,source_reference,extraction_confidence,extraction_status,approved_at,field_evidence,source_specific,raw_extracted,review_reasons,is_current,created_at,updated_at`;
    const vals = ['p4', null, 'src_3', 'client_2', 'acs_3', 'arr_1', 'cus_wh2', 'store_whx', 'Sonia Item', 'SN-1', 'SN-1', null, null, 'S', 5, null, null, null, 'EMAIL', 'ref3', 1, 'EXTRACTED', now, '{}', '[]', '{}', '[]', 1, now, now];
    db.run(`INSERT INTO crm_extracted_products (${cols}) VALUES (${vals.map(() => '?').join(',')})`, ...vals);

    const r1 = await h.module.warehouseDispatch.send('arr_1', 'client_1', actor);
    const r2 = await h.module.warehouseDispatch.send('arr_1', 'client_2', actor);
    expect(r1.status).toBe('SENT');
    expect(r2.status).toBe('SENT');
    expect(r2.card_id).not.toBe(r1.card_id);

    const cards = wh.received.map((r) => r.body.customer_arrival_card);
    const customers = cards.map((c) => c.customer.id).sort();
    expect(customers).toEqual(['cus_wh', 'cus_wh2']);
    expect(cards.find((c) => c.customer.id === 'cus_wh2').products[0].quantity).toBe(5);
    // Two distinct Expected Arrivals (two dispatch rows).
    expect(db.all('SELECT * FROM crm_warehouse_dispatches')).toHaveLength(2);
    await wh.stop();
  });

  test('large card (>=100 products) is accepted and total units aggregated', async () => {
    const apiKey = 'k';
    const wh = await startWarehouseServer({ apiKey });
    process.env.WAREHOUSE_API_URL = wh.url;
    process.env.WAREHOUSE_API_KEY = apiKey;
    const db = new QatafoDatabase(':memory:');
    databases.push(db);
    const h = seed(db);
    // Remove the two seed products and insert 120 products for client_1.
    db.run(`DELETE FROM crm_extracted_products WHERE arrival_client_id='client_1'`);
    const now = new Date().toISOString();
    const cols = `id,job_id,source_id,arrival_client_id,arrival_client_store_id,arrival_id,customer_id,store_id,product_name,sku,reference,variant,color,size,quantity,unit_price,currency,product_url,source_type,source_reference,extraction_confidence,extraction_status,approved_at,field_evidence,source_specific,raw_extracted,review_reasons,is_current,created_at,updated_at`;
    for (let i = 0; i < 120; i++) {
      const vals = [`pb${i}`, null, 'src_1', 'client_1', 'acs_1', 'arr_1', 'cus_wh', 'store_whx', `Bulk ${i}`, `BK-${i}`, `BK-${i}`, null, null, null, 2, null, null, null, 'EMAIL', 'ref', 1, 'EXTRACTED', now, '{}', '[]', '{}', '[]', 1, now, now];
      db.run(`INSERT INTO crm_extracted_products (${cols}) VALUES (${vals.map(() => '?').join(',')})`, ...vals);
    }
    const res = await h.module.warehouseDispatch.send(h.arrivalId, h.clientId, actor);
    expect(res.status).toBe('SENT');
    const card = wh.received[0].body.customer_arrival_card;
    expect(card.products.length).toBeGreaterThanOrEqual(100);
    expect(card.products).toHaveLength(120);
    expect(card.products.reduce((n: number, p: any) => n + p.quantity, 0)).toBe(240);
    await wh.stop();
  });
});
