import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { QatafoDatabase, resolvePrepaidCheckoutMethods } from '../src/db/database';
import { createPublicRouter } from '../src/public/routes';
import { readSocialFeed } from '../src/social-commerce/feed';
import { activeEdition, updateEditionState, readEditionState } from '../src/social-commerce/editions';
import { parseSocialEdition, type SocialEdition } from '../shared/socialCommerce';

const now = '2026-11-19T00:00:00.000Z';
const past = '2026-10-02T00:00:00.000Z';
const future = '2030-11-27T00:00:00.000Z';
let db: QatafoDatabase;
const draft: SocialEdition = { number: 1, title: 'Une édition', subtitle: 'Cette semaine', cover: '/media/edition.webp', startsAt: past, endsAt: future,
  entries: [{ kind: 'article', id: 'article-1', newsId: 'news-1' }, { kind: 'look', id: 'look-1', title: 'Look', description: '', image: '/media/look.webp', pins: [{ productId: 'p1', x: 45, y: 55 }] },
    { kind: 'pick', id: 'pick-1', title: 'Choix', description: '', productId: 'p2' }] };
const save = (edition: SocialEdition) => updateEditionState(db, 'save', readEditionState(db).revision, edition, now);
const publish = () => updateEditionState(db, 'publish', readEditionState(db).revision, null, now);

function reel(id: string, product: string | null = null, at = past, status = 'publie') {
  const publisher = db.get<{ id: string }>('SELECT id FROM story_publishers LIMIT 1')!.id;
  db.run(`INSERT INTO reels (id,title,channel_id,video_url,publish_at,status,product_id,content_mode,created_at,updated_at)
    VALUES (?,'Fixture',?,'/media/fixture.mp4',?,?,?,?,?,?)`, id, publisher, at, status, product, product ? 'shoppable' : 'normal', past, past);
}
function story(id: string, expires: string | null = null, media = '/media/story.webp') {
  db.run(`INSERT INTO stories (id,media_url,title,publish_at,expires_at,status,created_at,updated_at)
    VALUES (?,?,'Story',?,?,'PUBLISHED',?,?)`, id, media, past, expires, past, past);
}
function product(id: string, stock = 'AVAILABLE') {
  db.run(`INSERT INTO products (id,name,brand_name,status,stock_status,final_price,created_at,updated_at)
    VALUES (?,'Produit','Même marque','ACTIVE',?,49.9,?,?)`, id, stock, past, past);
}

beforeEach(() => {
  db = new QatafoDatabase(':memory:');
  db.run('DELETE FROM reels'); db.run('DELETE FROM stories'); db.run('DELETE FROM news_items');
  db.run(`INSERT INTO news_items (id,title,summary,category,published_at,status,created_at,updated_at)
    VALUES ('news-1','Article réel','Résumé','OTHER',?,'PUBLISHED',?,?)`, past, past, past);
});
afterEach(() => db.close());

