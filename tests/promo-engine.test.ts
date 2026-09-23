import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import {
  DEFAULT_DAY_LADDER,
  capPromoPercent,
  resolvePromo,
  resolvePromoForQuote,
  tunisIsoDay,
  type PromoRule,
} from '../src/services/promotions';
import { estimateWithDb } from '../src/ayrovix/services/currency';
import { calculatePrice } from '../src/services/pricing';

/**
 * Moteur de promotions (management 23/09/2026) : grille jour + règles ciblées,
 * remise sur le prix produit converti, plafond plancher de commission.
 * Déterministe : quel que soit le jour d'exécution, on n'active QUE la règle
 * du jour tunisien courant avec un pourcentage connu.
 */

const rule = (over: Partial<PromoRule>): PromoRule => ({
  id: 'r1', scope: 'DAY', target: '3', percent: 5, label: '', active: true,
  starts_at: '', ends_at: '', updated_at: '', ...over,
});

const uniqueSession = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function activateOnlyTodaysDayRule(percent: number) {
  const isoDay = tunisIsoDay();
  db.run('UPDATE promo_rules SET active=0');
  db.run('UPDATE promo_rules SET active=1, percent=? WHERE scope=? AND target=?', percent, 'DAY', String(isoDay));
}

function restoreDayGrid() {
  DEFAULT_DAY_LADDER.forEach((percent, index) => {
    db.run('UPDATE promo_rules SET active=1, percent=?, label=? WHERE id=?', percent, `Offre ${['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][index]}`, `day_${index + 1}`);
  });
  db.run("DELETE FROM promo_rules WHERE scope IN ('CATEGORY','PRODUCT')");
}

describe('Moteur de promotions — résolution pure', () => {
  test('précédence PRODUIT > CATÉGORIE > JOUR', () => {
    const now = new Date();
    const rules = [
      rule({ id: 'day', scope: 'DAY', target: String(tunisIsoDay(now)), percent: 1 }),
      rule({ id: 'cat', scope: 'CATEGORY', target: 'fashion_shoes', percent: 4 }),
      rule({ id: 'prod', scope: 'PRODUCT', target: 'product_x', percent: 6 }),
    ];
    expect(resolvePromo(rules, { now, categoryId: 'fashion_shoes' })?.ruleId).toBe('cat');
    expect(resolvePromo(rules, { now, categoryId: 'fashion_shoes', productId: 'product_x' })?.ruleId).toBe('prod');
    expect(resolvePromo(rules, { now, categoryId: 'tech_computers' })?.ruleId).toBe('day');
    expect(resolvePromo(rules, { now, productId: 'product_x' })?.ruleId).toBe('prod');
  });

  test('règle inactive ou hors fenêtre ignorée', () => {
    const now = new Date('2026-09-23T12:00:00.000Z');
    expect(resolvePromo([rule({ active: false, target: String(tunisIsoDay(now)) })], { now })).toBeNull();
    expect(resolvePromo([rule({ percent: 0, target: String(tunisIsoDay(now)) })], { now })).toBeNull();
    const future = rule({ starts_at: '2027-01-01T00:00:00.000Z', target: String(tunisIsoDay(now)) });
    expect(resolvePromo([future], { now })).toBeNull();
    const past = rule({ ends_at: '2026-01-01T00:00:00.000Z', target: String(tunisIsoDay(now)) });
    expect(resolvePromo([past], { now })).toBeNull();
  });

  test('plafond : la commission ne descend jamais sous le plancher', () => {
    expect(capPromoPercent(20, 10)).toBe(7);   // 10 − 3 plancher
    expect(capPromoPercent(2, 10)).toBe(2);
    expect(capPromoPercent(5, 4)).toBe(1);     // commission faible → cap serré
    expect(capPromoPercent(3, 3)).toBe(0);     // plancher == commission → aucune remise
  });

  test('jour tunisien (UTC+1 fixe) — frontière de minuit', () => {
    expect(tunisIsoDay(new Date('2026-09-23T12:00:00.000Z'))).toBe(3); // mercredi
    // 23:30 UTC = déjà jeudi 00:30 à Tunis.
    expect(tunisIsoDay(new Date('2026-09-23T23:30:00.000Z'))).toBe(4);
    expect(tunisIsoDay(new Date('2026-09-27T10:00:00.000Z'))).toBe(7); // dimanche
  });

  test('la base seed la grille jour légère (1-2 % semaine, 3-4 % week-end)', () => {
    const dayRules = db.getPromoRules().filter((item) => item.scope === 'DAY').sort((a, b) => Number(a.target) - Number(b.target));
    expect(dayRules).toHaveLength(7);
    expect(dayRules.map((item) => item.percent)).toEqual([1, 1, 2, 2, 2, 3, 4]);
  });
});

