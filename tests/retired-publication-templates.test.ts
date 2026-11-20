import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { QatafoDatabase } from '../src/db/database';
import { createAdminSession, setAdminCookie } from '../src/admin/auth';
import { publishedSocialTarget } from '../src/magazine/socialInteractions';

const now = '2026-11-16T10:00:00.000Z';
const id = 'pubblock_demo_retirement_fixture';
const media = '/media/catalogue/official/retirement-fixture.jpg';

function insertRetiredBlock(database: QatafoDatabase) {
  database.run(`INSERT INTO publication_blocks (id,kind,title,media_type,media_url,created_at,updated_at)
    VALUES (?,'media','Retired fixture','image',?,?,?)`, id, media, now, now);
}

it('keeps historical rows intact across restart without installing any old templates', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zayrovi-retired-publication-'));
  const file = path.join(directory, 'db.sqlite');
  let database = new QatafoDatabase(file);
  try {
    expect(database.all('SELECT id FROM publication_blocks')).toEqual([]);
    insertRetiredBlock(database);
    const before = database.get('SELECT * FROM publication_blocks WHERE id=?', id);
    database.close();
    database = new QatafoDatabase(file);
    expect(database.all('SELECT * FROM publication_blocks')).toEqual([before]);
    expect(publishedSocialTarget(database, id, now)).toBeNull();
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('returns no templates to installed APKs, and no authenticated admin endpoint can expose or change them', async () => {
  insertRetiredBlock(db);
  try {
    const before = db.get('SELECT * FROM publication_blocks WHERE id=?', id);
    const legacy = '/api/public/social/publication-blocks';
    const feed = await request(app).get(legacy).expect(200).expect('Cache-Control', 'no-store');
    expect(feed.body).toEqual({ success: true, data: [] });
    await request(app).get(`${legacy}/${id}`).expect(404).expect('Cache-Control', 'no-store');
    await request(app).get('/api/public/social/comments').query({ targetId: id }).expect(404);
    await request(app).post('/api/public/social/interact').set('x-session-id', 'retired-templates-fixture')
      .send({ type: 'share', targetId: id }).expect(404);
    const reels = await request(app).get('/api/public/social/reels').expect(200);
    expect(reels.body.data.length).toBeGreaterThan(0);

    const admin = db.get('SELECT id FROM admin_users WHERE email=?', process.env.ADMIN_EMAIL);
    expect(admin).toBeTruthy();
    const session = createAdminSession(db, admin, true);
    let cookie = '';
    setAdminCookie({ setHeader: (_name: string, value: string) => { cookie = value.split(';')[0]; } } as any, session.token);
    const authenticated = (req: request.Test) => req.set('Cookie', cookie).set('x-csrf-token', session.csrfToken);
    await authenticated(request(app).get('/api/admin/reels')).expect(200);
    const blocks = '/api/admin/publication-blocks';
    await authenticated(request(app).get(blocks)).expect(404);
    await authenticated(request(app).post(blocks)).send({ title: 'Not created' }).expect(404);
    await authenticated(request(app).put(`${blocks}/order`)).send({ ids: [id] }).expect(404);
    await authenticated(request(app).put(`${blocks}/${id}`)).send({ title: 'Not changed' }).expect(404);
    await authenticated(request(app).delete(`${blocks}/${id}`)).expect(404);
    expect(db.get('SELECT * FROM publication_blocks WHERE id=?', id)).toEqual(before);
  } finally {
    db.run('DELETE FROM publication_blocks WHERE id=?', id);
  }
});