describe('Social Commerce: bounded cursor, live content and checkout policy', () => {
  it('pages and alternates sources without duplicates, excludes draft/future/expired sources and does not leak joins', () => {
    for (let i = 0; i < 33; i++) { reel(`r${i}`); story(`s${i}`); }
    reel('draft', null, past, 'brouillon'); reel('future', null, future); story('expired', now);
    expect(save(draft).status).toBe(200); expect(publish().status).toBe(200);
    const all = [];
    let cursor: string | undefined;
    do {
      const page = readSocialFeed(db, 'all', cursor, now);
      expect(page.items.length).toBeLessThanOrEqual(8);
      all.push(...page.items);
      cursor = page.nextCursor || undefined;
      expect(all.length).toBeLessThanOrEqual(67);
    } while (cursor);
    expect(all).toHaveLength(67);
    expect(new Set(all.map(r => r.id)).size).toBe(67);
    expect(all.slice(0, 3).map(r => r.kind)).toEqual(['reel', 'article', 'story']);
    expect(all.some((r, index) => index > 0 && all[index - 1].kind === r.kind)).toBe(false);
    expect(JSON.stringify(all)).not.toContain('lp_');
    expect(readSocialFeed(db, 'magazine', undefined, now).items.map(r => r.id)).toEqual(['article-1']);
    expect(readSocialFeed(db, 'stories', undefined, now).items.every(r => r.kind === 'story')).toBe(true);
  });

  it('suppresses unavailable offers and repeated brands across a cursor, preserves editorial media and rechecks variant stock', () => {
    product('p1'); product('p2', 'OUT_OF_STOCK'); product('p3');
    db.run(`INSERT INTO catalogue_variants (id,product_id,sku,size,status,created_at,updated_at)
      VALUES ('v1','p3','test-sku','L','ACTIVE',?,?)`, past, past);
    reel('r50', 'p1'); reel('r49', 'p2'); reel('r48', 'p3');
    for (let i = 30; i >= 20; i--) reel(`r${i}`, 'p1');
    const first = readSocialFeed(db, 'reels', undefined, now);
    expect(first.items[0]).toMatchObject({ id: 'r50', products: [{ id: 'p1', price: 49.9, currency: 'TND' }] });
    expect(first.items.slice(1).every(row => row.kind === 'reel' && row.products.length === 0)).toBe(true);
    const next = readSocialFeed(db, 'reels', first.nextCursor, now);
    expect(next.items.slice(0, 2).every(row => row.kind === 'reel' && row.products.length === 0)).toBe(true);
    expect(next.items[2]).toMatchObject({ products: [{ id: 'p1' }] });
    expect(save({ ...draft, entries: [{ kind: 'pick', id: 'v-pick', title: 'Variante', description: '', productId: 'p3' }] }).status).toBe(200);
    expect(publish().status).toBe(200);
    expect(readSocialFeed(db, 'magazine', undefined, now).items).toEqual([]);
    db.run(`INSERT INTO inventory_stock_items (id,product_id,variant_id,quantity,created_at,updated_at) VALUES ('inv','p3','v1',2,?,?)`, past, past);
    expect(readSocialFeed(db, 'magazine', undefined, now).items[0]).toMatchObject({ product: { id: 'p3', available: true } });
  });

  it('validates eligibility and scheduling, prevents lost edits, supports rollback and resets a stale cursor', () => {
    expect(parseSocialEdition({ ...draft, startsAt: 'late' })).toBeNull();
    expect(parseSocialEdition({ ...draft, cover: '/api/private' })).toBeNull();
    expect(parseSocialEdition({ ...draft, cover: '/\\other.example/media/cover' })).toBeNull();
    expect(save(draft).status).toBe(200);
    expect(readSocialFeed(db, 'all', undefined, now).edition).toBeNull();
    expect(publish().status).toBe(200);
    for (let i = 0; i < 9; i++) reel(`r${i}`);
    const cursor = readSocialFeed(db, 'all', undefined, now).nextCursor;
    expect(updateEditionState(db, 'save', 0, draft, now).status).toBe(409);
    expect(save({ ...draft, number: 2, startsAt: '2026-11-21T00:00:00.000Z' }).status).toBe(200);
    expect(publish().status).toBe(200);
    expect(activeEdition(readEditionState(db), now)?.number).toBe(1);
    const later = '2026-11-22T00:00:00.000Z';
    expect(activeEdition(readEditionState(db), later)?.number).toBe(2);
    expect(() => readSocialFeed(db, 'all', cursor, later)).toThrow('SOCIAL_FEED_CHANGED');
    expect(updateEditionState(db, 'rollback', readEditionState(db).revision, null, later).status).toBe(200);
    expect(activeEdition(readEditionState(db), later)?.number).toBe(1);
  });

  it('exposes only the public projection, rejects malformed or cross-filter cursors', async () => {
    for (let i = 0; i < 10; i++) reel(`http${i}`);
    const app = express(); app.use('/api/public', createPublicRouter(db));
    const route = '/api/public/social/commerce-feed';
    const first = await request(app).get(route).query({ filter: 'reels' });
    expect(first.status).toBe(200); expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body.data.items).toHaveLength(8);
    const second = await request(app).get(route).query({ filter: 'reels', cursor: first.body.data.nextCursor });
    expect(second.body.data.items).toHaveLength(2);
    expect((await request(app).get(route).query({ filter: 'stories', cursor: first.body.data.nextCursor })).status).toBe(400);
    expect((await request(app).get(route).query({ cursor: ['a', 'b'] })).status).toBe(400);
  });

  it('never publishes COD for the shared storefront, even with old settings', () => {
    expect(resolvePrepaidCheckoutMethods(['COD', 'BANK_TRANSFER'])).toEqual(['BANK_TRANSFER']);
    expect(resolvePrepaidCheckoutMethods(['COD'])).toContain('CARD');
    expect(resolvePrepaidCheckoutMethods([])).not.toContain('COD');
  });
});
