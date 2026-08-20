import { afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';

const shoesPatch = (rate: number) => ({
  id: 'fashion_shoes',
  label: 'Chaussures',
  keywords: ['sneakers', 'sneaker', 'boots', 'boot', 'shoes', 'shoe', 'chaussures', 'chaussure', 'baskets', 'basket'],
  customsRate: rate,
  tvaRate: 0.19,
  defaultWeightKg: 1.2,
  status: 'ALLOWED',
});

describe('Admin CIF desk', () => {
  const admin = request.agent(app);
  let csrf = '';

  afterAll(() => {
    db.setDepositPercent(20);
    db.updateCustomsCategories([shoesPatch(0.3)]);
  });

  test('super admin opens the desk with millime CIF and 20% deposit', async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;

    const desk = await admin.get('/api/admin/pricing');
    expect(desk.status).toBe(200);
    expect(desk.body.data.depositPercent).toBe(20);
    expect(desk.body.data.exchangeBufferPercent).toBe(3);
    expect(desk.body.data.freightPerKgTND).toBe(13);
    const shoes = desk.body.data.categories.find((row: any) => row.id === 'fashion_shoes');
    expect(shoes.customsRate).toBe(0.3);

    const preview = await admin.post('/api/admin/pricing/preview').set('x-csrf-token', csrf)
      .send({ originalPrice: 50, currency: 'EUR', quantity: 1, title: 'sneakers Nike Air Force 1', weightKg: 1.2 });
    expect(preview.status).toBe(200);
    expect(preview.body.data.categoryId).toBe('fashion_shoes');
    expect(preview.body.data.totalTND).toBe(381.415);
    expect(preview.body.data.depositPercent).toBe(20);
    expect(preview.body.data.depositTND).toBe(76.283);
  });

  test('unknown category ids are refused and do not mutate the matrix', async () => {
    const before = db.getCustomsCategories().find((row) => row.id === 'fashion_shoes')!.customsRate;
    const rejected = await admin.put('/api/admin/pricing').set('x-csrf-token', csrf).send({
      categories: [{ id: 'does_not_exist', label: 'Inconnu', keywords: ['hello'], customsRate: 0.1, tvaRate: 0.19, defaultWeightKg: 0.5, status: 'ALLOWED' }],
    });
    expect(rejected.status).toBe(400);
    expect(db.getCustomsCategories().find((row) => row.id === 'fashion_shoes')!.customsRate).toBe(before);
  });

  test('deposit 25% then shoes duty 28% apply to new quotes only', async () => {
    const now = new Date().toISOString();
    const accountId = `desk_account_${Date.now()}`;
    const sessionId = `desk-session-${Date.now()}`;
    db.run(`INSERT INTO customer_accounts (id,display_name,email,email_verified_at,status,created_at,updated_at)
      VALUES (?,'Desk Client',? ,?,'ACTIVE',?,?)`, accountId, `desk-${Date.now()}@ayrovi.test`, now, now, now);
    db.addItem(sessionId, {
      store: 'shein', url: 'https://www.shein.com/sneakers-p-1.html', title: 'sneakers Nike Air Force 1',
      imageUrl: '/uploads/product.jpg', sourcePrice: 50, sourceCurrency: 'EUR', priceTND: 381.415, quantity: 1,
    }, accountId);
    const order = db.createOrderFromCart(sessionId, {
      name: 'Desk Client', email: 'desk@ayrovi.test', phone: '98111000', governorate: 'Tunis', address: 'Tunis',
      paymentMethod: 'BANK_TRANSFER', latitude: null, longitude: null, termsAcceptedAt: now, locale: 'fr-TN',
    }, accountId);
    const frozenTotal = db.get<any>('SELECT total_tnd FROM orders WHERE id=?', order.orderId).total_tnd;
    const frozenDeposit = db.get<any>('SELECT deposit_percent,deposit_amount_tnd FROM orders WHERE id=?', order.orderId);

    const deposit = await admin.put('/api/admin/pricing').set('x-csrf-token', csrf).send({ depositPercent: 25 });
    expect(deposit.status).toBe(200);
    expect(deposit.body.data.depositPercent).toBe(25);

    const duty = await admin.put('/api/admin/pricing').set('x-csrf-token', csrf).send({ categories: [shoesPatch(0.28)] });
    expect(duty.status).toBe(200);
    expect(duty.body.data.categories.find((row: any) => row.id === 'fashion_shoes').customsRate).toBe(0.28);

    const preview = await admin.post('/api/admin/pricing/preview').set('x-csrf-token', csrf)
      .send({ originalPrice: 50, currency: 'EUR', quantity: 1, title: 'sneakers Nike', weightKg: 1.2 });
    expect(preview.status).toBe(200);
    expect(preview.body.data.depositPercent).toBe(25);
    expect(preview.body.data.depositTND).toBe(Math.round(preview.body.data.totalTND * 25 * 10) / 1000);
    expect(preview.body.data.totalTND).not.toBe(381.415);

    const historical = await admin.get(`/api/admin/orders/${order.orderId}`);
    expect(historical.status).toBe(200);
    expect(historical.body.data.total_tnd).toBe(frozenTotal);
    expect(historical.body.data.deposit_percent).toBe(frozenDeposit.deposit_percent);
    expect(historical.body.data.deposit_amount_tnd).toBe(frozenDeposit.deposit_amount_tnd);
    expect(historical.body.data.pricing_snapshot.version).toBeDefined();

    db.setDepositPercent(20);
    db.updateCustomsCategories([shoesPatch(0.3)]);
    expect(db.getDepositPercent()).toBe(20);
    expect(db.getCustomsCategories().find((row) => row.id === 'fashion_shoes')!.customsRate).toBe(0.3);
  });

  test('content manager cannot write the desk', async () => {
    const created = await admin.post('/api/admin/users').set('x-csrf-token', csrf).send({
      name: 'Content Desk', email: `content-desk-${Date.now()}@test.ayrovi.tn`, password: 'ContentSecure2026!', role: 'CONTENT_MANAGER',
    });
    expect(created.status).toBe(201);
    const content = request.agent(app);
    const login = await content.post('/api/admin/auth/login').send({ email: created.body.data.email, password: 'ContentSecure2026!' });
    expect(login.status).toBe(200);
    const forbidden = await content.put('/api/admin/pricing').set('x-csrf-token', login.body.data.csrfToken)
      .send({ depositPercent: 40, categories: [shoesPatch(0.5)] });
    expect(forbidden.status).toBe(403);
    expect(db.getDepositPercent()).toBe(20);
    expect(db.getCustomsCategories().find((row) => row.id === 'fashion_shoes')!.customsRate).toBe(0.3);
  });
});
