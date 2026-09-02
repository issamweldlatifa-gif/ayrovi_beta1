import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiModelClass,
  AiResponsesProviderAdapter,
  AiStreamCallbacks,
  AiWorkload,
} from '../src/ai-core/contracts';
import { QatafoDatabase } from '../src/db/database';
import { createArrivalIngestionModule } from '../src/arrival-ingestion/routes';
import { ensureBootstrapAdmin, createAdminSession, sessionCookieName } from '../src/admin/auth';

/**
 * AI Product Category Classification (Arrival CRM).
 *
 * The Cards system itself is NOT rebuilt here: these tests drive the existing
 * `crm_extracted_products` -> Customer Arrival Card flow and only assert the
 * additive classification layer (Category Master + AI + manual review +
 * provenance + confidence + backward compatibility).
 *
 * The AI is a scripted adapter: it returns whatever a test decides, including
 * invalid answers (unknown / inactive category, low confidence), so we prove the
 * SERVER rejects them instead of trusting the model.
 */

interface ScriptedAnswer {
  categoryCode: string;
  subcategoryCode: string;
  confidence: number;
  reason: string;
}

class ScriptedCategoryAdapter implements AiResponsesProviderAdapter {
  readonly id = 'scripted-category-fixture';
  readonly kind = 'responses' as const;
  readonly targetRole = 'fallback' as const;
  readonly requests: AiCompletionRequest[] = [];
  /** Prompt content of the last call — used to prove the ACTIVE-only snapshot. */
  lastInstructions = '';
  configured = true;
  failWith: Error | null = null;
  decide: (line: Record<string, string>) => ScriptedAnswer = () => ({
    categoryCode: '', subcategoryCode: '', confidence: 0, reason: 'no decision',
  });

  isConfigured() { return this.configured; }
  resolveModel(_workload: AiWorkload, _modelClass: AiModelClass) { return 'fixture-category-model'; }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    this.requests.push(request);
    this.lastInstructions = request.instructions;
    if (this.failWith) throw this.failWith;
    const part = request.messages[0].content[0];
    const text = part && part.type === 'text' ? part.text : '';
    const lines = JSON.parse(text.replace(/^LINES:\n/, '')) as Array<Record<string, string>>;
    const results = lines.map((line) => ({ lineId: line.lineId, ...this.decide(line) }));
    return {
      provider: 'fixture',
      model: 'fixture-category-model',
      output: [],
      textBlocks: [JSON.stringify({ results })],
      webResults: [],
    };
  }

  async stream(_request: AiCompletionRequest, _callbacks: AiStreamCallbacks): Promise<AiCompletionResult> {
    throw new Error('stream not used by classification');
  }
}

/**
 * Real Warehouse Core stand-in (real HTTP, real fetch from the CRM).
 *
 * It enforces the SAME strict contract as the production Warehouse: each product
 * object is validated with additionalProperties:false, so ANY extra field
 * (e.g. a classification column leaking into the card) is rejected with a 400
 * listing "<path> should not exist" — exactly the failure seen in production.
 */
