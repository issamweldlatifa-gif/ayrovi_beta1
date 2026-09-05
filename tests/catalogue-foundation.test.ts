/**
 * AYROVI Catalogue (P2.1) — acceptance tests.
 *
 * Covers what this phase promised, in the order the spec lists it: the canonical product
 * entity (created on the EXISTING `products` table, never a second one), variants with a
 * database-enforced unique SKU, the category tree with cycle/depth protection, brands on
 * the existing `brands` table, media that cannot smuggle a private document into a product
 * sheet, declared attributes, permissions as revocable data, audit with field-level diff,
 * derived ERP events, and the three database-safety cases (fresh / existing / repeated).
 *
 * It also pins what must NOT have happened: the generic `/api/admin/products` +
 * `/api/admin/brands` screens keep their exact behaviour, the public storefront keeps
 * answering, and the upload policy is unchanged.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { app, db } from '../src/server';
import { bootstrapCatalogue, ensureCatalogueSchema } from '../src/catalogue/bootstrap';
import { createProduct } from '../src/catalogue/products';
import { canCatalogue } from '../src/catalogue/permissions';
import { PUBLIC_UPLOAD_DIRS } from '../src/erp-core/storage';

const suffix = Date.now();
let superAgent: any;
let superCsrf = '';
let content: { agent: any; csrf: string };
let orders: { agent: any; csrf: string };

async function makeSession(role: 'CONTENT_MANAGER' | 'ORDER_MANAGER') {
  const email = `cat-${role.toLowerCase()}-${suffix}@test.ayrovi.tn`;
  const password = 'CatalogueSecure2026!';
  const created = await superAgent.post('/api/admin/users').set('x-csrf-token', superCsrf)
    .send({ name: `Catalogue ${role}`, email, password, role });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return { agent, csrf: login.body.data.csrfToken };
}

function tableColumns(handle: QatafoDatabase, table: string): string[] {
  return handle.all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name);
}

describe('catalogue foundation (P2.1)', () => {
  let brandId = '';
  let categoryId = '';
  let childCategoryId = '';
  let productId = '';
  let variantId = '';
  let mediaId = '';
  const sku = `SKU-${suffix}`;

  beforeAll(async () => {
    superAgent = request.agent(app);
    const login = await superAgent.set('User-Agent', 'AYROVI-CatalogueTest/1.0 (vitest)')
      .post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    superCsrf = login.body.data.csrfToken;
    content = await makeSession('CONTENT_MANAGER');
    orders = await makeSession('ORDER_MANAGER');
    // Idempotent by contract: booting inside a live process changes nothing.
    const first = bootstrapCatalogue(db);
    expect(first.sequencesReady).toBe(2);
  });

  afterAll(() => {
    for (const id of [mediaId, variantId, productId].filter(Boolean)) {
      db.run('DELETE FROM catalogue_attribute_values WHERE product_id=? OR variant_id=?', id, id);
    }
    db.run('DELETE FROM catalogue_media WHERE product_id=?', productId);
    db.run('DELETE FROM catalogue_variants WHERE product_id=?', productId);
    db.run('DELETE FROM products WHERE id=?', productId);
    db.run('DELETE FROM catalogue_categories WHERE id IN (?,?)', categoryId, childCategoryId);
    db.run('DELETE FROM brands WHERE id=?', brandId);
  });

  describe('module wiring', () => {
    test('the catalogue is registered as an active module, in the single registry', async () => {
      const response = await superAgent.get('/api/admin/core/modules');
      expect(response.status).toBe(200);
      const flat = response.body.data.sections.flatMap((section: any) => section.modules);
      const catalog = flat.find((module: any) => module.key === 'catalog');
      expect(catalog).toBeTruthy();
      expect(catalog.status).toBe('active');
      expect(catalog.basePermission).toBe('content:read');
      // not a second registry: no `catalogue` twin next to `catalog`
      expect(flat.filter((module: any) => module.key === 'catalogue')).toHaveLength(0);
    });

    test('GET /catalogue/health reports the bootstrap, idempotently', async () => {
      const response = await superAgent.get('/api/admin/catalogue/health');
      expect(response.status).toBe(200);
      expect(response.body.data.module).toBe('catalog');
      const again = await superAgent.get('/api/admin/catalogue/health');
      expect(again.body.data.grantsSeeded).toBeGreaterThanOrEqual(0);
      expect(again.body.data.sequencesReady).toBe(2);
    });

    test('GET /catalogue/meta exposes the vocabulary, without inventing a status', async () => {
      const response = await superAgent.get('/api/admin/catalogue/meta');
      expect(response.status).toBe(200);
      expect(response.body.data.productStatuses).toEqual(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']);
      expect(response.body.data.policy.deletion).toContain('archivage');
    });
  });

  describe('products', () => {
    test('a brand and a category exist first (the product references them)', async () => {
      const brand = await superAgent.post('/api/admin/catalogue/brands').set('x-csrf-token', superCsrf)
        .send({ name: `Maison Test ${suffix}`, category: 'FASHION', description: 'Marque de test P2.1', display_order: 5 });
      expect(brand.status, JSON.stringify(brand.body)).toBe(201);
      expect(brand.body.data.slug).toBe(`maison-test-${suffix}`);
      brandId = brand.body.data.id;

      const category = await superAgent.post('/api/admin/catalogue/categories').set('x-csrf-token', superCsrf)
        .send({ name: `Chaussures ${suffix}`, sort_order: 10 });
      expect(category.status, JSON.stringify(category.body)).toBe(201);
      categoryId = category.body.data.id;
      const child = await superAgent.post('/api/admin/catalogue/categories').set('x-csrf-token', superCsrf)
        .send({ name: 'Homme', parent_id: categoryId, sort_order: 20 });
      expect(child.status, JSON.stringify(child.body)).toBe(201);
      expect(child.body.data.parent_id).toBe(categoryId);
      childCategoryId = child.body.data.id;
    });

    test('create returns the canonical row with a readable code and a slug', async () => {
      const response = await superAgent.post('/api/admin/catalogue/products').set('x-csrf-token', superCsrf)
        .send({
          name: `Baskets Route ${suffix}`, description: 'Test P2.1 — entité canonique du catalogue',
          brand_id: brandId, category_id: childCategoryId, status: 'DRAFT',
          original_price: 89.9, currency: 'EUR', source_platform: 'SHEIN',
        });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const product = response.body.data;
      productId = product.id;
      expect(product.product_code).toMatch(/^PRD-\d{6}$/);
      expect(product.slug).toBe(`baskets-route-${suffix}`);
      expect(product.brand_name).toBe(`Maison Test ${suffix}`);
      // legacy mirror kept in sync so the storefront does not lose its filter column
      expect(product.category).toBe('Homme');
      expect(product.category_id).toBe(childCategoryId);
      expect(product.status).toBe('DRAFT');
      // the identity is the SAME table the storefront reads — not a catalogue copy
      expect(db.get<any>('SELECT product_code FROM products WHERE id=?', productId).product_code).toBe(product.product_code);
    });

    test('the same name twice does not collide: slugs are suffixed, never overwritten', async () => {
      const second = await superAgent.post('/api/admin/catalogue/products').set('x-csrf-token', superCsrf)
        .send({ name: `Baskets Route ${suffix}`, source_platform: 'OTHER', currency: 'TND' });
      expect(second.status, JSON.stringify(second.body)).toBe(201);
      expect(second.body.data.slug).toBe(`baskets-route-${suffix}-2`);
      expect(second.body.data.id).not.toBe(productId);
      db.run('DELETE FROM products WHERE id=?', second.body.data.id);
    });

    test('an explicit slug already taken is a 409, not a silent takeover', async () => {
      const taken = await superAgent.post('/api/admin/catalogue/products').set('x-csrf-token', superCsrf)
        .send({ name: `Autre Nom ${suffix}`, slug: `baskets-route-${suffix}`, source_platform: 'OTHER', currency: 'TND' });
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe('CATALOGUE_SLUG_TAKEN');
      expect(taken.body.details[0].field).toBe('slug');
      // the original row is untouched
      expect(db.get<any>('SELECT name FROM products WHERE slug=?', `baskets-route-${suffix}`).name).toBe(`Baskets Route ${suffix}`);
    });

    test('invalid payloads are refused with a field, not with a 500', async () => {
      const noName = await superAgent.post('/api/admin/catalogue/products').set('x-csrf-token', superCsrf)
        .send({ source_platform: 'OTHER', currency: 'TND' });
      expect(noName.status).toBe(400);
      expect(noName.body.code).toBe('CATALOGUE_VALIDATION');
      expect(noName.body.details.some((entry: any) => entry.field === 'name')).toBe(true);

      const badStatus = await superAgent.put(`/api/admin/catalogue/products/${productId}`).set('x-csrf-token', superCsrf)
        .send({ status: 'PUBLISHED' });
      expect(badStatus.status).toBe(400);
      expect(badStatus.body.code).toBe('CATALOGUE_STATUS_INVALID');

      const ghostBrand = await superAgent.post('/api/admin/catalogue/products').set('x-csrf-token', superCsrf)
        .send({ name: `Fantôme ${suffix}`, brand_id: 'brand_does_not_exist', source_platform: 'OTHER', currency: 'TND' });
      expect(ghostBrand.status).toBe(400);
      expect(ghostBrand.body.details[0].reason).toBe('NOT_FOUND');

      const ghostCategory = await superAgent.post('/api/admin/catalogue/products').set('x-csrf-token', superCsrf)
        .send({ name: `Sans catégorie ${suffix}`, category_id: 'cat_ghost', source_platform: 'OTHER', currency: 'TND' });
      expect(ghostCategory.status).toBe(404);
      expect(ghostCategory.body.code).toBe('CATALOGUE_CATEGORY_NOT_FOUND');

      const malformed = await superAgent.get('/api/admin/catalogue/products/not%20an%20id');
      expect(malformed.status).toBe(404);

      const garbage = await superAgent.put('/api/admin/catalogue/products/not-a-valid-id-@@@@').set('x-csrf-token', superCsrf)
        .send({ status: 'DRAFT' });
      expect(garbage.status).toBe(400);
      expect(garbage.body.code).toBe('CATALOGUE_ID_MALFORMED');
    });

    test('update records a field-level diff, and a status change is a status event', async () => {
      const update = await superAgent.put(`/api/admin/catalogue/products/${productId}`).set('x-csrf-token', superCsrf)
        .send({ description: 'Description révisée P2.1', status: 'ACTIVE' });
      expect(update.status, JSON.stringify(update.body)).toBe(200);
      expect(update.body.data.status).toBe('ACTIVE');
      const auditRow = db.get<any>(`SELECT * FROM audit_logs WHERE module='CATALOGUE' AND resource_type='product' AND resource_id=? AND action='STATUS_CHANGE' ORDER BY created_at DESC LIMIT 1`, productId);
      expect(auditRow).toBeTruthy();
      const fields = db.all<{ field_name: string }>(`SELECT field_name FROM erp_audit_changes WHERE audit_id=?`, auditRow.id).map((row) => row.field_name);
      expect(fields).toContain('description');
      expect(fields).toContain('status');
      expect(auditRow.user_name).toBe('AYROVI Admin');
      expect(typeof auditRow.employee_code).toBe('string');

      // A plain edit (no status movement) must stay an UPDATE, not masquerade as a status event.
      const plain = await superAgent.put(`/api/admin/catalogue/products/${productId}`).set('x-csrf-token', superCsrf)
        .send({ description: 'Description révisée une deuxième fois' });
      expect(plain.status, JSON.stringify(plain.body)).toBe(200);
      const plainAudit = db.get<any>(`SELECT * FROM audit_logs WHERE module='CATALOGUE' AND resource_type='product' AND resource_id=? AND action='UPDATE' ORDER BY created_at DESC LIMIT 1`, productId);
      expect(plainAudit).toBeTruthy();
      expect(plainAudit.action).toBe('UPDATE');
      const plainFields = db.all<{ field_name: string }>(`SELECT field_name FROM erp_audit_changes WHERE audit_id=?`, plainAudit.id).map((row) => row.field_name);
      expect(plainFields).toEqual(['description']);
    });

    test('DELETE archives: the row, its history and its links survive', async () => {
      const response = await superAgent.delete(`/api/admin/catalogue/products/${productId}?reason=test-p21`).set('x-csrf-token', superCsrf);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.data.status).toBe('ARCHIVED');
      expect(db.get<any>('SELECT status FROM products WHERE id=?', productId).status).toBe('ARCHIVED');
      const auditRow = db.get<any>(`SELECT * FROM audit_logs WHERE module='CATALOGUE' AND action='ARCHIVE' AND resource_type='product' AND resource_id=?`, productId);
      expect(auditRow).toBeTruthy();
      expect(String(auditRow.new_value)).toContain('test-p21');
      // archiving is a status, not an execution: the product can come back
      const back = await superAgent.put(`/api/admin/catalogue/products/${productId}`).set('x-csrf-token', superCsrf)
        .send({ status: 'ACTIVE' });
      expect(back.body.data.status).toBe('ACTIVE');
    });

    test('search finds a product through its SKU', async () => {
      const variant = await superAgent.post(`/api/admin/catalogue/products/${productId}/variants`).set('x-csrf-token', superCsrf)
        .send({ sku, size: '42', color: 'Noir', barcode: `619${String(suffix).slice(-9)}` });
      expect(variant.status, JSON.stringify(variant.body)).toBe(201);
      variantId = variant.body.data.id;
      const response = await superAgent.get(`/api/admin/catalogue/products?search=${sku}`);
      expect(response.status).toBe(200);
      expect(response.body.data.some((row: any) => row.id === productId)).toBe(true);
    });
  });

  describe('variants and the SKU rule', () => {
    test('a SKU is unique at the database level, case-insensitively', () => {
      expect(() => db.run(`INSERT INTO catalogue_variants (id,product_id,sku,status,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?)`, `var_raw_${suffix}`, productId, sku.toLowerCase(), 'ACTIVE', 100, new Date().toISOString(), new Date().toISOString()))
        .toThrow();
      expect(Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM catalogue_variants WHERE product_id=?', productId)?.n ?? 0)).toBe(1);
    });

    test('a duplicate SKU is a controlled 409, whatever the case used', async () => {
      const duplicate = await superAgent.post(`/api/admin/catalogue/products/${productId}/variants`).set('x-csrf-token', superCsrf)
        .send({ sku: sku.toLowerCase(), size: '43' });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('CATALOGUE_SKU_TAKEN');
      expect(duplicate.body.details[0].field).toBe('sku');
    });

    test('a variant without a SKU is refused before touching the database', async () => {
      const missing = await superAgent.post(`/api/admin/catalogue/products/${productId}/variants`).set('x-csrf-token', superCsrf)
        .send({ size: '44' });
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe('CATALOGUE_SKU_REQUIRED');
    });

    test('a variant cannot be invented under an unknown product', async () => {
      const orphan = await superAgent.post('/api/admin/catalogue/products/prod_ghost/variants').set('x-csrf-token', superCsrf)
        .send({ sku: `ORPHAN-${suffix}` });
      expect(orphan.status).toBe(404);
      expect(orphan.body.code).toBe('CATALOGUE_PRODUCT_NOT_FOUND');
    });

    test('a variant update keeps its product, and retiring is not disappearing', async () => {
      const moved = await superAgent.put(`/api/admin/catalogue/variants/${variantId}`).set('x-csrf-token', superCsrf)
        .send({ color: 'Anthracite' });
      expect(moved.status).toBe(200);
      expect(moved.body.data.color).toBe('Anthracite');
      expect(moved.body.data.product_id).toBe(productId);
      const retired = await superAgent.delete(`/api/admin/catalogue/variants/${variantId}`).set('x-csrf-token', superCsrf);
      expect(retired.status).toBe(200);
      expect(retired.body.data.status).toBe('ARCHIVED');
      expect(db.get<any>('SELECT sku FROM catalogue_variants WHERE id=?', variantId)).toBeTruthy();
    });
  });

  describe('category hierarchy', () => {
    test('the tree exposes depth and parent links', async () => {
      const response = await superAgent.get('/api/admin/catalogue/categories?shape=tree');
      expect(response.status).toBe(200);
      const root = response.body.data.flat.find((row: any) => row.id === categoryId);
      const child = response.body.data.flat.find((row: any) => row.id === childCategoryId);
      expect(root.parent_id).toBe(null);
      expect(child.parent_id).toBe(categoryId);
      const node = response.body.data.tree.find((row: any) => row.id === categoryId);
      expect(node.children[0].depth).toBe(1);
      expect(node.children.some((entry: any) => entry.name === 'Homme')).toBe(true);
    });

    test('an unknown parent and a self parent are both refused', async () => {
      const ghost = await superAgent.post('/api/admin/catalogue/categories').set('x-csrf-token', superCsrf)
        .send({ name: `Orphelin ${suffix}`, parent_id: 'cat_ghost' });
      expect(ghost.status).toBe(404);
      expect(ghost.body.code).toBe('CATALOGUE_CATEGORY_NOT_FOUND');

      const self = await superAgent.put(`/api/admin/catalogue/categories/${categoryId}`).set('x-csrf-token', superCsrf)
        .send({ parent_id: categoryId });
      expect(self.status).toBe(400);
      expect(self.body.code).toBe('CATALOGUE_PARENT_CYCLE');
    });

    test('a two-node loop is refused (that is the update that hangs every walker)', async () => {
      const loop = await superAgent.put(`/api/admin/catalogue/categories/${categoryId}`).set('x-csrf-token', superCsrf)
        .send({ parent_id: childCategoryId });
      expect(loop.status).toBe(400);
      expect(loop.body.code).toBe('CATALOGUE_PARENT_CYCLE');
      expect((await superAgent.get('/api/admin/catalogue/categories')).status).toBe(200);
    });

    test('a duplicate explicit slug is a 409 in the category namespace', async () => {
      const clash = await superAgent.post('/api/admin/catalogue/categories').set('x-csrf-token', superCsrf)
        .send({ name: `Doublon ${suffix}`, slug: `chaussures-${suffix}` });
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe('CATALOGUE_SLUG_TAKEN');
    });

    test('a category holding products cannot be archived away from under them', async () => {
      const response = await superAgent.delete(`/api/admin/catalogue/categories/${childCategoryId}`).set('x-csrf-token', superCsrf);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CATALOGUE_CONFLICT');
      expect(String(response.body.error)).toContain('produit');
    });
  });

  describe('brands', () => {
    test('duplicate names are refused on the canonical table, case-insensitively', async () => {
      const clash = await superAgent.post('/api/admin/catalogue/brands').set('x-csrf-token', superCsrf)
        .send({ name: `maison test ${suffix}`, category: 'FASHION' });
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe('CATALOGUE_CONFLICT');
      expect(clash.body.details[0].reason).toBe('TAKEN');
    });

    test('renaming a brand follows its display mirror on products', async () => {
      const rename = await superAgent.put(`/api/admin/catalogue/brands/${brandId}`).set('x-csrf-token', superCsrf)
        .send({ name: `Maison Test Renommée ${suffix}` });
      expect(rename.status, JSON.stringify(rename.body)).toBe(200);
      expect(db.get<any>('SELECT brand_name FROM products WHERE id=?', productId).brand_name).toBe(`Maison Test Renommée ${suffix}`);
      expect(rename.body.data.slug).toBe(`maison-test-${suffix}`);
    });

    test('an invalid brand category is refused by the CHECK, translated to a 400', async () => {
      const bad = await superAgent.post('/api/admin/catalogue/brands').set('x-csrf-token', superCsrf)
        .send({ name: `Mauvaise ${suffix}`, category: 'AUTOMOBILE' });
      expect(bad.status).toBe(400);
      expect(bad.body.details[0].field).toBe('category');
    });
  });

  describe('media and the file policy', () => {
    test('a public reference is accepted and becomes the primary mirror', async () => {
      const response = await superAgent.post(`/api/admin/catalogue/products/${productId}/media`).set('x-csrf-token', superCsrf)
        .send({ media_type: 'IMAGE', url: `https://cdn.example.com/shoe-${suffix}.jpg`, alt_text: 'Baskets noires', is_primary: true, sort_order: 1 });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      mediaId = response.body.data.id;
      expect(response.body.data.is_primary).toBe(1);
      expect(db.get<any>('SELECT image FROM products WHERE id=?', productId).image).toBe(`https://cdn.example.com/shoe-${suffix}.jpg`);
    });

    test('a private document can never become a product picture', async () => {
      for (const url of ['/uploads/invoices/INV-2026-000001.pdf', '/uploads/private/documents/payment-proofs/proof.png', '/uploads/deposits/x.png']) {
        const response = await superAgent.post(`/api/admin/catalogue/products/${productId}/media`).set('x-csrf-token', superCsrf)
          .send({ media_type: 'DOCUMENT', url });
        expect(response.status, url).toBe(400);
        expect(response.body.code, url).toBe('CATALOGUE_MEDIA_PRIVATE_PATH');
      }
      const traversal = await superAgent.post(`/api/admin/catalogue/products/${productId}/media`).set('x-csrf-token', superCsrf)
        .send({ media_type: 'IMAGE', url: '/uploads/hero/../../private/documents/invoices/x.pdf' });
      expect(traversal.status).toBe(400);
      const scheme = await superAgent.post(`/api/admin/catalogue/products/${productId}/media`).set('x-csrf-token', superCsrf)
        .send({ media_type: 'IMAGE', url: 'file:///etc/passwd' });
      expect(scheme.status).toBe(400);
      expect(scheme.body.code).toBe('CATALOGUE_MEDIA_URL_INVALID');
      // the policy itself is unchanged by this phase
      expect([...PUBLIC_UPLOAD_DIRS]).toEqual(['hero']);
    });

    test('removing a media row deletes the reference only, and is audited', async () => {
      const removed = await superAgent.delete(`/api/admin/catalogue/media/${mediaId}`).set('x-csrf-token', superCsrf);
      expect(removed.status, JSON.stringify(removed.body)).toBe(200);
      expect(removed.body.data.removed).toBe(true);
      expect(db.get<any>('SELECT id FROM catalogue_media WHERE id=?', mediaId)).toBeFalsy();
      const auditRow = db.get<any>(`SELECT * FROM audit_logs WHERE module='CATALOGUE' AND action='DELETE' AND resource_type='product_media' AND resource_id=?`, mediaId);
      expect(auditRow).toBeTruthy();
      expect(String(auditRow.old_value)).toContain('cdn.example.com');
    });
  });

  describe('declared attributes', () => {
    test('an attribute must be declared before a value can be stored', async () => {
      const definition = await superAgent.post('/api/admin/catalogue/attributes').set('x-csrf-token', superCsrf)
        .send({ attribute_key: 'season', label: 'Saison', data_type: 'SELECT', target: 'variant', options: ['été', 'hiver'] });
      expect(definition.status, JSON.stringify(definition.body)).toBe(201);

      const unknown = await superAgent.post(`/api/admin/catalogue/products/${productId}/variants`).set('x-csrf-token', superCsrf)
        .send({ sku: `${sku}-2`, attributes: { colorimetry: 'rouge' } });
      expect(unknown.status).toBe(400);
      expect(unknown.body.code).toBe('CATALOGUE_ATTRIBUTE_TYPE_MISMATCH');

      const wrongType = await superAgent.post(`/api/admin/catalogue/products/${productId}/variants`).set('x-csrf-token', superCsrf)
        .send({ sku: `${sku}-3`, attributes: { season: 'printemps' } });
      expect(wrongType.status).toBe(400);
      expect(wrongType.body.details[0].reason).toBe('NOT_IN_OPTIONS');
    });

    test('a valid attribute value is stored beside the variant, in the same transaction', async () => {
      const variant = await superAgent.post(`/api/admin/catalogue/products/${productId}/variants`).set('x-csrf-token', superCsrf)
        .send({ sku: `${sku}-4`, size: '41', attributes: { season: 'été' } });
      expect(variant.status, JSON.stringify(variant.body)).toBe(201);
      const stored = db.get<any>('SELECT value_text FROM catalogue_attribute_values WHERE variant_id=? AND attribute_key=?', variant.body.data.id, 'season');
      expect(stored.value_text).toBe('été');
      db.run('DELETE FROM catalogue_attribute_values WHERE variant_id=?', variant.body.data.id);
      db.run('DELETE FROM catalogue_variants WHERE id=?', variant.body.data.id);
    });
  });

  describe('permissions as revocable data', () => {
    test('CONTENT_MANAGER keeps parity with the legacy screen (create allowed)', async () => {
      const response = await content.agent.post('/api/admin/catalogue/products').set('x-csrf-token', content.csrf)
        .send({ name: `Produit rédacteur ${suffix}`, source_platform: 'OTHER', currency: 'TND', original_price: 10 });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      db.run('DELETE FROM products WHERE id=?', response.body.data.id);
    });

    test('ORDER_MANAGER has no catalogue access, and the refusal is audited', async () => {
      const before = Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_logs WHERE action='ACCESS_DENIED' AND module='PERMISSIONS'`)?.n ?? 0);
      const response = await orders.agent.get('/api/admin/catalogue/products');
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('ERP_PERMISSION_DENIED');
      const after = Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_logs WHERE action='ACCESS_DENIED' AND module='PERMISSIONS'`)?.n ?? 0);
      expect(after).toBeGreaterThan(before);
    });

    test('revoking a catalogue right is editing a row, not shipping code', () => {
      expect(canCatalogue(db, 'CONTENT_MANAGER', 'approve', 'product').allowed).toBe(true);
      db.run(`UPDATE erp_role_permissions SET granted=0, origin='MANUAL' WHERE role='CONTENT_MANAGER' AND module_key='catalog' AND action='approve'`);
      expect(canCatalogue(db, 'CONTENT_MANAGER', 'approve', 'product').allowed).toBe(false);
      expect(canCatalogue(db, 'CONTENT_MANAGER', 'read', 'product').allowed).toBe(true);
      db.run(`UPDATE erp_role_permissions SET granted=1, origin='SEED' WHERE role='CONTENT_MANAGER' AND module_key='catalog' AND action='approve'`);
    });

    test('publishing a product requires approve, and the API says so explicitly', async () => {
      db.run(`UPDATE erp_role_permissions SET granted=0, origin='MANUAL' WHERE role='CONTENT_MANAGER' AND module_key='catalog' AND action='approve'`);
      try {
        const refused = await content.agent.post('/api/admin/catalogue/products').set('x-csrf-token', content.csrf)
          .send({ name: `Publication refusée ${suffix}`, status: 'ACTIVE', source_platform: 'OTHER', currency: 'TND' });
        expect(refused.status).toBe(403);
        expect(refused.body.code).toBe('CATALOGUE_PERMISSION_DENIED');
        expect(refused.body.details[0].reason).toBe('APPROVE_REQUIRED');
        const draft = await content.agent.post('/api/admin/catalogue/products').set('x-csrf-token', content.csrf)
          .send({ name: `Brouillon accepté ${suffix}`, status: 'DRAFT', source_platform: 'OTHER', currency: 'TND' });
        expect(draft.status).toBe(201);
        db.run('DELETE FROM products WHERE id=?', draft.body.data.id);
      } finally {
        db.run(`UPDATE erp_role_permissions SET granted=1, origin='SEED' WHERE role='CONTENT_MANAGER' AND module_key='catalog' AND action='approve'`);
      }
    });

    test('a write without a CSRF token is refused before any catalogue code runs', async () => {
      const response = await superAgent.post('/api/admin/catalogue/brands').send({ name: `Sans jeton ${suffix}`, category: 'OTHER' });
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('CSRF');
    });

    test('an anonymous caller cannot read the catalogue', async () => {
      expect((await request(app).get('/api/admin/catalogue/products')).status).toBe(401);
    });
  });

  describe('audit, events and the shared sequence', () => {
    test('every mutation kind produced an audit row under module CATALOGUE', () => {
      const seen = db.all<{ action: string; resource_type: string }>(
        `SELECT DISTINCT action, resource_type FROM audit_logs WHERE module='CATALOGUE'`)
        .map((row) => `${row.resource_type}.${row.action.toLowerCase().replace('_', '-')}`);
      for (const expected of ['product.create', 'product.update', 'product.status-change', 'product.archive',
        'variant.create', 'variant.update', 'variant.archive', 'category.create', 'brand.create', 'brand.update',
        'product_media.create', 'product_media.delete']) {
        expect(seen, expected).toContain(expected);
      }
    });

    test('the derived ERP events are the catalogue vocabulary, on the catalog module', () => {
      const names = db.all<{ event_name: string }>(`SELECT DISTINCT event_name FROM erp_events WHERE module_key='catalog'`).map((row) => row.event_name);
      for (const expected of ['product.created', 'product.updated', 'product.archived', 'product.status-changed',
        'variant.created', 'variant.updated', 'variant.archived', 'category.created', 'brand.created', 'brand.updated',
        'product_media.created', 'product_media.deleted']) {
        expect(names, expected).toContain(expected);
      }
    });

    test('no secret, token or password ever reaches catalogue audit data', () => {
      const rows = db.all<any>(`SELECT old_value, new_value FROM audit_logs WHERE module='CATALOGUE'`);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const text = `${row.old_value ?? ''} ${row.new_value ?? ''}`;
        for (const forbidden of ['password_hash', 'csrf_token', 'session_token', 'api_key']) {
          expect(text, forbidden).not.toContain(forbidden);
        }
      }
    });

    test('product codes come from the shared ERP sequence, unique and monotonic', async () => {
      const first = await superAgent.post('/api/admin/catalogue/products').set('x-csrf-token', superCsrf)
        .send({ name: `Séquence A ${suffix}`, source_platform: 'OTHER', currency: 'TND' });
      const second = await superAgent.post('/api/admin/catalogue/products').set('x-csrf-token', superCsrf)
        .send({ name: `Séquence B ${suffix}`, source_platform: 'OTHER', currency: 'TND' });
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      expect(second.status, JSON.stringify(second.body)).toBe(201);
      const codes = [first.body.data.product_code, second.body.data.product_code];
      for (const code of codes) expect(String(code)).toMatch(/^PRD-\d{6}$/);
      expect(codes[0]).not.toBe(codes[1]);
      const numeric = codes.map((code) => Number(String(code).split('-')[1]));
      expect(numeric[1]).toBeGreaterThan(numeric[0]);
      // the shared counter moved, the catalogue did not open its own numbering book
      const sequence = db.get<{ next_value: number, prefix: string }>(`SELECT next_value, prefix FROM erp_sequences WHERE sequence_key='product_code'`);
      expect(sequence.prefix).toBe('PRD');
      expect(Number(sequence.next_value)).toBeGreaterThan(numeric[1]);
      const row = db.get<any>('SELECT source_platform FROM products WHERE id=?', first.body.data.id);
      expect(row.source_platform).toBe('OTHER');
      db.run('DELETE FROM products WHERE id IN (?,?)', first.body.data.id, second.body.data.id);
    });

  });

  describe('database safety: fresh, existing, repeated', () => {
    test('a fresh database gets the catalogue shape from the constructor alone', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-cat-'));
      const fresh = new QatafoDatabase(path.join(dir, 'fresh.sqlite'));
      try {
        const tables = fresh.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'catalogue_%' ORDER BY name`).map((row) => row.name);
        expect(tables).toEqual(['catalogue_attribute_values', 'catalogue_attributes', 'catalogue_categories', 'catalogue_media', 'catalogue_variants']);
        for (const column of ['product_code', 'slug', 'category_id', 'product_type', 'created_by', 'updated_by']) {
          expect(tableColumns(fresh, 'products'), column).toContain(column);
        }
        expect(tableColumns(fresh, 'brands')).toContain('slug');
        expect(fresh.get<any>(`SELECT COUNT(*) AS n FROM erp_sequences WHERE sequence_key='product_code'`).n).toBe(1);
        // and a catalogue write works on that fresh database without any extra bootstrap
        const created = createProduct(fresh, { name: `Fraîchement ${suffix}`, source_platform: 'OTHER', currency: 'TND' }, { actor: { id: null, name: null } });
        expect(created.ok).toBe(true);
      } finally {
        fresh.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('slug uniqueness is case-insensitive in the database, not by convention', () => {
      // The API lowercases every slug, so a case variant can only come from another writer
      // (a script, a future import). The answer must still be a refusal — never two products
      // fighting for one address — so the partial unique index carries COLLATE NOCASE.
      for (const name of ['idx_products_slug_unique', 'idx_brands_slug_unique', 'idx_catalogue_categories_slug_unique', 'idx_products_product_code_unique']) {
        const row = db.get<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE type='index' AND name=?`, name);
        expect(String(row?.sql), name).toMatch(/COLLATE NOCASE/i);
      }
      const now = new Date().toISOString();
      const slug = `p21-case-${suffix}`;
      db.run(`INSERT INTO products (id,name,slug,status,source_platform,currency,created_at,updated_at) VALUES ('cat_case_z','Cas Z',?,'ACTIVE','OTHER','TND',?,?)`, slug, now, now);
      let refused = 'AUCUNE ERREUR — deux slugs identiques à la casse près coexistent';
      try {
        db.run(`INSERT INTO products (id,name,slug,status,source_platform,currency,created_at,updated_at) VALUES ('cat_case_w','Cas W',?,'ACTIVE','OTHER','TND',?,?)`, slug.toUpperCase(), now, now);
      } catch (error: any) { refused = String(error?.message || error); }
      db.run(`DELETE FROM products WHERE id IN ('cat_case_z','cat_case_w')`);
      expect(refused).toMatch(/UNIQUE constraint failed/i);
      expect(refused).toContain('products.slug');
    });

    test('repeated initialization is a no-op, not an error and not a duplicate', () => {
      const measure = () => ({
        tables: db.all<any>(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'catalogue_%'`).length,
        grants: Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM erp_role_permissions WHERE module_key='catalog'`)?.n ?? 0),
        sequences: Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM erp_sequences WHERE sequence_key IN ('product_code','variant_sku')`)?.n ?? 0),
        columns: tableColumns(db, 'products').length,
      });
      const before = measure();
      expect(() => { ensureCatalogueSchema(db); ensureCatalogueSchema(db); bootstrapCatalogue(db); }).not.toThrow();
      expect(measure()).toEqual(before);
      const dupes = db.all<any>(`SELECT role,module_key,action,resource_type,COUNT(*) AS n FROM erp_role_permissions WHERE module_key='catalog' GROUP BY role,module_key,action,resource_type HAVING n>1`);
      expect(dupes).toHaveLength(0);
      expect(before.grants).toBeGreaterThanOrEqual(50);
    });

    test('an existing database keeps its legacy rows untouched by the additions', () => {
      const legacy = db.get<any>(`SELECT id, name, category, brand_name, product_code, slug FROM products WHERE id='product_demo_01'`);
      expect(legacy).toBeTruthy();
      // the new columns are NULL on pre-catalogue rows: nothing was backfilled silently
      expect(legacy.product_code ?? null).toBe(null);
      expect(legacy.slug ?? null).toBe(null);
      expect(Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM products WHERE product_code IS NULL`)?.n ?? 0)).toBeGreaterThan(0);
      // which is exactly what the PARTIAL unique indexes allow (many NULLs, no collision)
      const indexes = db.all<any>(`PRAGMA index_list('products')`).map((row) => row.name);
      expect(indexes).toContain('idx_products_product_code_unique');
      expect(indexes).toContain('idx_products_slug_unique');
    });
  });

  describe('non-regression of what existed before P2.1', () => {
    test('the generic admin screen still writes products the same way', async () => {
      expect(db.get<any>(`SELECT id FROM products WHERE id='product_demo_01'`)).toBeTruthy();
      const response = await superAgent.put('/api/admin/products/product_demo_01').set('x-csrf-token', superCsrf)
        .send({ description: 'Description inchangée pour la non-régression' });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.data.description).toContain('non-régression');
    });

    test('the public storefront keeps its shape and its ACTIVE filter', async () => {
      const listed = await request(app).get('/api/public/products');
      expect(listed.status).toBe(200);
      expect(Array.isArray(listed.body.data)).toBe(true);
      const draft = await superAgent.post('/api/admin/catalogue/products').set('x-csrf-token', superCsrf)
        .send({ name: `Brouillon public ${suffix}`, source_platform: 'OTHER', currency: 'TND', status: 'DRAFT' });
      expect(draft.status).toBe(201);
      const after = await request(app).get('/api/public/products');
      expect(after.body.data.some((row: any) => row.id === draft.body.data.id)).toBe(false);
      db.run('DELETE FROM products WHERE id=?', draft.body.data.id);
    });

    test('the brands screen and the CRM tables were not diverted', async () => {
      const brands = await superAgent.get('/api/admin/brands');
      expect(brands.status).toBe(200);
      expect(brands.body.data.length).toBeGreaterThanOrEqual(1);
      const crmColumns = tableColumns(db, 'crm_extracted_products');
      expect(crmColumns).toContain('sku');
      expect(crmColumns).toContain('variant');
      expect(db.get<any>(`SELECT sql FROM sqlite_master WHERE name='order_items'`).sql).toContain('requested_size');
    });

    test('the readiness contract and the upload guard are untouched', async () => {
      expect((await request(app).get('/api/ready')).status).toBe(200);
      expect((await request(app).get('/uploads/invoices/x.pdf')).status).toBe(403);
    });
  });
});
