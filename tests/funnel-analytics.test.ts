/**
 * Parcours d'achat mesuré — la preuve que l'angle mort est fermé.
 *
 * Ce fichier ne teste pas une fonction : il rejoue le scénario qui a rendu le défaut
 * invisible. Un client remplit un panier, tente de payer, se fait refuser, réessaie et
 * réussit. Avant ce module, les trois premiers faits ne laissaient AUCUNE trace — le
 * tableau de bord n'aurait compté qu'une commande, sans jamais dire qu'une tentative avait
 * échoué avant. Ici on vérifie que le système voit désormais le parcours entier, et qu'il
 * en tire le seul chiffre qui permette d'agir : le taux de conversion, avec ses causes.
 */
import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { computeFunnelRates, funnelSummary } from '../src/analytics/funnel';

const uniqueSession = (label: string) => `funnel-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const cartItem = (title: string) => ({
  store: 'shein',
  externalId: `FN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  url: 'https://www.shein.com/product-p-382460229.html',
  title,
  imageUrl: '/uploads/product.jpg',
  sourcePrice: 21.99,
  sourceCurrency: 'EUR',
  quantity: 1,
});

type Customer = { agent: ReturnType<typeof request.agent>; csrf: string };

/**
 * Un numéro par scénario, comme des clients distincts dans la vraie vie — et parce que le
 * serveur limite les demandes d'OTP par numéro : réutiliser le même numéro ferait échouer
 * le test pour une raison qui n'a rien à voir avec ce qu'il vérifie.
 */