const ALLOWED_PRODUCT_KEYS = new Set(['product_id', 'sku', 'reference', 'product_name', 'quantity', 'variant', 'color', 'size']);
function startWarehouseServer() {
  const received: any[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      received.push(json);
      const card = json.customer_arrival_card;
      if (!card?.id || !Array.isArray(card?.products) || !card.products.length) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ code: 'BAD_PAYLOAD', message: 'invalid card' }));
      }
      const schemaErrors: string[] = [];
      card.products.forEach((product: any, index: number) => {
        for (const key of Object.keys(product || {})) {
          if (!ALLOWED_PRODUCT_KEYS.has(key)) {
            schemaErrors.push(`customer_arrival_card.products.${index}.property ${key} should not exist`);
          }
        }
      });
      if (schemaErrors.length) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ code: 'BAD_PAYLOAD', message: schemaErrors.join(',') }));
      }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        customer_arrival_card_id: card.id,
        warehouse_arrival_id: `WAR-${card.id.replace(/\D/g, '').slice(-6) || '000001'}`,
        arrival_status: 'EXPECTED',
        created: true,
      }));
    });
  });
  return new Promise<{ url: string; received: any[]; stop: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        received,
        stop: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

interface Harness {
  db: QatafoDatabase;
  adapter: ScriptedCategoryAdapter;
  module: ReturnType<typeof createArrivalIngestionModule>;
  app: express.Express;
  auth: { cookie: string; csrf: string };
  /** A REAL admin_users row: approved_by/classified_by are FK-referenced. */
  actor: { id: string; name: string; ipAddress: null };
}

const databases: QatafoDatabase[] = [];
const harnesses: Harness[] = [];
const servers: Array<{ stop: () => Promise<void> }> = [];

function createHarness(): Harness {
  const db = new QatafoDatabase(':memory:');
  ensureBootstrapAdmin(db);
  const admin = db.get<any>('SELECT * FROM admin_users ORDER BY created_at LIMIT 1');
  const session = createAdminSession(db, admin);
  const adapter = new ScriptedCategoryAdapter();
  const module = createArrivalIngestionModule(db, { aiAdapter: adapter, autoRunJobs: false });
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/admin/arrival-ingestion', module.router);
  const harness: Harness = {
    db, adapter, module, app,
    auth: { cookie: `${sessionCookieName()}=${session.token}`, csrf: session.csrfToken },
    actor: { id: admin.id, name: 'Category Admin', ipAddress: null },
  };
  harnesses.push(harness);
  return harness;
}

/** The official AYROVI Warehouse Core taxonomy, imported as DATA (never code). */
const OFFICIAL_MASTER = [
  { code: 'SHOES', name: 'Chaussures', parentCode: null, active: true },
  { code: 'SHOES_SPORTS', name: 'Chaussures de sport', parentCode: 'SHOES', active: true },
  { code: 'CLOTHING', name: 'Vêtements', parentCode: null, active: true },
  { code: 'CLOTHING_SHIRTS', name: 'Chemises', parentCode: 'CLOTHING', active: true },
  { code: 'ELECTRONICS', name: 'Électronique', parentCode: null, active: true },
  // Present in the master but retired: the AI must never be allowed to use it.
  { code: 'VINTAGE_TOYS', name: 'Jouets vintage (retiré)', parentCode: null, active: false },
];

function seedMaster(harness: Harness) {
  const result = harness.module.categories.importMaster(OFFICIAL_MASTER, harness.actor);
  expect(result.imported).toBe(OFFICIAL_MASTER.length);
  return result;
}

/**
 * One Customer Arrival Card with its product lines.
 * `legacy: true` reproduces a Card created BEFORE the Category Master feature
 * (classification_required=0) to prove backward compatibility.
 */
function seedCard(
  harness: Harness,
  lines: Array<{ id: string; sku: string; name: string; quantity: number }>,
  options: { legacy?: boolean; suffix?: string; arrivalStatus?: string } = {},
) {
  const suffix = options.suffix || '1';
  const legacy = options.legacy === true;
  const now = new Date().toISOString();
  const storeId = `store_${suffix}`;
  const customerId = `cus_${suffix}`;
  const arrivalId = `arr_${suffix}`;
  const clientId = `client_${suffix}`;
  const assignmentId = `acs_${suffix}`;
  const sourceId = `src_${suffix}`;
  harness.db.run(`INSERT INTO crm_stores (id,code,name,active,created_at,updated_at) VALUES (?,?,?,1,?,?)`,
    storeId, `ST${suffix}`, `Store ${suffix}`, now, now);
  harness.db.run(`INSERT INTO customers (id,name,phone,normalized_phone,governorate,address,registered_at,status,updated_at)
    VALUES (?,?,?,?,'Tunis','Adr',?,'ACTIVE',?)`, customerId, `Client ${suffix}`, `2162${suffix}000111`,
  `2${suffix}000111`.slice(0, 8), now, now);
  harness.db.run(`INSERT INTO crm_arrivals (id,name,status,created_at,updated_at) VALUES (?,?,?,?,?)`,
    arrivalId, `Arrival ${suffix}`, options.arrivalStatus || 'REVIEW', now, now);
  harness.db.run(`INSERT INTO crm_arrival_clients (id,arrival_id,customer_id,store_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?)`, clientId, arrivalId, customerId, storeId, now, now);
  harness.db.run(`INSERT INTO crm_arrival_client_stores (id,arrival_client_id,store_id,created_at,updated_at)
    VALUES (?,?,?,?,?)`, assignmentId, clientId, storeId, now, now);
  harness.db.run(`INSERT INTO crm_arrival_sources
    (id,arrival_client_id,arrival_client_store_id,source_type,original_filename,mime_type,byte_size,source_hash,storage_key,created_at)
    VALUES (?,?,?,'EMAIL','facture.eml','message/rfc822',100,?,?,?)`,
  sourceId, clientId, assignmentId, `hash_${suffix}`, `key_${suffix}`, now);
  for (const line of lines) {
    const cols = `id,source_id,arrival_client_id,arrival_client_store_id,arrival_id,customer_id,store_id,
      product_name,sku,reference,quantity,source_type,source_reference,extraction_confidence,extraction_status,
      field_evidence,source_specific,raw_extracted,review_reasons,
      classification_required,classification_status,is_current,created_at,updated_at`;
    const values = [
      line.id, sourceId, clientId, assignmentId, arrivalId, customerId, storeId,
      line.name, line.sku, line.sku, line.quantity, 'EMAIL', 'ref', 1, 'EXTRACTED',
      '{}', '[]', '{}', '[]',
      legacy ? 0 : 1, 'UNCLASSIFIED', 1, now, now,
    ];
    harness.db.run(`INSERT INTO crm_extracted_products (${cols}) VALUES (${values.map(() => '?').join(',')})`, ...values);
  }
  return { arrivalId, clientId, customerId, sourceId, assignmentId };
}

function row(harness: Harness, productId: string) {
  return harness.db.get<any>('SELECT * FROM crm_extracted_products WHERE id=?', productId);
}

beforeEach(() => {
  delete process.env.WAREHOUSE_API_URL;
  delete process.env.WAREHOUSE_API_KEY;
  delete process.env.ARRIVAL_CLASSIFICATION_CONFIDENCE_THRESHOLD;
  delete process.env.ARRIVAL_CLASSIFICATION_GATE;
});

afterEach(async () => {
  while (servers.length) await servers.pop()!.stop();
  while (harnesses.length) harnesses.pop()!.db.close();
  while (databases.length) databases.pop()!.close();
});

describe('Category Master (official taxonomy)', () => {
  test('the master is data imported from AYROVI, never hardcoded: empty master disables classification', async () => {
    const harness = createHarness();
    expect(harness.module.categories.isAvailable()).toBe(false);
    const card = seedCard(harness, [{ id: 'p1', sku: 'SB-1', name: 'Running Shoes', quantity: 1 }]);
    const outcome = await harness.module.classification.classifyCard(card.clientId, harness.actor);
    expect(outcome.skipped).toBe(true);
    expect(outcome.skipReason).toBe('CATEGORY_MASTER_EMPTY');
    // The AI was never called: there is nothing legal to choose from.
    expect(harness.adapter.requests).toHaveLength(0);
    // Gate stays inert while no official master exists (no Card can be blocked
    // by a requirement that cannot be satisfied).
    expect(harness.module.classification.gateEnabled()).toBe(false);
    expect(harness.module.products.approve('p1', harness.actor).extractionStatus).toBe('EXTRACTED');
  });

  test('only ACTIVE entries are shown to the AI and inactive codes are rejected', () => {
    const harness = createHarness();
    seedMaster(harness);
    const snapshot = harness.module.categories.aiSnapshot();
    expect(snapshot).toContain('SHOES_SPORTS | Chaussures de sport | SHOES');
    expect(snapshot).not.toContain('VINTAGE_TOYS');
    expect(harness.module.categories.validate('VINTAGE_TOYS').reasons).toEqual(['CATEGORY_INACTIVE']);
    expect(harness.module.categories.validate('NOT_IN_MASTER').reasons).toEqual(['CATEGORY_UNKNOWN']);
    expect(harness.module.categories.validate('').reasons).toEqual(['CATEGORY_REQUIRED']);
    expect(harness.module.categories.validate('CLOTHING', 'SHOES_SPORTS').reasons).toEqual(['SUBCATEGORY_PARENT_MISMATCH']);
    expect(harness.module.categories.validate('SHOES', 'SHOES_SPORTS')).toMatchObject({
      valid: true, categoryCode: 'SHOES', subcategoryCode: 'SHOES_SPORTS',
    });
  });

  test('re-importing the official master is idempotent (no duplicate categories)', () => {
    const harness = createHarness();
    seedMaster(harness);
    const again = harness.module.categories.importMaster(OFFICIAL_MASTER, harness.actor);
    expect(again.imported).toBe(0);
    expect(again.updated).toBe(OFFICIAL_MASTER.length);
    expect(harness.db.all('SELECT * FROM crm_categories')).toHaveLength(OFFICIAL_MASTER.length);
  });
});

describe('AI classification flow', () => {
  test('1. clear SKU + clear product name -> AI classifies, source AI, confidence stored', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = (line) => line.sku.startsWith('SHOE')
      ? { categoryCode: 'SHOES', subcategoryCode: 'SHOES_SPORTS', confidence: 0.93, reason: 'Running shoe' }
      : { categoryCode: '', subcategoryCode: '', confidence: 0, reason: '' };
    const card = seedCard(harness, [{ id: 'p1', sku: 'SHOE-100', name: 'Running Shoes', quantity: 2 }]);

    const outcome = await harness.module.classification.classifyCard(card.clientId, harness.actor);
    expect(outcome.classified).toBe(1);
    expect(outcome.needsReview).toBe(0);
    expect(outcome.results[0]).toMatchObject({
      productId: 'p1', status: 'CLASSIFIED', source: 'AI',
      categoryCode: 'SHOES', subcategoryCode: 'SHOES_SPORTS', confidence: 0.93,
    });

    const stored = row(harness, 'p1');
    expect(stored.category_code).toBe('SHOES');
    expect(stored.subcategory_code).toBe('SHOES_SPORTS');
    expect(stored.classification_source).toBe('AI');
    expect(stored.classification_confidence).toBeCloseTo(0.93, 5);
    expect(stored.classification_status).toBe('CLASSIFIED');
    expect(JSON.parse(stored.classification_reasons)).toEqual([]);
    // The prompt carried only the ACTIVE official master.
    expect(harness.adapter.lastInstructions).toContain('CATEGORY MASTER');
    expect(harness.adapter.lastInstructions).not.toContain('VINTAGE_TOYS');
  });

  test('2. AI returns a category that does not exist -> NEEDS_REVIEW, nothing stored', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = () => ({ categoryCode: 'SNEAKERS_PREMIUM', subcategoryCode: '', confidence: 0.99, reason: 'invented' });
    const card = seedCard(harness, [{ id: 'p1', sku: 'SB-1', name: 'Running Shoes', quantity: 1 }]);

    const outcome = await harness.module.classification.classifyCard(card.clientId, harness.actor);
    expect(outcome.needsReview).toBe(1);
    expect(outcome.results[0].reasons).toEqual(['AI_CATEGORY_UNKNOWN']);
    const stored = row(harness, 'p1');
    // The invented code is NOT persisted anywhere.
    expect(stored.category_code).toBeNull();
    expect(stored.classification_status).toBe('NEEDS_REVIEW');
    expect(stored.classification_source).toBe('AI');
    expect(harness.module.classification.isSatisfied(stored)).toBe(false);
  });

  test('3. AI returns an INACTIVE category -> NEEDS_REVIEW', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = () => ({ categoryCode: 'vintage_toys', subcategoryCode: '', confidence: 0.95, reason: 'legacy' });
    const card = seedCard(harness, [{ id: 'p1', sku: 'TY-1', name: 'Vintage toy car', quantity: 1 }]);

    const outcome = await harness.module.classification.classifyCard(card.clientId, harness.actor);
    expect(outcome.results[0].status).toBe('NEEDS_REVIEW');
    expect(outcome.results[0].reasons).toEqual(['AI_CATEGORY_INACTIVE']);
    expect(row(harness, 'p1').category_code).toBeNull();
  });

  test('4. AI not confident (below configurable threshold) -> NEEDS_REVIEW', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = () => ({ categoryCode: 'CLOTHING', subcategoryCode: '', confidence: 0.4, reason: 'ambiguous' });
    const card = seedCard(harness, [{ id: 'p1', sku: 'X-1', name: 'Article', quantity: 1 }]);

    expect(harness.module.classification.confidenceThreshold()).toBe(0.75);
    const outcome = await harness.module.classification.classifyCard(card.clientId, harness.actor);
    expect(outcome.results[0].status).toBe('NEEDS_REVIEW');
    expect(outcome.results[0].reasons).toEqual(['AI_CONFIDENCE_BELOW_THRESHOLD']);
    // The proposed code is kept for the reviewer, but the line is not approved.
    expect(outcome.results[0].categoryCode).toBe('CLOTHING');
    expect(row(harness, 'p1').classification_status).toBe('NEEDS_REVIEW');

    // Threshold is configuration, not a hardcoded guess.
    process.env.ARRIVAL_CLASSIFICATION_CONFIDENCE_THRESHOLD = '0.35';
    const harness2 = createHarness();
    seedMaster(harness2);
    expect(harness2.module.classification.confidenceThreshold()).toBe(0.35);
    harness2.adapter.decide = () => ({ categoryCode: 'CLOTHING', subcategoryCode: '', confidence: 0.4, reason: '' });
    const card2 = seedCard(harness2, [{ id: 'q1', sku: 'X-1', name: 'Article', quantity: 1 }], { suffix: '2' });
    const outcome2 = await harness2.module.classification.classifyCard(card2.clientId, harness2.actor);
    expect(outcome2.results[0].status).toBe('CLASSIFIED');
  });

  test('5. ambiguous product name -> AI declines (empty code) -> NEEDS_REVIEW', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = (line) => (line.productName === 'Cotton Shirt'
      ? { categoryCode: 'CLOTHING', subcategoryCode: 'CLOTHING_SHIRTS', confidence: 0.9, reason: 'shirt' }
      : { categoryCode: '', subcategoryCode: '', confidence: 0.1, reason: 'not enough information' });
    const card = seedCard(harness, [
      { id: 'p1', sku: 'SH-1', name: 'Cotton Shirt', quantity: 1 },
      { id: 'p2', sku: '??', name: 'ART-9', quantity: 3 },
    ]);

    const outcome = await harness.module.classification.classifyCard(card.clientId, harness.actor);
    const clear = outcome.results.find((item) => item.productId === 'p1')!;
    const unclear = outcome.results.find((item) => item.productId === 'p2')!;
    expect(clear.status).toBe('CLASSIFIED');
    expect(clear.categoryCode).toBe('CLOTHING');
    expect(clear.subcategoryCode).toBe('CLOTHING_SHIRTS');
    expect(unclear.status).toBe('NEEDS_REVIEW');
    expect(unclear.reasons).toEqual(['AI_UNABLE_TO_CLASSIFY']);
    expect(row(harness, 'p2').category_code).toBeNull();
  });

  test('AI provider failure never blocks or loses the Card: lines go to review', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.failWith = new Error('AI_PROVIDER_TIMEOUT');
    const card = seedCard(harness, [{ id: 'p1', sku: 'SB-1', name: 'Running Shoes', quantity: 1 }]);
    const outcome = await harness.module.classification.classifyCard(card.clientId, harness.actor);
    expect(outcome.errorCode).toBe('AI_PROVIDER_TIMEOUT');
    expect(outcome.results[0].status).toBe('NEEDS_REVIEW');
    expect(outcome.results[0].reasons).toEqual(['AI_CLASSIFICATION_UNAVAILABLE']);
    // The extracted line itself is untouched.
    expect(row(harness, 'p1').product_name).toBe('Running Shoes');
    expect(row(harness, 'p1').quantity).toBe(1);
  });
});

