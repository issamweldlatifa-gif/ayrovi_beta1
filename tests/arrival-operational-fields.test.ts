import { afterEach, describe, expect, test } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiResponsesProviderAdapter,
  AiStreamCallbacks,
  AiWorkload,
  AiModelClass,
} from '../src/ai-core/contracts';
import { QatafoDatabase } from '../src/db/database';
import { createArrivalIngestionModule } from '../src/arrival-ingestion/routes';
import { ensureBootstrapAdmin, createAdminSession, sessionCookieName } from '../src/admin/auth';
import { ProductExtractionNormalizer } from '../src/arrival-ingestion/productExtractionNormalizer';
import { ARRIVAL_EXTRACTION_SCHEMA } from '../src/arrival-ingestion/arrivalExtractionSchema';
import { inspectAnthropicSchema } from '../src/ai-core/adapters/anthropic/schemaLimits';

/**
 * Adapter that returns the NEW fixed, union-free schema shape and carries the
 * operational envelope (customer identifiers, order/tracking, supplier/store,
 * price/currency/url, size) plus per-source differences so we can prove
 * multi-source aggregation onto a single Customer Arrival Card.
 */
class OperationalAdapter implements AiResponsesProviderAdapter {
  readonly id = 'operational-fixture';
  readonly kind = 'responses' as const;
  readonly targetRole = 'fallback' as const;
  readonly requests: AiCompletionRequest[] = [];
  isConfigured() { return true; }
  resolveModel(_w: AiWorkload, _c: AiModelClass) { return 'fixture-model'; }
  async complete(aiRequest: AiCompletionRequest): Promise<AiCompletionResult> {
    this.requests.push(aiRequest);
    const textPart = (aiRequest.messages[0].content.find((p) => p.type === 'text') as { text?: string })?.text || '';
    const isEmail = textPart.includes('SOURCE_TYPE: EMAIL');
    const payload = isEmail
      ? { // SHEIN email source
        orderMeta: {
          customerName: 'Operational Customer', customerEmail: 'op.customer@example.com', customerPhone: '+216 22 000 777',
          supplier: 'SHEIN', store: 'SHEIN', orderId: 'SHEIN-OP-777', trackingNumber: 'TRK-SHEIN-777',
          orderDate: '2026-08-20', shipmentStatus: 'SHIPPED', currency: 'EUR',
        },
        products: [{
          productName: 'Email Sneakers', sku: 'SN-777', reference: '', variant: '', color: 'White', size: '42',
          quantity: 1, unitPrice: 49.99, currency: 'EUR', productUrl: 'https://shein.example/item/777',
          productImageRef: '', productImageRegion: [], confidence: 0.96,
          evidenceFieldNames: ['productName', 'sku', 'color', 'size', 'quantity', 'unitPrice', 'currency', 'productUrl'],
          sourceSpecific: [],
        }],
        unresolvedEntries: [], expectedProductCount: 1, warnings: [],
      }
      : { // IMAGE (screenshot) source — different store (TEMU), same customer
        orderMeta: {
          customerName: 'Operational Customer', customerEmail: '', customerPhone: '22000777',
          supplier: 'TEMU', store: 'TEMU', orderId: 'TEMU-OP-888', trackingNumber: 'TRK-TEMU-888',
          orderDate: '2026-08-21', shipmentStatus: 'IN_TRANSIT', currency: 'USD',
        },
        products: [{
          productName: 'Photo Backpack', sku: 'BK-888', reference: '', variant: '', color: 'Black', size: '',
          quantity: 2, unitPrice: 19.5, currency: 'USD', productUrl: '',
          productImageRef: '', productImageRegion: [], confidence: 0.91,
          evidenceFieldNames: ['productName', 'sku', 'color', 'quantity', 'unitPrice', 'currency'],
          sourceSpecific: [],
        }],
        unresolvedEntries: [], expectedProductCount: 1, warnings: [],
      };
    const text = JSON.stringify(payload);
    return { provider: this.id, model: 'fixture-model', output: [{ type: 'text', text }], textBlocks: [text], webResults: [] };
  }
  async stream(req: AiCompletionRequest, cb: AiStreamCallbacks): Promise<AiCompletionResult> {
    const r = await this.complete(req);
    cb.onTextDelta?.(r.textBlocks.join(''));
    return r;
  }
}

