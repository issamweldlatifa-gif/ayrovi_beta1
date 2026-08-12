import { afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db, scraper } from '../src/server';

const uniqueSession = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createCartItem = (title = 'Muchica Matching Set') => ({
  store: 'shein',
  externalId: `SH-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  url: 'https://www.shein.com/product-p-382460229.html',
  title,
  imageUrl: '/uploads/product.jpg',
  sourcePrice: 21.99,
  sourceCurrency: 'EUR',
  priceTND: 103.61,
  variant: 'Taille: M',
  quantity: 1,
});

describe('AYROVI platform', () => {
  const primarySession = uniqueSession('primary');
  const isolatedSession = uniqueSession('isolated');
  const quantitySession = uniqueSession('quantity');
  const repeatSession = uniqueSession('repeat');
  const superAdmin = request.agent(app);
  let adminCsrf = '';
  let persistedOrderId = '';
  let persistedCustomerId = '';
  let createdArrivalId = '';
  let createdProductId = '';
  let originalPricingVersion = 0;

  afterAll(() => {
    db.clearCart(primarySession);
    db.clearCart(isolatedSession);
    db.clearCart(quantitySession);
    db.clearCart(repeatSession);
  });

  test('URL cleaner extracts a valid link from pasted text', () => {
    const value = scraper.cleanPastedUrl(
      'Voir cet article : https://www.shein.com/product-p-382460229.html), merci',
    );
    expect(value).toBe('https://www.shein.com/product-p-382460229.html');
  });

  test('image extraction rejects a request without an image', async () => {
    const response = await request(app).post('/api/extract-image');
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('image extraction rejects non-image uploads', async () => {
    const response = await request(app)
      .post('/api/extract-image')
      .attach('image', Buffer.from('not-an-image'), {
        filename: 'payload.txt',
        contentType: 'text/plain',
      });
    expect(response.status).toBe(415);
    expect(response.body.success).toBe(false);
  });

  test('scraping blocks malformed and private service addresses', async () => {
    const malformed = await request(app).post('/api/scrape').send({ url: 'not-a-web-address' });
    expect(malformed.status).toBe(400);

    const privateAddress = await request(app).post('/api/scrape').send({ url: 'http://127.0.0.1:3000/' });
    expect(privateAddress.status).toBe(400);
    expect(privateAddress.body.success).toBe(false);
  });

  test('cart routes require a valid client session', async () => {
    const response = await request(app).get('/api/cart/items');
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('cart and checkout remain isolated between client sessions', async () => {
    const addResponse = await request(app)
      .post('/api/cart/items')
      .set('x-session-id', primarySession)
      .send(createCartItem());

    expect(addResponse.status).toBe(201);
    expect(addResponse.body.success).toBe(true);
    expect(addResponse.body.cartItem.priceTND).toBe(122.96);
    const itemId = addResponse.body.cartItem.id as string;

    const primaryCart = await request(app)
      .get('/api/cart/items')
      .set('x-session-id', primarySession);
    expect(primaryCart.status).toBe(200);
    expect(primaryCart.body.items).toHaveLength(1);

    const isolatedCart = await request(app)
      .get('/api/cart/items')
      .set('x-session-id', isolatedSession);
    expect(isolatedCart.status).toBe(200);
    expect(isolatedCart.body.items).toHaveLength(0);

    const unauthorizedUpdate = await request(app)
      .patch(`/api/cart/items/${itemId}`)
      .set('x-session-id', isolatedSession)
      .send({ quantity: 2 });
    expect(unauthorizedUpdate.status).toBe(404);

    const unauthorizedDelete = await request(app)
      .delete(`/api/cart/items/${itemId}`)
      .set('x-session-id', isolatedSession);
    expect(unauthorizedDelete.status).toBe(404);

    const emptyCheckout = await request(app)
      .post('/api/checkout')
      .set('x-session-id', isolatedSession)
      .send({
        name: 'Client Test',
        phone: '98123456',
        city: 'Tunis',
        address: 'Avenue Habib Bourguiba, Tunis',
        paymentMethod: 'cod',
      });
    expect(emptyCheckout.status).toBe(400);
    expect(emptyCheckout.body.error).toContain('panier est vide');

    const checkoutResponse = await request(app)
      .post('/api/checkout')
      .set('x-session-id', primarySession)
      .send({
        name: 'Client Test',
        phone: '98123456',
        city: 'Tunis',
        address: 'Avenue Habib Bourguiba, Tunis',
        paymentMethod: 'cod',
      });

    expect(checkoutResponse.status).toBe(200);
    expect(checkoutResponse.body.success).toBe(true);
    expect(checkoutResponse.body.orderNumber).toMatch(/^AYR-\d{6}$/);
    persistedOrderId = checkoutResponse.body.orderId;
    const order = db.get<any>('SELECT * FROM orders WHERE id=?', persistedOrderId);
    persistedCustomerId = order.customer_id;
    expect(order.pricing_snapshot).toContain('"version":1');
    expect(db.get<any>('SELECT COUNT(*) count FROM order_items WHERE order_id=?', persistedOrderId).count).toBe(1);
    expect(db.get<any>('SELECT status FROM payments WHERE order_id=?', persistedOrderId).status).toBe('PENDING');
    expect(db.get<any>('SELECT status FROM deliveries WHERE order_id=?', persistedOrderId).status).toBe('PENDING');
  });

  test('invalid cart quantities are rejected', async () => {
    const response = await request(app)
      .post('/api/cart/items')
      .set('x-session-id', primarySession)
      .send({ ...createCartItem('Invalid quantity item'), quantity: 100 });
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('duplicate additions cannot exceed the per-item quantity limit', async () => {
    const item = { ...createCartItem('Quantity limit item'), quantity: 99 };
    const firstResponse = await request(app)
      .post('/api/cart/items')
      .set('x-session-id', quantitySession)
      .send(item);
    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.totalTND).toBe(9429.68);
    const quantityCart = await request(app).get('/api/cart/items').set('x-session-id', quantitySession);
    expect(quantityCart.body.items[0].lineTotalTND).toBe(9429.68);
    expect(quantityCart.body.items[0].pricingVersion).toBe(1);

    const unavailablePayment = await request(app)
      .post('/api/checkout')
      .set('x-session-id', quantitySession)
      .send({ name: 'Client Test', phone: '98123457', city: 'Tunis', address: 'Tunis', paymentMethod: 'paypal' });
    expect(unavailablePayment.status).toBe(400);
    expect(unavailablePayment.body.error).toContain('paiement');

    const secondResponse = await request(app)
      .post('/api/cart/items')
      .set('x-session-id', quantitySession)
      .send({ ...item, quantity: 1 });
    expect(secondResponse.status).toBe(400);
    expect(secondResponse.body.error).toContain('99');
  });

  test('checkout reuses customers while preserving separate orders', async () => {
    const added = await request(app)
      .post('/api/cart/items')
      .set('x-session-id', repeatSession)
      .send(createCartItem('Second customer order'));
    expect(added.status).toBe(201);

    const checkout = await request(app)
      .post('/api/checkout')
      .set('x-session-id', repeatSession)
      .send({
        name: 'Client Test Updated',
        phone: '98123456',
        city: 'Ariana',
        address: 'Centre Ariana',
        paymentMethod: 'd17',
      });
    expect(checkout.status).toBe(200);
    expect(db.get<any>('SELECT COUNT(*) count FROM customers WHERE phone=?', '98123456').count).toBe(1);
    expect(db.get<any>('SELECT COUNT(*) count FROM orders WHERE customer_id=?', persistedCustomerId).count).toBe(2);
    expect(db.get<any>('SELECT payment_method FROM orders WHERE id=?', checkout.body.orderId).payment_method).toBe('D17');
  });

  test('public CMS and assistant APIs expose backend data without admin secrets', async () => {
    const home = await request(app).get('/api/public/home');
    expect(home.status).toBe(200);
    expect(home.body.success).toBe(true);
    expect(home.body.data.hero.length).toBeGreaterThan(0);
    expect(home.body.data.brands.length).toBeGreaterThan(0);
    expect(home.body.data.arrivals.length).toBeGreaterThan(0);
    expect(home.body.serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const context = await request(app).get('/api/public/assistant-context');
    expect(context.status).toBe(200);
    expect(context.body.data.pricing.rates.EUR).toBe(4);
    expect(context.body.data.facts.governorates).toHaveLength(24);
    expect(context.body.data.knowledge.length).toBeGreaterThan(0);
    expect(JSON.stringify(context.body)).not.toContain('password_hash');
    expect(JSON.stringify(context.body)).not.toContain('updated_by');

    const commerce = await request(app).get('/api/public/commerce-config');
    expect(commerce.status).toBe(200);
    expect(commerce.body.data.governorates).toHaveLength(24);
    expect(commerce.body.data.paymentMethods).toEqual(['COD', 'D17', 'FLOUCI']);
    expect(commerce.body.data.pricing.version).toBe(1);

    const preview = await request(app).post('/api/public/pricing/preview').send({ originalPrice: 21.99, currency: 'EUR', quantity: 2 });
    expect(preview.status).toBe(200);
    expect(preview.body.data.totalTND).toBe(214.99);
    expect(preview.body.data.pricingVersion).toBe(1);
  });

  test('admin routes reject unauthenticated requests and invalid credentials', async () => {
    const unauthorized = await request(app).get('/api/admin/dashboard');
    expect(unauthorized.status).toBe(401);
    const failedLogin = await request(app).post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'incorrect-password' });
    expect(failedLogin.status).toBe(401);
  });

  test('super admin login establishes an HttpOnly session and rotating CSRF token', async () => {
    const loginResponse = await superAdmin.post('/api/admin/auth/login').send({
      email: 'admin@ayrovi.tn',
      password: 'AyroviBeta2026!',
    });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(loginResponse.headers['set-cookie'][0]).toContain('SameSite=Strict');
    expect(loginResponse.body.data.user.permissions).toContain('pricing:write');
    adminCsrf = loginResponse.body.data.csrfToken;

    const identity = await superAdmin.get('/api/admin/auth/me');
    expect(identity.status).toBe(200);
    expect(identity.body.data.user.role).toBe('SUPER_ADMIN');
    expect(identity.body.data.user.permissions).toContain('pricing:write');
    expect(identity.body.data.csrfToken).not.toBe(adminCsrf);
    adminCsrf = identity.body.data.csrfToken;
  });

  test('admin mutations require a valid CSRF token', async () => {
    const response = await superAdmin.post('/api/admin/brands').send({
      name: 'Blocked Brand', category: 'FASHION', logo: '/blocked.jpg', active: true,
    });
    expect(response.status).toBe(403);
    expect(response.body.error).toContain('CSRF');
  });

  test('dashboard and pricing preview are backend-driven', async () => {
    const dashboard = await superAdmin.get('/api/admin/dashboard?days=30');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.metrics.orders).toBeGreaterThanOrEqual(2);
    expect(dashboard.body.data.metrics.customers).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(dashboard.body.data.statuses)).toBe(true);
    expect(Array.isArray(dashboard.body.data.sources)).toBe(true);

    const pricing = await superAdmin.get('/api/admin/pricing');
    expect(pricing.status).toBe(200);
    originalPricingVersion = pricing.body.data.version;
    const preview = await superAdmin
      .post('/api/admin/pricing/preview')
      .set('x-csrf-token', adminCsrf)
      .send({ originalPrice: 21.99, currency: 'EUR', quantity: 1, express: false });
    expect(preview.status).toBe(200);
    expect(preview.body.data.totalTND).toBe(122.96);
  });

  test('CMS CRUD validates, relates, publishes and safely archives content', async () => {
    const invalid = await superAdmin
      .post('/api/admin/promotions')
      .set('x-csrf-token', adminCsrf)
      .send({ name: 'Invalid dates', discount_type: 'FIXED', value: 4, starts_at: '2026-09-02T00:00:00Z', ends_at: '2026-09-01T00:00:00Z', status: 'ACTIVE' });
    expect(invalid.status).toBe(400);

    const malformedTimestamp = await superAdmin
      .post('/api/admin/promotions')
      .set('x-csrf-token', adminCsrf)
      .send({ name: 'Malformed timestamp', discount_type: 'FIXED', value: 4, starts_at: 'tomorrow', ends_at: '2026-09-03T00:00:00Z', status: 'ACTIVE' });
    expect(malformedTimestamp.status).toBe(400);
    expect(malformedTimestamp.body.error).toContain('Date invalide');

    const impossibleTimestamp = await superAdmin
      .post('/api/admin/arrivals')
      .set('x-csrf-token', adminCsrf)
      .send({ name: 'Impossible timestamp', type: 'STANDARD', expected_arrival_at: '2026-02-30T12:00:00Z', status: 'ACTIVE' });
    expect(impossibleTimestamp.status).toBe(400);
    expect(impossibleTimestamp.body.error).toContain('Date invalide');

    const arrival = await superAdmin
      .post('/api/admin/arrivals')
      .set('x-csrf-token', adminCsrf)
      .send({ name: 'ARRIVAGE TEST API', type: 'STANDARD', expected_arrival_at: '2027-01-15T12:00:00Z', description: 'Arrivage automatisé', main_image: '/uploads/test.jpg', secondary_images: [], badge: 'Test', status: 'ACTIVE' });
    expect(arrival.status).toBe(201);
    createdArrivalId = arrival.body.data.id;

    const product = await superAdmin
      .post('/api/admin/products')
      .set('x-csrf-token', adminCsrf)
      .send({ name: 'Produit test API', description: 'Tarification centralisée', image: '/uploads/test.jpg', additional_images: [], brand_name: 'AYROVI', category: 'Mode', source_url: 'https://www.shein.com/', source_platform: 'SHEIN', original_price: 21.99, currency: 'EUR', express_available: true, stock_status: 'AVAILABLE', status: 'ACTIVE', arrival_ids: [createdArrivalId] });
    expect(product.status).toBe(201);
    createdProductId = product.body.data.id;
    expect(product.body.data.final_price).toBe(122.96);
    expect(product.body.data.arrival_ids).toContain(createdArrivalId);

    const publicProducts = await request(app).get(`/api/public/products?arrivalId=${createdArrivalId}`);
    expect(publicProducts.status).toBe(200);
    expect(publicProducts.body.data.some((item: any) => item.id === createdProductId)).toBe(true);

    const archive = await superAdmin
      .delete(`/api/admin/arrivals/${createdArrivalId}`)
      .set('x-csrf-token', adminCsrf);
    expect(archive.status).toBe(200);
    expect(db.get<any>('SELECT status FROM arrivals WHERE id=?', createdArrivalId).status).toBe('ARCHIVED');
    expect(db.get<any>('SELECT COUNT(*) count FROM product_arrivals WHERE product_id=? AND arrival_id=?', createdProductId, createdArrivalId).count).toBe(1);
  });

  test('OMS updates order, payment and delivery histories atomically', async () => {
    const before = await superAdmin.get(`/api/admin/orders/${persistedOrderId}`);
    expect(before.status).toBe(200);
    expect(before.body.data.pricing_snapshot.version).toBe(originalPricingVersion);

    const status = await superAdmin
      .put(`/api/admin/orders/${persistedOrderId}/status`)
      .set('x-csrf-token', adminCsrf)
      .send({ status: 'CONFIRMED', note: 'Validation automatique' });
    expect(status.status).toBe(200);

    const payment = await superAdmin
      .put(`/api/admin/orders/${persistedOrderId}/payment`)
      .set('x-csrf-token', adminCsrf)
      .send({ status: 'PAID', reference: 'D17-TEST-001' });
    expect(payment.status).toBe(200);
    expect(payment.body.data.confirmed_by).toBeTruthy();

    const delivery = await superAdmin
      .put(`/api/admin/orders/${persistedOrderId}/delivery`)
      .set('x-csrf-token', adminCsrf)
      .send({ status: 'SHIPPED', carrier: 'Future Carrier', tracking_number: 'TRACK-001' });
    expect(delivery.status).toBe(200);

    const detail = await superAdmin.get(`/api/admin/orders/${persistedOrderId}`);
    expect(detail.body.data.status).toBe('CONFIRMED');
    expect(detail.body.data.payment.status).toBe('PAID');
    expect(detail.body.data.delivery.status).toBe('SHIPPED');
    expect(detail.body.data.history.some((entry: any) => entry.to_status === 'CONFIRMED')).toBe(true);
  });

  test('pricing changes are versioned without changing historical order snapshots', async () => {
    const update = await superAdmin
      .put('/api/admin/pricing')
      .set('x-csrf-token', adminCsrf)
      .send({ rateEUR: 4.2 });
    expect(update.status).toBe(200);
    expect(update.body.data.version).toBe(originalPricingVersion + 1);

    const historical = await superAdmin.get(`/api/admin/orders/${persistedOrderId}`);
    expect(historical.status).toBe(200);
    expect(historical.body.data.pricing_snapshot.version).toBe(originalPricingVersion);
    expect(historical.body.data.items[0].total_tnd).toBe(122.96);

    const newPreview = await superAdmin
      .post('/api/admin/pricing/preview')
      .set('x-csrf-token', adminCsrf)
      .send({ originalPrice: 21.99, currency: 'EUR', quantity: 1 });
    expect(newPreview.body.data.totalTND).toBe(127.36);
  });

  test('RBAC separates content, order, admin and super-admin capabilities', async () => {
    const users = [
      { name: 'Content User', email: 'content@test.ayrovi.tn', password: 'ContentSecure2026!', role: 'CONTENT_MANAGER' },
      { name: 'Order User', email: 'orders@test.ayrovi.tn', password: 'OrdersSecure2026!', role: 'ORDER_MANAGER' },
      { name: 'Admin User', email: 'admin-role@test.ayrovi.tn', password: 'AdminSecure2026!', role: 'ADMIN' },
    ];
    for (const user of users) {
      const created = await superAdmin.post('/api/admin/users').set('x-csrf-token', adminCsrf).send(user);
      expect(created.status).toBe(201);
    }

    const contentAgent = request.agent(app);
    const contentLogin = await contentAgent.post('/api/admin/auth/login').send({ email: users[0].email, password: users[0].password });
    expect((await contentAgent.get('/api/admin/products')).status).toBe(200);
    expect((await contentAgent.get('/api/admin/orders')).status).toBe(403);
    expect((await contentAgent.put('/api/admin/pricing').set('x-csrf-token', contentLogin.body.data.csrfToken).send({ rateEUR: 4 })).status).toBe(403);

    const orderAgent = request.agent(app);
    const orderLogin = await orderAgent.post('/api/admin/auth/login').send({ email: users[1].email, password: users[1].password });
    expect((await orderAgent.get('/api/admin/orders')).status).toBe(200);
    expect((await orderAgent.post('/api/admin/brands').set('x-csrf-token', orderLogin.body.data.csrfToken).send({ name: 'Forbidden', category: 'OTHER' })).status).toBe(403);

    const adminAgent = request.agent(app);
    const adminLogin = await adminAgent.post('/api/admin/auth/login').send({ email: users[2].email, password: users[2].password });
    expect((await adminAgent.put('/api/admin/settings/setting_delivery_delay').set('x-csrf-token', adminLogin.body.data.csrfToken).send({ value: '6 à 9 jours ouvrés' })).status).toBe(200);
    expect((await adminAgent.get('/api/admin/users')).status).toBe(403);
  });

  test('audit logs record actors, targets and old/new values', async () => {
    const audit = await superAdmin.get('/api/admin/audit-logs?pageSize=100');
    expect(audit.status).toBe(200);
    expect(audit.body.data.some((entry: any) => entry.action === 'CREATE' && entry.module === 'PRODUCTS' && entry.entity_id === createdProductId)).toBe(true);
    const pricingAudit = audit.body.data.find((entry: any) => entry.module === 'PRICING');
    expect(pricingAudit.user_name).toBe('AYROVI Admin');
    expect(pricingAudit.old_value.version).toBe(originalPricingVersion);
    expect(pricingAudit.new_value.version).toBe(originalPricingVersion + 1);
  });

  test('logout invalidates the admin session', async () => {
    const logoutResponse = await superAdmin.post('/api/admin/auth/logout').set('x-csrf-token', adminCsrf);
    expect(logoutResponse.status).toBe(200);
    expect((await superAdmin.get('/api/admin/dashboard')).status).toBe(401);
  });

  test('healthcheck reports the service as ready', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