describe('Manual review flow', () => {
  test('7. manual selection from the official master -> CLASSIFIED, source MANUAL', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = () => ({ categoryCode: '', subcategoryCode: '', confidence: 0.1, reason: '' });
    const card = seedCard(harness, [{ id: 'p1', sku: 'SB-1', name: 'Running Shoes', quantity: 1 }]);
    await harness.module.classification.classifyCard(card.clientId, harness.actor);
    expect(row(harness, 'p1').classification_status).toBe('NEEDS_REVIEW');

    const manual = harness.module.classification.setManualCategory('p1',
      { categoryCode: 'SHOES', subcategoryCode: 'SHOES_SPORTS' }, harness.actor);
    expect(manual).toMatchObject({
      status: 'CLASSIFIED', source: 'MANUAL', categoryCode: 'SHOES', subcategoryCode: 'SHOES_SPORTS', confidence: null,
    });
    const stored = row(harness, 'p1');
    expect(stored.classification_source).toBe('MANUAL');
    expect(stored.classification_confidence).toBeNull();
    expect(stored.classified_by).toBe(harness.actor.id);
    expect(harness.module.classification.isSatisfied(stored)).toBe(true);
  });

  test('free text is impossible: unknown / inactive / incoherent codes are rejected', () => {
    const harness = createHarness();
    seedMaster(harness);
    const card = seedCard(harness, [{ id: 'p1', sku: 'SB-1', name: 'Running Shoes', quantity: 1 }]);

    const freeText = () => harness.module.classification.setManualCategory('p1', { categoryCode: 'Chaussures de sport homme' }, harness.actor);
    expect(freeText).toThrowError(expect.objectContaining({ code: 'CATEGORY_INVALID' }));
    const inactive = () => harness.module.classification.setManualCategory('p1', { categoryCode: 'VINTAGE_TOYS' }, harness.actor);
    expect(inactive).toThrowError(expect.objectContaining({ code: 'CATEGORY_INVALID' }));
    const mismatch = () => harness.module.classification.setManualCategory('p1',
      { categoryCode: 'CLOTHING', subcategoryCode: 'SHOES_SPORTS' }, harness.actor);
    expect(mismatch).toThrowError(expect.objectContaining({ code: 'CATEGORY_INVALID' }));
    // Nothing was written.
    expect(row(harness, 'p1').category_code).toBeNull();
    expect(card.clientId).toBeTruthy();
  });

  test('HTTP: PATCH /products/:id/category accepts only official codes, GET /categories lists the master', async () => {
    const harness = createHarness();
    seedMaster(harness);
    const card = seedCard(harness, [{ id: 'p1', sku: 'SB-1', name: 'Running Shoes', quantity: 1 }]);

    const listing = await request(harness.app).get('/api/admin/arrival-ingestion/categories')
      .set('Cookie', harness.auth.cookie);
    expect(listing.status).toBe(200);
    expect(listing.body.data.available).toBe(true);
    expect(listing.body.data.confidenceThreshold).toBe(0.75);
    expect(listing.body.data.categories.map((item: any) => item.code)).toContain('CLOTHING_SHIRTS');

    const bad = await request(harness.app).patch('/api/admin/arrival-ingestion/products/p1/category')
      .set('Cookie', harness.auth.cookie).set('x-csrf-token', harness.auth.csrf)
      .send({ categoryCode: 'My own category' });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('CATEGORY_INVALID');

    const good = await request(harness.app).patch('/api/admin/arrival-ingestion/products/p1/category')
      .set('Cookie', harness.auth.cookie).set('x-csrf-token', harness.auth.csrf)
      .send({ categoryCode: 'SHOES', subcategoryCode: 'SHOES_SPORTS' });
    expect(good.status).toBe(200);
    expect(good.body.data).toMatchObject({ status: 'CLASSIFIED', source: 'MANUAL', categoryCode: 'SHOES' });
    expect(card.clientId).toBeTruthy();
  });

  test('HTTP: POST /clients/:id/classify runs the AI pass on demand', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = () => ({ categoryCode: 'ELECTRONICS', subcategoryCode: '', confidence: 0.88, reason: '' });
    const card = seedCard(harness, [{ id: 'p1', sku: 'EL-1', name: 'Wireless headphones', quantity: 1 }]);
    const response = await request(harness.app).post(`/api/admin/arrival-ingestion/clients/${card.clientId}/classify`)
      .set('Cookie', harness.auth.cookie).set('x-csrf-token', harness.auth.csrf).send({ force: true });
    expect(response.status).toBe(200);
    expect(response.body.data.classified).toBe(1);
    expect(row(harness, 'p1').category_code).toBe('ELECTRONICS');
  });
});

