/**
 * Produits temporaires (Reels, Stories, Publications) — règles et parcours serveur.
 *
 *  • un produit temporaire est une ligne `products` avec `visibility='CONTENT'` ;
 *  • il n'entre jamais dans le catalogue public, la recherche ni la liste admin du catalogue ;
 *  • la fiche (« Découvrir ») ne s'ouvre que si le produit est ACTIVE ET lié à un contenu publié et daté ;
 *  • les contenus stockent seulement `product_id` : aucune copie, aucun doublon à la modification ;
 *  • le catalogue existant ne change pas.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { catalogSearch } from '../src/ayrovix/services/search';

const PAST = '2026-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';
const SESSION = 'sess-temp-products-test-0001';

describe('Produits temporaires — Reels, Stories, Publications', () => {
  const admin = request.agent(app);
  let csrf = '';
  const CHANNEL = 'story_pub_temp_products_test';
  const CATALOG_ACTIVE = 'prod_temp_catalog_active';
  const CATALOG_INACTIVE = 'prod_temp_catalog_inactive';
  const createdProductIds: string[] = [];

  const productCount = () => Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM products')?.n ?? 0);

  const createTemp = async (over: Record<string, unknown> = {}) => {
    const res = await admin.post('/api/admin/catalogue/content-products').set('x-csrf-token', csrf).send({
      name: 'Veste temporaire', final_price: 120, original_price: 80, currency: 'TND', status: 'DRAFT', ...over,
    });
    if (res.status !== 201) throw new Error(`createTemp ${res.status} ${JSON.stringify(res.body).slice(0, 400)}`);
    createdProductIds.push(res.body.data.id);
    return res;
  };

  const reel = (body: Record<string, unknown>) => admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
    title: 'Reel temporaire', channel_id: CHANNEL, video_url: '/v/temp.mp4', status: 'publie', publish_at: PAST, ...body,
  });

  beforeAll(async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
    const now = new Date().toISOString();
    db.run(`INSERT OR REPLACE INTO story_publishers (id,slug,name,subtitle,avatar,official,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`, CHANNEL, 'temp-products-test', 'AYROVI', '', '', 1, now, now);
    db.run(`INSERT OR REPLACE INTO products (id,name,image,status,final_price,original_price,currency,stock_status,source_platform,visibility,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, CATALOG_ACTIVE, 'Chemise catalogue', '/m/chemise.jpg', 'ACTIVE', 60, 40, 'TND', 'AVAILABLE', 'OTHER', 'CATALOG', now, now);
    db.run(`INSERT OR REPLACE INTO products (id,name,image,status,final_price,original_price,currency,stock_status,source_platform,visibility,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, CATALOG_INACTIVE, 'Ancien catalogue', '', 'INACTIVE', 50, 20, 'TND', 'AVAILABLE', 'OTHER', 'CATALOG', now, now);
  });

  afterAll(() => {
    for (const id of createdProductIds) db.run('DELETE FROM products WHERE id=?', id);
  });

  test('la création exige une session admin (pas d’écriture anonyme)', async () => {
    const res = await request(app).post('/api/admin/catalogue/content-products').send({ name: 'Anonyme', final_price: 10, currency: 'TND' });
    expect([401, 403]).toContain(res.status);
  });

  test('un produit temporaire est créé en CONTENT, même si le client demande CATALOG', async () => {
    const res = await createTemp({ visibility: 'CATALOG' });
    expect(res.status).toBe(201);
    expect(res.body.data.visibility).toBe('CONTENT');
    expect(res.body.data.product_code).toBeTruthy();
  });

  test('le produit temporaire n’apparaît ni dans la liste admin du catalogue, ni dans la liste publique', async () => {
    const created = await createTemp({ name: 'Robe secrète temporaire', status: 'ACTIVE' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const catalogList = await admin.get('/api/admin/catalogue/products?page_size=100').set('x-csrf-token', csrf);
    expect(catalogList.body.data.some((p: any) => p.id === id)).toBe(false);
    const publicList = await request(app).get('/api/public/products?limit=50');
    expect(publicList.body.data.some((p: any) => p.id === id)).toBe(false);
    const contentList = await admin.get('/api/admin/catalogue/content-products?page_size=100');
    expect(contentList.body.data.some((p: any) => p.id === id)).toBe(true);
  });

  test('la recherche de catalogue ne retourne jamais un produit temporaire (un produit catalogue au même nom, oui)', async () => {
    const created = await createTemp({ name: 'Blouson Zephyrix temporaire', status: 'ACTIVE' });
    const id = created.body.data.id;
    db.run(`INSERT OR REPLACE INTO products (id,name,image,source_url,status,final_price,original_price,currency,stock_status,source_platform,visibility,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, 'prod_temp_catalog_zephyrix', 'Blouson Zephyrix temporaire', '/m/zephyrix.jpg', 'https://www.example-shop.tn/zephyrix', 'ACTIVE', 90, 70, 'TND', 'AVAILABLE', 'OTHER', 'CATALOG', new Date().toISOString(), new Date().toISOString());
    createdProductIds.push('prod_temp_catalog_zephyrix');
    const result: any = catalogSearch(db, null, 'Blouson Zephyrix temporaire', 20);
    const text = JSON.stringify(result);
    expect(text).toContain('prod_temp_catalog_zephyrix');
    expect(text).not.toContain(id);
  });

  test('un produit temporaire en brouillon n’est pas accessible, même lié à un contenu publié', async () => {
    const created = await createTemp({ name: 'Brouillon temporaire', status: 'DRAFT' });
    const id = created.body.data.id;
    // Le lien d'un contenu vers un brouillon est refusé : on passe par la base pour simuler un lien existant.
    const r = await reel({ title: 'Reel brouillon', content_mode: 'normal' });
    db.run('UPDATE reels SET product_id=?, content_mode=? WHERE id=?', id, 'shoppable', r.body.data.id);
    expect((await request(app).get(`/api/public/products/${id}`)).status).toBe(404);
  });

  test('un produit publié mais sans contenu publié n’est pas accessible ; il devient accessible dès qu’un contenu publié le référence', async () => {
    const created = await createTemp({ name: 'Veste Découvrir', status: 'ACTIVE' });
    const id = created.body.data.id;
    expect((await request(app).get(`/api/public/products/${id}`)).status).toBe(404);

    const r = await reel({ title: 'Reel Découvrir', content_mode: 'shoppable', product_id: id });
    expect(r.status).toBe(201);
    const detail = await request(app).get(`/api/public/products/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ id, name: 'Veste Découvrir', visibility: 'CONTENT' });
    expect(detail.body.data.finalPrice).toBeGreaterThan(0);
  });

  test('une Publication publiée ouvre la fiche de son produit temporaire, et la modification ne duplique rien', async () => {
    const created = await createTemp({ name: 'Sac publication', status: 'ACTIVE' });
    const id = created.body.data.id;
    const pub = await admin.post('/api/admin/publications').set('x-csrf-token', csrf).send({
      title: 'Publication temporaire', subtitle: '', channel_id: CHANNEL, image_url: '/m/pub.jpg', status: 'publie',
      publish_at: PAST, content_mode: 'shoppable', product_id: id,
    });
    expect(pub.status).toBe(201);
    expect((await request(app).get(`/api/public/products/${id}`)).status).toBe(200);
    const before = productCount();
    const edited = await admin.put(`/api/admin/publications/${pub.body.data.id}`).set('x-csrf-token', csrf).send({ title: 'Publication modifiée' });
    expect(edited.status).toBe(200);
    expect(productCount()).toBe(before);
    expect(db.get<any>('SELECT product_id FROM publications WHERE id=?', pub.body.data.id).product_id).toBe(id);
  });

  test('un contenu programmé ou non publié ne rend pas le produit accessible', async () => {
    const created = await createTemp({ name: 'Veste programmée', status: 'ACTIVE' });
    const id = created.body.data.id;
    await reel({ title: 'Reel programmé', status: 'programme', publish_at: FUTURE, content_mode: 'shoppable', product_id: id });
    expect((await request(app).get(`/api/public/products/${id}`)).status).toBe(404);
  });

  test('une association shoppable à un produit temporaire brouillon est refusée (publier le produit d’abord)', async () => {
    const created = await createTemp({ name: 'Brouillon à lier', status: 'DRAFT' });
    const res = await reel({ title: 'Reel refusé', content_mode: 'shoppable', product_id: created.body.data.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRODUCT_INVALID');
  });

  test('éditer le produit met à jour la carte du contenu, sans copie stockée dans le contenu', async () => {
    const created = await createTemp({ name: 'Nom initial', status: 'ACTIVE' });
    const id = created.body.data.id;
    const r = await reel({ title: 'Reel édition', content_mode: 'shoppable', product_id: id });
    const reelId = r.body.data.id;
    const edit = await admin.put(`/api/admin/catalogue/content-products/${id}`).set('x-csrf-token', csrf).send({ name: 'Nom modifié' });
    expect(edit.status).toBe(200);
    const pub = await request(app).get('/api/public/social/reels');
    expect(pub.body.data.find((item: any) => item.id === reelId).product).toMatchObject({ id, name: 'Nom modifié' });
    const row = db.get<any>('SELECT * FROM reels WHERE id=?', reelId);
    expect(Object.keys(row).some((column) => /product_(name|price|image)/.test(column))).toBe(false);
    expect(row.product_id).toBe(id);
  });

  test('modifier ou republier un contenu ne crée jamais un nouveau produit', async () => {
    const created = await createTemp({ name: 'Pas de doublon', status: 'ACTIVE' });
    const id = created.body.data.id;
    const r = await reel({ title: 'Reel sans doublon', content_mode: 'shoppable', product_id: id });
    const before = productCount();
    const updated = await admin.put(`/api/admin/reels/${r.body.data.id}`).set('x-csrf-token', csrf).send({ title: 'Reel republié', status: 'publie' });
    expect(updated.status).toBe(200);
    expect(productCount()).toBe(before);
    const row = db.get<any>('SELECT product_id FROM reels WHERE id=?', r.body.data.id);
    expect(row.product_id).toBe(id);
  });

  test('archiver le produit retire la fiche et la carte, sans supprimer le contenu', async () => {
    const created = await createTemp({ name: 'À archiver', status: 'ACTIVE' });
    const id = created.body.data.id;
    const r = await reel({ title: 'Reel archivé produit', content_mode: 'shoppable', product_id: id });
    const del = await admin.delete(`/api/admin/catalogue/content-products/${id}`).set('x-csrf-token', csrf);
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/public/products/${id}`)).status).toBe(404);
    const pub = await request(app).get('/api/public/social/reels');
    const item = pub.body.data.find((x: any) => x.id === r.body.data.id);
    expect(item).toBeTruthy();
    expect(item.product).toBeNull();
  });

  test('une Story publiée et non expirée ouvre la fiche ; une Story expirée non', async () => {
    const created = await createTemp({ name: 'Produit story', status: 'ACTIVE' });
    const id = created.body.data.id;
    const now = new Date().toISOString();
    db.run(`INSERT INTO stories (id,title,media_type,media_url,product_id,publish_at,expires_at,status,priority,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, 'story_temp_live', 'Story live', 'IMAGE', '/m/story.jpg', id, PAST, FUTURE, 'PUBLISHED', 1, now, now);
    expect((await request(app).get(`/api/public/products/${id}`)).status).toBe(200);
    db.run(`UPDATE stories SET expires_at=? WHERE id=?`, PAST, 'story_temp_live');
    expect((await request(app).get(`/api/public/products/${id}`)).status).toBe(404);
    db.run('DELETE FROM stories WHERE id=?', 'story_temp_live');
  });

  test('l’ajout au panier refuse un produit temporaire qui n’est pas accessible, et accepte un produit temporaire publié', async () => {
    const created = await createTemp({ name: 'Panier temporaire', status: 'ACTIVE' });
    const id = created.body.data.id;
    const blocked = await request(app).post('/api/cart/catalog').set('x-session-id', SESSION).send({ productId: id, quantity: 1 });
    expect(blocked.status).toBe(404);
    await reel({ title: 'Reel panier', content_mode: 'shoppable', product_id: id });
    const allowed = await request(app).post('/api/cart/catalog').set('x-session-id', SESSION).send({ productId: id, quantity: 1 });
    expect([200, 201]).toContain(allowed.status);
  });

  test('le catalogue existant ne change pas : seuls les produits CATALOG ACTIVE sont listés et ouvrables', async () => {
    const list = await request(app).get('/api/public/products?limit=50');
    expect(list.body.data.some((p: any) => p.id === CATALOG_ACTIVE)).toBe(true);
    expect(list.body.data.some((p: any) => p.id === CATALOG_INACTIVE)).toBe(false);
    expect((await request(app).get(`/api/public/products/${CATALOG_ACTIVE}`)).body.data.visibility).toBe('CATALOG');
    expect((await request(app).get(`/api/public/products/${CATALOG_INACTIVE}`)).status).toBe(404);
    const catalogList = await admin.get('/api/admin/catalogue/products?page_size=100');
    expect(catalogList.body.data.some((p: any) => p.id === CATALOG_ACTIVE)).toBe(true);
  });

  test('la route temporaire ne modifie ni n’ouvre une fiche du catalogue', async () => {
    const put = await admin.put(`/api/admin/catalogue/content-products/${CATALOG_ACTIVE}`).set('x-csrf-token', csrf).send({ name: 'Piratage' });
    expect(put.status).toBe(404);
    const del = await admin.delete(`/api/admin/catalogue/content-products/${CATALOG_ACTIVE}`).set('x-csrf-token', csrf);
    expect(del.status).toBe(404);
    expect(db.get<any>('SELECT name,status FROM products WHERE id=?', CATALOG_ACTIVE)).toMatchObject({ name: 'Chemise catalogue', status: 'ACTIVE' });
  });

  test('la visibilité ne se modifie pas depuis une route d’édition', async () => {
    const created = await createTemp({ name: 'Visibilité figée', status: 'ACTIVE' });
    const id = created.body.data.id;
    await admin.put(`/api/admin/catalogue/products/${id}`).set('x-csrf-token', csrf).send({ visibility: 'CATALOG' });
    expect(db.get<any>('SELECT visibility FROM products WHERE id=?', id).visibility).toBe('CONTENT');
  });
});
