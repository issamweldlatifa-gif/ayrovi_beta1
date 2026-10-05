/**
 * PREUVE DE PRIX À LA COMMANDE — le défaut fermé (05/10/2026).
 *
 * Le panier gardait un STATUT (« VERIFIED ») mais pas la preuve signée. Une
 * commande pouvait donc encaisser un prix attesté bien plus tôt, ou un prix de
 * ligne modifié après coup, sans qu'aucune source ne soit relue. Ces tests
 * verrouillent la règle : une ligne `VERIFIED` doit présenter, AU MOMENT de la
 * commande, le jeton signé par le serveur pour exactement ce prix, ce titre et
 * ce lien. Sinon la commande est refusée AVANT d'exister — et le chemin manuel
 * historique n'est pas touché.
 */
import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { createAyrovixPriceToken } from '../src/ayrovix/priceQuote';
import { verifyCartPriceTrust, CART_QUOTE_LEGACY_GRACE_MS } from '../src/services/cartPriceTrust';

const uniqueSession = (label: string) => `pricetrust-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const uniquePhone = () => `+216${'24579'[Math.floor(Math.random() * 5)]}${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

const PRICE = 41.5;
const CURRENCY = 'EUR';
const TITLE = 'Sac test preuve de prix';
const URL = 'https://www.shein.com/price-trust-p-382460230.html';

const quote = (ttlMs = 30 * 60_000, over: Record<string, unknown> = {}) =>
  createAyrovixPriceToken({ price: PRICE, currency: CURRENCY, title: TITLE, referenceUrl: '', status: 'VERIFIED', ...over }, ttlMs)!;

const cartItem = (body: Record<string, unknown> = {}) => ({
  store: 'shein',
  externalId: `PT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  url: URL,
  title: TITLE,
  imageUrl: '/uploads/product.jpg',
  sourcePrice: PRICE,
  sourceCurrency: CURRENCY,
  priceVerificationStatus: 'VERIFIED',
  quantity: 1,
  ...body,
});

const checkoutPayload = (over: Record<string, unknown> = {}) => ({
  name: 'Client Preuve Prix', email: 'pricetrust@ayrovi.test', phone: '+216 98 123 456',
  city: 'Tunis', address: 'Avenue Habib Bourguiba, Tunis', deliveryMode: 'home',
  termsAccepted: true, locale: 'fr-TN', ...over,
});

async function customerLogin(cartSessionId: string) {
  const agent = request.agent(app);
  const requested = await request(app).post('/api/customer/auth/otp/request').send({ phone: uniquePhone(), cartSessionId });
  expect(requested.status, JSON.stringify(requested.body)).toBe(201);
  const verified = await agent.post('/api/customer/auth/otp/verify').send({
    challengeId: requested.body.data.challengeId, code: requested.body.data.developmentCode, cartSessionId,
  });
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  return { agent, csrf: verified.body.data.csrfToken as string };
}

async function addItem(sessionId: string, body: Record<string, unknown> = {}) {
  return request(app).post('/api/cart/items').set('x-session-id', sessionId).send(cartItem(body));
}

const orderCount = () => Number(db.get<any>('SELECT COUNT(*) c FROM orders')!.c);

describe('caisse : le prix doit être prouvé AU MOMENT de la commande', () => {
  test('une cotation signée et fraîche commande normalement', async () => {
    const sessionId = uniqueSession('frais');
    const added = await addItem(sessionId, { priceToken: quote() });
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    const customer = await customerLogin(sessionId);
    const checkout = await customer.agent.post('/api/checkout').set('x-session-id', sessionId)
      .set('x-csrf-token', customer.csrf).send(checkoutPayload());
    expect([200, 201]).toContain(checkout.status);
    expect(checkout.body.orderId).toBeTruthy();
  });

  test('une cotation expirée refuse la commande SANS en créer une', async () => {
    const sessionId = uniqueSession('expire');
    // Le jeton est authentique, signé par le serveur — simplement périmé au
    // moment de la commande (il était valide à l'ajout : la route d'ajout le
    // vérifie aussi).
    const added = await addItem(sessionId, { priceToken: quote(150) });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const customer = await customerLogin(sessionId);
    const before = orderCount();
    const checkout = await customer.agent.post('/api/checkout').set('x-session-id', sessionId)
      .set('x-csrf-token', customer.csrf).send(checkoutPayload());
    expect(checkout.status, JSON.stringify(checkout.body)).toBe(409);
    expect(checkout.body.code).toBe('PRICE_VERIFICATION_REQUIRED');
    expect(checkout.body.items[0].reason).toBe('TOKEN_EXPIRED_OR_ALTERED');
    expect(checkout.body.error).toContain('Relancez la vérification');
    // Aucune commande orpheline : le refus intervient avant toute écriture.
    expect(orderCount()).toBe(before);
  });

  test('un prix de ligne modifié après l’ajout est refusé (le jeton ne correspond plus)', async () => {
    const sessionId = uniqueSession('altere');
    const added = await addItem(sessionId, { priceToken: quote() });
    expect(added.status).toBe(201);
    const itemId = String(added.body.cartItem.id);
    // Simule une écriture qui contournerait la route d'ajout : le jeton, lui,
    // reste signé sur l'ancien montant.
    db.run('UPDATE cart_items SET source_price = ? WHERE id = ?', PRICE - 10, itemId);

    const customer = await customerLogin(sessionId);
    const checkout = await customer.agent.post('/api/checkout').set('x-session-id', sessionId)
      .set('x-csrf-token', customer.csrf).send(checkoutPayload());
    expect(checkout.status, JSON.stringify(checkout.body)).toBe(409);
    expect(checkout.body.code).toBe('PRICE_VERIFICATION_REQUIRED');
  });

  test('l’ancien chemin manuel n’est pas cassé : une ligne PENDING_MANUAL commande encore', async () => {
    const sessionId = uniqueSession('manuel');
    // Chemin manuel réel : la couche web n'envoie NI statut NI jeton (Lens n'a
    // rien coté) — la ligne naît donc PENDING_MANUAL côté serveur.
    const added = await addItem(sessionId, { priceVerificationStatus: undefined });
    expect(added.body.cartItem?.priceVerificationStatus).toBe('PENDING_MANUAL');
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    const customer = await customerLogin(sessionId);
    const checkout = await customer.agent.post('/api/checkout').set('x-session-id', sessionId)
      .set('x-csrf-token', customer.csrf).send(checkoutPayload());
    expect([200, 201], JSON.stringify(checkout.body)).toContain(checkout.status);
  });

  test('le panier annonce la même décision que la caisse', async () => {
    const sessionId = uniqueSession('lecture');
    const fresh = await addItem(sessionId, { priceToken: quote() });
    const stale = await addItem(sessionId, { priceToken: quote(150) });
    const manual = await addItem(sessionId, { priceVerificationStatus: undefined });
    expect([fresh.status, stale.status, manual.status], JSON.stringify([fresh.body, stale.body, manual.body])).toEqual([201, 201, 201]);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const read = await request(app).get('/api/cart/items').set('x-session-id', sessionId);
    expect(read.status).toBe(200);
    const trustOf = (id: string) => read.body.items.find((item: any) => item.id === id);
    expect(trustOf(fresh.body.cartItem.id).priceTrust).toBe('FRESH');
    expect(trustOf(stale.body.cartItem.id).priceTrust).toBe('STALE');
    expect(trustOf(stale.body.cartItem.id).priceTrustReason).toBe('TOKEN_EXPIRED_OR_ALTERED');
    expect(trustOf(manual.body.cartItem.id).priceTrust).toBe('MANUAL');
    // Le jeton lui-même n'est jamais renvoyé : la preuve n'est pas un objet client.
    expect(JSON.stringify(read.body)).not.toContain(quote().split('.')[0].slice(0, 24));
    expect(read.body.items.every((item: any) => item.priceToken === undefined)).toBe(true);
  });
});

describe('service de confiance : limites exactes', () => {
  const addDirect = (sessionId: string, token: string | undefined, extra: Record<string, unknown> = {}) =>
    db.addItem(sessionId, {
      store: 'shein', url: URL, title: TITLE, imageUrl: '/uploads/p.jpg',
      sourcePrice: PRICE, sourceCurrency: CURRENCY, priceTND: 200, referenceUrl: '',
      priceVerificationStatus: extra.priceVerificationStatus === 'PENDING_MANUAL' ? 'PENDING_MANUAL' : 'VERIFIED',
      priceToken: token, quantity: 1,
    } as any, null);

  test('une ligne récente sans jeton (écrite avant la preuve persistée) reste acceptable, une ligne ancienne non', () => {
    const sessionId = uniqueSession('heritage');
    const item = addDirect(sessionId, undefined);
    expect(verifyCartPriceTrust(db, [item]).blocking).toHaveLength(0);

    const oldStamp = new Date(Date.now() - CART_QUOTE_LEGACY_GRACE_MS - 60_000).toISOString();
    db.run('UPDATE cart_items SET updated_at = ? WHERE id = ?', oldStamp, item.id);
    const reread = db.getItemById(item.id, sessionId, null)!;
    const report = verifyCartPriceTrust(db, [reread]);
    expect(report.blocking.map((line) => line.reason)).toEqual(['TOKEN_MISSING']);
  });

  test('la frontière d’expiration est celle du jeton, pas une approximation', () => {
    const sessionId = uniqueSession('frontiere');
    const token = quote(60_000);
    const item = addDirect(sessionId, token);
    const claims = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    const atEdge = verifyCartPriceTrust(db, [item], claims.expiresAt);
    expect(atEdge.blocking).toHaveLength(0);
    expect(atEdge.lines[0].expiresAt).toBe(new Date(claims.expiresAt).toISOString());
    const past = verifyCartPriceTrust(db, [item], claims.expiresAt + 1);
    expect(past.blocking.map((line) => line.reason)).toEqual(['TOKEN_EXPIRED_OR_ALTERED']);
  });

  test('une ligne PENDING_MANUAL n’est jamais bloquée par la preuve de prix', () => {
    const sessionId = uniqueSession('manuel-service');
    const item = addDirect(sessionId, undefined, { priceVerificationStatus: 'PENDING_MANUAL' });
    db.run('UPDATE cart_items SET updated_at = ? WHERE id = ?', new Date(Date.now() - 86_400_000).toISOString(), item.id);
    const report = verifyCartPriceTrust(db, [db.getItemById(item.id, sessionId, null)!]);
    expect(report.blocking).toHaveLength(0);
    expect(report.lines[0].status).toBe('MANUAL');
  });
});