describe('Card approval gate and Warehouse dispatch', () => {
  test('8. a Card without a category is not approved until manual review resolves it', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = () => ({ categoryCode: '', subcategoryCode: '', confidence: 0.1, reason: '' });
    const card = seedCard(harness, [{ id: 'p1', sku: 'SB-1', name: 'Running Shoes', quantity: 1 }]);
    await harness.module.classification.classifyCard(card.clientId, harness.actor);

    // Per-line approval is blocked.
    const approve = () => harness.module.products.approve('p1', harness.actor);
    expect(approve).toThrowError(expect.objectContaining({ code: 'PRODUCT_CATEGORY_REQUIRED', status: 409 }));
    // Batch approval holds the line back instead of approving it.
    const batch = harness.module.products.approveAll(card.clientId, harness.actor);
    expect(batch.approved).toBe(0);
    expect(batch.needsCategory).toBe(1);
    // The Card itself reports the pending category review.
    expect(harness.module.arrivals.detail(card.arrivalId).confirmation.issues.map((issue: any) => issue.code))
      .toContain('CATEGORY_REVIEW_REQUIRED');

    // Sending the Card to the Warehouse is blocked too.
    process.env.WAREHOUSE_API_URL = 'http://127.0.0.1:9';
    process.env.WAREHOUSE_API_KEY = 'k';
    harness.db.run(`UPDATE crm_arrivals SET status='CONFIRMED' WHERE id=?`, card.arrivalId);
    await expect(harness.module.warehouseDispatch.send(card.arrivalId, card.clientId, harness.actor))
      .rejects.toMatchObject({ code: 'CARD_CLASSIFICATION_PENDING', status: 409 });

    // Manual review resolves it (the Arrival is still editable at this point).
    harness.db.run(`UPDATE crm_arrivals SET status='REVIEW' WHERE id=?`, card.arrivalId);
    harness.module.classification.setManualCategory('p1', { categoryCode: 'SHOES' }, harness.actor);
    expect(harness.module.arrivals.detail(card.arrivalId).confirmation.issues.map((issue: any) => issue.code))
      .not.toContain('CATEGORY_REVIEW_REQUIRED');
    expect(harness.module.products.approve('p1', harness.actor).extractionStatus).toBe('EXTRACTED');

    // Now the Card is sendable, carrying the manual category + provenance.
    const wh = await startWarehouseServer();
    servers.push(wh);
    process.env.WAREHOUSE_API_URL = wh.url;
    harness.db.run(`UPDATE crm_arrivals SET status='CONFIRMED' WHERE id=?`, card.arrivalId);
    const dispatch = await harness.module.warehouseDispatch.send(card.arrivalId, card.clientId, harness.actor);
    expect(dispatch.status).toBe('SENT');
    const sent = wh.received[0].customer_arrival_card.products[0];
    // The Warehouse only ever receives the canonical product shape — no
    // classification field may leak (it validates additionalProperties:false).
    expect(sent).toMatchObject({ sku: 'SB-1', product_name: 'Running Shoes', quantity: 1 });
    for (const key of ['category_code', 'subcategory_code', 'classification_source', 'classification_confidence', 'classification_status']) {
      expect(sent).not.toHaveProperty(key);
    }
    // The provenance stays in the CRM, not in the card.
    expect(row(harness, 'p1')).toMatchObject({ classification_source: 'MANUAL', category_code: 'SHOES' });
  });

  test('9. re-classifying and re-sending the same Card never duplicates anything', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = () => ({ categoryCode: 'SHOES', subcategoryCode: '', confidence: 0.9, reason: '' });
    const card = seedCard(harness, [{ id: 'p1', sku: 'SB-1', name: 'Running Shoes', quantity: 1 }]);

    await harness.module.classification.classifyCard(card.clientId, harness.actor);
    await harness.module.classification.classifyCard(card.clientId, harness.actor, { force: true });
    await harness.module.classification.classifyCard(card.clientId, harness.actor, { force: true });
    // Same line, single row, still exactly one classification.
    expect(harness.db.all('SELECT * FROM crm_extracted_products')).toHaveLength(1);
    expect(row(harness, 'p1').classification_status).toBe('CLASSIFIED');
    expect(row(harness, 'p1').classification_source).toBe('AI');

    const wh = await startWarehouseServer();
    servers.push(wh);
    process.env.WAREHOUSE_API_URL = wh.url;
    process.env.WAREHOUSE_API_KEY = 'k';
    harness.db.run(`UPDATE crm_arrivals SET status='CONFIRMED' WHERE id=?`, card.arrivalId);

    const first = await harness.module.warehouseDispatch.send(card.arrivalId, card.clientId, harness.actor);
    const second = await harness.module.warehouseDispatch.send(card.arrivalId, card.clientId, harness.actor);
    expect(second.card_id).toBe(first.card_id);
    expect(second.warehouse_arrival_id).toBe(first.warehouse_arrival_id);
    expect(harness.db.all('SELECT * FROM crm_warehouse_dispatches')).toHaveLength(1);
    expect(wh.received).toHaveLength(1);
  });

  test('10. a legacy Card (created before the feature) keeps working untouched', async () => {
    const harness = createHarness();
    seedMaster(harness);
    // Gate is ON (an official master exists) yet the legacy line is exempt.
    expect(harness.module.classification.gateEnabled()).toBe(true);
    const card = seedCard(harness, [{ id: 'old1', sku: 'LEG-1', name: 'Legacy product', quantity: 2 }], { legacy: true });
    expect(row(harness, 'old1').classification_required).toBe(0);
    expect(harness.module.classification.isSatisfied(row(harness, 'old1'))).toBe(true);

    // Approval still works without any category.
    expect(harness.module.products.approve('old1', harness.actor).extractionStatus).toBe('EXTRACTED');

    // The Card is still sendable, and its product line simply carries no
    // category and no provenance (null), exactly as before.
    const wh = await startWarehouseServer();
    servers.push(wh);
    process.env.WAREHOUSE_API_URL = wh.url;
    process.env.WAREHOUSE_API_KEY = 'k';
    harness.db.run(`UPDATE crm_arrivals SET status='CONFIRMED' WHERE id=?`, card.arrivalId);
    const dispatch = await harness.module.warehouseDispatch.send(card.arrivalId, card.clientId, harness.actor);
    expect(dispatch.status).toBe('SENT');
    const sent = wh.received[0].customer_arrival_card.products[0];
    expect(sent).toMatchObject({ sku: 'LEG-1', product_name: 'Legacy product', quantity: 2 });
    for (const key of ['category_code', 'subcategory_code', 'classification_source', 'classification_confidence', 'classification_status']) {
      expect(sent).not.toHaveProperty(key);
    }
    // Identity fields of the old Card are preserved.
    expect(wh.received[0].customer_arrival_card.id).toBe(`card_${card.clientId}`);
    expect(wh.received[0].customer_arrival_card.customer.id).toBe(card.customerId);
  });

  test('a category deactivated in the master can no longer be selected', async () => {
    const harness = createHarness();
    seedMaster(harness);
    harness.adapter.decide = () => ({ categoryCode: 'ELECTRONICS', subcategoryCode: '', confidence: 0.95, reason: '' });
    const card = seedCard(harness, [{ id: 'p1', sku: 'EL-1', name: 'Charger', quantity: 1 }]);
    await harness.module.classification.classifyCard(card.clientId, harness.actor);
    expect(row(harness, 'p1').classification_status).toBe('CLASSIFIED');

    harness.module.categories.update('ELECTRONICS', { active: false }, harness.actor);
    // The stored code is now invalid against the master, so the line can no
    // longer be approved: validation is always re-run against the master.
    const stored = row(harness, 'p1');
    expect(harness.module.categories.validate(stored.category_code).valid).toBe(false);
    expect(() => harness.module.classification.setManualCategory('p1', { categoryCode: 'ELECTRONICS' }, harness.actor))
      .toThrowError(expect.objectContaining({ code: 'CATEGORY_INVALID' }));
  });
});

