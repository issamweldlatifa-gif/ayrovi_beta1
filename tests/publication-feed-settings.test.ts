import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_PUBLICATION_FEED_SETTINGS as defaults, normalizePublicationFeedSettings } from '../shared/publicationFeed';
import { readPublicationFeedSettings } from '../src/services/publicationFeedSettings';
const admin = request.agent(app);
let csrf = '';
beforeAll(async () => { const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' }); csrf = login.body.data.csrfToken; });
afterEach(() => { db.run("UPDATE publication_feed_settings SET config_json=? WHERE id='global'", JSON.stringify(defaults)); });
const write = (body: unknown) => admin.put('/api/admin/publication-feed-settings').set('x-csrf-token', csrf).send(body as any);
describe('Publication feed CMS settings', () => {
  test('reads bilingual defaults without serving cached stale configuration', async () => {
    const result = await request(app).get('/api/public/social/publication-feed-settings');
    expect(result.status).toBe(200); expect(result.body.data).toEqual(defaults);
    expect(result.headers['cache-control']).toContain('no-store');
  });
  test('persists title, layout and category order/visibility without modifying publication data', async () => {
    const count = db.get<any>('SELECT COUNT(*) n FROM publications').n;
    const categories = [...defaults.categories].reverse().map(c => c.key === 'fashion' ? { ...c, labelFr: 'Style', enabled: false } : c);
    const response = await write({ titleFr: 'Découvrir ZAYROVI', titleAr: 'اكتشف زيروفي', layout: 'compact', categories });
    expect(response.status).toBe(200);
    expect((await request(app).get('/api/public/social/publication-feed-settings')).body.data).toMatchObject({ titleFr: 'Découvrir ZAYROVI', layout: 'compact', categories });
    expect((await request(app).get('/api/public/social/publication-feed').query({ category: 'fashion' })).status).toBe(400);
    expect(db.get<any>('SELECT COUNT(*) n FROM publications').n).toBe(count);
  });
  test('section visibility hides the new feed, not published content or the legacy API', async () => {
    expect((await write({ enabled: false })).status).toBe(200);
    expect((await request(app).get('/api/public/social/publication-feed')).body.data).toEqual({ items: [], nextCursor: null });
    expect((await request(app).get('/api/public/social/publications')).body.data.length).toBeGreaterThan(0);
  });
  test('rejects broken settings instead of silently dropping categories or accepting false booleans', async () => {
    for (const body of [{ enabled: 'false' }, { layout: 'invented' }, { titleFr: '' }, { categories: [] },
      { categories: defaults.categories.map(c => ({ ...c, key: 'beauty' })) },
      { categories: defaults.categories.map(c => c.key === '' ? { ...c, enabled: false } : c) }]) {
      expect(normalizePublicationFeedSettings(body)).toBeNull();
      expect((await write(body)).status).toBe(400);
    }
    expect(readPublicationFeedSettings(db)).toEqual(defaults);
  });
  test('enforces authentication, CSRF and content permissions', async () => {
    expect((await request(app).put('/api/admin/publication-feed-settings').send({ enabled: false })).status).toBe(401);
    expect((await admin.put('/api/admin/publication-feed-settings').send({ enabled: false })).status).toBe(403);
    const email = 'feed-settings-orders@test.invalid';
    expect((await admin.post('/api/admin/users').set('x-csrf-token', csrf).send({ name: 'Orders', email, password: 'FeedSettings2026!', role: 'ORDER_MANAGER' })).status).toBe(201);
    const orders = request.agent(app);
    const login = await orders.post('/api/admin/auth/login').send({ email, password: 'FeedSettings2026!' });
    expect((await orders.get('/api/admin/publication-feed-settings')).status).toBe(403);
    expect((await orders.put('/api/admin/publication-feed-settings').set('x-csrf-token', login.body.data.csrfToken).send({ enabled: false })).status).toBe(403);
  });
});

test('CMS settings survive an actual SQLite restart without being reset to defaults', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'publication-settings-'));
  let store: QatafoDatabase | undefined;
  try {
    const file = path.join(dir, 'store.sqlite');
    store = new QatafoDatabase(file);
    const settings = { ...defaults, titleFr: 'Persistent title', layout: 'portrait', enabled: false };
    store.run("UPDATE publication_feed_settings SET config_json=? WHERE id='global'", JSON.stringify(settings));
    store.close(); store = new QatafoDatabase(file);
    expect(readPublicationFeedSettings(store)).toEqual(settings);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