interface Harness {
  db: QatafoDatabase;
  adapter: OperationalAdapter;
  module: ReturnType<typeof createArrivalIngestionModule>;
  app: express.Express;
  auth: { cookie: string; csrf: string };
  root: string;
}
const harnesses: Harness[] = [];
function createHarness(): Harness {
  const db = new QatafoDatabase(':memory:');
  ensureBootstrapAdmin(db);
  const admin = db.get<any>('SELECT * FROM admin_users ORDER BY created_at LIMIT 1');
  const session = createAdminSession(db, admin);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-operational-'));
  const adapter = new OperationalAdapter();
  const module = createArrivalIngestionModule(db, { aiAdapter: adapter, sourceRoot: root, autoRunJobs: true });
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/admin/arrival-ingestion', module.router);
  const harness = {
    db, adapter, module, app, root,
    auth: { cookie: `${sessionCookieName()}=${session.token}`, csrf: session.csrfToken },
  };
  harnesses.push(harness);
  return harness;
}
const mut = (h: Harness, m: 'post' | 'patch' | 'get', url: string) =>
  request(h.app)[m](url).set('Cookie', h.auth.cookie).set('x-csrf-token', h.auth.csrf);

afterEach(() => {
  while (harnesses.length) {
    const h = harnesses.pop()!;
    h.db.close();
    fs.rmSync(h.root, { recursive: true, force: true });
  }
});

