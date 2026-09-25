/**
 * GLOBAL DISCOVERY — contrat d'architecture source-agnostique.
 *
 * La plateforme n'est plus construite autour d'une liste fermée de boutiques
 * (SHEIN / Amazon / TEMU / AliExpress). La source est une MÉTADONNÉE :
 *  • n'importe quelle boutique mondiale passe au panier et à la commande ;
 *  • le registre `discovery_sources` et la couche `discovery_markets` sont
 *    administrables depuis le back office ;
 *  • un même produit trouvé chez plusieurs sources devient UN candidat avec
 *    plusieurs offres (groupOffers), jamais une pile de doublons ;
 *  • aucun point d'entrée ne réintroduit de liste fermée de plateformes.
 */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app, db } from '../src/server';
import { groupOffers } from '../src/ayrovix/services/search';
import type { AyrovixCandidate } from '../src/ayrovix/types';

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
const candidate = (over: Partial<AyrovixCandidate>): AyrovixCandidate => ({
  id: 'x', kind: 'external', title: 'Nike Air Max 90', brand: 'Nike', model: null,
  colors: [], sizes: [], source: 'Marché International', sourceUrl: 'https://example.com/p',
  image: '', price: 100, currency: 'EUR', priceTnd: 300, match: 80, ...over,
});

