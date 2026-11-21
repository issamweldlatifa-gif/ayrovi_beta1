import request from 'supertest';
import { expect, it } from 'vitest';
import { app, db } from '../src/server';
import { createAdminSession, setAdminCookie } from '../src/admin/auth';
import { DEFAULT_ZAYROVI_NEWS, normalizeZayroviNews } from '../shared/zayroviNews';
import { readPublicZayroviNews, ZAYROVI_NEWS_KEY } from '../src/services/zayroviNews';
import { resolvePromoForQuote } from '../src/services/promotions';

it('uses the canonical capped day rule and Tunis midnight, without making pricing writes', () => {
  const before = db.all('SELECT * FROM promo_rules ORDER BY id');
  // Monday in Tunis even though the UTC clock is still Sunday.
  const now = new Date('2026-11-22T23:00:00.000Z');
  const previous = db.get<{ active: number; percent: number }>("SELECT active,percent FROM promo_rules WHERE id='day_1'")!;
  try {
    db.run("UPDATE promo_rules SET active=1,percent=80 WHERE id='day_1'");
    const expected = resolvePromoForQuote(db, { now });
    expect(readPublicZayroviNews(db, now).daily).toMatchObject({ day: 1, percent: expected?.percent ?? null });
    expect(expected?.percent).toBeGreaterThan(0);
    expect(expected?.percent).toBeLessThan(80);
    expect(readPublicZayroviNews(db, new Date('2026-11-22T22:59:59.000Z')).daily.day).toBe(7);
    db.run("UPDATE promo_rules SET active=0 WHERE id='day_1'");
    expect(readPublicZayroviNews(db, now).daily.percent).toBeNull();
  } finally { db.run("UPDATE promo_rules SET active=?,percent=? WHERE id='day_1'", previous.active, previous.percent); }
  expect(db.all('SELECT * FROM promo_rules ORDER BY id')).toEqual(before);
});

it('validates content schema and rejects duplicate, freeform and invalid image links', () => {
  const base = DEFAULT_ZAYROVI_NEWS;
  const reel = { id: 'video', published: true, kind: 'reel', targetId: 'r1' };
  expect(normalizeZayroviNews({ ...base, entries: [reel] })?.entries).toEqual([reel]);
  expect(normalizeZayroviNews({ ...base, entries: [reel, { ...reel, id: 'duplicate' }] })).toBeNull();
  expect(normalizeZayroviNews({ ...base, entries: [{ ...reel, targetId: 'https://example.org' }] })).toBeNull();
  expect(normalizeZayroviNews({ ...base, entries: [{ ...base.entries[0], image: '/media/%2e%2e/secret.jpg' }] })).toBeNull();
});

it('protects CRM writes and only publishes enabled cards pointing to currently public records in editorial order', async () => {
  const path = '/api/admin/zayrovi-news';
  const publicPath = '/api/public/zayrovi-news';
  const snapshot = db.get<{ setting_value: string; updated_at: string }>('SELECT setting_value,updated_at FROM settings WHERE setting_key=?', ZAYROVI_NEWS_KEY);
  const admin = db.get('SELECT id FROM admin_users WHERE email=?', process.env.ADMIN_EMAIL);
  const session = createAdminSession(db, admin, true);
  let cookie = '';
  setAdminCookie({ setHeader: (_name: string, value: string) => { cookie = value.split(';')[0]!; } } as never, session.token);
  const now = new Date().toISOString();
  const live = 'znews_live_article', future = 'znews_future_article';
  const archivedStory = 'znews_expired_story';
  const bindings = (id: string, date: string) => db.run(`INSERT INTO news_items (id,title,summary,content,category,status,published_at,created_at,updated_at)
    VALUES (?,'Test actualité','Intro','Contenu authentique','INFORMATION','PUBLISHED',?,?,?)`, id, date, now, now);
  const authorized = (req: request.Test) => req.set('Cookie', cookie).set('x-csrf-token', session.csrfToken);
  const beforeRules = db.all('SELECT * FROM promo_rules ORDER BY id');
  try {
    db.run(`INSERT INTO stories (id,title,media_type,media_url,status,publish_at,expires_at,created_at,updated_at)
      VALUES (?,'Retirée','IMAGE','/media/stories/winter.jpg','PUBLISHED',?,?,?,?)`,
    archivedStory, '2025-01-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z', now, now);
    bindings(live, '2025-01-01T00:00:00.000Z'); bindings(future, '2099-01-01T00:00:00.000Z');
    const draft = { daily: { ...DEFAULT_ZAYROVI_NEWS.daily, showHome: false }, entries: [
      { id: 'real', kind: 'article', published: true, targetId: live },
      { id: 'future', kind: 'article', published: true, targetId: future },
      { id: 'video', kind: 'reel', published: true, targetId: 'reel_drive_workwear_v2' },
      { id: 'story', kind: 'story', published: true, targetId: 'official_story_winter' },
      { id: 'expired', kind: 'story', published: true, targetId: archivedStory },
      { ...DEFAULT_ZAYROVI_NEWS.entries[0], published: false },
      { id: 'missing', kind: 'story', published: true, targetId: 'not_found' },
    ] };
    await request(app).get(path).expect(401);
    await request(app).put(path).send(draft).expect(401);
    await request(app).put(path).set('Cookie', cookie).send(draft).expect(403);
    await authorized(request(app).put(path)).send(draft).expect(200);
    expect(db.get("SELECT entity_id FROM audit_logs WHERE module='ZAYROVI_NEWS' AND action='UPDATE' AND user_id=?", admin.id)).toMatchObject({ entity_id: 'global' });
    await authorized(request(app).put(`/api/admin/settings/${ZAYROVI_NEWS_KEY}`)).send({ value: {} }).expect(409);
    const picker = await authorized(request(app).get(`${path}/sources`).query({ kind: 'article', q: 'znews_' })).expect(200);
    expect(picker.body.data.map((item: { id: string }) => item.id)).toContain(live);
    expect(picker.body.data.map((item: { id: string }) => item.id)).not.toContain(future);
    const { body } = await request(app).get(publicPath).expect(200).expect('Cache-Control', 'no-store');
    expect(body.data.daily).toMatchObject({ showHome: false, showNews: true });
    expect(body.data.entries.map((item: { id: string }) => item.id)).toEqual(['real', 'video', 'story']);
    expect(body.data.entries[0]).toMatchObject({ title: { fr: 'Test actualité' }, body: { fr: 'Intro' } });
    expect((await request(app).get(`${publicPath}?view=home`).expect(200)).body.data).not.toHaveProperty('entries');
    expect((await request(app).get('/api/public/news').query({ item: live }).expect(200)).body.data[0].content).toBe('Contenu authentique');
    expect((await request(app).get('/api/public/news').query({ item: future }).expect(200)).body.data).toEqual([]);
    db.run("UPDATE news_items SET status='ARCHIVED' WHERE id=?", live);
    expect((await request(app).get(publicPath).expect(200)).body.data.entries.map((item: { id: string }) => item.id)).toEqual(['video', 'story']);
    expect(db.all('SELECT * FROM promo_rules ORDER BY id')).toEqual(beforeRules);
  } finally {
    db.run('DELETE FROM news_items WHERE id IN (?,?)', live, future);
    db.run('DELETE FROM stories WHERE id=?', archivedStory);
    if (snapshot) db.run('UPDATE settings SET setting_value=?,updated_at=? WHERE setting_key=?', snapshot.setting_value, snapshot.updated_at, ZAYROVI_NEWS_KEY);
    else db.run('DELETE FROM settings WHERE setting_key=?', ZAYROVI_NEWS_KEY);
  }
});
