import { afterAll, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { app, db, scraper } from '../src/server';
import { createCustomerSession, hashToken } from '../src/customer/auth';
import { createAyrovixPriceToken } from '../src/ayrovix/priceQuote';

const uniqueSession = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const checkoutDefaults = { email: 'google.merge@ayrovi.test', termsAccepted: true, locale: 'fr-TN' };

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
  const customerAgent = request.agent(app);
  const secondCustomerAgent = request.agent(app);
  let adminCsrf = '';
  let customerCsrf = '';
  let secondCustomerCsrf = '';
  let primaryAccountId = '';
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

  const insertHistoricalOrder = (suffix: string, phone: string) => {
    const now = new Date().toISOString();
    const customerId = `historical_customer_${suffix}`;
    const orderId = `historical_order_${suffix}`;
    db.run(`INSERT INTO customers (id,name,phone,governorate,address,registered_at,status,updated_at)
      VALUES (?,?,?,'Tunis','Ancienne adresse',?,'ACTIVE',?)`, customerId, `Client historique ${suffix}`, phone, now, now);
    db.run(`INSERT INTO orders
      (id,order_number,customer_id,account_id,source,status,payment_status,payment_method,subtotal_tnd,customs_tnd,shipping_tnd,service_tnd,express_tnd,discount_tnd,total_tnd,pricing_snapshot,governorate,address,phone,notes,created_at,updated_at)
      VALUES (?,?,?,NULL,'OTHER','DELIVERED','PAID','COD',100,0,7,10,0,0,117,?,'Tunis','Ancienne adresse',?,'',?,?)`,
    orderId, `AYR-81${suffix.padStart(4, '0')}`, customerId, JSON.stringify({ version: 1 }), phone, now, now);
    return orderId;
  };

  const otpLogin = async (agent: any, phone: string, cartSessionId?: string, checkInvalidCode = false) => {
    const requested = await agent.post('/api/customer/auth/otp/request').send({ phone });
    expect(requested.status).toBe(201);
    expect(requested.body.data.developmentCode).toMatch(/^\d{6}$/);
    if (checkInvalidCode) {
      const rejected = await agent.post('/api/customer/auth/otp/verify').send({
        challengeId: requested.body.data.challengeId, code: '000000', cartSessionId,
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body.code).toBe('OTP_INVALID');
    }
    const verified = await agent.post('/api/customer/auth/otp/verify').send({
      challengeId: requested.body.data.challengeId,
      code: requested.body.data.developmentCode,
      cartSessionId,
    });
    expect(verified.status).toBe(200);
    expect(verified.headers['set-cookie']?.[0]).toContain('ayrovi_customer_session=');
    expect(verified.headers['set-cookie']?.[0]).toContain('HttpOnly');
    return verified.body.data;
  };

  test('customer OTP activates isolated accounts and links only verified historical orders', async () => {
    const primaryHistoricalOrder = insertHistoricalOrder('1', '98123456');
    const otherHistoricalOrder = insertHistoricalOrder('2', '97123456');

    expect((await request(app).get('/api/customer/account/orders')).status).toBe(401);
    const primaryLogin = await otpLogin(customerAgent, '98 123 456', primarySession, true);
    customerCsrf = primaryLogin.csrfToken;
    primaryAccountId = primaryLogin.account.id;
    expect(primaryLogin.account.phone).toBe('+21698123456');
    expect(primaryLogin.account.phoneVerified).toBe(true);
    expect(primaryLogin.linkedHistoricalOrders).toBe(1);

    const primaryOrders = await customerAgent.get('/api/customer/account/orders');
    expect(primaryOrders.status).toBe(200);
    expect(primaryOrders.body.data.map((order: any) => order.id)).toContain(primaryHistoricalOrder);
    expect(primaryOrders.body.data.map((order: any) => order.id)).not.toContain(otherHistoricalOrder);
    expect((await customerAgent.get(`/api/customer/account/orders/${otherHistoricalOrder}`)).status).toBe(404);
    expect(db.get<any>('SELECT account_id FROM orders WHERE id=?', otherHistoricalOrder).account_id).toBeNull();

    const secondLogin = await otpLogin(secondCustomerAgent, '97123456');
    secondCustomerCsrf = secondLogin.csrfToken;
    expect(secondLogin.account.id).not.toBe(primaryAccountId);
    expect(secondLogin.linkedHistoricalOrders).toBe(1);
    expect((await secondCustomerAgent.get(`/api/customer/account/orders/${primaryHistoricalOrder}`)).status).toBe(404);
    expect(db.get<any>('SELECT account_id FROM orders WHERE id=?', primaryHistoricalOrder).account_id).toBe(primaryAccountId);
  });

  test('Google OAuth state is bound to the initiating browser', async () => {
    const previous = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callback: process.env.GOOGLE_CALLBACK_URL,
    };
    process.env.GOOGLE_CLIENT_ID = 'test-google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
    process.env.GOOGLE_CALLBACK_URL = 'https://ayrovi.example/api/customer/auth/google/callback';
    try {
      const browser = request.agent(app);
      const started = await browser.get('/api/customer/auth/google/start?returnTo=/compte');
      expect(started.status).toBe(302);
      expect(started.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
      expect(started.headers['set-cookie']?.[0]).toContain('ayrovi_customer_oauth=');
      expect(started.headers['set-cookie']?.[0]).toContain('HttpOnly');
      const state = new URL(started.headers.location).searchParams.get('state');
      expect(state).toBeTruthy();

      const foreignBrowser = await request(app)
        .get('/api/customer/auth/google/callback')
        .query({ state, code: 'code-that-must-not-be-exchanged' });
      expect(foreignBrowser.status).toBe(302);
      expect(foreignBrowser.headers.location).toBe('/?customerAuth=error');
      expect(foreignBrowser.headers['set-cookie']?.[0]).toContain('Max-Age=0');
      expect(db.get<any>('SELECT id FROM customer_oauth_states WHERE id=?', hashToken(state!))).toBeTruthy();
    } finally {
      if (previous.clientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = previous.clientId;
      if (previous.clientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = previous.clientSecret;
      if (previous.callback === undefined) delete process.env.GOOGLE_CALLBACK_URL;
      else process.env.GOOGLE_CALLBACK_URL = previous.callback;
    }
  });

  test('Google OAuth safely merges an explicitly linked account and rejects unverified email pre-hijacking', async () => {
    const previous = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callback: process.env.GOOGLE_CALLBACK_URL,
    };
    process.env.GOOGLE_CLIENT_ID = 'test-google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
    process.env.GOOGLE_CALLBACK_URL = 'https://ayrovi.example/api/customer/auth/google/callback';
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const mockGoogle = (profile: Record<string, unknown>) => {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'google-access-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
        .mockResolvedValueOnce(new Response(JSON.stringify(profile), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    try {
      const now = new Date().toISOString();
      const googleSourceId = `google_source_${Date.now()}`;
      db.run(`INSERT INTO customer_accounts (id,display_name,email,email_verified_at,status,created_at,updated_at)
        VALUES (?,'Compte Google','google.merge@ayrovi.test',?,'ACTIVE',?,?)`, googleSourceId, now, now, now);
      db.run(`INSERT INTO customer_auth_identities (id,account_id,provider,provider_subject,created_at)
        VALUES (?,?, 'GOOGLE','google-merge-subject',?)`, `identity_${Date.now()}`, googleSourceId, now);

      const startedLink = await customerAgent.get('/api/customer/auth/google/start?returnTo=/compte');
      const linkState = new URL(startedLink.headers.location).searchParams.get('state');
      mockGoogle({ sub: 'google-merge-subject', email: 'google.merge@ayrovi.test', email_verified: true, name: 'Compte Google', picture: 'https://example.com/avatar.jpg' });
      const linked = await customerAgent.get('/api/customer/auth/google/callback').query({ state: linkState, code: 'valid-link-code' });
      expect(linked.status).toBe(302);
      expect(linked.headers.location).toBe('/compte?customerAuth=success');
      expect(linked.headers['set-cookie']).toEqual(expect.arrayContaining([
        expect.stringContaining('ayrovi_customer_oauth='),
        expect.stringContaining('ayrovi_customer_session='),
      ]));
      expect(db.get<any>('SELECT id FROM customer_accounts WHERE id=?', googleSourceId)).toBeUndefined();
      expect(db.get<any>(`SELECT account_id FROM customer_auth_identities WHERE provider='GOOGLE' AND provider_subject='google-merge-subject'`).account_id).toBe(primaryAccountId);
      const mergedAccount = db.get<any>('SELECT phone,email,phone_verified_at,email_verified_at FROM customer_accounts WHERE id=?', primaryAccountId);
      expect(mergedAccount.phone).toBe('+21698123456');
      expect(mergedAccount.phone_verified_at).toBeTruthy();
      expect(mergedAccount.email).toBe('google.merge@ayrovi.test');
      expect(mergedAccount.email_verified_at).toBeTruthy();
      const refreshedPrimary = await customerAgent.get('/api/customer/auth/me');
      customerCsrf = refreshedPrimary.body.data.csrfToken;

      const squatterId = `email_squatter_${Date.now()}`;
      db.run(`INSERT INTO customer_accounts (id,display_name,email,status,created_at,updated_at)
        VALUES (?,'Compte non vérifié','victim.google@ayrovi.test','ACTIVE',?,?)`, squatterId, now, now);
      const victimBrowser = request.agent(app);
      const startedVictim = await victimBrowser.get('/api/customer/auth/google/start?returnTo=/compte');
      const victimState = new URL(startedVictim.headers.location).searchParams.get('state');
      mockGoogle({ sub: 'verified-victim-subject', email: 'victim.google@ayrovi.test', email_verified: true, name: 'Client vérifié', picture: '' });
      const victimCallback = await victimBrowser.get('/api/customer/auth/google/callback').query({ state: victimState, code: 'valid-victim-code' });
      expect(victimCallback.status).toBe(302);
      expect(victimCallback.headers.location).toBe('/compte?customerAuth=success');
      const victimIdentity = await victimBrowser.get('/api/customer/auth/me');
      expect(victimIdentity.status).toBe(200);
      expect(victimIdentity.body.data.account.id).not.toBe(squatterId);
      expect(victimIdentity.body.data.account.email).toBe('victim.google@ayrovi.test');
      expect(victimIdentity.body.data.account.emailVerified).toBe(true);
      expect(db.get<any>('SELECT email FROM customer_accounts WHERE id=?', squatterId).email).toBeNull();
    } finally {
      fetchMock.mockRestore();
      if (previous.clientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = previous.clientId;
      if (previous.clientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = previous.clientSecret;
      if (previous.callback === undefined) delete process.env.GOOGLE_CALLBACK_URL;
      else process.env.GOOGLE_CALLBACK_URL = previous.callback;
    }
  });

  test('Facebook OAuth state is provider-bound and tied to the initiating browser', async () => {
    const previous = {
      appId: process.env.FACEBOOK_APP_ID,
      appSecret: process.env.FACEBOOK_APP_SECRET,
      callback: process.env.FACEBOOK_CALLBACK_URL,
      version: process.env.FACEBOOK_GRAPH_VERSION,
    };
    process.env.FACEBOOK_APP_ID = '123456789012345';
    process.env.FACEBOOK_APP_SECRET = 'test-facebook-secret';
    process.env.FACEBOOK_CALLBACK_URL = 'https://ayrovi.example/api/customer/auth/facebook/callback';
    process.env.FACEBOOK_GRAPH_VERSION = 'v26.0';
    try {
      const browser = request.agent(app);
      const started = await browser.get('/api/customer/auth/facebook/start?returnTo=/compte');
      expect(started.status).toBe(302);
      const location = new URL(started.headers.location);
      expect(`${location.origin}${location.pathname}`).toBe('https://www.facebook.com/v26.0/dialog/oauth');
      expect(location.searchParams.get('scope')).toBe('public_profile,email');
      expect(location.searchParams.get('redirect_uri')).toBe(process.env.FACEBOOK_CALLBACK_URL);
      expect(started.headers['set-cookie']?.[0]).toContain('ayrovi_customer_facebook_oauth=');
      expect(started.headers['set-cookie']?.[0]).toContain('HttpOnly');
      const state = location.searchParams.get('state');
      expect(state).toBeTruthy();
      expect(db.get<any>('SELECT provider FROM customer_oauth_states WHERE id=?', hashToken(state!))?.provider).toBe('FACEBOOK');

      const foreignBrowser = await request(app)
        .get('/api/customer/auth/facebook/callback')
        .query({ state, code: 'must-not-be-exchanged' });
      expect(foreignBrowser.status).toBe(302);
      expect(foreignBrowser.headers.location).toBe('/?customerAuth=facebook_error');
      expect(db.get<any>('SELECT id FROM customer_oauth_states WHERE id=?', hashToken(state!))).toBeTruthy();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        const envKey = key === 'appId' ? 'FACEBOOK_APP_ID' : key === 'appSecret' ? 'FACEBOOK_APP_SECRET' : key === 'callback' ? 'FACEBOOK_CALLBACK_URL' : 'FACEBOOK_GRAPH_VERSION';
        if (value === undefined) delete process.env[envKey]; else process.env[envKey] = value;
      }
    }
  });

  test('Facebook OAuth verifies the token and never merges accounts by an unverified email', async () => {
    const previous = {
      appId: process.env.FACEBOOK_APP_ID,
      appSecret: process.env.FACEBOOK_APP_SECRET,
      callback: process.env.FACEBOOK_CALLBACK_URL,
      version: process.env.FACEBOOK_GRAPH_VERSION,
    };
    process.env.FACEBOOK_APP_ID = '123456789012345';
    process.env.FACEBOOK_APP_SECRET = 'test-facebook-secret';
    process.env.FACEBOOK_CALLBACK_URL = 'https://ayrovi.example/api/customer/auth/facebook/callback';
    process.env.FACEBOOK_GRAPH_VERSION = 'v26.0';
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const now = new Date().toISOString();
    const email = `facebook-collision-${Date.now()}@ayrovi.test`;
    const existingId = `facebook_email_owner_${Date.now()}`;
    db.run(`INSERT INTO customer_accounts (id,display_name,email,email_verified_at,status,created_at,updated_at)
      VALUES (?,'Compte Google existant',?,?,'ACTIVE',?,?)`, existingId, email, now, now, now);
    try {
      const browser = request.agent(app);
      const started = await browser.get('/api/customer/auth/facebook/start?returnTo=/compte');
      const state = new URL(started.headers.location).searchParams.get('state');
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'facebook-user-token', token_type: 'bearer' }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: { is_valid: true, app_id: process.env.FACEBOOK_APP_ID, user_id: '998877665544' } }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          id: '998877665544', name: 'Client Facebook', email,
          picture: { data: { is_silhouette: false, url: 'https://platform-lookaside.fbsbx.com/avatar.jpg' } },
        }), { status: 200 }));
      const callback = await browser.get('/api/customer/auth/facebook/callback').query({ state, code: 'valid-facebook-code' });
      expect(callback.status).toBe(302);
      expect(callback.headers.location).toBe('/compte?customerAuth=facebook_success');
      const identity = await browser.get('/api/customer/auth/me');
      expect(identity.status).toBe(200);
      expect(identity.body.data.account.id).not.toBe(existingId);
      expect(identity.body.data.account.displayName).toBe('Client Facebook');
      expect(identity.body.data.account.email).toBeNull();
      expect(identity.body.data.account.emailVerified).toBe(false);
      expect(db.get<any>(`SELECT provider_subject FROM customer_auth_identities WHERE account_id=? AND provider='FACEBOOK'`, identity.body.data.account.id)?.provider_subject).toBe('998877665544');
      expect(db.get<any>('SELECT email FROM customer_accounts WHERE id=?', existingId)?.email).toBe(email);
      db.run('DELETE FROM customer_accounts WHERE id=?', identity.body.data.account.id);
    } finally {
      fetchMock.mockRestore();
      db.run('DELETE FROM customer_accounts WHERE id=?', existingId);
      for (const [key, value] of Object.entries(previous)) {
        const envKey = key === 'appId' ? 'FACEBOOK_APP_ID' : key === 'appSecret' ? 'FACEBOOK_APP_SECRET' : key === 'callback' ? 'FACEBOOK_CALLBACK_URL' : 'FACEBOOK_GRAPH_VERSION';
        if (value === undefined) delete process.env[envKey]; else process.env[envKey] = value;
      }
    }
  });

  test('customers can permanently delete their profile with CSRF and explicit confirmation', async () => {
    const accountId = `account_delete_${Date.now()}`;
    const now = new Date().toISOString();
    db.run("INSERT INTO customer_accounts (id,display_name,email,status,created_at,updated_at) VALUES (?,? ,?,'ACTIVE',?,?)",
      accountId, 'Compte à supprimer', `delete-${Date.now()}@ayrovi.test`, now, now);
    db.run(`INSERT INTO customer_auth_identities (id,account_id,provider,provider_subject,created_at)
      VALUES (?,?,'FACEBOOK',?,?)`, `identity_delete_${Date.now()}`, accountId, `facebook-delete-${Date.now()}`, now);
    const session = createCustomerSession(db, accountId, { ip: '127.0.0.1', headers: {} } as any);
    const cookie = `ayrovi_customer_session=${encodeURIComponent(session.token)}`;
    const withoutConfirmation = await request(app).delete('/api/customer/account')
      .set('Cookie', cookie).set('x-csrf-token', session.csrfToken).send({});
    expect(withoutConfirmation.status).toBe(400);
    expect(db.get<any>('SELECT id FROM customer_accounts WHERE id=?', accountId)).toBeTruthy();

    const removed = await request(app).delete('/api/customer/account')
      .set('Cookie', cookie).set('x-csrf-token', session.csrfToken).send({ confirmation: 'SUPPRIMER' });
    expect(removed.status).toBe(200);
    expect(removed.body.data.deleted).toBe(true);
    expect(([] as string[]).concat(removed.headers['set-cookie'] || []).some((value) => value.includes('Max-Age=0'))).toBe(true);
    expect(db.get<any>('SELECT id FROM customer_accounts WHERE id=?', accountId)).toBeUndefined();
    expect(db.get<any>('SELECT id FROM customer_auth_identities WHERE account_id=?', accountId)).toBeUndefined();
    expect(db.get<any>('SELECT id FROM customer_sessions WHERE account_id=?', accountId)).toBeUndefined();
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

  test('image extraction rejects spoofed image MIME and keeps healthcheck alive', async () => {
    const response = await request(app)
      .post('/api/extract-image')
      .attach('image', Buffer.from('not-a-real-jpeg'), {
        filename: 'payload.js',
        contentType: 'image/jpeg',
      });
    expect(response.status).toBe(415);
    expect(response.body.code).toBe('INVALID_IMAGE');
    expect((await request(app).get('/api/health')).status).toBe(200);
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

  test('Lens order keeps the mandatory manual link and request fields, while signed estimate tampering is rejected', async () => {
    const sessionId = uniqueSession('lens-manual-order');
    const accountId = `account_lens_manual_${Date.now()}`;
    const title = 'Article Lens à acheter manuellement';
    const referenceUrl = 'https://www.google.com/shopping/product/reference';
    const quote = {
      price: 57.5,
      currency: 'EUR',
      title,
      referenceUrl,
      status: 'PENDING_MANUAL' as const,
    };
    const priceToken = createAyrovixPriceToken(quote);
    const payload = {
      store: 'generic', externalId: null, url: 'https://www.amazon.fr/dp/EXACTITEM', title,
      imageUrl: 'https://images.example/item.jpg', sourcePrice: quote.price, sourceCurrency: quote.currency,
      priceTND: 1, variant: 'Taille: XXL · Couleur: Noir', requestedSize: 'XXL', requestedColor: 'Noir',
      customerNote: 'Emballage cadeau, sans prix visible.', referenceUrl,
      priceVerificationStatus: quote.status, priceToken, quantity: 2,
    };
    try {
      const added = await request(app).post('/api/cart/items').set('x-session-id', sessionId).send(payload);
      expect(added.status, JSON.stringify(added.body)).toBe(201);
      expect(added.body.cartItem).toMatchObject({
        sourceUrl: payload.url, requestedSize: 'XXL', requestedColor: 'Noir', customerNote: payload.customerNote,
        referenceUrl, priceVerificationStatus: 'PENDING_MANUAL', quantity: 2,
      });
      expect(added.body.cartItem.priceTND).not.toBe(1); // toujours recalculé côté serveur

      const tampered = await request(app).post('/api/cart/items').set('x-session-id', `${sessionId}-tampered`).send({ ...payload, sourcePrice: 5.75 });
      expect(tampered.status).toBe(400);
      expect(tampered.body.code).toBe('INVALID_AYROVIX_PRICE_TOKEN');

      const noManualLink = await request(app).post('/api/cart/items').set('x-session-id', `${sessionId}-link`).send({ ...payload, url: '' });
      expect(noManualLink.status).toBe(400);
      expect(noManualLink.body.code).toBe('MANUAL_PRODUCT_URL_REQUIRED');

      const now = new Date().toISOString();
      db.run("INSERT INTO customer_accounts (id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)", accountId, 'Client Lens', now, now);
      expect(db.attachCartToAccount(sessionId, accountId)).toBe(1);
      const order = db.createOrderFromCart(sessionId, {
        name: 'Client Lens', email: 'lens@example.com', phone: '+216 98 765 432', governorate: 'Tunis', address: 'Avenue de Tunis', paymentMethod: 'BANK_TRANSFER',
        latitude: null, longitude: null, termsAcceptedAt: now, locale: 'fr-TN',
      }, accountId);
      expect(order.deposit.percent).toBe(20);
      const snapshot = db.get<any>('SELECT * FROM order_items WHERE order_id=?', order.orderId);
      expect(snapshot).toMatchObject({
        source_url: payload.url, requested_size: 'XXL', requested_color: 'Noir', customer_note: payload.customerNote,
        reference_url: referenceUrl, price_verification_status: 'PENDING_MANUAL', quantity: 2,
      });
    } finally {
      db.run('DELETE FROM customer_accounts WHERE id=?', accountId);
      db.clearCart(sessionId);
      db.clearCart(`${sessionId}-tampered`);
      db.clearCart(`${sessionId}-link`);
    }
  });

  test('cart and checkout remain isolated between client sessions', async () => {
    const addResponse = await customerAgent
      .post('/api/cart/items')
      .set('x-session-id', primarySession)
      .set('x-csrf-token', customerCsrf)
      .send(createCartItem());

    expect(addResponse.status).toBe(201);
    expect(addResponse.body.success).toBe(true);
    expect(addResponse.body.cartItem.priceTND).toBe(122.96);
    const itemId = addResponse.body.cartItem.id as string;

    const primaryCart = await customerAgent
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
      .send({ ...checkoutDefaults,
        name: 'Client Test',
        phone: '98123456',
        city: 'Tunis',
        address: 'Avenue Habib Bourguiba, Tunis',
        paymentMethod: 'cod',
      });
    expect(emptyCheckout.status).toBe(401);
    expect(emptyCheckout.body.code).toBe('AUTH_REQUIRED');

    const withoutCsrf = await customerAgent
      .patch(`/api/cart/items/${itemId}`)
      .set('x-session-id', primarySession)
      .send({ quantity: 2 });
    expect(withoutCsrf.status).toBe(403);
    expect(withoutCsrf.body.error).toContain('sécurité');

    // Un numéro de livraison invalide est rejeté sans consommer le panier.
    const invalidPhoneCheckout = await customerAgent
      .post('/api/checkout')
      .set('x-session-id', primarySession)
      .set('x-csrf-token', customerCsrf)
      .send({ ...checkoutDefaults,
        name: 'Client Test',
        phone: '1234',
        city: 'Tunis',
        address: 'Avenue Habib Bourguiba, Tunis',
        paymentMethod: 'bank_transfer',
      });
    expect(invalidPhoneCheckout.status).toBe(400);

    const validCheckoutPayload = {
      ...checkoutDefaults,
      name: 'Client Test',
      phone: '+216 98 123 456',
      city: 'Tunis',
      address: 'Avenue Habib Bourguiba, Tunis',
      paymentMethod: 'bank_transfer',
    };

    const withoutTerms = await customerAgent.post('/api/checkout').set('x-session-id', primarySession).set('x-csrf-token', customerCsrf).send({ ...validCheckoutPayload, termsAccepted: false });
    expect(withoutTerms.status).toBe(400);
    expect(withoutTerms.body.code).toBe('TERMS_REQUIRED');

    const invalidLocale = await customerAgent.post('/api/checkout').set('x-session-id', primarySession).set('x-csrf-token', customerCsrf).send({ ...validCheckoutPayload, locale: 'en-US' });
    expect(invalidLocale.status).toBe(400);
    expect(invalidLocale.body.code).toBe('CHECKOUT_LOCALE_INVALID');

    const incompleteLocation = await customerAgent.post('/api/checkout').set('x-session-id', primarySession).set('x-csrf-token', customerCsrf).send({ ...validCheckoutPayload, latitude: 36.8065 });
    expect(incompleteLocation.status).toBe(400);
    expect(incompleteLocation.body.code).toBe('DELIVERY_LOCATION_INVALID');

    const outOfRangeLocation = await customerAgent.post('/api/checkout').set('x-session-id', primarySession).set('x-csrf-token', customerCsrf).send({ ...validCheckoutPayload, latitude: 91, longitude: 10 });
    expect(outOfRangeLocation.status).toBe(400);
    expect(outOfRangeLocation.body.code).toBe('DELIVERY_LOCATION_INVALID');

    // Le téléphone de livraison, les coordonnées et la langue choisie sont conservés avec le consentement.
    const checkoutResponse = await customerAgent
      .post('/api/checkout')
      .set('x-session-id', primarySession)
      .set('x-csrf-token', customerCsrf)
      .send({ ...validCheckoutPayload, latitude: 36.8065, longitude: 10.1815, locale: 'ar-TN' });

    expect(checkoutResponse.status).toBe(200);
    expect(checkoutResponse.body.success).toBe(true);
    expect(checkoutResponse.body.orderNumber).toMatch(/^AYR-\d{6}$/);
    // Acompte de confirmation : 20% du total, statut PAYMENT_PENDING tant que l'acompte n'est pas validé.
    expect(checkoutResponse.body.deposit.percent).toBe(20);
    expect(checkoutResponse.body.deposit.status).toBe('PENDING');
    expect(checkoutResponse.body.deposit.method).toBe('BANK_TRANSFER');
    expect(checkoutResponse.body.deposit.amountTnd).toBeCloseTo(checkoutResponse.body.totalTND * 0.2, 2);
    persistedOrderId = checkoutResponse.body.orderId;
    const order = db.get<any>('SELECT * FROM orders WHERE id=?', persistedOrderId);
    persistedCustomerId = order.customer_id;
    expect(order.pricing_snapshot).toContain('"version":1');
    expect(order.account_id).toBe(primaryAccountId);
    expect(order.phone).toBe('+216 98 123 456');
    expect(order.contact_email).toBe(checkoutDefaults.email);
    expect(order.delivery_latitude).toBeCloseTo(36.8065, 4);
    expect(order.delivery_longitude).toBeCloseTo(10.1815, 4);
    expect(order.terms_accepted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(order.locale).toBe('ar-TN');
    expect(order.status).toBe('PAYMENT_PENDING');
    expect(order.deposit_status).toBe('PENDING');
    expect(order.deposit_percent).toBe(20);
    expect(order.payment_method).toBe('BANK_TRANSFER');
    expect(db.get<any>('SELECT COUNT(*) count FROM order_items WHERE order_id=?', persistedOrderId).count).toBe(1);
    expect(db.get<any>('SELECT status FROM payments WHERE order_id=?', persistedOrderId).status).toBe('PENDING');
    expect(db.get<any>('SELECT status FROM deliveries WHERE order_id=?', persistedOrderId).status).toBe('PENDING');

    const accountDetail = await customerAgent.get(`/api/customer/account/orders/${persistedOrderId}`);
    expect(accountDetail.status).toBe(200);
    expect(accountDetail.body.data.items).toHaveLength(1);
    expect(JSON.parse(accountDetail.body.data.pricing_snapshot).version).toBe(1);
    expect((await secondCustomerAgent.get(`/api/customer/account/orders/${persistedOrderId}`)).status).toBe(404);
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
      .send({ ...checkoutDefaults, name: 'Client Test', phone: '98123457', city: 'Tunis', address: 'Tunis', paymentMethod: 'paypal' });
    expect(unavailablePayment.status).toBe(401);
    expect(unavailablePayment.body.code).toBe('AUTH_REQUIRED');

    const secondResponse = await request(app)
      .post('/api/cart/items')
      .set('x-session-id', quantitySession)
      .send({ ...item, quantity: 1 });
    expect(secondResponse.status).toBe(400);
    expect(secondResponse.body.error).toContain('99');
  });

  test('email-only accounts checkout with a form-provided delivery phone (no SMS verification needed)', async () => {
    const accountId = `account_google_only_${Date.now()}`;
    const sessionId = uniqueSession('unverified');
    const now = new Date().toISOString();
    const verifiedEmail = `google-${Date.now()}@example.com`;
    db.run(`INSERT INTO customer_accounts
      (id,display_name,email,email_verified_at,status,created_at,updated_at)
      VALUES (?,?,?,?,'ACTIVE',?,?)`, accountId, 'Google Client', verifiedEmail, now, now, now);
    const session = createCustomerSession(db, accountId, { ip: '127.0.0.1', headers: {} } as any);
    const added = await request(app)
      .post('/api/cart/items')
      .set('x-session-id', sessionId)
      .send(createCartItem('Unverified phone checkout'));
    expect(added.status).toBe(201);

    const checkoutWith = (payload: any) => request(app)
      .post('/api/checkout')
      .set('Cookie', `ayrovi_customer_session=${encodeURIComponent(session.token)}`)
      .set('x-session-id', sessionId)
      .set('x-csrf-token', session.csrfToken)
      .send({ ...checkoutDefaults, email: verifiedEmail, name: 'Google Client', city: 'Tunis', address: 'Tunis', paymentMethod: 'card', ...payload });

    // Sans téléphone ou avec un numéro invalide, la commande est refusée (400).
    expect((await checkoutWith({})).status).toBe(400);
    expect((await checkoutWith({ phone: '123' })).status).toBe(400);
    expect(db.get<any>('SELECT COUNT(*) count FROM orders WHERE account_id=?', accountId).count).toBe(0);

    // Avec un téléphone de livraison valide, la commande passe et attend l'acompte de 20%.
    const checkout = await checkoutWith({ phone: '55123456' });
    expect(checkout.status).toBe(200);
    expect(checkout.body.deposit.percent).toBe(20);
    const order = db.get<any>('SELECT * FROM orders WHERE account_id=?', accountId);
    expect(order.status).toBe('PAYMENT_PENDING');
    expect(order.payment_method).toBe('CARD');
    expect(order.phone).toBe('55123456');
    db.clearCart(sessionId);
  });

  test('checkout requires at least one verified contact channel', async () => {
    const accountId = `account_no_verified_contact_${Date.now()}`;
    const sessionId = uniqueSession('no-verified-contact');
    const now = new Date().toISOString();
    db.run(`INSERT INTO customer_accounts (id,display_name,email,status,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,?)`, accountId, 'Compte non vérifié', `pending-${Date.now()}@example.com`, now, now);
    const session = createCustomerSession(db, accountId, { ip: '127.0.0.1', headers: {} } as any);
    try {
      expect((await request(app).post('/api/cart/items').set('x-session-id', sessionId).send(createCartItem('Verification required item'))).status).toBe(201);
      const checkout = await request(app)
        .post('/api/checkout')
        .set('Cookie', `ayrovi_customer_session=${encodeURIComponent(session.token)}`)
        .set('x-session-id', sessionId)
        .set('x-csrf-token', session.csrfToken)
        .send({ ...checkoutDefaults, email: `pending-${Date.now()}@example.com`, name: 'Compte non vérifié', phone: '98123456', city: 'Tunis', address: 'Tunis', paymentMethod: 'card' });
      expect(checkout.status).toBe(403);
      expect(checkout.body.code).toBe('CONTACT_VERIFICATION_REQUIRED');
      expect(db.get<any>('SELECT COUNT(*) count FROM orders WHERE account_id=?', accountId).count).toBe(0);
    } finally {
      db.clearCart(sessionId);
      db.run('DELETE FROM customer_sessions WHERE account_id=?', accountId);
      db.run('DELETE FROM customer_accounts WHERE id=?', accountId);
    }
  });

  test('checkout reuses customers while preserving separate orders', async () => {
    const added = await request(app)
      .post('/api/cart/items')
      .set('x-session-id', repeatSession)
      .send(createCartItem('Second customer order'));
    expect(added.status).toBe(201);

    const checkout = await customerAgent
      .post('/api/checkout')
      .set('x-session-id', repeatSession)
      .set('x-csrf-token', customerCsrf)
      .send({ ...checkoutDefaults,
        name: 'Client Test Updated',
        phone: '98123456',
        city: 'Ariana',
        address: 'Centre Ariana',
        paymentMethod: 'flouci',
      });
    expect(checkout.status).toBe(200);
    expect(db.get<any>('SELECT COUNT(*) count FROM customers WHERE phone=?', '98123456').count).toBe(1);
    expect(db.get<any>('SELECT COUNT(*) count FROM orders WHERE customer_id=?', persistedCustomerId).count).toBe(3);
    expect(db.get<any>('SELECT payment_method FROM orders WHERE id=?', checkout.body.orderId).payment_method).toBe('FLOUCI');
  });

  test('deposit lifecycle: proof upload, admin review, invoice PDF and tracking code', async () => {
    // 1) الطلب يُنشأ بحالة PAYMENT_PENDING مع عربون 20%
    const depositSession = uniqueSession('deposit');
    await request(app).post('/api/cart/items').set('x-session-id', depositSession).send(createCartItem('Deposit flow item'));
    const checkout = await customerAgent
      .post('/api/checkout')
      .set('x-session-id', depositSession)
      .set('x-csrf-token', customerCsrf)
      .send({ ...checkoutDefaults, name: 'Client Test', phone: '98123456', city: 'Tunis', address: 'Rue de la République', paymentMethod: 'bank_transfer' });
    expect(checkout.status).toBe(200);
    const orderId = checkout.body.orderId;
    // لا فاتورة قبل تأكيد العربون
    expect((await customerAgent.get(`/api/customer/account/orders/${orderId}/invoice`)).status).toBe(404);

    // 2) العميل يرفع وصل الدفع (تحقق من التوقيع الثنائي للملف)
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00]);
    const proof = await customerAgent
      .post(`/api/customer/account/orders/${orderId}/deposit-proof`)
      .set('x-csrf-token', customerCsrf)
      .attach('proof', png, 'recu.png');
    expect(proof.status).toBe(200);
    expect(proof.body.data.depositStatus).toBe('SUBMITTED');
    // ملف مموّه يُرفض، وعميل أجنبي لا يصل للطلب
    const disguised = await customerAgent
      .post(`/api/customer/account/orders/${orderId}/deposit-proof`)
      .set('x-csrf-token', customerCsrf)
      .attach('proof', Buffer.from('MZ this is not an image payload'), 'fake.png');
    expect(disguised.status).toBe(415);
    const foreignProof = await secondCustomerAgent
      .post(`/api/customer/account/orders/${orderId}/deposit-proof`)
      .set('x-csrf-token', secondCustomerCsrf)
      .attach('proof', png, 'recu.png');
    expect(foreignProof.status).toBe(404);

    // 3) مراجعة الأدمن: الوصول بدون مصادقة محظور
    expect((await request(app).get(`/api/admin/orders/${orderId}/deposit-proof`)).status).toBe(401);
    const reviewer = request.agent(app);
    const login = await reviewer.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    const reviewerCsrf = login.body.data.csrfToken;
    expect((await reviewer.get(`/api/admin/orders/${orderId}/deposit-proof`)).status).toBe(200);
    expect((await reviewer.post(`/api/admin/orders/${orderId}/deposit/review`).send({ decision: 'approve' })).status).toBe(403); // بدون CSRF

    // 4) القبول ⇒ تأكيد + كود تتبع + فاتورة PDF
    const review = await reviewer
      .post(`/api/admin/orders/${orderId}/deposit/review`)
      .set('x-csrf-token', reviewerCsrf)
      .send({ decision: 'approve', note: 'Reçu conforme' });
    expect(review.status).toBe(200);
    expect(review.body.data.depositStatus).toBe('PAID');
    expect(review.body.data.trackingCode).toMatch(/^AYR-TN-\d{8}$/);
    expect(review.body.data.invoice.number).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(review.body.data.invoice.generated).toBe(true);
    const confirmed = db.get<any>('SELECT * FROM orders WHERE id=?', orderId);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.tracking_code).toMatch(/^AYR-TN-/);
    expect(db.get<any>('SELECT status FROM payments WHERE order_id=?', orderId).status).toBe('PAID');

    // 5) العميل يحمّل فاتورته (مالك الطلب فقط) والملف PDF سليم
    const invoice = await customerAgent.get(`/api/customer/account/orders/${orderId}/invoice`);
    expect(invoice.status).toBe(200);
    expect(invoice.headers['content-type']).toContain('application/pdf');
    expect(fs.readFileSync(confirmed.invoice_path).slice(0, 5).toString()).toBe('%PDF-');
    expect((await secondCustomerAgent.get(`/api/customer/account/orders/${orderId}/invoice`)).status).toBe(404);

    // 6) الرفض بملاحظة: عربون مرفوض والطلب يبقى بانتظار الدفع
    const rejectSession = uniqueSession('reject');
    await request(app).post('/api/cart/items').set('x-session-id', rejectSession).send(createCartItem('Rejected deposit item'));
    const rejectCheckout = await customerAgent
      .post('/api/checkout')
      .set('x-session-id', rejectSession)
      .set('x-csrf-token', customerCsrf)
      .send({ ...checkoutDefaults, name: 'Client Test', phone: '98123456', city: 'Tunis', address: 'Tunis', paymentMethod: 'poste' });
    expect(rejectCheckout.status).toBe(200);
    const rejectedOrderId = rejectCheckout.body.orderId;
    // طريقة يدوية بدون وصل: لا يمكن قبولها
    const blindApprove = await reviewer
      .post(`/api/admin/orders/${rejectedOrderId}/deposit/review`)
      .set('x-csrf-token', reviewerCsrf)
      .send({ decision: 'approve' });
    expect(blindApprove.status).toBe(409);
    await customerAgent
      .post(`/api/customer/account/orders/${rejectedOrderId}/deposit-proof`)
      .set('x-csrf-token', customerCsrf)
      .attach('proof', png, 'mandat.png');
    const reject = await reviewer
      .post(`/api/admin/orders/${rejectedOrderId}/deposit/review`)
      .set('x-csrf-token', reviewerCsrf)
      .send({ decision: 'reject', note: 'Mandat illisible' });
    expect(reject.status).toBe(200);
    const rejected = db.get<any>('SELECT status,deposit_status,deposit_review_note FROM orders WHERE id=?', rejectedOrderId);
    expect(rejected.deposit_status).toBe('REJECTED');
    expect(rejected.status).toBe('PAYMENT_PENDING');
    expect(rejected.deposit_review_note).toBe('Mandat illisible');
  }, 20000);

  test('card checkout applies the 5% card discount and notification feed tracks the review queue', async () => {
    const cardSession = uniqueSession('card');
    await request(app).post('/api/cart/items').set('x-session-id', cardSession).send(createCartItem('Card discount item'));
    const checkout = await customerAgent
      .post('/api/checkout')
      .set('x-session-id', cardSession)
      .set('x-csrf-token', customerCsrf)
      .send({ ...checkoutDefaults, name: 'Client Test', phone: '98123456', city: 'Tunis', address: 'Tunis', paymentMethod: 'card' });
    expect(checkout.status).toBe(200);
    const { deposit } = checkout.body;
    // خصم 5% على العربون للدفع بالبطاقة
    expect(deposit.method).toBe('CARD');
    expect(deposit.cardDiscountPercent).toBe(5);
    expect(deposit.discountTnd).toBeCloseTo(deposit.baseAmountTnd * 0.05, 2);
    expect(deposit.amountTnd).toBeCloseTo(deposit.baseAmountTnd * 0.95, 2);
    const orderRow = db.get<any>('SELECT deposit_discount_tnd FROM orders WHERE id=?', checkout.body.orderId);
    expect(orderRow.deposit_discount_tnd).toBeCloseTo(deposit.discountTnd, 2);

    // إشعارات الإدارة: طلب جديد + وصولات سابقة بانتظار المراجعة
    const reviewer = request.agent(app);
    const login = await reviewer.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    const csrf = login.body.data.csrfToken;
    const notifications = await reviewer.get('/api/admin/notifications');
    expect(notifications.status).toBe(200);
    expect(notifications.body.unread).toBeGreaterThan(0);
    expect(notifications.body.data.some((n: any) => n.type === 'DEPOSIT_REVIEW')).toBe(true);
    expect(notifications.body.data.some((n: any) => n.type === 'ORDER')).toBe(true);

    // قبول عربون البطاقة بدون وصل (البوابة تؤكد) ⇒ فاتورة فورية
    const approve = await reviewer.post(`/api/admin/orders/${checkout.body.orderId}/deposit/review`).set('x-csrf-token', csrf).send({ decision: 'approve' });
    expect(approve.status).toBe(200);
    expect(approve.body.data.invoice.generated).toBe(true);

    // إعادة توليد/إرسال الفاتورة عند الحاجة
    const resend = await reviewer.post(`/api/admin/orders/${checkout.body.orderId}/invoice/resend`).set('x-csrf-token', csrf);
    expect(resend.status).toBe(200);
    expect(resend.body.data.invoiceNumber).toBe(approve.body.data.invoice.number);

    const readAll = await reviewer.post('/api/admin/notifications/read-all').set('x-csrf-token', csrf);
    expect(readAll.body.unread).toBe(0);
    expect((await request(app).get('/api/admin/notifications')).status).toBe(401);
  }, 20000);

  test('finance reports combine income, expenses and profit with strict validation', async () => {
    const reviewer = request.agent(app);
    const login = await reviewer.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    const csrf = login.body.data.csrfToken;
    const today = new Date().toISOString().slice(0, 10);

    const badExpense = await reviewer.post('/api/admin/expenses').set('x-csrf-token', csrf).send({ label: '', amountTnd: -5, expenseDate: today });
    expect(badExpense.status).toBe(400);
    const created = await reviewer.post('/api/admin/expenses').set('x-csrf-token', csrf)
      .send({ label: 'Campagne Facebook Ads', category: 'ADS', amountTnd: 120, expenseDate: today, notes: 'Test' });
    expect(created.status).toBe(201);

    const monthStart = `${today.slice(0, 7)}-01`;
    const report = await reviewer.get(`/api/admin/reports/finance?from=${monthStart}&to=${today}`);
    expect(report.status).toBe(200);
    expect(report.body.data.income).toBeGreaterThan(0); // العربونات المؤكدة أعلاه
    expect(report.body.data.expenses).toBe(120);
    expect(report.body.data.profit).toBeCloseTo(report.body.data.income - 120, 2);
    expect(report.body.data.monthly).toHaveLength(6);
    expect(report.body.data.expensesByCategory[0].category).toBe('ADS');

    const removed = await reviewer.delete(`/api/admin/expenses/${created.body.data.id}`).set('x-csrf-token', csrf);
    expect(removed.status).toBe(200);
    expect((await reviewer.get(`/api/admin/reports/finance?from=${monthStart}&to=${today}`)).body.data.expenses).toBe(0);
    expect((await request(app).get('/api/admin/reports/finance')).status).toBe(401);
  });

  test('customer profile, addresses, favorites, notifications and ownership boundaries persist', async () => {
    const profile = await customerAgent
      .put('/api/customer/account/profile')
      .set('x-csrf-token', customerCsrf)
      .send({ displayName: 'Client Test', email: 'client.test@ayrovi.tn', marketingOptIn: true });
    expect(profile.status).toBe(200);
    expect(profile.body.data.displayName).toBe('Client Test');
    expect(profile.body.data.emailVerified).toBe(false);

    const address = await customerAgent
      .post('/api/customer/account/addresses')
      .set('x-csrf-token', customerCsrf)
      .send({ label: 'Bureau', recipientName: 'Client Test', phone: '98123456', governorate: 'Ariana', city: 'Ariana', postalCode: '2080', addressLine: 'Centre Ariana', deliveryNotes: 'Appeler avant', isDefault: true });
    expect(address.status).toBe(201);
    expect(address.body.data.is_default).toBe(1);

    const forbiddenAddressUpdate = await secondCustomerAgent
      .put(`/api/customer/account/addresses/${address.body.data.id}`)
      .set('x-csrf-token', secondCustomerCsrf)
      .send({ label: 'Volée', recipientName: 'Autre', phone: '97123456', governorate: 'Tunis', addressLine: 'Inaccessible', isDefault: true });
    expect(forbiddenAddressUpdate.status).toBe(404);

    const updatedAddress = await customerAgent
      .put(`/api/customer/account/addresses/${address.body.data.id}`)
      .set('x-csrf-token', customerCsrf)
      .send({ label: 'Bureau principal', recipientName: 'Client Test', phone: '98123456', governorate: 'Ariana', city: 'Ariana', postalCode: '2080', addressLine: 'Nouvelle adresse Ariana', deliveryNotes: '', isDefault: false });
    expect(updatedAddress.status).toBe(200);
    expect(updatedAddress.body.data.address_line).toBe('Nouvelle adresse Ariana');
    expect(updatedAddress.body.data.is_default).toBe(1);

    const secondaryAddress = await customerAgent
      .post('/api/customer/account/addresses')
      .set('x-csrf-token', customerCsrf)
      .send({ label: 'Maison', recipientName: 'Client Test', phone: '98123456', governorate: 'Tunis', city: 'Tunis', postalCode: '1000', addressLine: 'Adresse secondaire', deliveryNotes: '', isDefault: false });
    expect(secondaryAddress.status).toBe(201);
    expect((await secondCustomerAgent.delete(`/api/customer/account/addresses/${secondaryAddress.body.data.id}`).set('x-csrf-token', secondCustomerCsrf)).status).toBe(404);
    expect((await customerAgent.delete(`/api/customer/account/addresses/${address.body.data.id}`).set('x-csrf-token', customerCsrf)).status).toBe(200);
    const remainingAddresses = await customerAgent.get('/api/customer/account/addresses');
    expect(remainingAddresses.body.data.some((item: any) => item.id === address.body.data.id)).toBe(false);
    expect(remainingAddresses.body.data.filter((item: any) => item.is_default === 1)).toHaveLength(1);

    const favorite = await customerAgent
      .post('/api/customer/account/favorites')
      .set('x-csrf-token', customerCsrf)
      .send({ sourceUrl: 'https://www.shein.com/example', title: 'Favori test', imageUrl: '/uploads/product.jpg', priceTND: 42 });
    expect(favorite.status).toBe(201);
    expect((await customerAgent.get('/api/customer/account/favorites')).body.data).toHaveLength(1);
    expect((await secondCustomerAgent.delete(`/api/customer/account/favorites/${favorite.body.data.id}`).set('x-csrf-token', secondCustomerCsrf)).status).toBe(404);

    const overview = await customerAgent.get('/api/customer/account/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.data.counts.orders).toBeGreaterThanOrEqual(3);
    expect(overview.body.data.counts.addresses).toBeGreaterThanOrEqual(1);
    expect(overview.body.data.counts.favorites).toBe(1);
    expect(overview.body.data.counts.unreadNotifications).toBeGreaterThan(0);
    expect((await customerAgent.put('/api/customer/account/notifications/read').set('x-csrf-token', customerCsrf).send({})).status).toBe(200);
    expect(db.get<any>('SELECT COUNT(*) count FROM customer_notifications WHERE account_id=? AND read_at IS NULL', primaryAccountId).count).toBe(0);
  });

  test('guest carts merge into an account and customer logout and expiry invalidate sessions', async () => {
    const mergeSession = uniqueSession('merge');
    const mergeAgent = request.agent(app);
    const guestItem = await request(app)
      .post('/api/cart/items')
      .set('x-session-id', mergeSession)
      .send(createCartItem('Guest cart merge item'));
    expect(guestItem.status).toBe(201);

    const login = await otpLogin(mergeAgent, '95123456', mergeSession);
    const mergedCart = await mergeAgent.get('/api/cart/items').set('x-session-id', mergeSession);
    expect(mergedCart.status).toBe(200);
    expect(mergedCart.body.items.map((item: any) => item.title)).toContain('Guest cart merge item');
    const formerGuestView = await request(app).get('/api/cart/items').set('x-session-id', mergeSession);
    expect(formerGuestView.body.items).toHaveLength(0);

    const logout = await mergeAgent
      .post('/api/customer/auth/logout')
      .set('x-csrf-token', login.csrfToken)
      .send({});
    expect(logout.status).toBe(200);
    const logoutCookies = ([] as string[]).concat(logout.headers['set-cookie'] || []);
    expect(logoutCookies.some((value) => value.includes('Max-Age=0'))).toBe(true);
    expect((await mergeAgent.get('/api/customer/auth/me')).status).toBe(401);

    const freshLogin = await otpLogin(mergeAgent, '95123456', mergeSession);
    db.run('UPDATE customer_sessions SET expires_at=? WHERE account_id=?', '2000-01-01T00:00:00.000Z', freshLogin.account.id);
    const stale = await mergeAgent.get('/api/customer/auth/me');
    expect(stale.status).toBe(401);
    const staleCookies = ([] as string[]).concat(stale.headers['set-cookie'] || []);
    expect(staleCookies.some((value) => value.includes('Max-Age=0'))).toBe(true);
    expect(db.get<any>('SELECT COUNT(*) count FROM customer_sessions WHERE account_id=? AND expires_at>?', freshLogin.account.id, new Date().toISOString()).count).toBe(0);
    db.clearCart(mergeSession, freshLogin.account.id);
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
    expect(commerce.body.data.paymentMethods).toEqual(['CARD', 'FLOUCI', 'BANK_TRANSFER', 'POSTE']);
    expect(commerce.body.data.deposit.percent).toBe(20);
    expect(commerce.body.data.deposit.companyName).toBeTruthy();
    expect(commerce.body.data.deposit).toHaveProperty('bankRib');
    expect(commerce.body.data.deposit).toHaveProperty('posteAccount');
    expect(commerce.body.data.deposit).toHaveProperty('flouciNumber');
    expect(commerce.body.data.deposit.cardDiscountPercent).toBe(5);
    expect(commerce.body.data.channels).toEqual({ facebook: '', instagram: '', tiktok: '', whatsapp: '' });
    expect(commerce.body.data.theme.primary).toBe('#673de6');
    expect(commerce.body.data.pricing.version).toBe(1);

    const preview = await request(app).post('/api/public/pricing/preview').send({ originalPrice: 21.99, currency: 'EUR', quantity: 2 });
    expect(preview.status).toBe(200);
    expect(preview.body.data.totalTND).toBe(214.99);
    expect(preview.body.data.pricingVersion).toBe(1);
  });

  test('admin routes reject unauthenticated requests, clear stale cookies and reject invalid credentials', async () => {
    const unauthorized = await request(app).get('/api/admin/dashboard');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers['set-cookie'][0]).toContain('Max-Age=0');
    const identity = await request(app).get('/api/admin/auth/me');
    expect(identity.status).toBe(401);
    expect(identity.headers['set-cookie'][0]).toContain('Max-Age=0');
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

  test('assistant feedback is persisted for guests and CSRF-protected accounts without storing raw guest sessions', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const guestSession = `assistant-guest-${suffix}`;
    const guestPayload = {
      conversationId: `conversation_${suffix}`,
      messageId: `assistant_${suffix}`,
      rating: 'down',
      comment: 'La réponse pourrait être plus précise.',
      responseExcerpt: 'Réponse test AYROVI',
    };
    const guest = await request(app)
      .post('/api/public/assistant-feedback')
      .set('x-session-id', guestSession)
      .send(guestPayload);
    expect(guest.status).toBe(201);
    const guestRow = db.get<any>('SELECT * FROM assistant_feedback WHERE conversation_id=?', guestPayload.conversationId);
    expect(guestRow.account_id).toBeNull();
    expect(guestRow.guest_session_hash).not.toBe(guestSession);
    expect(guestRow.guest_session_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(guestRow.comment).toBe(guestPayload.comment);

    const updated = await request(app)
      .post('/api/public/assistant-feedback')
      .set('x-session-id', guestSession)
      .send({ ...guestPayload, rating: 'up', comment: '' });
    expect(updated.status).toBe(201);
    expect(db.get<any>('SELECT rating,comment FROM assistant_feedback WHERE id=?', guestRow.id)).toEqual({ rating: 'up', comment: '' });

    const accountId = `assistant_account_${suffix}`;
    const now = new Date().toISOString();
    db.run(`INSERT INTO customer_accounts (id,display_name,status,created_at,updated_at)
      VALUES (?,?,'ACTIVE',?,?)`, accountId, 'Assistant Client', now, now);
    const session = createCustomerSession(db, accountId, { ip: '127.0.0.1', headers: {} } as any);
    const accountPayload = { ...guestPayload, conversationId: `conversation_account_${suffix}`, messageId: `assistant_account_${suffix}` };
    const cookie = `ayrovi_customer_session=${encodeURIComponent(session.token)}`;
    expect((await request(app).post('/api/public/assistant-feedback').set('Cookie', cookie).set('x-session-id', guestSession).send(accountPayload)).status).toBe(403);
    const authenticated = await request(app)
      .post('/api/public/assistant-feedback')
      .set('Cookie', cookie)
      .set('x-csrf-token', session.csrfToken)
      .set('x-session-id', guestSession)
      .send(accountPayload);
    expect(authenticated.status).toBe(201);
    const accountRow = db.get<any>('SELECT * FROM assistant_feedback WHERE conversation_id=?', accountPayload.conversationId);
    expect(accountRow.account_id).toBe(accountId);
    expect(accountRow.guest_session_hash).toBe('');
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

  test('manual PUBLISHED status publishes now instead of showing a false published badge', async () => {
    const before = Date.now();
    const created = await superAdmin.post('/api/admin/news').set('x-csrf-token', adminCsrf).send({
      title: `Publication immédiate ${before}`,
      summary: 'Résumé de publication',
      content: 'Contenu de publication',
      image: '',
      category: 'AYROVI',
      author: 'Test',
      published_at: new Date(before + 86_400_000).toISOString(),
      status: 'PUBLISHED',
    });
    expect(created.status).toBe(201);
    try {
      expect(created.body.data.status).toBe('PUBLISHED');
      expect(new Date(created.body.data.published_at).getTime()).toBeGreaterThanOrEqual(before);
      expect(new Date(created.body.data.published_at).getTime()).toBeLessThanOrEqual(Date.now());
      const publicResponse = await request(app).get('/api/public/news?limit=50');
      expect(publicResponse.body.data.map((item: any) => item.id)).toContain(created.body.data.id);
    } finally {
      if (created.body.data?.id) db.run('DELETE FROM news_items WHERE id=?', created.body.data.id);
    }
  });

  test('public magazine exposes due schedules but never future content', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const dueId = `news_due_${suffix}`;
    const futureId = `news_future_${suffix}`;
    const now = new Date().toISOString();
    const due = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const insert = (id: string, publishedAt: string) => db.run(`INSERT INTO news_items
      (id,title,summary,content,image,category,arrival_id,product_id,author,published_at,status,created_at,updated_at)
      VALUES (?,?,?,'Contenu','', 'AYROVI',NULL,NULL,'Test',?,'SCHEDULED',?,?)`, id, `Magazine ${id}`, 'Résumé', publishedAt, now, now);
    try {
      insert(dueId, due);
      insert(futureId, future);
      const response = await request(app).get('/api/public/news?limit=50');
      expect(response.status).toBe(200);
      expect(response.body.data.map((item: any) => item.id)).toContain(dueId);
      expect(response.body.data.map((item: any) => item.id)).not.toContain(futureId);
    } finally {
      db.run('DELETE FROM news_items WHERE id IN (?,?)', dueId, futureId);
    }
  });

  test('rate limiting throttles brute-force attempts on sensitive endpoints', async () => {
    // bucket otp-verify : 12 requêtes / 5 min par IP — des tentatives précédentes peuvent déjà compter
    const statuses: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      const res = await request(app).post('/api/customer/auth/otp/verify').send({ challengeId: 'bogus', code: '123456' });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
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
