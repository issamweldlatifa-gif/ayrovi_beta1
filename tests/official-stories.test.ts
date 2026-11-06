import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { QatafoDatabase } from '../src/db/database';
import { OFFICIAL_STORIES } from '../src/services/officialStories';

describe('official Stories — publication, editing, retirement and persistence', () => {
  const admin = request.agent(app);
  let csrf = '';
  beforeAll(async () => {
    const response = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    csrf = response.body.data.csrfToken;
  });
  test('ships exactly seven unique official cards, bilingual copy and real photos', async () => {
    const response = await request(app).get('/api/public/stories');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(7);
    expect(new Set(response.body.data.map((row: any) => row.media_url)).size).toBe(7);
    for (const [index, [slug]] of OFFICIAL_STORIES.entries()) {
      const card = response.body.data[index];
      expect(card.id).toBe(`official_story_${slug}`);
      expect(card.title_ar).toBeTruthy(); expect(card.description_ar).toBeTruthy();
      expect(card.cta).toBe(''); expect(card.target_url).toBe('');
      const image = await request(app).get(card.media_url);
      expect(image.status).toBe(200); expect(image.headers['content-type']).toContain('image/jpeg');
    }
    expect(db.get<any>("SELECT COUNT(*) n FROM stories WHERE id LIKE 'story_demo_%' OR id='story_arrival_08'")?.n).toBe(0);
  });
  test('settings are authenticated, CSRF-protected, bilingual and start before Lens', async () => {
    expect((await request(app).put('/api/admin/stories-showcase').send({ enabled: false })).status).toBe(401);
    expect((await admin.put('/api/admin/stories-showcase').send({ enabled: false })).status).toBe(403);
    const block = (await request(app).get('/api/public/stories-showcase')).body.data;
    expect(block).toMatchObject({ cardCount: 7, ctaUrl: '', sortOrder: 0, enabled: true });
    expect(block.titleAr).toBeTruthy();
    const changed = await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf)
      .send({ titleAr: 'اختبار', subtitleAr: 'وصف', ctaLabelAr: 'استكشف', cardCount: 8 });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ titleAr: 'اختبار', subtitleAr: 'وصف', ctaLabelAr: 'استكشف', cardCount: 8 });
  });
  test('CRM creates an eighth photo, edits bilingual text/order, hides drafts and removes a card', async () => {
    const created = await admin.post('/api/admin/stories').set('x-csrf-token', csrf).send({
      media_type: 'IMAGE', media_url: '/media/stories/coffee.jpg', title: 'Nouvelle carte', title_ar: 'جديدة',
      description: 'Texte', description_ar: 'وصف', publish_at: new Date(Date.now() - 1000).toISOString(), priority: 200, status: 'PUBLISHED',
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    let cards = (await request(app).get('/api/public/stories')).body.data;
    expect(cards).toHaveLength(8); expect(cards[0].id).toBe(id);
    const edited = await admin.put(`/api/admin/stories/${id}`).set('x-csrf-token', csrf).send({ title_ar: 'تعديل', status: 'DRAFT' });
    expect(edited.status).toBe(200); expect(edited.body.data.title_ar).toBe('تعديل');
    cards = (await request(app).get('/api/public/stories')).body.data;
    expect(cards.some((row: any) => row.id === id)).toBe(false);
    expect((await admin.delete(`/api/admin/stories/${id}`).set('x-csrf-token', csrf)).status).toBe(200);
    expect(db.get<any>('SELECT status FROM stories WHERE id=?', id).status).toBe('EXPIRED');
  });
  test('unsafe media is rejected', async () => {
    const invalid = await admin.post('/api/admin/stories').set('x-csrf-token', csrf).send({
      media_type: 'IMAGE', media_url: 'javascript:alert(1)', title: 'Unsafe photo', publish_at: new Date().toISOString(), status: 'PUBLISHED',
    });
    expect(invalid.status).toBe(400);
  });
});

test('existing SQLite upgrade is backed up, preserves shared channels and never resurrects retired cards', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'official-stories-'));
  const file = path.join(dir, 'store.sqlite');
  let store: QatafoDatabase | undefined;
  try {
    store = new QatafoDatabase(file);
    // Simulate an installation prior to this migration, retaining its channels and unrelated content.
    store.run("DELETE FROM applied_data_migrations WHERE key='official_stories_editorial_v1'");
    store.run('DELETE FROM stories');
    const now = new Date().toISOString();
    store.run(`INSERT INTO stories (id,media_url,title,publish_at,status,created_at,updated_at) VALUES ('old_story','/media/old.jpg','Old story',?,'PUBLISHED',?,?)`, now, now, now);
    store.run('ALTER TABLE stories_showcase_settings RENAME TO settings_before_upgrade');
    store.run(`CREATE TABLE stories_showcase_settings (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL, cta_label TEXT NOT NULL,
      cta_url TEXT NOT NULL DEFAULT '',card_count INTEGER NOT NULL CHECK(card_count IN (4,5)),
      enabled INTEGER NOT NULL,sort_order INTEGER NOT NULL,updated_at TEXT NOT NULL)`);
    store.run(`INSERT INTO stories_showcase_settings SELECT id,title,subtitle,cta_label,cta_url,4,enabled,sort_order,updated_at FROM settings_before_upgrade`);
    store.run('DROP TABLE settings_before_upgrade');
    const publishers = store.all<any>('SELECT * FROM story_publishers');
    store.run(`INSERT INTO publications (id,title,channel_id,image_url,publish_at,status,created_at,updated_at) VALUES ('keep_publication','Keep',?,'/media/keep.jpg',?,'publie',?,?)`, publishers[0].id, now, now, now);
    store.run(`INSERT INTO reels (id,title,channel_id,video_url,publish_at,status,created_at,updated_at) VALUES ('keep_reel','Keep',?,'https://example.com/keep.mp4',?,'publie',?,?)`, publishers[0].id, now, now, now);
    store.close(); store = new QatafoDatabase(file);
    expect(readdirSync(path.join(dir, 'backups')).some(name => name.startsWith('before-official-stories-'))).toBe(true);
    expect(store.get('SELECT id FROM stories WHERE id=?', 'old_story')).toBeUndefined();
    expect(store.all('SELECT id FROM stories')).toHaveLength(7);
    expect(store.get('SELECT id FROM publications WHERE id=?', 'keep_publication')).toBeTruthy();
    expect(store.get('SELECT id FROM reels WHERE id=?', 'keep_reel')).toBeTruthy();
    store.run('DELETE FROM stories WHERE id=?', 'official_story_coffee');
    store.run("UPDATE stories_showcase_settings SET title='Edited',card_count=12 WHERE id='global'");
    store.close(); store = new QatafoDatabase(file);
    expect(store.all('SELECT id FROM stories')).toHaveLength(6);
    expect(store.get<any>("SELECT title,card_count FROM stories_showcase_settings WHERE id='global'")).toMatchObject({ title: 'Edited', card_count: 12 });
    expect(store.get('SELECT id FROM stories WHERE id=?', 'old_story')).toBeUndefined();
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