describe('Moteur de promotions — panier, estimations et commandes', () => {
  test('la ligne du panier porte la promo du jour : original barré + prix remisé', async () => {
    activateOnlyTodaysDayRule(5);
    try {
      const sessionId = uniqueSession('promo-cart');
      const added = await request(app).post('/api/cart/items').set('x-session-id', sessionId).send({
        store: 'shein', url: 'https://www.shein.com/ensemble-p-9.html', title: 'ensemble tendance',
        imageUrl: '/uploads/e.jpg', sourcePrice: 21.99, sourceCurrency: 'EUR', priceTND: 1, quantity: 1,
      });
      expect(added.status, JSON.stringify(added.body)).toBe(201);

      const cart = await request(app).get('/api/cart/items').set('x-session-id', sessionId);
      const line = cart.body.items[0];
      expect(line.promo).toMatchObject({ percent: 5 });
      const base = calculatePrice(db.getPricingRules(), 21.99, 'EUR', { title: 'ensemble tendance', includeLocalDelivery: false });
      const expectedDiscount = Math.round((base!.convertedPriceTND * 5 / 100) * 1000) / 1000;
      expect(line.promo).toMatchObject({ percent: 5, discountTND: expectedDiscount });
      expect(line.originalLineTotalTND).toBe(base!.totalTND);
      expect(line.lineTotalTND).toBe(Math.round((base!.totalTND - expectedDiscount) * 1000) / 1000);
      expect(line.lineTotalTND).toBeLessThan(line.originalLineTotalTND);
    } finally { restoreDayGrid(); }
  });

  test('les estimations Lens portent la promo (prix remisé + original)', () => {
    activateOnlyTodaysDayRule(5);
    try {
      const estimate = estimateWithDb(db, 50, 'EUR');
      expect(estimate?.promo).not.toBeNull();
      expect(estimate!.promo!.percent).toBe(5);
      expect(estimate!.promo!.priceTnd).toBeLessThan(estimate!.promo!.originalPriceTnd);
      expect(estimate!.priceTnd).toBe(estimate!.promo!.priceTnd);
    } finally { restoreDayGrid(); }
  });

  test('jour désactivé → aucune promo nulle part', async () => {
    db.run('UPDATE promo_rules SET active=0');
    try {
      expect(resolvePromoForQuote(db)).toBeNull();
      expect(estimateWithDb(db, 50, 'EUR')?.promo).toBeNull();
      const sessionId = uniqueSession('promo-off');
      await request(app).post('/api/cart/items').set('x-session-id', sessionId).send({
        store: 'shein', url: 'https://www.shein.com/tshirt-p-10.html', title: 'tshirt coton',
        imageUrl: '/uploads/t.jpg', sourcePrice: 15, sourceCurrency: 'EUR', priceTND: 1, quantity: 1,
      });
      const cart = await request(app).get('/api/cart/items').set('x-session-id', sessionId);
      expect(cart.body.items[0].promo).toBeNull();
    } finally { restoreDayGrid(); }
  });

  test('la commande gèle la promo : discount ligne + promo_json', () => {
    activateOnlyTodaysDayRule(5);
    try {
      const now = new Date().toISOString();
      const accountId = `promo_account_${Date.now()}`;
      const sessionId = `promo-order-${Date.now()}`;
      db.run(`INSERT INTO customer_accounts (id,display_name,email,email_verified_at,status,created_at,updated_at)
        VALUES (?,'Client Promo','promo@ayrovi.test',?,'ACTIVE',?,?)`, accountId, now, now, now);
      db.addItem(sessionId, {
        store: 'shein', url: 'https://www.shein.com/sneakers-p-11.html', title: 'sneakers running',
        imageUrl: '/uploads/s.jpg', sourcePrice: 50, sourceCurrency: 'EUR', priceTND: 1, quantity: 1,
      }, accountId);
      const order = db.createOrderFromCart(sessionId, {
        name: 'Client Promo', email: 'promo@ayrovi.test', phone: '98111001', governorate: 'Tunis', address: 'Tunis',
        paymentMethod: 'BANK_TRANSFER', latitude: null, longitude: null, termsAcceptedAt: now, locale: 'fr-TN',
      }, accountId);
      const item = db.get<any>('SELECT * FROM order_items WHERE order_id=?', order.orderId);
      expect(item.discount_tnd).toBeGreaterThan(0);
      const base = calculatePrice(db.getPricingRules(), 50, 'EUR', { title: 'sneakers running', includeLocalDelivery: false });
      expect(item.discount_tnd).toBe(Math.round((base!.convertedPriceTND * 5 / 100) * 1000) / 1000);
      const promoJson = JSON.parse(db.get<any>('SELECT promo_json FROM orders WHERE id=?', order.orderId).promo_json);
      expect(promoJson.items).toHaveLength(1);
      expect(promoJson.items[0]).toMatchObject({ percent: 5, source: 'DAY' });
      expect(promoJson.resolvedAt).toBeTruthy();
      // Le total commande reflète la remise (ligne remisée + livraison locale).
      const orderRow = db.get<any>('SELECT total_tnd FROM orders WHERE id=?', order.orderId);
      expect(orderRow.total_tnd).toBe(Math.round((item.total_tnd + 8) * 1000) / 1000);
    } finally { restoreDayGrid(); }
  });

  test('commerce-config expose l\'offre du jour pour les badges', async () => {
    activateOnlyTodaysDayRule(4);
    try {
      const response = await request(app).get('/api/public/commerce-config');
      expect(response.status).toBe(200);
      expect(response.body.data.promo).toMatchObject({ percent: 4 });
      expect(response.body.data.promo.day).toBe(tunisIsoDay());
    } finally { restoreDayGrid(); }
  });
});

