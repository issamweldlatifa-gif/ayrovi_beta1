import { imageWork, ImageBusyError } from '../src/services/imageWork';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
const prefix = 'paging_reel_';
beforeAll(() => {
  const publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
  for (let i = 0; i < 65; i++) db.run(`INSERT INTO reels (id,title,channel_id,video_url,publish_at,status,created_at,updated_at)
    VALUES (?,?,?, '/media/reels/flower-cc0-v1.mp4', '2026-01-01T00:00:00.000Z','publie','2026-01-01','2026-01-01')`, prefix + String(i).padStart(3, '0'), 'Real Reel', publisher);
});
afterAll(() => db.run('DELETE FROM reels WHERE id LIKE ?', prefix + '%'));
it('pages all published rows without gaps or duplicate timestamp ties', async () => {
  const ids: string[] = []; let cursor: string | null = null;
  do {
    const res = await request(app).get('/api/public/social/reels').query({ limit: 12, ...(cursor ? { cursor } : {}) });
    expect(res.status).toBe(200); expect(res.body.data.items.length).toBeLessThanOrEqual(12);
    ids.push(...res.body.data.items.map((row: any) => row.id));
    cursor = res.body.data.nextCursor;
  } while (cursor);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.filter(id => id.startsWith(prefix))).toHaveLength(65);
});
it('opens an old selected Reel directly, preserves legacy arrays and rejects malformed paging', async () => {
  const anchor = prefix + '020';
  const res = await request(app).get('/api/public/social/reels').query({ limit: 12, anchor });
  expect(res.body.data.items[0].id).toBe(anchor);
  expect(Array.isArray((await request(app).get('/api/public/social/reels')).body.data)).toBe(true);
  for (const query of [{ limit: 0 }, { limit: 1000 }, { limit: 1, cursor: 'invalid' }, { limit: 1, anchor: "bad'id" }])
    expect((await request(app).get('/api/public/social/reels').query(query)).status).toBe(400);
});
it('offers bounded publication pages without changing the legacy publication feed', async () => {
  const page = await request(app).get('/api/public/social/publications?limit=2');
  expect(page.status).toBe(200); expect(page.body.data.items.length).toBeLessThanOrEqual(2);
  expect(Array.isArray((await request(app).get('/api/public/social/publications')).body.data)).toBe(true);
});
it('keeps cursors usable after anchor deletion and never leaks draft or future Reels', async () => {
  const first = await request(app).get('/api/public/social/reels').query({ limit: 1, anchor: prefix + '050' });
  const cursor = first.body.data.nextCursor;
  db.run('DELETE FROM reels WHERE id=?', prefix + '050');
  const next = await request(app).get('/api/public/social/reels').query({ limit: 1, cursor });
  expect(next.body.data.items[0].id).toBe(prefix + '049');
  db.run("UPDATE reels SET status='brouillon' WHERE id=?", prefix + '005');
  db.run("UPDATE reels SET publish_at='2099-01-01T00:00:00.000Z' WHERE id=?", prefix + '006');
  for (const anchor of [prefix + '005', prefix + '006']) {
    const res = await request(app).get('/api/public/social/reels').query({ limit: 30, anchor });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((r: any) => r.id === prefix + '005' || r.id === prefix + '006')).toBe(false);
  }
});

it('returns retryable 503 rather than caching an image failure when the queue is busy', async () => {
  const limit = vi.spyOn(imageWork, 'limit').mockRejectedValueOnce(new ImageBusyError());
  try {
    const res = await request(app).get('/api/public/media/img').query({ u: 'https://cdn.example.com/queue-test.jpg', w: 320 });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('IMAGE_BUSY');
    expect(res.headers['retry-after']).toBe('2');
    expect(res.headers['cache-control'] ?? '').not.toContain('immutable');
  } finally { limit.mockRestore(); }
});
