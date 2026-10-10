/**
 * Contenu « Shoppable » (Reels, Publications, Stories) — règles et parcours serveur.
 *
 *  • mode normal = aucune carte, produit effacé ; mode shoppable = produit obligatoire ;
 *  • un produit vendable = ACTIVE + prix > 0 ; sinon refus côté serveur (400) ;
 *  • la lecture publique joint le catalogue : prix/stock frais, jamais de copie ;
 *  • produit désactivé après coup ⇒ `product: null`, le contenu reste, sans lien mort ;
 *  • la migration est additive : les lignes existantes sont `normal`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import {
  decideShoppable, linkedProductFromJoin, publicLinkedProduct, isSellableProduct, normalizeContentMode,
  type ProductSnapshot,
} from '../src/services/shoppableContent';

const product = (over: Partial<ProductSnapshot> = {}): ProductSnapshot => ({
  id: 'p', name: 'Pantalon taille haute', image: '/m/p.jpg', status: 'ACTIVE', final_price: 89, stock_status: 'AVAILABLE', ...over,
});

describe('règles pures — shoppableContent', () => {
  test('un mode inconnu retombe sur normal', () => {
    expect(normalizeContentMode('shoppable')).toBe('shoppable');
    expect(normalizeContentMode('n’importe quoi')).toBe('normal');
    expect(normalizeContentMode(undefined)).toBe('normal');
  });

  test('normal ignore et efface le produit fourni', () => {
    expect(decideShoppable('normal', 'p1', () => product())).toEqual({ ok: true, mode: 'normal', productId: null });
  });

  test('shoppable sans produit est refusé (PRODUCT_REQUIRED)', () => {
    const decision = decideShoppable('shoppable', '  ', () => product());
    expect(decision).toMatchObject({ ok: false, code: 'PRODUCT_REQUIRED' });
  });

  test('shoppable avec produit inactif, archivé, sans prix ou introuvable est refusé (PRODUCT_INVALID)', () => {
    expect(decideShoppable('shoppable', 'p', () => product({ status: 'INACTIVE' }))).toMatchObject({ ok: false, code: 'PRODUCT_INVALID' });
    expect(decideShoppable('shoppable', 'p', () => product({ status: 'ARCHIVED' }))).toMatchObject({ ok: false, code: 'PRODUCT_INVALID' });
    expect(decideShoppable('shoppable', 'p', () => product({ final_price: 0 }))).toMatchObject({ ok: false, code: 'PRODUCT_INVALID' });
    expect(decideShoppable('shoppable', 'p', () => null)).toMatchObject({ ok: false, code: 'PRODUCT_INVALID' });
  });

  test('shoppable avec produit vendable est accepté', () => {
    expect(decideShoppable('shoppable', 'p', () => product())).toEqual({ ok: true, mode: 'shoppable', productId: 'p' });
    expect(isSellableProduct(product())).toBe(true);
  });

  test('la carte publique est une liste blanche et disparaît si le contenu est normal', () => {
    const card = publicLinkedProduct('shoppable', product());
    expect(Object.keys(card ?? {}).sort()).toEqual(['available', 'currency', 'id', 'image', 'name', 'price', 'stockStatus']);
    expect(card).toMatchObject({ price: 89, currency: 'TND', available: true });
    expect(publicLinkedProduct('normal', product())).toBeNull();
  });

  test('un produit en rupture reste affichable mais marqué indisponible', () => {
    expect(publicLinkedProduct('shoppable', product({ stock_status: 'OUT_OF_STOCK' }))).toMatchObject({ available: false });
  });

  test('la jointure ne sort jamais un produit désactivé', () => {
    expect(linkedProductFromJoin({
      content_mode: 'shoppable', lp_id: 'p', lp_name: 'X', lp_image: '', lp_status: 'INACTIVE', lp_final_price: 10, lp_stock_status: 'AVAILABLE',
    })).toBeNull();
    expect(linkedProductFromJoin({ content_mode: 'shoppable', lp_id: null })).toBeNull();
  });
});

describe('parcours serveur — admin + lecture publique', () => {
  const admin = request.agent(app);
  let csrf = '';
  const CHANNEL = 'story_pub_shoppable_test';
  const ACTIVE = 'prod_shoppable_active';
  const INACTIVE = 'prod_shoppable_inactive';
  const PAST = '2026-01-01T00:00:00.000Z';

  beforeAll(async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
    const now = new Date().toISOString();
    db.run(`INSERT OR REPLACE INTO story_publishers (id,slug,name,subtitle,avatar,official,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`, CHANNEL, 'shoppable-test', 'AYROVI', '', '', 1, now, now);
    db.run(`INSERT OR REPLACE INTO products (id,name,image,status,final_price,original_price,currency,stock_status,source_platform,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ACTIVE, 'Pantalon taille haute', '/m/pantalon.jpg', 'ACTIVE', 89, 40, 'TND', 'AVAILABLE', 'OTHER', now, now);
    db.run(`INSERT OR REPLACE INTO products (id,name,image,status,final_price,original_price,currency,stock_status,source_platform,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, INACTIVE, 'Ancien modèle', '', 'INACTIVE', 50, 20, 'TND', 'AVAILABLE', 'OTHER', now, now);
  });

  afterAll(() => {
    db.run(`UPDATE products SET status='ACTIVE' WHERE id=?`, ACTIVE);
  });

  test('un Reel shoppable sans produit est refusé (400 PRODUCT_REQUIRED)', async () => {
    const res = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Test', channel_id: CHANNEL, video_url: '/v/a.mp4', status: 'publie', publish_at: PAST, content_mode: 'shoppable',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRODUCT_REQUIRED');
  });

  test('un Reel shoppable avec un produit inactif est refusé (400 PRODUCT_INVALID)', async () => {
    const res = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Test', channel_id: CHANNEL, video_url: '/v/a.mp4', status: 'publie', publish_at: PAST, content_mode: 'shoppable', product_id: INACTIVE,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRODUCT_INVALID');
  });

  test('un Reel shoppable valide apparaît publiquement avec sa carte produit', async () => {
    const created = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Reel produit', channel_id: CHANNEL, video_url: '/v/shop.mp4', status: 'publie', publish_at: PAST, content_mode: 'shoppable', product_id: ACTIVE,
    });
    expect(created.status).toBe(201);
    const pub = await request(app).get('/api/public/social/reels');
    const item = pub.body.data.find((r: any) => r.id === created.body.data.id);
    expect(item.product).toMatchObject({ id: ACTIVE, name: 'Pantalon taille haute', price: 89, currency: 'TND', available: true });
    expect(Object.keys(item).some((key) => key.startsWith('lp_'))).toBe(false);
  });

  test('la couverture d’un Reel est enregistrée, exposée, et conservée si le champ est absent à la modification', async () => {
    const created = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Reel couverture', channel_id: CHANNEL, video_url: '/v/c.mp4', status: 'publie', publish_at: PAST, content_mode: 'normal', poster_url: '/m/cover-reel.jpg',
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const pub = await request(app).get('/api/public/social/reels');
    expect(pub.body.data.find((r: any) => r.id === id).poster_url).toBe('/m/cover-reel.jpg');
    const updated = await admin.put(`/api/admin/reels/${id}`).set('x-csrf-token', csrf).send({ title: 'Reel couverture 2' });
    expect(updated.status).toBe(200);
    const row = db.get<any>('SELECT poster_url FROM reels WHERE id=?', id);
    expect(row.poster_url).toBe('/m/cover-reel.jpg');
  });

  test('un Reel normal n’a aucune carte, même si on lui donne un produit', async () => {
    const created = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Reel normal', channel_id: CHANNEL, video_url: '/v/n.mp4', status: 'publie', publish_at: PAST, content_mode: 'normal', product_id: ACTIVE,
    });
    expect(created.status).toBe(201);
    const row = db.get<any>('SELECT product_id,content_mode FROM reels WHERE id=?', created.body.data.id);
    expect(row).toEqual({ product_id: null, content_mode: 'normal' });
    const pub = await request(app).get('/api/public/social/reels');
    expect(pub.body.data.find((r: any) => r.id === created.body.data.id).product).toBeNull();
  });

  test('produit désactivé après publication ⇒ carte retirée, contenu gardé, aucune erreur', async () => {
    const created = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Reel bientôt inactif', channel_id: CHANNEL, video_url: '/v/x.mp4', status: 'publie', publish_at: PAST, content_mode: 'shoppable', product_id: ACTIVE,
    });
    expect(created.status).toBe(201);
    db.run(`UPDATE products SET status='INACTIVE' WHERE id=?`, ACTIVE);
    try {
      const pub = await request(app).get('/api/public/social/reels');
      expect(pub.status).toBe(200);
      const item = pub.body.data.find((r: any) => r.id === created.body.data.id);
      expect(item).toBeDefined();
      expect(item.product).toBeNull();
    } finally {
      db.run(`UPDATE products SET status='ACTIVE' WHERE id=?`, ACTIVE);
    }
  });

  test('une Publication shoppable : refus sans produit, carte publique avec produit', async () => {
    const refused = await admin.post('/api/admin/publications').set('x-csrf-token', csrf).send({
      title: 'Look', channel_id: CHANNEL, image_url: '/m/look.jpg', status: 'publie', publish_at: PAST, content_mode: 'shoppable',
    });
    expect(refused.status).toBe(400);
    const ok = await admin.post('/api/admin/publications').set('x-csrf-token', csrf).send({
      title: 'Look', channel_id: CHANNEL, image_url: '/m/look.jpg', status: 'publie', publish_at: PAST, content_mode: 'shoppable', product_id: ACTIVE,
    });
    expect(ok.status).toBe(201);
    const pub = await request(app).get('/api/public/social/publications');
    expect(pub.body.data.find((r: any) => r.id === ok.body.data.id).product).toMatchObject({ id: ACTIVE });
  });

  test('une Story : le mode shoppable exige un produit vendable (refus côté serveur)', async () => {
    const base = { media_type: 'IMAGE', media_url: '/m/s.jpg', title: 'Story', publish_at: PAST, status: 'PUBLISHED' };
    const noProduct = await admin.post('/api/admin/stories').set('x-csrf-token', csrf).send({ ...base, content_mode: 'shoppable' });
    expect(noProduct.status).toBe(400);
    const inactive = await admin.post('/api/admin/stories').set('x-csrf-token', csrf).send({ ...base, content_mode: 'shoppable', product_id: INACTIVE });
    expect(inactive.status).toBe(400);
    const ok = await admin.post('/api/admin/stories').set('x-csrf-token', csrf).send({ ...base, content_mode: 'shoppable', product_id: ACTIVE });
    expect(ok.status).toBe(201);
    const pub = await request(app).get('/api/public/stories');
    const story = pub.body.data.find((s: any) => s.id === ok.body.data.id);
    expect(story.product).toMatchObject({ id: ACTIVE, price: 89 });
  });

  test('une Story shoppable dont le produit disparaît ne garde plus de lien (pas de CTA mort)', async () => {
    const base = { media_type: 'IMAGE', media_url: '/m/s2.jpg', title: 'Story 2', publish_at: PAST, status: 'PUBLISHED' };
    const ok = await admin.post('/api/admin/stories').set('x-csrf-token', csrf).send({ ...base, content_mode: 'shoppable', product_id: ACTIVE });
    expect(ok.status).toBe(201);
    db.run(`UPDATE products SET status='ARCHIVED' WHERE id=?`, ACTIVE);
    try {
      const pub = await request(app).get('/api/public/stories');
      const story = pub.body.data.find((s: any) => s.id === ok.body.data.id);
      expect(story.product).toBeNull();
      expect(story.product_id).toBeNull();
    } finally {
      db.run(`UPDATE products SET status='ACTIVE' WHERE id=?`, ACTIVE);
    }
  });

  test('« Découvrir » : la fiche publique d’un produit ne sort que si le produit est actif', async () => {
    const active = await request(app).get(`/api/public/products/${ACTIVE}`);
    expect(active.status).toBe(200);
    expect(active.body.data).toMatchObject({ id: ACTIVE, name: 'Pantalon taille haute', finalPrice: 89 });
    const inactive = await request(app).get(`/api/public/products/${INACTIVE}`);
    expect(inactive.status).toBe(404);
    const missing = await request(app).get('/api/public/products/prod_inexistant');
    expect(missing.status).toBe(404);
  });

  test('migration additive : les colonnes existent et une ligne sans mode vaut « normal »', () => {
    const cols = (table: string) => (db.all<any>(`PRAGMA table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
    expect(cols('reels')).toEqual(expect.arrayContaining(['content_mode', 'product_id']));
    expect(cols('publications')).toEqual(expect.arrayContaining(['content_mode', 'product_id']));
    expect(cols('stories')).toEqual(expect.arrayContaining(['content_mode']));
    const id = `reel_legacy_${Date.now()}`;
    const now = new Date().toISOString();
    db.run(`INSERT INTO reels (id,title,channel_id,video_url,publish_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      id, 'Ancien', CHANNEL, '/v/old.mp4', now, 'publie', now, now);
    expect(db.get<any>('SELECT content_mode,product_id FROM reels WHERE id=?', id)).toEqual({ content_mode: 'normal', product_id: null });
  });
});
