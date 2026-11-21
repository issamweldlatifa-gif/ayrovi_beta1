import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { expect, it } from 'vitest';
import { app, db } from '../src/server';
import { createAdminSession, setAdminCookie } from '../src/admin/auth';
import { QatafoDatabase } from '../src/db/database';
import { BLACK_FRIDAY_DEMO, BLACK_FRIDAY_DEMO_MIGRATION, BLACK_FRIDAY_KEY, readBlackFridaySettings, installBlackFridayCollections, readPublicBlackFriday } from '../src/catalogue/blackFriday';
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
  expect(block.collections.map((item: { id: string }) => item.id)).toEqual(['vans', 'streetwear', 'casual', 'beauty']);
  const links = block.collections.flatMap((item: { productIds: string[]; demo: boolean; endsAt: string; cover: string }) => {
    expect(item.demo).toBe(true);
    expect(Date.parse(item.endsAt)).toBeGreaterThan(Date.now());
    expect(fs.existsSync(path.join(process.cwd(), 'assets', item.cover))).toBe(true);
    return item.productIds;
  });
  expect(new Set(links)).toEqual(new Set(BLACK_FRIDAY_DEMO.map(([key]) => zalandoDemoProductId(key))));
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
  const update = { ...before, collections: [], title: 'Black Friday\nTest', productIds: [second, id], cover: '/media/special.jpg', featureCover: '/media/feature.jpg',
    backgroundColor: '#deaf99', surfaceColor: '#101010', landingTitle: 'Black Friday Démo', featureTitleFr: 'Offres du week-end', featureCtaFr: 'Voir la sélection' };
  const searched = await authorized(request(app).get(`${admin}/products`).query({ q: 'Vans' })).expect(200);
  expect(searched.body.data.some((item: { id: string }) => item.id === id)).toBe(true);
  try {
    await authorized(request(app).put(admin)).send({ ...update, productIds: [zalandoDemoProductId('zalando-p001')] }).expect(400);
    await authorized(request(app).put(admin)).send({ ...update, backgroundColor: 'transparent' }).expect(400);
    const selection = { id: 'test-edited', titleFr: 'Sélection', titleAr: 'مجموعة', cover: '', demo: true, endsAt: '', productIds: [id] };
    await authorized(request(app).put(admin)).send({ ...update, collections: [{ ...selection, productIds: [demoId(2)] }] }).expect(400);
    await authorized(request(app).put(admin)).send({ ...update, collections: [selection] }).expect(200);
    expect((await request(app).get(publicUrl)).body.data).toMatchObject({ collections: [selection], products: [{ id }] });
    await authorized(request(app).put(admin)).send(update).expect(200);
    expect((await request(app).get(publicUrl)).body.data).toMatchObject({ cover: '/media/special.jpg', featureCover: '/media/feature.jpg', backgroundColor: '#DEAF99', surfaceColor: '#101010',
      landingTitle: 'Black Friday Démo', featureCtaFr: 'Voir la sélection', products: [{ id: second }, { id }] });
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


it('limits inline price writes to pricing users and direct TND products, with canonical checkout and stale edit protection', async () => {
  const user = db.get('SELECT id FROM admin_users WHERE email=?', process.env.ADMIN_EMAIL);
  const login = createAdminSession(db, user, true);
  let cookie = '';
  setAdminCookie({ setHeader: (_name: string, value: string) => { cookie = value.split(';')[0]!; } } as any, login.token);
  const id = demoId(0);
  const url = `${admin}/products/${id}/price`;
  const row = db.get<{ final_price: number; compare_at_price: number; converted_price: number; updated_at: string }>('SELECT final_price,compare_at_price,converted_price,updated_at FROM products WHERE id=?', id)!;
  const patch = { price: 125.551, compareAtPrice: 150, expectedPrice: row.final_price, expectedCompareAtPrice: row.compare_at_price };
  const put = () => request(app).put(url).set('Cookie', cookie).set('x-csrf-token', login.csrfToken);
  await request(app).put(url).send(patch).expect(401);
  await request(app).put(url).set('Cookie', cookie).send(patch).expect(403);
  const editor = { email: 'bf-content-editor@test.zayrovi.com', password: 'TestCampaignPricing2026!' };
  await request(app).post('/api/admin/users').set('Cookie', cookie).set('x-csrf-token', login.csrfToken)
    .send({ ...editor, name: 'BF Content Editor', role: 'CONTENT_MANAGER' }).expect(201);
  const content = request.agent(app);
  const contentLogin = await content.post('/api/admin/auth/login').send(editor).expect(200);
  await content.put(url).set('x-csrf-token', contentLogin.body.data.csrfToken).send(patch).expect(403);
  await put().send({ ...patch, price: 151 }).expect(400);
  await put().send({ ...patch, price: 12.3456 }).expect(400);
  try {
    const result = await put().send(patch).expect(200);
    expect(result.body.data).toMatchObject({ price: 125.551, compareAtPrice: 150, discountPercent: 16 });
    await put().send(patch).expect(409);
    expect(db.get('SELECT converted_price FROM products WHERE id=?', id)).toEqual({ converted_price: row.converted_price });
    const detail = await request(app).get(`/api/public/products/${id}`).expect(200);
    expect(detail.body.data).toMatchObject({ finalPrice: 125.551, compareAtPrice: 150 });
    const live = await request(app).get(publicUrl).expect(200);
    expect(live.body.data.products.find((p: { id: string }) => p.id === id)).toMatchObject({ price: 125.551, compareAtPrice: 150 });
    const sessionId = 'bf-crm-direct-price';
    const variant = db.get<{ size: string; color: string }>("SELECT size,color FROM catalogue_variants WHERE product_id=? AND status='ACTIVE' LIMIT 1", id)!;
    addCatalogueLine(db, { sessionId, accountId: null, productId: id, now: new Date().toISOString(), quantity: 1,
      requestedSize: variant.size, requestedColor: variant.color, customerNote: '', expectedPrice: 125.551 });
    expect(db.getItems(sessionId, null)).toMatchObject([{ priceTND: 125.551 }]);
    db.run('UPDATE products SET original_price=1 WHERE id=?', id);
    await put().send({ ...patch, expectedPrice: patch.price, expectedCompareAtPrice: patch.compareAtPrice }).expect(400);
  } finally {
    db.run('UPDATE products SET final_price=?,compare_at_price=?,original_price=0,updated_at=? WHERE id=?', row.final_price, row.compare_at_price, row.updated_at, id);
  }
});

it('hides scheduled campaigns when ended without touching the actual catalogue prices', async () => {
  const before = readBlackFridaySettings(db);
  const id = demoId(0);
  const price = db.get('SELECT final_price,compare_at_price FROM products WHERE id=?', id);
  try {
    db.run('UPDATE settings SET setting_value=? WHERE setting_key=?', JSON.stringify({ ...before, endsAt: '2000-01-01T00:00:00.000Z' }), BLACK_FRIDAY_KEY);
    expect((await request(app).get(publicUrl).expect(200)).body.data).toBeNull();
    expect(db.get('SELECT final_price,compare_at_price FROM products WHERE id=?', id)).toEqual(price);
  } finally { db.run('UPDATE settings SET setting_value=? WHERE setting_key=?', JSON.stringify(before), BLACK_FRIDAY_KEY); }
});


it('uses fixed per-selection deadlines and cannot re-seed them over an existing campaign', () => {
  const before = readBlackFridaySettings(db);
  const vans = before.collections[0]!;
  const advanceTo = Date.parse(vans.endsAt);
  const live = readPublicBlackFriday(db, advanceTo)!;
  expect(live.collections.map(item => item.id)).not.toContain(vans.id);
  expect(live.products.some(offer => vans.productIds.includes(offer.id))).toBe(false);
  installBlackFridayCollections(db, new Date(advanceTo + 5000).toISOString());
  expect(readBlackFridaySettings(db).collections).toEqual(before.collections);
  expect(readPublicBlackFriday(db, Math.max(...before.collections.map(item => Date.parse(item.endsAt))))).toBeNull();
});