describe('Arrival CRM operational fields + multi-source customer aggregation', () => {
  test('the provider-facing schema retains every required operational field with zero union parameters', () => {
    const schema = ARRIVAL_EXTRACTION_SCHEMA as any;
    const props = Object.keys(schema.properties);
    expect(props).toEqual(expect.arrayContaining(['orderMeta', 'products', 'unresolvedEntries', 'expectedProductCount', 'warnings']));
    const meta = Object.keys(schema.properties.orderMeta.properties);
    for (const required of ['customerName', 'customerEmail', 'customerPhone', 'supplier', 'store', 'orderId', 'trackingNumber', 'orderDate', 'shipmentStatus', 'currency']) {
      expect(meta).toContain(required);
    }
    const product = Object.keys(schema.properties.products.items.properties);
    for (const required of ['productName', 'sku', 'reference', 'variant', 'color', 'size', 'quantity', 'currency', 'productUrl', 'confidence']) {
      expect(product).toContain(required);
    }
    const report = inspectAnthropicSchema(ARRIVAL_EXTRACTION_SCHEMA);
    expect(report.unionParameters).toBe(0);
    expect(report.exceeded).toBe(false);
  });

  test('normalizer maps fixed-schema sentinels into the application model without losing fields', () => {
    const raw = JSON.stringify({
      orderMeta: {
        customerName: 'Normalized Client', customerEmail: 'n@example.com', customerPhone: '+216 22 000 777',
        supplier: 'SHEIN', store: 'SHEIN', orderId: 'ORD-N', trackingNumber: 'TRK-N',
        orderDate: '2026-08-20', shipmentStatus: 'SHIPPED', currency: 'eur',
      },
      products: [{
        productName: 'Item', sku: 'SKU1', reference: '', variant: '', color: '', size: '42',
        quantity: 0, unitPrice: 0, currency: '', productUrl: 'not-a-url',
        productImageRef: '', productImageRegion: [], confidence: 0.9,
        evidenceFieldNames: ['productName', 'sku', 'size'],
        sourceSpecific: [],
      }],
      unresolvedEntries: [{ sourceReference: 'row-2', field: 'quantity', reason: 'qty unreadable', visibleText: '' }],
      expectedProductCount: 0, warnings: [],
    });
    const out = new ProductExtractionNormalizer().parse(raw, new Set());
    expect(out.orderMeta).toMatchObject({
      customerName: 'Normalized Client', orderId: 'ORD-N', trackingNumber: 'TRK-N',
      orderDate: '2026-08-20', shipmentStatus: 'SHIPPED', currency: 'EUR',
    });
    const p = out.products[0];
    // 0 sentinel -> null; missing evidence -> null; invalid url -> null
    expect(p.quantity).toBeNull();
    expect(p.unitPrice).toBeNull();
    expect(p.size).toBe('42');
    expect(p.productUrl).toBeNull();
    expect(p.currency).toBe('EUR'); // inherits orderMeta currency
    expect(out.unresolvedEntries[0]).toMatchObject({ field: 'quantity', reason: 'qty unreadable', visibleText: null });
  });

  test('aggregates an EMAIL source and an IMAGE (screenshot) source from two stores onto one Customer Arrival Card, then warehouse batch', async () => {
    const h = createHarness();
    const now = new Date().toISOString();
    const customerId = 'op_customer_1';
    h.db.run(`INSERT INTO customers (id,name,phone,normalized_phone,governorate,address,registered_at,status,updated_at)
      VALUES (?,?,?,?,?,?,?,'ACTIVE',?)`, customerId, 'Operational Customer', '+21622000777', '22000777', 'Tunis', 'Tunis address', now, now);

    // Arrival + one client (one Customer Arrival Card)
    const arrival = await mut(h, 'post', '/api/admin/arrival-ingestion/arrivals').send({ name: 'Operational Batch' });
    expect(arrival.status).toBe(201);
    const arrivalId = arrival.body.data.id;
    const linked = await mut(h, 'post', `/api/admin/arrival-ingestion/arrivals/${arrivalId}/clients`).send({ customerId });
    const clientId = linked.body.data.clients[0].id as string;

    const stores = (await mut(h, 'get', '/api/admin/arrival-ingestion/stores')).body.data;
    const shein = stores.find((s: any) => s.code === 'SHEIN');
    const temu = stores.find((s: any) => s.code === 'TEMU');

    // Store 1 = SHEIN (email), Store 2 = TEMU (image/screenshot)
    const sheinAssign = await mut(h, 'patch', `/api/admin/arrival-ingestion/clients/${clientId}`).send({ storeId: shein.id });
    expect(sheinAssign.status).toBe(200);
    const addTemu = await mut(h, 'post', `/api/admin/arrival-ingestion/clients/${clientId}/stores`).send({ storeId: temu.id });
    expect(addTemu.status).toBe(201);
    const temuAssignment = addTemu.body.data.clients[0].stores.find((s: any) => s.store.code === 'TEMU');
    const sheinAssignment = addTemu.body.data.clients[0].stores.find((s: any) => s.store.code === 'SHEIN');

    // EMAIL source -> SHEIN store
    const emailUpload = await mut(h, 'post', `/api/admin/arrival-ingestion/clients/${clientId}/stores/${sheinAssignment.id}/sources`)
      .field('sourceType', 'EMAIL')
      .field('emailContent', [
        'Subject: SHEIN order SHEIN-OP-777 TRK-SHEIN-777',
        '',
        'Email Sneakers',
        'SKU: SN-777',
        'color: White',
        'size: 42',
        'Quantity: 1',
        'Unit price: 49.99 EUR',
        'https://shein.example/item/777',
      ].join('\n'));
    expect(emailUpload.status).toBe(201);
    const emailSourceId = emailUpload.body.data.source.id;

    // IMAGE (screenshot) source -> TEMU store
    const png = await import('sharp').then(({ default: sharp }) =>
      sharp({ create: { width: 96, height: 96, channels: 3, background: '#fafafa' } }).png().toBuffer());
    const imageUpload = await mut(h, 'post', `/api/admin/arrival-ingestion/clients/${clientId}/stores/${temuAssignment.id}/sources`)
      .field('sourceType', 'IMAGE')
      .attach('source', png, { filename: 'screenshot.png', contentType: 'image/png' });
    expect(imageUpload.status).toBe(201);
    const imageSourceId = imageUpload.body.data.source.id;

    // Run both extractions and wait for the worker queue.
    const e1 = await mut(h, 'post', `/api/admin/arrival-ingestion/sources/${emailSourceId}/extractions`).send({ reprocess: false });
    const e2 = await mut(h, 'post', `/api/admin/arrival-ingestion/sources/${imageSourceId}/extractions`).send({ reprocess: false });
    expect(e1.status).toBe(202);
    expect(e2.status).toBe(202);
    await h.module.runner.waitForIdle();

    // Both requests used the union-free structured output schema.
    expect(h.adapter.requests).toHaveLength(2);
    expect(h.adapter.requests.every((r) => r.outputSchema?.name === 'ayrovi_arrival_product_extraction')).toBe(true);

    // Customer Arrival Card aggregates BOTH stores under ONE client/customer.
    const detail = await mut(h, 'get', `/api/admin/arrival-ingestion/arrivals/${arrivalId}`);
    expect(detail.body.data.clients).toHaveLength(1);
    const card = detail.body.data.clients[0];
    expect(card.customer.id).toBe(customerId);
    expect(card.stores).toHaveLength(2);
    expect(card.stores.map((s: any) => s.store.code).sort()).toEqual(['SHEIN', 'TEMU']);
    expect(detail.body.data.summary).toMatchObject({ customers: 1, stores: 2, products: 2 });

    // Operational fields persisted on the SHEIN (email) line item.
    const sheinProducts = (await mut(h, 'get', `/api/admin/arrival-ingestion/clients/${clientId}/stores/${sheinAssignment.id}/products`)).body.data;
    expect(sheinProducts).toHaveLength(1);
    expect(sheinProducts[0]).toMatchObject({
      sku: 'SN-777', color: 'White', size: '42', quantity: 1,
      unitPrice: 49.99, currency: 'EUR', productUrl: 'https://shein.example/item/777',
      orderId: 'SHEIN-OP-777', trackingNumber: 'TRK-SHEIN-777', shipmentStatus: 'SHIPPED',
    });
    // Operational fields persisted on the TEMU (screenshot) line item.
    const temuProducts = (await mut(h, 'get', `/api/admin/arrival-ingestion/clients/${clientId}/stores/${temuAssignment.id}/products`)).body.data;
    expect(temuProducts).toHaveLength(1);
    expect(temuProducts[0]).toMatchObject({
      sku: 'BK-888', color: 'Black', quantity: 2, unitPrice: 19.5, currency: 'USD',
      orderId: 'TEMU-OP-888', trackingNumber: 'TRK-TEMU-888', shipmentStatus: 'IN_TRANSIT',
    });

    // Warehouse batch: approve all line items across both stores, then confirm
    // the Arrival (the batch) which is now fully consistent.
    const approveAll = await mut(h, 'post', `/api/admin/arrival-ingestion/clients/${clientId}/products/approve-all`).send({});
    expect(approveAll.status).toBe(200);
    expect(approveAll.body.data.approved).toBe(2);

    const preConfirm = await mut(h, 'get', `/api/admin/arrival-ingestion/arrivals/${arrivalId}`);
    expect(preConfirm.body.data.confirmation.canConfirm,
      JSON.stringify(preConfirm.body.data.confirmation.issues)).toBe(true);
    const confirmed = await mut(h, 'post', `/api/admin/arrival-ingestion/arrivals/${arrivalId}/confirm`).send({});
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(confirmed.body.data.status).toBe('CONFIRMED');
    expect(confirmed.body.data.confirmedAt).toEqual(expect.any(String));
  }, 30_000);
});
