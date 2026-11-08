import { expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { readPublicProducts, publicProductQuery } from '../src/catalogue/publicProducts';
import { ensureCatalogueSchema } from '../src/catalogue/bootstrap';
function legacy(scope: 'catalog' | 'home', limit: number, arrivalId = '') {
  return db.all(`SELECT p.*,GROUP_CONCAT(pa.arrival_id) arrival_ids FROM products p
    LEFT JOIN product_arrivals pa ON pa.product_id=p.id WHERE p.status='ACTIVE'
    ${scope === 'catalog' ? "AND p.visibility='CATALOG'" : ''}
    ${arrivalId ? 'AND EXISTS(SELECT 1 FROM product_arrivals f WHERE f.product_id=p.id AND f.arrival_id=?)' : ''}
    GROUP BY p.id ORDER BY p.updated_at DESC,p.id ASC LIMIT ?`, ...(arrivalId ? [arrivalId] : []), limit);
}
it('preserves legacy rows, prices, visibility, ties and every arrival when filtering one arrival', async () => {
  db.run('SAVEPOINT product_read_fixture');
  try {
    for (const id of ['read_arrival_a', 'read_arrival_b']) db.run(`INSERT INTO arrivals(id,name,type,status,expected_arrival_at,created_at,updated_at)
      VALUES (?,?,'STANDARD','ACTIVE','2026-01-01','2026-01-01','2026-01-01')`, id, id);
    for (let i = 0; i < 90; i++) db.run(`INSERT INTO products(id,name,status,visibility,final_price,created_at,updated_at)
      VALUES (?, 'Fixture', ?, ?, 137.55,'2026-01-01',?)`, `product_read_${String(i).padStart(3,'0')}`,
      i % 9 === 0 ? 'DRAFT' : 'ACTIVE', i % 5 === 0 ? 'CONTENT' : 'CATALOG', i % 2 ? '2026-11-04' : '2026-11-03');
    for (const id of ['read_arrival_b','read_arrival_a']) db.run('INSERT INTO product_arrivals(product_id,arrival_id) VALUES (?,?)', 'product_read_001', id);
    for (const scope of ['catalog','home'] as const) for (const limit of [1,12,50]) for (const arrivalId of ['', 'read_arrival_a', 'missing', "x' OR 1=1--"]) {
      expect(readPublicProducts(db, { scope, limit, arrivalId })).toEqual(legacy(scope, limit, arrivalId));
    }
    const filtered = readPublicProducts(db, { scope: 'catalog', limit: 12, arrivalId: 'read_arrival_a' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].arrival_ids).toBe('read_arrival_a,read_arrival_b');
    expect(filtered[0].final_price).toBe(137.55);
    const response = await request(app).get('/api/public/products').query({ arrivalId: 'read_arrival_a', limit: 50 });
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ id: 'product_read_001', finalPrice: 137.55,
      visibility: 'CATALOG', arrivalIds: ['read_arrival_a','read_arrival_b'] });
  } finally { db.run('ROLLBACK TO product_read_fixture'); db.run('RELEASE product_read_fixture'); }
});
it('uses ordered product indexes without full-result temporary grouping/sorting', () => {
  for (const scope of ['catalog','home'] as const) {
    const query = publicProductQuery({ scope, limit: 12 });
    const plan = db.all<{ detail: string }>('EXPLAIN QUERY PLAN '+query.sql, ...query.params).map(r => r.detail).join('\n');
    expect(plan).toContain(scope === 'catalog' ? 'idx_products_public_catalog' : 'idx_products_public_home');
    expect(plan).not.toContain('USE TEMP B-TREE');
  }
});
it('keeps product HTTP envelopes and list limits, including home product mapping', async () => {
  const products = await request(app).get('/api/public/products?limit=1');
  expect(products.status).toBe(200); expect(products.body.success).toBe(true);
  expect(products.body.data.length).toBeLessThanOrEqual(1);
  const home = await request(app).get('/api/public/home');
  expect(home.status).toBe(200); expect(Array.isArray(home.body.data.products)).toBe(true);
  expect(home.body.data.products.length).toBeLessThanOrEqual(12);
});
it('reinstalls the additive indexes on an existing schema without changing products', () => {
  db.run('SAVEPOINT product_index_fixture');
  try {
    const before = db.all('SELECT * FROM products ORDER BY id');
    db.run('DROP INDEX idx_products_public_catalog'); db.run('DROP INDEX idx_products_public_home');
    ensureCatalogueSchema(db); ensureCatalogueSchema(db);
    expect(db.all('SELECT * FROM products ORDER BY id')).toEqual(before);
    expect(db.all("SELECT name FROM sqlite_schema WHERE name IN ('idx_products_public_catalog','idx_products_public_home')")).toHaveLength(2);
  } finally { db.run('ROLLBACK TO product_index_fixture'); db.run('RELEASE product_index_fixture'); }
});

it('rejects invalid internal read options before executing SQL', () => {
  for (const limit of [0,51,1.5,NaN,Infinity]) expect(() => publicProductQuery({ scope: 'catalog', limit })).toThrow(RangeError);
  expect(() => publicProductQuery({ scope: 'unknown' as 'catalog', limit: 12 })).toThrow(RangeError);
});