describe('GLOBAL DISCOVERY — architecture source-agnostique', () => {
  test('les registres administrables existent et sont amorcés (sources + marchés)', () => {
    const sources = db.all<any>(`SELECT source_id, source_type, status FROM discovery_sources`);
    expect(sources.length).toBeGreaterThanOrEqual(5);
    // `generic` couvre toute source web non encore identifiée : le moteur ne
    // dépend d'aucune liste fermée pour fonctionner.
    expect(sources.some((row) => row.source_id === 'generic' && row.source_type === 'GENERIC')).toBe(true);
    expect(sources.some((row) => row.source_id === 'amazon')).toBe(true);

    const markets = db.all<any>(`SELECT code, enabled FROM discovery_markets ORDER BY display_order`);
    expect(markets.length).toBeGreaterThanOrEqual(10);
    expect(markets[0].code).toBe('TN');
    expect(markets.filter((row) => row.enabled).length).toBeGreaterThanOrEqual(5);
  });

  test('la source est une métadonnée libre : plus aucune contrainte de liste fermée en base', () => {
    const orders = db.get<any>(`SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'`);
    expect(String(orders.sql)).not.toMatch(/CHECK\s*\(\s*source\s+IN/i);
    const products = db.get<any>(`SELECT sql FROM sqlite_master WHERE type='table' AND name='products'`);
    expect(String(products.sql)).not.toMatch(/CHECK\s*\(\s*source_platform\s+IN/i);
  });

  test('le panier accepte n’importe quelle boutique mondiale et la commande en garde la source', async () => {
    const agent = request.agent(app);
    const sessionId = `global-discovery-${Date.now()}`;
    const phone = '97 654 321';
    const requested = await agent.post('/api/customer/auth/otp/request').send({ phone });
    expect(requested.status).toBe(201);
    const verified = await agent.post('/api/customer/auth/otp/verify').send({
      challengeId: requested.body.data.challengeId,
      code: requested.body.data.developmentCode,
      cartSessionId: sessionId,
    });
    expect(verified.status).toBe(200);
    const csrf = verified.body.data.csrfToken;

    // Une boutique qui n'a jamais été écrite dans le code : preuve qu'aucune
    // liste fermée ne filtre l'entrée.
    const added = await agent
      .post('/api/cart/items')
      .set('x-session-id', sessionId)
      .set('x-csrf-token', csrf)
      .send({
        store: 'bonichon',
        externalId: `BN-${Date.now()}`,
        url: 'https://www.bonichon.tn/produit/sneakers',
        title: 'Sneakers canvas locales',
        imageUrl: '/uploads/product.jpg',
        sourcePrice: 45,
        sourceCurrency: 'EUR',
        priceTND: 210,
        quantity: 1,
      });
    expect(added.status).toBe(201);

    const checkout = await agent
      .post('/api/checkout')
      .set('x-session-id', sessionId)
      .set('x-csrf-token', csrf)
      .send({
        email: 'global.discovery@ayrovi.test',
        termsAccepted: true,
        locale: 'fr-TN',
        name: 'Client Global Discovery',
        phone: '97654321',
        city: 'Tunis',
        address: 'Avenue de la Découverte, Tunis',
        paymentMethod: 'card',
      });
    expect([200, 201]).toContain(checkout.status);
    const order = db.get<any>('SELECT source FROM orders WHERE id=?', checkout.body.orderId);
    // La source réelle remonte telle quelle (uppercase), pas « OTHER » masqué
    // par une liste fermée de plateformes supportées.
    expect(order.source).toBe('BONICHON');
  });

  test('groupOffers keeps distinct merchant listings separate, even with the same title', () => {
    const result = groupOffers([
      candidate({ id: 'a', source: 'Boutique A', sourceUrl: 'https://a.com/p', price: 120, priceTnd: 360, match: 70 }),
      candidate({ id: 'b', source: 'Boutique B', sourceUrl: 'https://b.com/p', price: 90, priceTnd: 280, match: 75 }),
      candidate({ id: 'c', source: 'Boutique C', sourceUrl: 'https://c.com/p', price: 150, priceTnd: 430, match: 60 }),
      candidate({ id: 'd', title: 'Adidas Samba OG', brand: 'Adidas', source: 'Boutique D', sourceUrl: 'https://d.com/p', price: 80, priceTnd: 250, match: 65 }),
    ]);
    expect(result.map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.map(item => item.priceTnd)).toEqual([360, 280, 430, 250]);
    expect(result.every(item => item.offerCount === undefined)).toBe(true);
  });

  test('tracking-only URL duplicates collapse, but merchant variant URLs remain distinct', () => {
    const result = groupOffers([
      candidate({ id: 'a', sourceUrl: 'https://a.com/product?color=blue&utm_source=lens' }),
      candidate({ id: 'b', sourceUrl: 'https://a.com/product?color=blue&utm_source=search' }),
      candidate({ id: 'c', sourceUrl: 'https://a.com/product?color=red&utm_source=lens' }),
    ]);
    expect(result.map(item => item.id)).toEqual(['a', 'c']);
  });

  test('le catalogue AYROVI n’est jamais regroupé avec les offres externes', () => {
    const result = groupOffers([
      candidate({ id: 'cat', kind: 'catalog', source: 'Collection AYROVI', title: 'Nike Air Max 90', priceTnd: 300, match: 90 }),
      candidate({ id: 'ext', source: 'Boutique B', title: 'Nike Air Max 90', priceTnd: 280, match: 75 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.offerCount === undefined)).toBe(true);
  });

  test('aucun point d’entrée ne réintroduit une liste fermée de plateformes', () => {
    // Le panier (API) ne filtre plus par une liste de boutiques supportées.
    expect(read('src/api/routes.ts')).not.toContain('SUPPORTED_STORES');
    // La base n'a plus de liste fermée de plateformes marchandes (la signature
    // exacte de l'ancien CHECK fermé ne doit plus exister nulle part).
    expect(read('src/db/database.ts')).not.toContain("'SHEIN','AMAZON','TEMU','ALIEXPRES S'".replace('ALIEXPRES S', 'ALIEXPRESS'));
    // Les textes publics parlent du web mondial, pas de trois enseignes.
    expect(read('client/index.html')).not.toContain('SHEIN, Amazon, TEMU');
    expect(read('client/src/components/ProductDrawer.tsx')).not.toContain('SHEIN, Amazon ou TEMU');
    expect(read('client/src/ayrovix/components/LensLauncher.tsx')).not.toContain('SHEIN, Zara, Amazon');
  });
});
