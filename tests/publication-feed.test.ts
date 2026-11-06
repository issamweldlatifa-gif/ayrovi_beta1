import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { createCustomerSession } from '../src/customer/auth';

const prefix = 'publication_feed_qa_';
let token = '', csrf = '';
beforeAll(() => {
  const now = new Date().toISOString();
  const channel = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
  for (const [suffix, status, date] of [['a', 'publie', '2026-01-01T00:00:00.000Z'], ['b', 'publie', '2026-01-01T00:00:00.000Z'], ['c', 'publie', '2026-01-01T00:00:00.000Z'], ['draft', 'brouillon', now], ['future', 'publie', '2099-01-01T00:00:00.000Z']]) {
    db.run(`INSERT INTO publications(id,title,subtitle,channel_id,image_url,publish_at,status,category,remark,created_at,updated_at)
      VALUES (?,'feed-qa <script>alert(1)</script>','Unique editorial QA',?,'/media/publications/editorial-style.jpg',?,?,'fashion','SECRET_INTERNAL',?,?)`, prefix + suffix, channel, date, status, now, now);
  }
  db.run(`INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES ('feed_account','QA','ACTIVE',?,?)`, now, now);
  const session = createCustomerSession(db, 'feed_account', { ip: '127.0.0.1', headers: {} } as any);
  token = session.token; csrf = session.csrfToken;
});
afterAll(() => {
  db.run("DELETE FROM story_interactions WHERE target_id LIKE 'publication_feed_qa_%'");
  db.run("DELETE FROM publications WHERE id LIKE 'publication_feed_qa_%'");
  db.run("DELETE FROM customer_accounts WHERE id='feed_account'");
});
const feed = () => request(app).get('/api/public/social/publication-feed');
describe('Publication Phase 1 feed contract', () => {
  test('bounded stable cursor pages, literal search, taxonomy and published-only whitelist', async () => {
    const first = await feed().query({ category: 'fashion', q: 'feed-qa', limit: 2 });
    expect(first.status).toBe(200);
    expect(first.body.data.items.map((p: any) => p.id)).toEqual([prefix + 'c', prefix + 'b']);
    expect(JSON.stringify(first.body)).not.toContain('SECRET_INTERNAL');
    expect(first.body.data.items[0]).not.toHaveProperty('remark');
    const next = await feed().query({ category: 'fashion', q: 'feed-qa', limit: 2, cursor: first.body.data.nextCursor });
    expect(next.body.data.items.map((p: any) => p.id)).toEqual([prefix + 'a']);
    expect(next.body.data.nextCursor).toBeNull();
    expect((await feed().query({ category: 'beauty', q: 'feed-qa' })).body.data.items).toEqual([]);
    expect((await feed().query({ q: '%DROP TABLE' })).body.data.items).toEqual([]);
    for (const query of [{ limit: 1000 }, { limit: 'x' }, { category: 'invented' }, { cursor: 'invalid' }, { q: 'x'.repeat(101) }]) expect((await feed().query(query)).status).toBe(400);
  });
  test('likes are persisted per account, guest-safe and never publicly cached', async () => {
    const liked = await request(app).post('/api/public/social/interact').set('Authorization', `Bearer ${token}`).set('x-csrf-token', csrf).send({ type: 'like', targetId: prefix + 'a' });
    expect(liked.status).toBe(200); expect(liked.body.data.liked).toBe(true);
    const own = await feed().set('Authorization', `Bearer ${token}`).query({ post: prefix + 'a' });
    expect(own.body.data.items[0]).toMatchObject({ liked: 1, likes: 1 });
    const guest = await feed().query({ post: prefix + 'a' });
    expect(guest.body.data.items[0]).toMatchObject({ liked: 0, likes: 1 });
    expect(own.headers['cache-control']).toContain('private'); expect(guest.headers['cache-control']).toContain('no-store');
    expect((await request(app).post('/api/public/social/interact').send({ type: 'like', targetId: prefix + 'a' })).status).toBe(401);
  });
  test('external share URL renders the actual publication, escapes text and rejects drafts', async () => {
    const shared = await request(app).get('/publications').query({ post: prefix + 'a' });
    expect(shared.status).toBe(200); expect(shared.text).toContain('ayrovi://publications?post=');
    expect(shared.text).toContain('&lt;script&gt;'); expect(shared.text).not.toContain('<script>');
    expect((await request(app).get('/publications').query({ post: prefix + 'draft' })).status).toBe(404);
    expect((await request(app).get('/publications').query({ post: prefix + 'future' })).status).toBe(404);
  });
  test('authored AI editorial photos exist without made-up products, and do not replace À la une', async () => {
    const response = await feed().query({ q: 'Le temps d’une pause' });
    const item = response.body.data.items.find((row: any) => row.id === 'publication_editorial_lifestyle');
    expect(item).toMatchObject({ category: 'lifestyle', media_origin: 'generated', products: [] });
    expect((await request(app).get(item.image_url)).status).toBe(200);
    const featured = (await request(app).get('/api/public/home-featured')).body.data.publication;
    expect(featured?.id).not.toContain('publication_editorial_');
  });
  test('CRM taxonomy writes are authenticated and validate unsupported categories', async () => {
    const admin = request.agent(app);
    const auth = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    const csrfToken = auth.body.data.csrfToken;
    const path = '/api/admin/publications/' + prefix + 'a';
    expect((await request(app).put(path).send({ category: 'beauty' })).status).toBe(401);
    expect((await admin.put(path).set('x-csrf-token', csrfToken).send({ category: 'invented' })).status).toBe(400);
    expect((await admin.put(path).set('x-csrf-token', csrfToken).send({ category: 'beauty' })).status).toBe(200);
    expect((await feed().query({ post: prefix + 'a', category: 'beauty' })).body.data.items).toHaveLength(1);
  });
});