describe('Schema migration on an existing database', () => {
  test('an existing (pre-feature) database is upgraded additively and its Cards keep working', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-category-mig-'));
    const file = path.join(dir, 'legacy.sqlite');
    try {
      const now = new Date().toISOString();
      const created = new QatafoDatabase(file);
      created.run(`INSERT INTO crm_stores (id,code,name,active,created_at,updated_at) VALUES ('s1','S1','Shop',1,?,?)`, now, now);
      created.run(`INSERT INTO customers (id,name,phone,normalized_phone,governorate,address,registered_at,status,updated_at)
        VALUES ('c1','Legacy','+21622000111','22000111','Tunis','A',?,'ACTIVE',?)`, now, now);
      created.run(`INSERT INTO crm_arrivals (id,name,status,created_at,updated_at) VALUES ('a1','Old','CONFIRMED',?,?)`, now, now);
      created.run(`INSERT INTO crm_arrival_clients (id,arrival_id,customer_id,store_id,created_at,updated_at) VALUES ('cl1','a1','c1','s1',?,?)`, now, now);
      created.run(`INSERT INTO crm_arrival_client_stores (id,arrival_client_id,store_id,created_at,updated_at) VALUES ('cs1','cl1','s1',?,?)`, now, now);
      created.run(`INSERT INTO crm_arrival_sources (id,arrival_client_id,arrival_client_store_id,source_type,original_filename,mime_type,byte_size,source_hash,storage_key,created_at)
        VALUES ('sr1','cl1','cs1','EMAIL','f.eml','message/rfc822',10,'h1','k1',?)`, now);
      created.run(`INSERT INTO crm_extracted_products (id,source_id,arrival_client_id,arrival_client_store_id,arrival_id,customer_id,store_id,
        product_name,sku,quantity,source_type,source_reference,extraction_confidence,extraction_status,is_current,created_at,updated_at)
        VALUES ('p1','sr1','cl1','cs1','a1','c1','s1','Old product','OLD-1',3,'EMAIL','r',1,'EXTRACTED',1,?,?)`, now, now);
      // Simulate a database written before this feature existed.
      for (const column of ['category_code', 'subcategory_code', 'classification_source', 'classification_confidence',
        'classification_status', 'classification_reasons', 'classification_note', 'classification_required',
        'classified_at', 'classified_by']) created.run(`ALTER TABLE crm_extracted_products DROP COLUMN ${column}`);
      created.run('DROP TABLE crm_categories');
      created.close();

      const reopened = new QatafoDatabase(file);
      databases.push(reopened);
      const columns = reopened.all<any>('PRAGMA table_info(crm_extracted_products)').map((column) => column.name);
      for (const column of ['category_code', 'subcategory_code', 'classification_source', 'classification_confidence',
        'classification_status', 'classification_reasons', 'classification_note', 'classification_required',
        'classified_at', 'classified_by']) expect(columns).toContain(column);
      expect(reopened.get<any>("SELECT name FROM sqlite_master WHERE type='table' AND name='crm_categories'")).toBeTruthy();

      // The pre-existing Card line is untouched and is explicitly NOT gated.
      const legacy = reopened.get<any>('SELECT * FROM crm_extracted_products WHERE id=?', 'p1');
      expect(legacy).toMatchObject({
        id: 'p1', product_name: 'Old product', sku: 'OLD-1', quantity: 3,
        extraction_status: 'EXTRACTED', is_current: 1,
        classification_required: 0, classification_status: 'UNCLASSIFIED',
        category_code: null, classification_source: null,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
