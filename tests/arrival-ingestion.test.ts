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
import { AiProviderError } from '../src/ai-core/errors';
import { QatafoDatabase } from '../src/db/database';
import { createArrivalIngestionModule } from '../src/arrival-ingestion/routes';
import { ensureBootstrapAdmin, createAdminSession, sessionCookieName } from '../src/admin/auth';
import { writeSimplePdf } from '../src/services/simplePdf';
import { ProductExtractionNormalizer } from '../src/arrival-ingestion/productExtractionNormalizer';
import { loadStoreProfile } from '../src/arrival-ingestion/storeProfiles';

class DeterministicIngestionAdapter implements AiResponsesProviderAdapter {
  readonly id = 'deterministic-arrival-fixture';
  readonly kind = 'responses' as const;
  readonly targetRole = 'fallback' as const;
  readonly requests: AiCompletionRequest[] = [];
  failStores = new Set<string>();
  rateLimitStores = new Set<string>();

  isConfigured() { return true; }
  resolveModel(_workload: AiWorkload, _modelClass: AiModelClass) { return 'fixture-model'; }
  private payload(request: AiCompletionRequest) {
    const system = request.instructions;
    for (const store of this.failStores) if (system.includes(`Store profile: ${store}`)) throw new Error('fixture failure');
    const orderMeta = {
      customerName: '', customerEmail: '', customerPhone: '',
      supplier: '', store: '', orderId: '', trackingNumber: '',
      orderDate: '', shipmentStatus: '', currency: '',
    };
    // New fixed schema: text unknowns are "" (not null), numeric unknowns 0,
    // array unknowns []; evidence is the list of evidenced canonical fields.
    if (system.includes('Store profile: TEMU')) {
      return {
        orderMeta: { ...orderMeta, supplier: 'TEMU', store: 'TEMU', orderId: 'TEMU-ORD-1', trackingNumber: 'TRK-TEMU-1', currency: 'USD' },
        products: [{
          productName: 'TEMU storage basket', sku: 'TM-100', reference: '', variant: 'Large', color: 'Black', size: '',
          quantity: 1, unitPrice: 0, currency: 'USD', productUrl: '',
          productImageRef: 'pdf-page-1', productImageRegion: [0.08, 0.08, 0.35, 0.35], confidence: 0.94,
          evidenceFieldNames: ['productName', 'sku', 'variant', 'color', 'quantity'],
          sourceSpecific: [{ key: 'orderLine', value: '1', evidence: 'First visible invoice line' }],
        }],
        unresolvedEntries: [], expectedProductCount: 1, warnings: [],
      };
    }
    return {
      orderMeta: { ...orderMeta, supplier: 'SHEIN', store: 'SHEIN', orderId: 'SHEIN-ORD-9', trackingNumber: 'TRK-SHEIN-9', currency: 'EUR' },
      products: [
        {
          productName: 'Grande boîte à bijoux', sku: 'sb25092090066487374', reference: '',
          variant: 'Multicolore-Blanc-Autocollant lettre A', color: 'Blanc', size: '',
          quantity: 1, unitPrice: 12.9, currency: 'EUR', productUrl: '',
          productImageRef: '', productImageRegion: [], confidence: 0.97,
          evidenceFieldNames: ['productName', 'sku', 'variant', 'color', 'quantity'],
          sourceSpecific: [{ key: 'storeLine', value: 'A-1', evidence: 'First product block' }],
        },
        {
          productName: 'Bracelet mode', sku: 'sj2406136606014547', reference: '',
          variant: '', color: '', size: '',
          quantity: 0, unitPrice: 0, currency: '', productUrl: '',
          productImageRef: '', productImageRegion: [], confidence: 0.82,
          evidenceFieldNames: ['productName', 'sku'],
          sourceSpecific: [],
        },
      ],
      unresolvedEntries: [], expectedProductCount: 2, warnings: [],
    };
  }
  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    this.requests.push(request);
    for (const store of this.rateLimitStores) {
      if (request.instructions.includes(`Store profile: ${store}`)) {
        throw new AiProviderError('PROVIDER_RATE_LIMITED', this.id, 'fixture quota detail', { retryable: true });
      }
    }
    const payload = this.payload(request);
    return {
      provider: this.id,
      model: 'fixture-model',
      output: [{ type: 'text', text: JSON.stringify(payload) }],
      textBlocks: [JSON.stringify(payload)],
      webResults: [],
    };
  }
  async stream(request: AiCompletionRequest, callbacks: AiStreamCallbacks): Promise<AiCompletionResult> {
    const result = await this.complete(request);
    callbacks.onTextDelta?.(result.textBlocks[0]);
    return result;
  }
}

interface Harness {
  db: QatafoDatabase;
  adapter: DeterministicIngestionAdapter;
  module: ReturnType<typeof createArrivalIngestionModule>;
  app: express.Express;
  auth: { cookie: string; csrf: string };
  root: string;
}

