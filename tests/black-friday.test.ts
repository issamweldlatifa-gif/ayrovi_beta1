import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { expect, it } from 'vitest';
import { app, db } from '../src/server';
import { createAdminSession, setAdminCookie } from '../src/admin/auth';
import { QatafoDatabase } from '../src/db/database';
import { BLACK_FRIDAY_DEMO, BLACK_FRIDAY_DEMO_MIGRATION, BLACK_FRIDAY_KEY, readBlackFridaySettings } from '../src/catalogue/blackFriday';
import { demoTnd, ZALANDO_DEMO, zalandoDemoProductId } from '../src/catalogue/installZalandoDemoCatalogue';
import { addCatalogueLine } from '../src/catalogue/cartAdd';
import { DEFAULT_BLACK_FRIDAY, normalizeBlackFriday } from '../shared/blackFriday';

const admin = '/api/admin/home-black-friday';
const publicUrl = '/api/public/home-black-friday';
const demoId = (index: number) => zalandoDemoProductId(BLACK_FRIDAY_DEMO[index]![0]);

it('publishes nine real demo discounts from the catalogue in authored order', async () => {
  const response = await request(app).get(publicUrl).expect(200).expect('Cache-Control', 'no-store');
  const block = response.body.data;
  expect(block.maxDiscount).toBe(30);
  expect(block.cover).toBe('/media/catalogue/zalando-demo-v1/p016-2.jpg');
  expect(block.products.map((p: { id: string }) => p.id)).toEqual(BLACK_FRIDAY_DEMO.map(([key]) => zalandoDemoProductId(key)));
  for (const [i, [key, percent]] of BLACK_FRIDAY_DEMO.entries()) {
    const fixture = ZALANDO_DEMO.products.find(row => row.key === key)!;
    const product = block.products[i];
    expect(product).toMatchObject({ image: fixture.images[0], compareAtPrice: demoTnd(fixture.priceEurCents), discountPercent: percent });
    expect(product.price).toBeLessThan(product.compareAtPrice);
  }
  const product = block.products.find((item: { id: string }) => item.id.endsWith('p002'));
  const detail = await request(app).get(`/api/public/products/${product.id}`).expect(200);
  expect(detail.body.data).toMatchObject({ finalPrice: product.price, compareAtPrice: product.compareAtPrice });
  const sessionId = 'black-friday-canonical-cart';
  addCatalogueLine(db, { sessionId, accountId: null, productId: product.id, now: new Date().toISOString(), quantity: 1,
    requestedSize: '', requestedColor: '', customerNote: '', expectedPrice: product.price });
  expect(db.getItems(sessionId, null)).toMatchObject([{ priceTND: product.price }]);
});

it('secures CRM writes, rejects ineligible products and filters later stock/price changes', async () => {
  const before = readBlackFridaySettings(db);
  const user = db.get('SELECT id FROM admin_users WHERE email=?', process.env.ADMIN_EMAIL);
  const session = createAdminSession(db, user, true);
  let cookie = '';
  setAdminCookie({ setHeader: (_name: string, value: string) => { cookie = value.split(';')[0]!; } } as any, session.token);
  const authorized = (req: request.Test) => req.set('Cookie', cookie).set('x-csrf-token', session.csrfToken);
  await request(app).put(admin).send(before).expect(401);
  const id = demoId(0), second = demoId(1);
  const update = { ...before, title: 'Black Friday\nTest', productIds: [second, id], cover: '/media/special.jpg' };
  const searched = await authorized(request(app).get(`${admin}/products`).query({ q: 'Vans' })).expect(200);
  expect(searched.body.data.some((item: { id: string }) => item.id === id)).toBe(true);
  try {
    await authorized(request(app).put(admin)).send({ ...update, productIds: [zalandoDemoProductId('zalando-p001')] }).expect(400);
    await authorized(request(app).put(admin)).send(update).expect(200);
    expect((await request(app).get(publicUrl)).body.data).toMatchObject({ cover: '/media/special.jpg', products: [{ id: second }, { id }] });
    db.run("UPDATE products SET stock_status='OUT_OF_STOCK' WHERE id=?", id);
    expect((await request(app).get(publicUrl)).body.data.products.map((item: { id: string }) => item.id)).toEqual([second]);
    await authorized(request(app).put(admin)).send({ ...update, enabled: false }).expect(200);
    expect((await request(app).get(publicUrl)).body.data).toBeNull();
  } finally {
    db.run("UPDATE products SET stock_status='AVAILABLE' WHERE id=?", id);
    db.run('UPDATE settings SET setting_value=? WHERE setting_key=?', JSON.stringify(before), BLACK_FRIDAY_KEY);
  }
  expect(normalizeBlackFriday({ ...DEFAULT_BLACK_FRIDAY, cover: '/media/%2e%2e/private.jpg' })).toBeNull();
});

it('preserves edited prices and creates a backup on upgrade, without reapplying after reopen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'black-friday-upgrade-'));
  const file = path.join(dir, 'test.sqlite');
  let store = new QatafoDatabase(file);
  const id = demoId(0), second = demoId(1);
  try {
    store.run('DELETE FROM settings WHERE setting_key=?', BLACK_FRIDAY_KEY);
    store.run('DELETE FROM applied_data_migrations WHERE key=?', BLACK_FRIDAY_DEMO_MIGRATION);
    store.run('UPDATE products SET final_price=270.001, compare_at_price=NULL WHERE id=?', id);
    store.run('UPDATE products SET final_price=converted_price, compare_at_price=NULL WHERE id=?', second);
    store.close(); store = new QatafoDatabase(file);
    expect(store.get('SELECT final_price,compare_at_price FROM products WHERE id=?', id)).toEqual({ final_price: 270.001, compare_at_price: null });
    const price = store.get<{ final_price: number; compare_at_price: number }>('SELECT final_price, compare_at_price FROM products WHERE id=?', second)!;
    expect(price.final_price).toBeLessThan(price.compare_at_price);
    expect(fs.readdirSync(path.join(dir, 'backups')).filter(name => name.startsWith('pre-black-friday-demo-'))).toHaveLength(1);
    store.run('UPDATE products SET final_price=99 WHERE id=?', second);
    store.close(); store = new QatafoDatabase(file);
    expect(store.get('SELECT final_price FROM products WHERE id=?', second)).toEqual({ final_price: 99 });
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
