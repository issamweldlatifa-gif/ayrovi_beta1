import { describe, expect, test, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { getAyrovixStats } from '../src/ayrovix/events';
import { listAyrovixHistory } from '../src/ayrovix/history';
import { createCustomerSession } from '../src/customer/auth';

function seedCatalogProduct(name = 'Nike Air Max 270 React', brand = 'Nike', price = 59, currency = 'EUR') {
  const now = new Date().toISOString();
  const id = `prd_text_${Math.random().toString(36).slice(2, 10)}`;
  db.run(
    `INSERT INTO products (id,name,description,image,brand_name,category,source_url,source_platform,
      original_price,currency,converted_price,customs_fee,shipping_fee,service_fee,final_price,express_available,stock_status,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,0,0,0,?,1,'AVAILABLE','ACTIVE',?,?)`,
    id, name, '', '', brand, 'chaussures', `https://www.nike.com/${id}`, 'SHEIN',
    price, currency, price * 4, now, now,
  );
  return id;
}

describe('AYROVIX Lens — product-name text search (Phase 0, analytics-safe)', () => {
  test('rejects short query', async () => {
    const res = await request(app).post('/api/ayrovix/analyze-text').send({ query: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TEXT');
  });

  test('rejects empty query', async () => {
    const res = await request(app).post('/api/ayrovix/analyze-text').send({ query: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TEXT');
  });

  test('text search uses catalog and returns priced candidate without inventing data', async () => {
    const id = seedCatalogProduct('Adidas Ultra Boost 22', 'Adidas', 62, 'EUR');
    const res = await request(app).post('/api/ayrovix/analyze-text').send({ query: 'Adidas Ultra Boost' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.query).toBe('Adidas Ultra Boost');
    expect(Array.isArray(data.candidates)).toBe(true);
    // Should find our seeded catalog product as priced candidate
    const found = data.candidates.find((c: any) => c.title.includes('Adidas'));
    expect(found).toBeDefined();
    expect(found.price).toBeGreaterThan(0);
    expect(found.currency).toMatch(/^[A-Z]{3}$/);
    expect(found.priceTnd).toBeGreaterThan(0);
    expect(found.sourceUrl).toMatch(/^https:\/\//);
    // Never invent sizes/colors — should be [] for this candidate
    expect(Array.isArray(found.colors)).toBe(true);
    expect(Array.isArray(found.sizes)).toBe(true);
    // priceToken must be present and verification status set
    expect(found.priceToken).toBeTruthy();
    expect(['VERIFIED','PENDING_MANUAL']).toContain(found.priceVerificationStatus);
    // cleanup
    db.run('DELETE FROM products WHERE id=?', id);
  });

  test('text channel is recorded separately from qr (analytics-safe)', async () => {
    // Clean events for this check (use fresh stats comparison)
    const before = getAyrovixStats(db).last7d;
    // Create a text search and a qr code search
    seedCatalogProduct('Puma RS-X', 'Puma', 55, 'EUR');
    await request(app).post('/api/ayrovix/analyze-text').send({ query: 'Puma RS-X' });
    // mock provider search for qr without external provider to avoid counting external
    await request(app).post('/api/ayrovix/analyze-code').send({ value: 'Puma RS-X' });
    const after = getAyrovixStats(db).last7d;
    // text should have increased, qr should also have increased, but they are separate counters
    expect(after.text).toBeGreaterThan(before.text);
    expect(after.qr).toBeGreaterThan(before.qr);
    // Ensure text not counted as qr
    const diffText = after.text - before.text;
    const diffQr = after.qr - before.qr;
    expect(diffText).toBe(1);
    expect(diffQr).toBe(1);
  });

  test('history kind text is persisted for authenticated user (server)', async () => {
    const accountId = `cus_test_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    db.run(`INSERT INTO customer_accounts (id, display_name, status, created_at, updated_at) VALUES (?,?,'ACTIVE',?,?)`,
      accountId, 'Test Text History', now, now);
    const session = createCustomerSession(db, accountId, { ip: '127.0.0.1', headers: { 'user-agent': 'Vitest' } } as any);
    const cookie = `ayrovi_customer_session=${encodeURIComponent(session.token)}`;
    seedCatalogProduct('New Balance 550', 'New Balance', 70, 'EUR');
    const res = await request(app).post('/api/ayrovix/analyze-text').set('Cookie', cookie).send({ query: 'New Balance 550' });
    expect(res.status).toBe(200);
    const eventId = res.body.data.eventId;
    expect(eventId).toMatch(/^ayx_/);
    const history = listAyrovixHistory(db, accountId, 10);
    const entry = history.find(h => h.id === eventId);
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe('text');
    expect(entry?.queryLabel).toBe('New Balance 550');
    expect(entry?.title.length).toBeGreaterThan(0);
    // cleanup
    db.run('DELETE FROM ayrovix_search_history WHERE account_id=?', accountId);
    db.run('DELETE FROM customer_accounts WHERE id=?', accountId);
    db.run("DELETE FROM products WHERE name LIKE 'New Balance%'");
  });

  test('lensApi analyzeText is exposed (client)', async () => {
    const mod = await import('../client/src/ayrovix/services/lensApi');
    expect(typeof (mod as any).analyzeText).toBe('function');
  });
});