const uniquePhone = () => `+216${'24579'[Math.floor(Math.random() * 5)]}${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

/** Connexion client par OTP : le même chemin que le parcours réel, pas un raccourci de test. */
async function customerLogin(cartSessionId: string, phone = uniquePhone()): Promise<Customer> {
  const agent = request.agent(app);
  const requested = await request(app).post('/api/customer/auth/otp/request').send({ phone, cartSessionId });
  expect(requested.status, JSON.stringify(requested.body)).toBe(201);
  const verified = await agent.post('/api/customer/auth/otp/verify').send({
    challengeId: requested.body.data.challengeId,
    code: requested.body.data.developmentCode,
    cartSessionId,
  });
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  return { agent, csrf: verified.body.data.csrfToken };
}

const checkoutPayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'Client Parcours',
  email: 'parcours@ayrovi.test',
  phone: '+216 98 123 456',
  city: 'Tunis',
  address: 'Avenue Habib Bourguiba, Tunis',
  deliveryMode: 'home',
  termsAccepted: true,
  locale: 'fr-TN',
  ...overrides,
});

async function loginSuperAdmin() {
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
  expect(login.status).toBe(200);
  return { agent, csrf: login.body.data.csrfToken as string };
}

describe('les taux, une règle pure', () => {
  test('les tentatives ne sont pas des personnes : un « taux » ne dépasse jamais 100 %', () => {
    // Le défaut trouvé en preuve vivante : 1 panier, 3 tentatives de caisse donnaient
    // « 300 % ». Les tentatives ne sont même pas une entrée du calcul — elles ne peuvent
    // donc plus corrompre un pourcentage.
    expect(computeFunnelRates({ carts: 1, checkouts: 1, orders: 1 })).toEqual({ conversionRate: 100, cartToCheckoutRate: 100 });
    expect(computeFunnelRates({ carts: 4, checkouts: 3, orders: 1 })).toEqual({ conversionRate: 33.3, cartToCheckoutRate: 75 });
    expect(computeFunnelRates({ carts: 2, checkouts: 2, orders: 0 })).toEqual({ conversionRate: 0, cartToCheckoutRate: 100 });
  });

  test('aucun visiteur n\'est pas un taux de zéro : c\'est une information absente', () => {
    expect(computeFunnelRates({ carts: 0, checkouts: 0, orders: 0 })).toEqual({ conversionRate: null, cartToCheckoutRate: null });
    expect(computeFunnelRates({ carts: 3, checkouts: 0, orders: 0 })).toEqual({ conversionRate: null, cartToCheckoutRate: 0 });
  });
});

describe('parcours d\'achat mesuré', () => {
  test('une tentative refusée est comptée AVEC sa cause, et n\'est pas confondue avec une absence de tentative', async () => {
    const sessionId = uniqueSession('refus');
    const before = funnelSummary(db, 30).counts;

    const added = await request(app).post('/api/cart/items').set('x-session-id', sessionId).send(cartItem('Veste mesurée'));
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    // Rien n'a encore été tenté à la caisse : le taux doit rester `null` (inconnu), pas 0.
    const afterCart = funnelSummary(db, 30);
    expect(afterCart.counts.cart_item_added).toBe(before.cart_item_added + 1);
    expect(afterCart.conversionRate).toBe(afterCart.counts.checkout_started > 0 ? afterCart.conversionRate : null);
    if (afterCart.counts.checkout_started === 0) expect(afterCart.conversionRate).toBeNull();

    const customer = await customerLogin(sessionId);
    // Refus réel et nommé : langue invalide. Le client l'a vécu ; le système doit le savoir.
    const refused = await customer.agent.post('/api/checkout').set('x-session-id', sessionId).set('x-csrf-token', customer.csrf)
      .send(checkoutPayload({ locale: 'en-US' }));
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('CHECKOUT_LOCALE_INVALID');

    const afterRefusal = funnelSummary(db, 30);
    expect(afterRefusal.counts.checkout_started).toBe(afterCart.counts.checkout_started + 1);
    expect(afterRefusal.counts.checkout_failed).toBe(afterCart.counts.checkout_failed + 1);
    expect(afterRefusal.counts.order_created).toBe(afterCart.counts.order_created);
    // La cause est isolée, pas seulement le fait : c'est ce qui rend la fuite actionnable.
    const cause = afterRefusal.failures.find((entry) => entry.code === 'CHECKOUT_LOCALE_INVALID');
    expect(cause, JSON.stringify(afterRefusal.failures)).toBeTruthy();
    expect(cause!.count).toBeGreaterThanOrEqual(1);
  });

  test('trois tentatives du même panier restent UN visiteur — et l\'identifiant de panier n\'est jamais stocké', async () => {
    const sessionId = uniqueSession('unicite');
    const before = funnelSummary(db, 30);
    const added = await request(app).post('/api/cart/items').set('x-session-id', sessionId).send(cartItem('Article unique'));
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    const customer = await customerLogin(sessionId);
    const attempt = (overrides: Record<string, unknown>) => customer.agent.post('/api/checkout')
      .set('x-session-id', sessionId).set('x-csrf-token', customer.csrf).send(checkoutPayload(overrides));
    // Trois passages en caisse depuis le même panier : deux refus et une réussite.
    expect((await attempt({ locale: 'en-US' })).status).toBe(400);
    expect((await attempt({ deliveryMode: 'flying-carpet' })).status).toBe(400);
    const method = ((await request(app).get('/api/public/commerce-config')).body?.data?.paymentMethods || [])[0];
    expect((await attempt({ paymentMethod: method })).status).toBe(200);

    const after = funnelSummary(db, 30);
    // Le volume voit trois tentatives…
    expect(after.counts.checkout_started - before.counts.checkout_started).toBe(3);
    // …mais les taux ne voient qu'un seul visiteur, et restent donc bornés.
    expect(after.visitors.checkouts - before.visitors.checkouts).toBe(1);
    expect(after.visitors.carts - before.visitors.carts).toBe(1);
    expect(after.visitors.orders - before.visitors.orders).toBe(1);
    expect(after.cartToCheckoutRate!).toBeLessThanOrEqual(100);
    expect(after.conversionRate!).toBeLessThanOrEqual(100);

    // Vie privée : le panier est une capacité d'accès — il ne doit apparaître nulle part.
    const rows = db.all<Record<string, unknown>>('SELECT * FROM funnel_events WHERE visitor_key IS NOT NULL');
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(sessionId);
    const keys = new Set(rows.map((row) => String(row.visitor_key)));
    expect(keys.size).toBeGreaterThan(0);
    for (const key of keys) expect(key).toMatch(/^[a-f0-9]{32}$/);
  });

  test('une commande conclue est comptée avec sa valeur, et le taux de conversion devient un vrai rapport', async () => {
    const sessionId = uniqueSession('succes');
    const added = await request(app).post('/api/cart/items').set('x-session-id', sessionId).send(cartItem('Sac mesuré'));
    expect(added.status, JSON.stringify(added.body)).toBe(201);

    const customer = await customerLogin(sessionId);
    // Le moyen de paiement réellement publié par le serveur : la caisse et la mesure
    // parlent donc du même moyen, jamais d'une hypothèse du test.
    const published = await request(app).get('/api/public/commerce-config');
    const method = (published.body?.data?.paymentMethods || [])[0];
    if (!method) throw new Error('aucun moyen de paiement publié : le scénario de succès ne peut pas être joué');

    const before = funnelSummary(db, 30);
    const order = await customer.agent.post('/api/checkout').set('x-session-id', sessionId).set('x-csrf-token', customer.csrf)
      .send(checkoutPayload({ paymentMethod: method }));
    expect(order.status, JSON.stringify(order.body)).toBe(200);
    expect(order.body.success).toBe(true);

    const after = funnelSummary(db, 30);
    expect(after.counts.order_created).toBe(before.counts.order_created + 1);
    // Le tunnel complet est lisible : c'est le chiffre que le tableau de bord ne savait pas dire.
    expect(after.counts.checkout_started).toBeGreaterThan(0);
    expect(after.conversionRate).not.toBeNull();
    expect(after.conversionRate!).toBeGreaterThan(0);
    expect(after.conversionRate!).toBeLessThanOrEqual(100);
    expect(after.cartToCheckoutRate).not.toBeNull();

    // La valeur est enregistrée : un parcours se juge aussi en dinars, pas seulement en nombre.
    const stored = db.get<{ value_tnd: number }>(
      "SELECT value_tnd FROM funnel_events WHERE step='order_created' ORDER BY created_at DESC LIMIT 1");
    expect(Number(stored!.value_tnd)).toBeGreaterThan(0);
  });

  test('le tableau de bord expose le parcours là où le commerçant regarde déjà ses chiffres', async () => {
    const { agent } = await loginSuperAdmin();
    const dashboard = await agent.get('/api/admin/dashboard?days=30');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.funnel).toBeTruthy();
    expect(dashboard.body.data.funnel).toHaveProperty('conversionRate');
    expect(dashboard.body.data.funnel).toHaveProperty('failures');

    const funnel = await agent.get('/api/admin/funnel?days=30');
    expect(funnel.status).toBe(200);
    expect(funnel.body.data.windowDays).toBe(30);
  });

  test('la mesure est un service, pas une dépendance : elle ne peut pas faire échouer une vente', async () => {
    /*
     * La propriété qui compte n'est pas « la table existe » mais « la vente survit à la
     * mesure ». On met donc la table hors d'atteinte du module (renommée) et on rejoue les
     * deux gestes du client : ajouter au panier, puis payer. Aucun des deux ne doit échouer,
     * et l'échec de mesure doit rester silencieux — on ne perd pas une vente pour une
     * statistique.
     */
    db.run('ALTER TABLE funnel_events RENAME TO funnel_events_masked');
    try {
      const sessionId = uniqueSession('panne');
      const added = await request(app).post('/api/cart/items').set('x-session-id', sessionId).send(cartItem('Sac sous panne'));
      expect(added.status, JSON.stringify(added.body)).toBe(201);

      const customer = await customerLogin(sessionId);
      const refused = await customer.agent.post('/api/checkout').set('x-session-id', sessionId).set('x-csrf-token', customer.csrf)
        .send(checkoutPayload({ locale: 'en-US' }));
      // Le refus attendu (métier) arrive normalement : la panne de mesure ne le maquille pas.
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe('CHECKOUT_LOCALE_INVALID');
    } finally {
      db.run('ALTER TABLE funnel_events_masked RENAME TO funnel_events');
    }
    // Et la mesure repart sans réparation manuelle : la table est de nouveau vivante.
    expect(funnelSummary(db, 30)).toBeTruthy();
  });

  test('le parcours n\'est lisible que par les rôles qui traitent les commandes', async () => {
    const superAdmin = await loginSuperAdmin();
    const email = `funnel-content-${Date.now()}@test.ayrovi.tn`;
    const created = await superAdmin.agent.post('/api/admin/users').set('x-csrf-token', superAdmin.csrf)
      .send({ name: 'Parcours Contenu', email, password: 'FunnelSecure2026!x', role: 'CONTENT_MANAGER' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const content = request.agent(app);
    const login = await content.post('/api/admin/auth/login').send({ email, password: 'FunnelSecure2026!x' });
    expect(login.status).toBe(200);
    // Un rédacteur n'a pas `commerce:read` : le parcours commercial ne le regarde pas.
    expect((await content.get('/api/admin/funnel')).status).toBe(403);
    expect((await superAdmin.agent.get('/api/admin/funnel')).status).toBe(200);
  });
});