describe('Moteur de promotions — administration', () => {
  const login = async () => {
    const agent = request.agent(app);
    const response = await agent.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    return { agent, csrf: response.body.data.csrfToken };
  };

  test('GET /promos : grille + garde-fous exposés', async () => {
    const { agent, csrf } = await login();
    const response = await agent.get('/api/admin/promos').set('x-csrf-token', csrf);
    expect(response.status).toBe(200);
    expect(response.body.data.rules.filter((item: any) => item.scope === 'DAY')).toHaveLength(7);
    expect(response.body.data.floorPercent).toBe(3);
    expect(response.body.data.capPercent).toBe(7); // commission 10 − plancher 3
  });

  test('PUT jour + règle catégorie qui surcharge, plafonnée au cap', async () => {
    const { agent, csrf } = await login();
    activateOnlyTodaysDayRule(2);
    try {
      // 1) règle ciblée catégorie chaussures à 8 % → plafonnée à 7 % (cap commission).
      const created = await agent.post('/api/admin/promos').set('x-csrf-token', csrf)
        .send({ scope: 'CATEGORY', target: 'fashion_shoes', percent: 8, label: 'Special sneakers' });
      expect(created.status, JSON.stringify(created.body)).toBe(201);

      const sessionId = uniqueSession('promo-cat');
      const added = await request(app).post('/api/cart/items').set('x-session-id', sessionId).send({
        store: 'nike', url: 'https://www.nike.com/air-p-12.html', title: 'sneakers Air Max',
        imageUrl: '/uploads/n.jpg', sourcePrice: 60, sourceCurrency: 'EUR', priceTND: 1, quantity: 1,
      });
      const catCart = await request(app).get('/api/cart/items').set('x-session-id', sessionId);
      expect(catCart.body.items[0].promo).toMatchObject({ percent: 7, label: 'Special sneakers' });

      // 2) suppression → retour à la grille jour (2 %).
      const deleted = await agent.delete(`/api/admin/promos/${created.body.data.rule.id}`).set('x-csrf-token', csrf);
      expect(deleted.status).toBe(200);
      const cart = await request(app).get('/api/cart/items').set('x-session-id', sessionId);
      expect(cart.body.items[0].promo).toMatchObject({ percent: 2 });

      // 3) validations : pourcentage invalide, catégorie inconnue, jour non supprimable.
      const badPercent = await agent.post('/api/admin/promos').set('x-csrf-token', csrf)
        .send({ scope: 'CATEGORY', target: 'fashion_shoes', percent: 0 });
      expect(badPercent.status).toBe(400);
      const badCategory = await agent.post('/api/admin/promos').set('x-csrf-token', csrf)
        .send({ scope: 'CATEGORY', target: 'does_not_exist', percent: 5 });
      expect(badCategory.status).toBe(400);
      const noDeleteDay = await agent.delete('/api/admin/promos/day_1').set('x-csrf-token', csrf);
      expect(noDeleteDay.status).toBe(400);
    } finally { restoreDayGrid(); }
  });

  test('un rôle sans pricing:write est refusé en écriture', async () => {
    const superAdmin = await login();
    const created = await superAdmin.agent.post('/api/admin/users').set('x-csrf-token', superAdmin.csrf)
      .send({ name: 'Order Promo', email: 'order-promo@test.ayrovi.tn', password: 'OrderPromo2026!', role: 'ORDER_MANAGER' });
    expect(created.status).toBe(201);
    const agent = request.agent(app);
    const response = await agent.post('/api/admin/auth/login').send({ email: 'order-promo@test.ayrovi.tn', password: 'OrderPromo2026!' });
    const csrf = response.body.data.csrfToken;
    expect((await agent.get('/api/admin/promos').set('x-csrf-token', csrf)).status).toBe(200); // commerce:read OK
    expect((await agent.put('/api/admin/promos/day_1').set('x-csrf-token', csrf).send({ percent: 3 })).status).toBe(403);
    expect((await agent.post('/api/admin/promos').set('x-csrf-token', csrf).send({ scope: 'CATEGORY', target: 'fashion_shoes', percent: 3 })).status).toBe(403);
    db.run('DELETE FROM admin_users WHERE email=?', 'order-promo@test.ayrovi.tn');
  });
});