const harnesses: Harness[] = [];
function createHarness(autoRunJobs = true): Harness {
  const db = new QatafoDatabase(':memory:');
  ensureBootstrapAdmin(db);
  const admin = db.get<any>('SELECT * FROM admin_users ORDER BY created_at LIMIT 1');
  const session = createAdminSession(db, admin);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-arrival-ingestion-'));
  const adapter = new DeterministicIngestionAdapter();
  const module = createArrivalIngestionModule(db, { aiAdapter: adapter, sourceRoot: root, autoRunJobs });
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
function mutation(harness: Harness, method: 'post' | 'patch' | 'delete', url: string) {
  return request(harness.app)[method](url).set('Cookie', harness.auth.cookie).set('x-csrf-token', harness.auth.csrf);
}
function read(harness: Harness, url: string) {
  return request(harness.app).get(url).set('Cookie', harness.auth.cookie);
}
function addCustomer(db: QatafoDatabase, suffix: string, name: string) {
  const now = new Date().toISOString();
  const id = `arrival_test_customer_${suffix}`;
  db.run(`INSERT INTO customers (id,name,phone,normalized_phone,governorate,address,registered_at,status,updated_at)
    VALUES (?,?,?,?,?,?,?,'ACTIVE',?)`, id, name, `22${suffix.padStart(6, '0')}`, `22${suffix.padStart(6, '0')}`, 'Tunis', 'Test address', now, now);
  return id;
}

async function createArrivalWithClient(harness: Harness, name: string, customerId: string, storeCode: string) {
  const arrival = await mutation(harness, 'post', '/api/admin/arrival-ingestion/arrivals').send({ name });
  expect(arrival.status).toBe(201);
  const arrivalId = arrival.body.data.id as string;
  const added = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${arrivalId}/clients`).send({ customerId });
  expect(added.status).toBe(201);
  const clientId = added.body.data.clients[0].id as string;
  const stores = await read(harness, '/api/admin/arrival-ingestion/stores');
  const store = stores.body.data.find((item: any) => item.code === storeCode);
  expect(store).toBeTruthy();
  const selected = await mutation(harness, 'patch', `/api/admin/arrival-ingestion/clients/${clientId}`).send({ storeId: store.id });
  expect(selected.status).toBe(200);
  return { arrivalId, clientId, store };
}

afterEach(() => {
  while (harnesses.length) {
    const harness = harnesses.pop()!;
    harness.db.close();
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

describe('Administration CRM Arrival AI ingestion', () => {
  test('keeps operational Arrivals separate from the existing public CMS arrivals', () => {
    const harness = createHarness();
    expect(harness.db.get<any>("SELECT name FROM sqlite_master WHERE type='table' AND name='arrivals'")).toBeTruthy();
    expect(harness.db.get<any>("SELECT name FROM sqlite_master WHERE type='table' AND name='crm_arrivals'")).toBeTruthy();
    expect(harness.db.get<any>("SELECT name FROM sqlite_master WHERE type='table' AND name='crm_extraction_jobs'")).toBeTruthy();
    expect(harness.db.arrivalMultistoreMigrationReadiness()).toMatchObject({ ready: true, backupStatus: 'NOT_REQUIRED', backupId: null });
    expect(harness.db.all<any>('SELECT code FROM crm_stores ORDER BY code').map((row) => row.code)).toEqual(['ADIDAS', 'NIKE', 'SHEIN', 'TEMU', 'ZALANDO']);
    const now = new Date().toISOString();
    harness.db.run("INSERT INTO crm_stores (id,code,name,active,created_at,updated_at) VALUES ('crm_store_future','FUTURE','Future Store',1,?,?)", now, now);
    harness.db.run("INSERT INTO crm_store_source_profiles (id,store_id,source_type,strategy_key,extraction_hints,enabled,created_at,updated_at) VALUES ('crm_profile_future_image','crm_store_future','IMAGE','future-image-v1','[]',1,?,?)", now, now);
    expect(loadStoreProfile(harness.db, 'crm_store_future', 'IMAGE')).toMatchObject({ code: 'FUTURE', strategyKey: 'future-image-v1' });

    harness.db.run("CREATE TRIGGER reject_arrival_audit BEFORE INSERT ON audit_logs WHEN NEW.action='ARRIVAL_CREATED' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    expect(() => harness.module.arrivals.create('Atomic rollback check', { id: null, name: 'Test', ipAddress: null })).toThrow('audit unavailable');
    expect(harness.db.get<any>("SELECT id FROM crm_arrivals WHERE name='Atomic rollback check'")).toBeUndefined();
  });

  test('creates a canonical CRM customer inline, normalizes and reuses a duplicate phone, then links the Arrival atomically', async () => {
    const harness = createHarness();
    const firstArrival = await mutation(harness, 'post', '/api/admin/arrival-ingestion/arrivals').send({ name: 'Inline customer A' });
    const firstArrivalId = firstArrival.body.data.id as string;

    const invalid = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${firstArrivalId}/clients`)
      .send({ customer: { name: 'Nouveau Client', phone: '12 345 678' } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('CUSTOMER_PHONE_INVALID');

    const created = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${firstArrivalId}/clients`)
      .send({ customer: { name: '  Nouveau   Client  ', phone: '+216 22 345 678' } });
    expect(created.status).toBe(201);
    expect(created.body.meta).toEqual({ customerCreated: true });
    expect(created.body.data.clients).toHaveLength(1);
    expect(created.body.data.clients[0].customer).toMatchObject({ name: 'Nouveau Client', phone: '+21622345678', status: 'ACTIVE' });
    const customerId = created.body.data.clients[0].customer.id as string;
    expect(harness.db.get<any>('SELECT * FROM customers WHERE id=?', customerId)).toMatchObject({
      name: 'Nouveau Client', phone: '+21622345678', normalized_phone: '22345678', governorate: '', address: '', status: 'ACTIVE',
    });
    expect(harness.db.get<any>("SELECT COUNT(*) count FROM audit_logs WHERE action='CUSTOMER_CREATED' AND entity_id=?", customerId).count).toBe(1);
    const searchedByFormattedPhone = await read(harness, '/api/admin/arrival-ingestion/customers?search=%2B216%2022%20345%20678');
    expect(searchedByFormattedPhone.body.data).toEqual([expect.objectContaining({ id: customerId })]);

    const duplicateInArrival = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${firstArrivalId}/clients`)
      .send({ customer: { name: 'Nom différent', phone: '00216 22 345 678' } });
    expect(duplicateInArrival.status).toBe(409);
    expect(duplicateInArrival.body.code).toBe('ARRIVAL_CLIENT_DUPLICATE');

    const secondArrival = await mutation(harness, 'post', '/api/admin/arrival-ingestion/arrivals').send({ name: 'Inline customer B' });
    const reused = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${secondArrival.body.data.id}/clients`)
      .send({ customer: { name: 'Ne pas remplacer', phone: '22345678' } });
    expect(reused.status).toBe(201);
    expect(reused.body.meta).toEqual({ customerCreated: false });
    expect(reused.body.data.clients[0].customer).toMatchObject({ id: customerId, name: 'Nouveau Client', phone: '+21622345678' });
    expect(harness.db.get<any>("SELECT COUNT(*) count FROM customers WHERE normalized_phone='22345678'").count).toBe(1);
    expect(harness.db.get<any>("SELECT COUNT(*) count FROM audit_logs WHERE action='CUSTOMER_CREATED' AND entity_id=?", customerId).count).toBe(1);

    const blockedArrival = await mutation(harness, 'post', '/api/admin/arrival-ingestion/arrivals').send({ name: 'Blocked customer reuse' });
    harness.db.run("UPDATE customers SET status='BLOCKED' WHERE id=?", customerId);
    const blocked = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${blockedArrival.body.data.id}/clients`)
      .send({ customer: { name: 'Blocked Customer', phone: '22 345 678' } });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('CUSTOMER_INVALID');
    expect(harness.db.get<any>('SELECT id FROM crm_arrival_clients WHERE arrival_id=?', blockedArrival.body.data.id)).toBeUndefined();
    harness.db.run("UPDATE customers SET status='ACTIVE' WHERE id=?", customerId);

    harness.db.run("UPDATE crm_arrivals SET status='CONFIRMED' WHERE id=?", firstArrivalId);
    const locked = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${firstArrivalId}/clients`)
      .send({ customer: { name: 'Locked Customer', phone: '22 765 432' } });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('ARRIVAL_CONFIRMED');
    expect(harness.db.get<any>("SELECT id FROM customers WHERE normalized_phone='22765432'")).toBeUndefined();

    const thirdArrival = await mutation(harness, 'post', '/api/admin/arrival-ingestion/arrivals').send({ name: 'Atomic inline failure' });
    harness.db.run("CREATE TRIGGER reject_inline_customer_audit BEFORE INSERT ON audit_logs WHEN NEW.action='CUSTOMER_CREATED' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
    const failed = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${thirdArrival.body.data.id}/clients`)
      .send({ customer: { name: 'Must Roll Back', phone: '22 987 654' } });
    expect(failed.status).toBe(500);
    expect(harness.db.get<any>("SELECT id FROM customers WHERE normalized_phone='22987654'")).toBeUndefined();
    expect(harness.db.get<any>('SELECT id FROM crm_arrival_clients WHERE arrival_id=?', thirdArrival.body.data.id)).toBeUndefined();
  });

  test('runs the full SHEIN email + TEMU PDF workflow, review, idempotency, summary and confirmation', async () => {
    const harness = createHarness();
    const ahmed = addCustomer(harness.db, '1', 'Ahmed Ben Ali');
    const sara = addCustomer(harness.db, '2', 'Sara Ben Ahmed');
    const first = await createArrivalWithClient(harness, 'January 2026', ahmed, 'SHEIN');

    const email = [
      'Subject: SHEIN order',
      '',
      'Grande boîte à bijoux',
      'SKU: sb25092090066487374',
      'Variant: Multicolore-Blanc-Autocollant lettre A',
      'Quantity: 1',
      '',
      'Bracelet mode',
      'SKU: sj2406136606014547',
    ].join('\n');
    const uploaded = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${first.clientId}/sources`)
      .field('sourceType', 'EMAIL').field('emailContent', email);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data.duplicate).toBe(false);
    const sheinSourceId = uploaded.body.data.source.id as string;

    const started = await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${sheinSourceId}/extractions`).send({ reprocess: false });
    expect(started.status).toBe(202);
    await harness.module.runner.waitForIdle();
    const sheinJob = await read(harness, `/api/admin/arrival-ingestion/jobs/${started.body.data.id}`);
    expect(sheinJob.body.data.state).toBe('PARTIAL');
    expect(sheinJob.body.data.productsExtracted).toBe(1);
    expect(sheinJob.body.data.recordsNeedingReview).toBe(1);

    let products = await read(harness, `/api/admin/arrival-ingestion/clients/${first.clientId}/products`);
    expect(products.body.data).toHaveLength(2);
    expect(products.body.data.every((item: any) => item.rawExtracted === undefined)).toBe(true);
    expect(products.body.data.find((item: any) => item.sku === 'sb25092090066487374')).toMatchObject({ quantity: 1, extractionStatus: 'EXTRACTED' });
    const incomplete = products.body.data.find((item: any) => item.sku === 'sj2406136606014547');
    expect(incomplete.quantity).toBeNull();
    expect(incomplete.extractionStatus).toBe('NEEDS_REVIEW');

    const corrected = await mutation(harness, 'patch', `/api/admin/arrival-ingestion/products/${incomplete.id}`).send({ quantity: 1 });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data.extractionStatus).toBe('NEEDS_REVIEW');
    expect(corrected.body.data.fieldEvidence.quantity).toContain('Correction manuelle');
    const approvedShein = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${first.clientId}/products/approve-all`).send({});
    expect(approvedShein.body.data).toMatchObject({ approved: 2, unresolved: 0 });

    const duplicateUpload = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${first.clientId}/sources`)
      .field('sourceType', 'EMAIL').field('emailContent', email);
    expect(duplicateUpload.status).toBe(200);
    expect(duplicateUpload.body.data.duplicate).toBe(true);
    expect(duplicateUpload.body.data.source.id).toBe(sheinSourceId);
    const prevented = await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${sheinSourceId}/extractions`).send({ reprocess: false });
    expect(prevented.status).toBe(409);
    expect(prevented.body.code).toBe('EXTRACTION_EXISTS');

    const reprocess = await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${sheinSourceId}/extractions`).send({ reprocess: true });
    expect(reprocess.status).toBe(202);
    await harness.module.runner.waitForIdle();
    products = await read(harness, `/api/admin/arrival-ingestion/clients/${first.clientId}/products`);
    expect(products.body.data).toHaveLength(2);
    expect(harness.db.get<any>('SELECT COUNT(*) count FROM crm_extracted_products WHERE source_id=? AND is_current=1', sheinSourceId).count).toBe(2);
    expect(harness.db.get<any>('SELECT COUNT(*) count FROM crm_extracted_products WHERE source_id=? AND is_current=0', sheinSourceId).count).toBe(2);
    const correctedAgain = products.body.data.find((item: any) => item.sku === 'sj2406136606014547');
    await mutation(harness, 'patch', `/api/admin/arrival-ingestion/products/${correctedAgain.id}`).send({ quantity: 1 });
    await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${first.clientId}/products/approve-all`).send({});
    const manualProduct = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${first.clientId}/products`).send({
      sourceId: sheinSourceId,
      productName: 'Produit manquant vérifié',
      sku: 'MANUAL-SKU-1',
      quantity: 1,
    });
    expect(manualProduct.status).toBe(201);
    expect(manualProduct.body.data).toMatchObject({ sku: 'MANUAL-SKU-1', extractionStatus: 'NEEDS_REVIEW' });
    const manualApproved = await mutation(harness, 'post', `/api/admin/arrival-ingestion/products/${manualProduct.body.data.id}/approve`).send({});
    expect(manualApproved.body.data).toMatchObject({ extractionStatus: 'EXTRACTED', approvedAt: expect.any(String) });

    const secondClient = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${first.arrivalId}/clients`).send({ customerId: sara });
    const saraClientId = secondClient.body.data.clients.find((item: any) => item.customer.id === sara).id as string;
    const stores = await read(harness, '/api/admin/arrival-ingestion/stores');
    const temu = stores.body.data.find((item: any) => item.code === 'TEMU');
    await mutation(harness, 'patch', `/api/admin/arrival-ingestion/clients/${saraClientId}`).send({ storeId: temu.id });

    const pdfPath = path.join(harness.root, 'temu-fixture.pdf');
    writeSimplePdf([
      { text: 'TEMU INVOICE', size: 18, bold: true },
      { text: 'Product: TEMU storage basket' },
      { text: 'SKU: TM-100' },
      { text: 'Variant: Large - Black' },
      { text: 'Quantity: 1' },
    ], pdfPath);
    const pdfUpload = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${saraClientId}/sources`)
      .field('sourceType', 'PDF').attach('source', pdfPath, { contentType: 'application/pdf' });
    expect(pdfUpload.status).toBe(201);
    const pdfSourceId = pdfUpload.body.data.source.id as string;
    const pdfStarted = await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${pdfSourceId}/extractions`).send({ reprocess: false });
    expect(pdfStarted.status).toBe(202);
    await harness.module.runner.waitForIdle();
    const pdfJob = await read(harness, `/api/admin/arrival-ingestion/jobs/${pdfStarted.body.data.id}`);
    expect(pdfJob.body.data).toMatchObject({ state: 'COMPLETED', progressCurrent: 1, progressTotal: 1, productsExtracted: 1 });
    const temuProducts = await read(harness, `/api/admin/arrival-ingestion/clients/${saraClientId}/products`);
    expect(temuProducts.body.data).toHaveLength(1);
    expect(temuProducts.body.data[0]).toMatchObject({ sku: 'TM-100', productImage: expect.stringContaining('/image') });
    const image = await read(harness, `/api/admin/arrival-ingestion/products/${temuProducts.body.data[0].id}/image`);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toContain('image/webp');
    await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${saraClientId}/products/approve-all`).send({});

    const original = await read(harness, `/api/admin/arrival-ingestion/sources/${pdfSourceId}/content`);
    expect(original.status).toBe(200);
    expect(original.headers['content-type']).toContain('application/pdf');
    expect(original.body.subarray(0, 5).toString()).toBe('%PDF-');

    const detail = await read(harness, `/api/admin/arrival-ingestion/arrivals/${first.arrivalId}`);
    expect(detail.body.data.summary).toMatchObject({ customers: 2, products: 4, completed: 2, needsReview: 0, processing: 0 });
    const confirmed = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${first.arrivalId}/confirm`).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('CONFIRMED');
    const locked = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${first.arrivalId}/clients`).send({ customerId: addCustomer(harness.db, '3', 'Client Locked') });
    expect(locked.status).toBe(409);

    expect(harness.adapter.requests.length).toBe(3);
    expect(harness.adapter.requests.every((item) => item.workload === 'arrival-ingestion' && item.outputSchema?.name === 'ayrovi_arrival_product_extraction')).toBe(true);
    expect(harness.adapter.requests.every((item) => item.context?.userIdHash?.length === 64 && !JSON.stringify(item).includes('Ahmed Ben Ali'))).toBe(true);
    const pdfRequest = harness.adapter.requests.find((item) => item.instructions.includes('Store profile: TEMU'))!;
    expect(pdfRequest.messages[0].content.some((part) => part.type === 'image')).toBe(true);
    expect(pdfRequest.messages[0].content.some((part) => part.type === 'text' && part.text.includes('SOURCE_TEXT: none'))).toBe(true);

    const actions = harness.db.all<any>("SELECT action FROM audit_logs WHERE module='CRM_ARRIVALS'").map((row) => row.action);
    for (const expected of ['ARRIVAL_CREATED','CLIENT_ADDED_TO_ARRIVAL','SOURCE_UPLOADED','EXTRACTION_STARTED','EXTRACTION_COMPLETED','PRODUCT_EXTRACTED','PRODUCT_UPDATED','ARRIVAL_CONFIRMED']) {
      expect(actions).toContain(expected);
    }
  }, 30_000);

  test('blocks confirmation on partial data and records a sanitized failed extraction without retrying the source', async () => {
    const harness = createHarness();
    harness.adapter.failStores.add('ADIDAS');
    const customerId = addCustomer(harness.db, '9', 'Client Failure');
    const flow = await createArrivalWithClient(harness, 'Failure fixture', customerId, 'ADIDAS');
    const png = await import('sharp').then(({ default: sharp }) => sharp({ create: { width: 120, height: 80, channels: 3, background: '#ffffff' } }).png().toBuffer());
    const uploaded = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${flow.clientId}/sources`)
      .field('sourceType', 'IMAGE').attach('source', png, { filename: 'adidas.png', contentType: 'image/png' });
    const started = await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${uploaded.body.data.source.id}/extractions`).send({ reprocess: false });
    await harness.module.runner.waitForIdle();
    const job = await read(harness, `/api/admin/arrival-ingestion/jobs/${started.body.data.id}`);
    expect(job.body.data.state).toBe('FAILED');
    expect(job.body.data.errorCode).toBe('EXTRACTION_FAILED');
    expect(job.body.data.errorMessage).not.toContain('fixture');
    expect(harness.adapter.requests).toHaveLength(1);
    const confirmation = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${flow.arrivalId}/confirm`).send({});
    expect(confirmation.status).toBe(409);
    expect(confirmation.body.details.issues.map((issue: any) => issue.code)).toEqual(expect.arrayContaining(['EXTRACTION_FAILED','PRODUCTS_REQUIRED']));
    expect(harness.db.get<any>("SELECT COUNT(*) count FROM audit_logs WHERE action='EXTRACTION_FAILED' AND module='CRM_ARRIVALS'").count).toBe(1);
  });

  test('recovers an interrupted job without retaining uncommitted rows or derived files', async () => {
    const harness = createHarness(false);
    const customer = addCustomer(harness.db, '9005', 'Recovery Client');
    const setup = await createArrivalWithClient(harness, 'Recovery Arrival', customer, 'SHEIN');
    const sourceUpload = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${setup.clientId}/sources`)
      .field('sourceType', 'EMAIL').field('emailContent', 'SHEIN item: recovery shirt, SKU: REC-1, quantity: 1');
    expect(sourceUpload.status).toBe(201);
    const source = sourceUpload.body.data.source;
    const started = await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${source.id}/extractions`).send({});
    expect(started.status).toBe(202);
    const jobId = started.body.data.id;
    const leaseNow = new Date().toISOString();
    const futureLease = new Date(Date.now() + 60_000).toISOString();
    harness.db.run("UPDATE crm_extraction_jobs SET state='PROCESSING',progress_current=1,progress_total=2,worker_id='other_worker',heartbeat_at=?,lease_expires_at=? WHERE id=?", leaseNow, futureLease, jobId);
    const clientRow = harness.db.get<any>('SELECT * FROM crm_arrival_clients WHERE id=?', setup.clientId);
    const staleProductId = harness.module.products.insertUnresolved({
      jobId, sourceId: source.id, client: clientRow, sourceType: 'EMAIL', sourceReference: `${source.id}#stale`, reason: 'INTERRUPTED_STAGING_ROW',
    });
    const staleDir = path.join(harness.root, source.id, 'derived', jobId);
    fs.mkdirSync(staleDir, { recursive: true });
    const staleFile = path.join(staleDir, 'stale.webp');
    fs.writeFileSync(staleFile, 'stale');

    const restarted = createArrivalIngestionModule(harness.db, {
      aiAdapter: harness.adapter, sourceRoot: harness.root, autoRunJobs: true,
    });
    await restarted.runner.waitForIdle();
    expect(harness.db.get<any>('SELECT state FROM crm_extraction_jobs WHERE id=?', jobId).state).toBe('PROCESSING');
    expect(harness.db.get<any>('SELECT id FROM crm_extracted_products WHERE id=?', staleProductId)).toBeTruthy();
    expect(harness.adapter.requests).toHaveLength(0);

    harness.db.run('UPDATE crm_extraction_jobs SET lease_expires_at=? WHERE id=?', new Date(Date.now() - 1_000).toISOString(), jobId);
    restarted.runner.recoverPending();
    await restarted.runner.waitForIdle();

    const recoveredJob = harness.db.get<any>('SELECT * FROM crm_extraction_jobs WHERE id=?', jobId);
    expect(['COMPLETED', 'PARTIAL']).toContain(recoveredJob.state);
    expect(harness.db.get<any>('SELECT id FROM crm_extracted_products WHERE id=?', staleProductId)).toBeUndefined();
    expect(harness.db.get<any>('SELECT COUNT(*) AS count FROM crm_extracted_products WHERE job_id=?', jobId).count).toBe(2);
    expect(fs.existsSync(staleFile)).toBe(false);
  });

  test('opens the extraction capability circuit on HTTP 429 and does not call remaining PDF pages', async () => {
    const harness = createHarness();
    harness.adapter.rateLimitStores.add('TEMU');
    const customerId = addCustomer(harness.db, '8', 'Client Quota');
    const flow = await createArrivalWithClient(harness, 'Quota fixture', customerId, 'TEMU');
    const pdfPath = path.join(harness.root, 'multi-page-quota.pdf');
    writeSimplePdf(Array.from({ length: 110 }, (_, index) => ({ text: `Product row ${index + 1} SKU Q-${index + 1} Qty 1` })), pdfPath);
    const uploaded = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${flow.clientId}/sources`)
      .field('sourceType', 'PDF').attach('source', pdfPath, { contentType: 'application/pdf' });
    const started = await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${uploaded.body.data.source.id}/extractions`).send({ reprocess: false });
    await harness.module.runner.waitForIdle();
    const job = await read(harness, `/api/admin/arrival-ingestion/jobs/${started.body.data.id}`);
    expect(job.body.data.state).toBe('FAILED');
    expect(job.body.data.errorCode).toBe('AI_RATE_LIMITED');
    expect(job.body.data.progressTotal).toBeGreaterThan(1);
    expect(job.body.data.progressCurrent).toBe(1);
    expect(job.body.data.warningCodes).toEqual(expect.arrayContaining(['AI_RATE_LIMITED','REMAINING_UNITS_SKIPPED_BY_RATE_LIMIT_CIRCUIT']));
    expect(job.body.data.retryAt).toEqual(expect.any(String));
    const readiness = await read(harness, '/api/admin/arrival-ingestion/ai/status');
    expect(readiness.body.data).toMatchObject({
      capability: 'arrival-ingestion', state: 'PAUSED_RATE_LIMIT', circuitOpen: true, retryAllowed: false,
      lastFailure: { errorCode: 'AI_RATE_LIMITED' },
    });
    expect(readiness.body.data).not.toHaveProperty('provider');
    expect(readiness.body.data).not.toHaveProperty('model');
    expect(JSON.stringify(readiness.body.data)).not.toContain(harness.adapter.id);
    const immediateRetry = await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${uploaded.body.data.source.id}/extractions`).send({ reprocess: true });
    expect(immediateRetry.status).toBe(429);
    expect(immediateRetry.body).toMatchObject({ code: 'AI_RATE_LIMITED', details: { retryAt: job.body.data.retryAt } });
    expect(harness.adapter.requests).toHaveLength(1);
  });

  test('persists and exposes sanitized actionable authentication diagnostics without leaking provider details', async () => {
    const harness = createHarness();
    harness.adapter.complete = async (aiRequest: AiCompletionRequest) => {
      harness.adapter.requests.push(aiRequest);
      throw new AiProviderError(
        'PROVIDER_AUTHENTICATION_FAILED',
        harness.adapter.id,
        'raw-provider-secret-key-should-never-leak',
        { status: 401, retryable: false, diagnostic: 'credential=super-secret-value' },
      );
    };
    const customerId = addCustomer(harness.db, '710003', 'AI Diagnostics Customer');
    const flow = await createArrivalWithClient(harness, 'AI diagnostics Arrival', customerId, 'SHEIN');
    const uploaded = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${flow.clientId}/sources`)
      .field('sourceType', 'EMAIL').field('emailContent', 'Subject: SHEIN order\n\nProduct SKU AUTH-1 Qty 1');
    const started = await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${uploaded.body.data.source.id}/extractions`).send({ reprocess: false });
    await harness.module.runner.waitForIdle();
    const job = await read(harness, `/api/admin/arrival-ingestion/jobs/${started.body.data.id}`);
    expect(job.body.data).toMatchObject({
      state: 'FAILED',
      errorCode: 'AI_AUTHENTICATION_FAILED',
      errorMessage: expect.stringContaining('authentification'),
    });
    expect(job.body.data.warningCodes).toContain('AI_AUTHENTICATION_FAILED');
    expect(JSON.stringify(job.body.data)).not.toContain('super-secret');
    expect(JSON.stringify(job.body.data)).not.toContain(harness.adapter.id);
    expect(harness.adapter.requests).toHaveLength(1);
    const detail = await read(harness, `/api/admin/arrival-ingestion/arrivals/${flow.arrivalId}`);
    const latestJob = detail.body.data.clients[0].stores[0].sources[0].latestJob;
    expect(latestJob).toMatchObject({ errorCode: 'AI_AUTHENTICATION_FAILED', attempt: 1 });
    expect(JSON.stringify(latestJob)).not.toContain('raw-provider');
  });

  test('keeps multiple nested Stores on one Arrival client, scopes sources/products, supports an Arrival alias, and unlinks without deleting canonical CRM data', async () => {
    const harness = createHarness();
    const customerId = addCustomer(harness.db, '710001', 'Canonical Customer Name');
    const first = await createArrivalWithClient(harness, 'Nested multi-store Arrival', customerId, 'SHEIN');
    const detailBefore = await read(harness, `/api/admin/arrival-ingestion/arrivals/${first.arrivalId}`);
    const sheinAssignment = detailBefore.body.data.clients[0].stores[0];
    expect(sheinAssignment.store.code).toBe('SHEIN');

    const stores = await read(harness, '/api/admin/arrival-ingestion/stores');
    const temu = stores.body.data.find((store: any) => store.code === 'TEMU');
    const assigned = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${first.clientId}/stores`)
      .send({ storeId: temu.id });
    expect(assigned.status).toBe(201);
    expect(assigned.body.data.clients).toHaveLength(1);
    expect(assigned.body.data.clients[0].stores.map((item: any) => item.store.code)).toEqual(['SHEIN', 'TEMU']);
    const duplicateAssignment = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${first.clientId}/stores`)
      .send({ storeId: temu.id });
    expect(duplicateAssignment.status).toBe(200);
    expect(duplicateAssignment.body.meta.duplicate).toBe(true);
    expect(duplicateAssignment.body.data.clients[0].stores).toHaveLength(2);
    const temuAssignment = assigned.body.data.clients[0].stores.find((item: any) => item.store.code === 'TEMU');

    const aliased = await mutation(harness, 'patch', `/api/admin/arrival-ingestion/clients/${first.clientId}`)
      .send({ displayAlias: 'Alias limité à cet Arrival' });
    expect(aliased.status).toBe(200);
    expect(aliased.body.data.clients[0]).toMatchObject({
      displayAlias: 'Alias limité à cet Arrival',
      displayName: 'Alias limité à cet Arrival',
      customer: { name: 'Canonical Customer Name' },
    });
    expect(harness.db.get<any>('SELECT name FROM customers WHERE id=?', customerId).name).toBe('Canonical Customer Name');

    const email = 'Subject: SHEIN order\n\nGrande boîte à bijoux SKU sb25092090066487374 Qty 1';
    const emailUpload = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${first.clientId}/stores/${sheinAssignment.id}/sources`)
      .field('sourceType', 'EMAIL').field('emailContent', email);
    expect(emailUpload.status).toBe(201);
    expect(emailUpload.body.data.source.arrivalClientStoreId).toBe(sheinAssignment.id);

    const pdfPath = path.join(harness.root, 'same-client-temu.pdf');
    writeSimplePdf([
      { text: 'TEMU INVOICE', size: 18, bold: true },
      { text: 'Product: TEMU storage basket' },
      { text: 'SKU: TM-100' },
      { text: 'Quantity: 1' },
    ], pdfPath);
    const pdfUpload = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${first.clientId}/stores/${temuAssignment.id}/sources`)
      .field('sourceType', 'PDF').attach('source', pdfPath, { contentType: 'application/pdf' });
    expect(pdfUpload.status).toBe(201);
    expect(pdfUpload.body.data.source.arrivalClientStoreId).toBe(temuAssignment.id);

    await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${emailUpload.body.data.source.id}/extractions`).send({ reprocess: false });
    await mutation(harness, 'post', `/api/admin/arrival-ingestion/sources/${pdfUpload.body.data.source.id}/extractions`).send({ reprocess: false });
    await harness.module.runner.waitForIdle();
    const sheinProducts = await read(harness, `/api/admin/arrival-ingestion/clients/${first.clientId}/stores/${sheinAssignment.id}/products`);
    const temuProducts = await read(harness, `/api/admin/arrival-ingestion/clients/${first.clientId}/stores/${temuAssignment.id}/products`);
    expect(sheinProducts.body.data).toHaveLength(2);
    expect(temuProducts.body.data).toHaveLength(1);
    expect(sheinProducts.body.data.every((product: any) => product.arrivalClientStoreId === sheinAssignment.id)).toBe(true);
    expect(temuProducts.body.data[0]).toMatchObject({ arrivalClientStoreId: temuAssignment.id, storeId: temu.id, sku: 'TM-100' });

    const blockedStoreRemoval = await mutation(harness, 'delete', `/api/admin/arrival-ingestion/clients/${first.clientId}/stores/${temuAssignment.id}`);
    expect(blockedStoreRemoval.status).toBe(409);
    expect(blockedStoreRemoval.body.code).toBe('ARRIVAL_CLIENT_STORE_IN_USE');

    const now = new Date().toISOString();
    harness.db.run(`INSERT INTO orders
      (id,order_number,customer_id,status,subtotal_tnd,total_tnd,pricing_snapshot,governorate,address,phone,created_at,updated_at)
      VALUES ('order_preserved_by_arrival_unlink','AYR-PRESERVE-1',?,'CREATED',10,10,'{}','Tunis','Order address','22710001',?,?)`,
    customerId, now, now);
    const sourceIds = [emailUpload.body.data.source.id, pdfUpload.body.data.source.id];
    expect(sourceIds.every((sourceId) => fs.existsSync(path.join(harness.root, sourceId)))).toBe(true);
    const unlinked = await mutation(harness, 'delete', `/api/admin/arrival-ingestion/clients/${first.clientId}`);
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.meta).toMatchObject({ customerPreserved: true, customerId });
    expect(unlinked.body.data.clients).toHaveLength(0);
    expect(harness.db.get<any>('SELECT id,name FROM customers WHERE id=?', customerId)).toMatchObject({ id: customerId, name: 'Canonical Customer Name' });
    expect(harness.db.get<any>("SELECT id FROM orders WHERE id='order_preserved_by_arrival_unlink'")).toBeTruthy();
    expect(harness.db.get<any>('SELECT id FROM crm_arrival_clients WHERE id=?', first.clientId)).toBeUndefined();
    expect(harness.db.get<any>('SELECT COUNT(*) count FROM crm_arrival_sources WHERE arrival_client_id=?', first.clientId).count).toBe(0);
    expect(harness.db.get<any>('SELECT COUNT(*) count FROM crm_extraction_jobs WHERE arrival_client_id=?', first.clientId).count).toBe(0);
    expect(harness.db.get<any>('SELECT COUNT(*) count FROM crm_extracted_products WHERE arrival_client_id=?', first.clientId).count).toBe(0);
    expect(sourceIds.every((sourceId) => !fs.existsSync(path.join(harness.root, sourceId)))).toBe(true);
    expect(harness.db.get<any>("SELECT COUNT(*) count FROM audit_logs WHERE action='ARRIVAL_CLIENT_UNLINKED' AND entity_id=?", first.clientId).count).toBe(1);
  }, 30_000);

  test('creates and manages global Store profiles with audited validation and assignment protection', async () => {
    const harness = createHarness();
    const created = await mutation(harness, 'post', '/api/admin/arrival-ingestion/stores').send({
      code: 'SHOP_X', name: 'Shop X', sourceTypes: ['EMAIL', 'IMAGE'],
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ code: 'SHOP_X', name: 'Shop X', active: true });
    expect(created.body.data.supportedSources.map((profile: any) => profile.sourceType).sort()).toEqual(['EMAIL', 'IMAGE']);
    const duplicate = await mutation(harness, 'post', '/api/admin/arrival-ingestion/stores').send({
      code: 'SHOP_X', name: 'Duplicate', sourceTypes: ['PDF'],
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('STORE_CODE_DUPLICATE');

    const updated = await mutation(harness, 'patch', `/api/admin/arrival-ingestion/stores/${created.body.data.id}`).send({
      name: 'Shop X Tunisie', sourceTypes: ['EMAIL'], active: true,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ code: 'SHOP_X', name: 'Shop X Tunisie' });
    expect(updated.body.data.supportedSources.map((profile: any) => profile.sourceType)).toEqual(['EMAIL']);

    const customerId = addCustomer(harness.db, '710002', 'Store Manager Customer');
    const arrival = await mutation(harness, 'post', '/api/admin/arrival-ingestion/arrivals').send({ name: 'Custom Store Arrival' });
    const linked = await mutation(harness, 'post', `/api/admin/arrival-ingestion/arrivals/${arrival.body.data.id}/clients`).send({ customerId });
    const clientId = linked.body.data.clients[0].id;
    const assigned = await mutation(harness, 'post', `/api/admin/arrival-ingestion/clients/${clientId}/stores`).send({ storeId: created.body.data.id });
    expect(assigned.status).toBe(201);
    const blocked = await mutation(harness, 'patch', `/api/admin/arrival-ingestion/stores/${created.body.data.id}`).send({ active: false });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('STORE_IN_USE');
    expect(harness.db.get<any>("SELECT COUNT(*) count FROM audit_logs WHERE action='ARRIVAL_STORE_CREATED' AND entity_id=?", created.body.data.id).count).toBe(1);
    expect(harness.db.get<any>("SELECT COUNT(*) count FROM audit_logs WHERE action='ARRIVAL_STORE_UPDATED' AND entity_id=?", created.body.data.id).count).toBe(1);
  });

  test('enforces admin authentication, write permission and CSRF protection', async () => {
    const harness = createHarness();
    expect((await request(harness.app).get('/api/admin/arrival-ingestion/arrivals')).status).toBe(401);
    const noCsrf = await request(harness.app).post('/api/admin/arrival-ingestion/arrivals').set('Cookie', harness.auth.cookie).send({ name: 'Blocked' });
    expect(noCsrf.status).toBe(403);

    const now = new Date().toISOString();
    harness.db.run(`INSERT INTO admin_users (id,email,name,password_hash,role,active,created_at,updated_at)
      VALUES ('content_arrival_test','content@arrival.test','Content only','not-used','CONTENT_MANAGER',1,?,?)`, now, now);
    const contentSession = createAdminSession(harness.db, harness.db.get<any>("SELECT * FROM admin_users WHERE id='content_arrival_test'"));
    const forbidden = await request(harness.app).post('/api/admin/arrival-ingestion/arrivals')
      .set('Cookie', `${sessionCookieName()}=${contentSession.token}`).set('x-csrf-token', contentSession.csrfToken).send({ name: 'Forbidden' });
    expect(forbidden.status).toBe(403);
  });

  test('normalizes all 50 evidence-backed products without truncating the source batch', () => {
    const products = Array.from({ length: 50 }, (_, index) => ({
      productName: `SHEIN product ${index + 1}`,
      sku: `shein-sku-${index + 1}`,
      reference: '',
      variant: `Size ${index + 1}`,
      color: '',
      size: '',
      quantity: 1,
      unitPrice: 0,
      currency: '',
      productUrl: '',
      productImageRef: '',
      productImageRegion: [],
      confidence: 0.9,
      evidenceFieldNames: ['productName', 'sku', 'variant', 'quantity'],
      sourceSpecific: [],
    }));
    const normalized = new ProductExtractionNormalizer().parse(JSON.stringify({
      orderMeta: { customerName: '', customerEmail: '', customerPhone: '', supplier: 'SHEIN', store: 'SHEIN', orderId: '', trackingNumber: '', orderDate: '', shipmentStatus: '', currency: '' },
      products, unresolvedEntries: [], expectedProductCount: 50, warnings: [],
    }), new Set());
    expect(normalized.products).toHaveLength(50);
    expect(normalized.products.every((product) => product.extractionStatus === 'EXTRACTED')).toBe(true);
    expect(normalized.unresolvedEntries).toHaveLength(0);
  });

  test('normalizer removes unsupported guessed values and preserves uncertainty', () => {
    const normalized = new ProductExtractionNormalizer().parse(JSON.stringify({
      orderMeta: { customerName: '', customerEmail: '', customerPhone: '', supplier: '', store: '', orderId: '', trackingNumber: '', orderDate: '', shipmentStatus: '', currency: '' },
      products: [{
        productName: 'Guessed product', sku: 'MADE-UP', reference: '', variant: '', color: '', size: '', quantity: 2,
        unitPrice: 0, currency: '', productUrl: '',
        productImageRef: 'unknown-image', productImageRegion: [0, 0, 1, 1], confidence: 0.99,
        evidenceFieldNames: ['quantity'],
        sourceSpecific: [],
      }],
      unresolvedEntries: [], expectedProductCount: 2, warnings: [],
    }), new Set());
    expect(normalized.products[0]).toMatchObject({ productName: null, sku: null, quantity: 2, productImageRef: null, extractionStatus: 'NEEDS_REVIEW' });
    expect(normalized.products[0].reviewReasons).toEqual(expect.arrayContaining(['MISSING_EVIDENCE_PRODUCTNAME','MISSING_EVIDENCE_SKU','MISSING_PRODUCT_IDENTITY']));
    expect(normalized.unresolvedEntries).toHaveLength(1);
    expect(normalized.warningCodes).toContain('EXPECTED_COUNT_NOT_FULLY_ACCOUNTED_FOR');

    const contradicted = new ProductExtractionNormalizer().parse(JSON.stringify({
      orderMeta: { customerName: '', customerEmail: '', customerPhone: '', supplier: '', store: '', orderId: '', trackingNumber: '', orderDate: '', shipmentStatus: '', currency: '' },
      products: [{
        productName: 'Invented title', sku: 'FAKE-99', reference: '', variant: '', color: '', size: '', quantity: 1,
        unitPrice: 0, currency: '', productUrl: '',
        productImageRef: '', productImageRegion: [], confidence: 0.98,
        evidenceFieldNames: ['productName', 'sku', 'quantity'],
        sourceSpecific: [],
      }],
      unresolvedEntries: [], expectedProductCount: 1, warnings: [],
    }), new Set(), 'Actual source line with quantity 1 only');
    expect(contradicted.products[0].productName).toBeNull();
    expect(contradicted.products[0].sku).toBeNull();
    expect(contradicted.products[0].reviewReasons).toEqual(expect.arrayContaining([
      'VALUE_NOT_FOUND_IN_SOURCE_PRODUCTNAME', 'VALUE_NOT_FOUND_IN_SOURCE_SKU',
    ]));
  });
});
