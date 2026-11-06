import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { createCustomerSession } from '../src/customer/auth';
import { normalizePublicationContent } from '../shared/publicationContent';
const id = 'publication_content_qa';
let channel = '', token = '', csrf = '';
beforeAll(() => {
  const now = new Date().toISOString(); channel = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
  db.run(`INSERT INTO publications(id,title,channel_id,image_url,publish_at,status,created_at,updated_at,post_type,audience,topic,sponsored,description)
    VALUES (?,'Content QA',?,'/media/test.jpg',?,'publie',?,?,'carousel','women','accessories',1,'Long content')`, id, channel, now, now, now);
  db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES ('content_account','QA','ACTIVE',?,?)", now, now);
  const auth = createCustomerSession(db, 'content_account', { ip: '127.0.0.1', headers: {} } as any); token = auth.token; csrf = auth.csrfToken;
});
afterAll(() => { db.run('DELETE FROM story_interactions WHERE target_id=?', id); db.run('DELETE FROM publications WHERE id=?', id); db.run("DELETE FROM customer_accounts WHERE id='content_account'"); });
const feed = (query: object = {}, auth = true) => { const req = request(app).get('/api/public/social/publication-feed').query({ post: id, ...query }); return auth ? req.set('Authorization', `Bearer ${token}`) : req; };
const preference = (body: object) => request(app).put(`/api/public/social/publications/${id}/preferences`).set('Authorization', `Bearer ${token}`).set('x-csrf-token', csrf).send(body);
describe('Publication media and preferences', () => {
  test('normalizes legacy covers, six templates and position while rejecting malformed playable media', () => {
    expect(normalizePublicationContent({})).toMatchObject({ type: 'image', sponsored: false, media: [] });
    const image = { type: 'image', url: '/media/a.jpg' };
    expect(normalizePublicationContent({ post_type: 'carousel', media: [image, image] })?.media).toHaveLength(2);
    expect(normalizePublicationContent({ post_type: 'carousel', media: [image] })).toBeNull();
    expect(normalizePublicationContent({ post_type: 'video', image_url: '/media/poster.jpg', media: [{ type: 'video', url: 'https://example.com/clip.mp4' }] })?.media[0].poster).toBe('/media/poster.jpg');
    for (const body of [{ post_type: 'unknown' }, { sponsored: 'yes' }, { description_position: 'middle' }, { audience: 'unknown' }, { media: [null] }, { media: [{ type: 'image', url: 'javascript:alert(1)' }] }, { post_type: 'video', media: [{ type: 'video', url: 'https://youtube.com/watch?v=x' }] }]) expect(normalizePublicationContent(body)).toBeNull();
  });
  test('visual template validation is independent from media type and never accepts broken video/carousel combinations', () => {
    for (const template of ['auto','photo','split','campaign']) expect(normalizePublicationContent({ template_id: template })).toMatchObject({ template });
    for (const body of [{ template_id: 'unknown' }, { template_id: 'video' }, { template_id: 'carousel' }, { action_target: 'javascript:bad' }]) expect(normalizePublicationContent(body)).toBeNull();
    expect(normalizePublicationContent({ template_id: 'split', action_label: 'Découvrir', action_target: 'products' })).toMatchObject({ template: 'split', actionLabel: 'Découvrir', actionTarget: 'products' });
  });
  test('filters are real intersections and expose authored sponsorship', async () => {
    expect((await feed({ type: 'carousel', audience: 'women', topic: 'accessories' })).body.data.items[0]).toMatchObject({ sponsored: 1, description: 'Long content' });
    for (const filter of [{ type: 'video' }, { audience: 'men' }, { topic: 'shoes' }, { saved: 1 }, { following: 1 }, { hasProducts: 1 }]) expect((await feed(filter)).body.data.items).toEqual([]);
    expect((await feed({ type: 'invalid' })).status).toBe(400);
  });
  test('preference writes require customer and CSRF, validate payload, and isolate guest state', async () => {
    const url = `/api/public/social/publications/${id}/preferences`;
    expect((await request(app).put(url).send({ saved: true })).status).toBe(401);
    expect((await request(app).put(url).set('Authorization', `Bearer ${token}`).send({ saved: true })).status).toBe(403);
    expect((await preference({ saved: 'yes' })).status).toBe(400);
    expect((await preference({ feedback: 'arbitrary' })).status).toBe(400);
    expect((await preference({ saved: true })).status).toBe(200);
    expect((await preference({ saved: true })).status).toBe(200);
    expect((await feed({ saved: 1 })).body.data.items[0].saved).toBe(1);
    expect((await feed({}, false)).body.data.items[0].saved).toBe(0);
    expect((await preference({ feedback: 'not_interested' })).status).toBe(200);
    expect((await feed()).body.data.items).toEqual([]);
    expect((await feed({}, false)).body.data.items).toHaveLength(1);
    expect((await preference({ feedback: '' })).status).toBe(200);
    expect((await feed()).body.data.items[0].saved).toBe(1);
    expect((await preference({ saved: false })).status).toBe(200);
  });
  test('publisher following is idempotent, account-scoped and changes following filter', async () => {
    const url = `/api/public/social/publishers/${channel}/follow`;
    for (let i = 0; i < 2; i++) expect((await request(app).put(url).set('Authorization', `Bearer ${token}`).set('x-csrf-token', csrf).send({ following: true })).status).toBe(200);
    expect((await feed({ following: 1 })).body.data.items).toHaveLength(1);
    expect((await feed({ following: 1 }, false)).body.data.items).toEqual([]);
    expect((await request(app).put(url).set('Authorization', `Bearer ${token}`).set('x-csrf-token', csrf).send({ following: false })).status).toBe(200);
    expect((await feed({ following: 1 })).body.data.items).toEqual([]);
  });
  test('CRM validates content before writing and reports observed deduplicated engagement only', async () => {
    const admin = request.agent(app);
    expect((await request(app).get('/api/admin/publication-insights')).status).toBe(401);
    const auth = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    const headers = { 'x-csrf-token': auth.body.data.csrfToken };
    expect((await admin.put(`/api/admin/publications/${id}`).set(headers).send({ post_type: 'video', media: [] })).status).toBe(400);
    expect((await admin.put(`/api/admin/publications/${id}`).set(headers).send({ post_type: 'product', media: [] })).status).toBe(400);
    const media = [{ type: 'image', url: '/a.jpg' }, { type: 'image', url: '/b.jpg' }];
    expect((await admin.put(`/api/admin/publications/${id}`).set(headers).send({ post_type: 'carousel', media, description_position: 'above' })).status).toBe(200);
    expect((await admin.put(`/api/admin/publications/${id}`).set(headers).send({ template_id: 'split', action_label: 'Découvrir', action_target: 'products' })).status).toBe(400);
    expect((await admin.put(`/api/admin/publications/${id}`).set(headers).send({ template_id: 'split', action_label: 'Découvrir', action_target: 'detail' })).status).toBe(200);
    expect((await feed()).body.data.items[0]).toMatchObject({ template_id: 'split', action_label: 'Découvrir', action_target: 'detail' });
    expect((await admin.put(`/api/admin/publications/${id}`).set(headers).send({ template_id: 'invalid' })).status).toBe(400);
    const row = (await feed()).body.data.items[0];
    expect(row.description_position).toBe('above'); expect(JSON.parse(row.media_json)).toHaveLength(2);
    for (let i = 0; i < 2; i++) expect((await request(app).post('/api/public/social/interact').set('x-session-id', 'content_qa_session').send({ type: 'view', targetId: id })).status).toBe(200);
    const insights = (await admin.get('/api/admin/publication-insights')).body.data.find((entry: any) => entry.id === id);
    expect(insights).toMatchObject({ views: 1, shares: 0, likes: 0, comments: 0 });
    expect(insights).not.toHaveProperty('revenue');
  });

});
