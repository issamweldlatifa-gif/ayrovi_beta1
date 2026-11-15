/**
 * Bug « un seul cœur marche » (capture du 15/11, Publication) — correctif du 16/11.
 *
 * Cause : `UNIQUE(account_id, source_url)` alors que les produits du catalogue
 * officiel n'ont pas d'adresse source (`''`). Le premier favori prenait la valeur
 * vide, chaque suivant renvoyait 500 — et l'appli avalait l'erreur.
 *
 *  • plusieurs produits officiels deviennent favoris pour le même compte ;
 *  • l'unicité par adresse reste vraie pour les favoris EXTERNES ;
 *  • une base créée avant le 16/11 est reconstruite une fois, lignes intactes.
 */
import Database from 'better-sqlite3';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { app, db } from '../src/server';
import { officialProductId } from '../src/catalogue/installOfficialCatalogue';
import { relaxCustomerFavoritesSourceUnique } from '../src/db/customerFavoritesMigration';

async function signIn(phone: string) {
  const agent = request.agent(app);
  const requested = await agent.post('/api/customer/auth/otp/request').send({ phone });
  expect(requested.status).toBe(201);
  const verified = await agent.post('/api/customer/auth/otp/verify').send({
    challengeId: requested.body.data.challengeId,
    code: requested.body.data.developmentCode,
  });
  expect(verified.status).toBe(200);
  return { agent, csrf: verified.body.data.csrfToken as string };
}

describe('cœurs des produits officiels', () => {
  test('chaque produit officiel devient favori — plus de 500 après le premier', async () => {
    const { agent, csrf } = await signIn('92 416 116');
    const ids = ['adidas-essentials-hoodie', 'nike-dri-fit-legend', 'levis-501-original', 'jbl-go-4'].map(officialProductId);
    const created: string[] = [];
    for (const productId of ids) {
      const response = await agent.post('/api/customer/account/favorites').set('x-csrf-token', csrf).send({ productId });
      expect(response.status, productId).toBe(201);
      expect(response.body.data.product_id).toBe(productId);
      created.push(response.body.data.id);
    }
    expect(new Set(created).size).toBe(ids.length);
    // Second appui sur le même produit : le favori existant, pas un doublon.
    const again = await agent.post('/api/customer/account/favorites').set('x-csrf-token', csrf).send({ productId: ids[0] });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(created[0]);
    const list = await agent.get('/api/customer/account/favorites');
    expect(list.body.data.map((row: { product_id: string }) => row.product_id).sort()).toEqual([...ids].sort());
    // Retirer un cœur n'empêche pas d'en remettre un autre.
    expect((await agent.delete(`/api/customer/account/favorites/${created[1]}`).set('x-csrf-token', csrf)).status).toBe(200);
    expect((await agent.post('/api/customer/account/favorites').set('x-csrf-token', csrf).send({ productId: ids[1] })).status).toBe(201);
  });

  test('un favori externe reste unique par adresse', async () => {
    const { agent, csrf } = await signIn('92 416 117');
    const body = { sourceUrl: 'https://www.example.com/p/1', title: 'Externe', imageUrl: '', priceTND: 10 };
    const first = await agent.post('/api/customer/account/favorites').set('x-csrf-token', csrf).send(body);
    const second = await agent.post('/api/customer/account/favorites').set('x-csrf-token', csrf).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name='ux_customer_favorites_source'")?.sql).toMatch(/WHERE source_url <> ''/);
  });
});

describe('base créée avant le 16/11', () => {
  test('la contrainte d’adresse est retirée une fois, favoris intacts', () => {
    const old = new Database(':memory:');
    old.exec(`CREATE TABLE customer_accounts (id TEXT PRIMARY KEY);
      CREATE TABLE products (id TEXT PRIMARY KEY);
      INSERT INTO customer_accounts VALUES ('a1');
      INSERT INTO products VALUES ('p1'),('p2');
      CREATE TABLE customer_favorites (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        source_url TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        image_url TEXT NOT NULL DEFAULT '',
        price_tnd REAL,
        created_at TEXT NOT NULL,
        UNIQUE(account_id, product_id),
        UNIQUE(account_id, source_url)
      );
      INSERT INTO customer_favorites (id,account_id,product_id,title,created_at) VALUES ('f1','a1','p1','Un','2026-11-15');`);
    const insertSecond = () => old.prepare("INSERT INTO customer_favorites (id,account_id,product_id,title,created_at) VALUES ('f2','a1','p2','Deux','t')").run();
    expect(insertSecond).toThrow(/UNIQUE/);

    expect(relaxCustomerFavoritesSourceUnique(old)).toBe(true);
    expect(old.prepare('SELECT id,product_id,title FROM customer_favorites').all()).toEqual([{ id: 'f1', product_id: 'p1', title: 'Un' }]);
    insertSecond();
    old.prepare("INSERT INTO customer_favorites (id,account_id,source_url,title,created_at) VALUES ('e1','a1','https://x.test','E','t')").run();
    expect(() => old.prepare("INSERT INTO customer_favorites (id,account_id,source_url,title,created_at) VALUES ('e2','a1','https://x.test','E','t')").run()).toThrow(/UNIQUE/);
    expect(() => old.prepare("INSERT INTO customer_favorites (id,account_id,product_id,title,created_at) VALUES ('f3','a1','p2','Doublon','t')").run()).toThrow(/UNIQUE/);
    expect(old.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'customer_favorites%'").all()).toEqual([{ name: 'customer_favorites' }]);
    expect(relaxCustomerFavoritesSourceUnique(old)).toBe(false);
    old.close();
  });
});
