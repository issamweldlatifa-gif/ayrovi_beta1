import request from 'supertest';
import { expect, it } from 'vitest';
import { app, db } from '../src/server';
import { createCustomerSession } from '../src/customer/auth';
import { writePublisherFollow } from '../src/magazine/publicationPreferences';

it('delivers one account-scoped alert per newly published Story, honors unfollow, and persists read state', async () => {
  const a = 'story_alert_reader_a', b = 'story_alert_reader_b';
  const now = Date.now();
  const stamp = (ms: number) => new Date(now + ms).toISOString();
  const time = stamp(0);
  for (const id of [a, b]) db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)", id, id, time, time);
  const follower = createCustomerSession(db, a, { ip: '127.0.0.1', headers: {} } as never);
  const other = createCustomerSession(db, b, { ip: '127.0.0.1', headers: {} } as never);
  const inbox = '/api/customer/account/notifications';
  const auth = (req: request.Test, token: string = follower.token) => req.set('Authorization', `Bearer ${token}`).set('Accept-Language', 'ar-TN');
  const fixture = [
    ['live', 'PUBLISHED', stamp(-1_000), null], ['old', 'PUBLISHED', stamp(-20_000), null],
    ['draft', 'DRAFT', stamp(-2_000), null], ['later', 'PUBLISHED', stamp(60_000), null],
    ['expired', 'PUBLISHED', stamp(-3_000), stamp(-500)],
  ] as const;
  const storyId = (key: string) => `story_alert_fixture_${key}`;
  const rows = (key: string) => db.all('SELECT id FROM customer_notifications WHERE account_id=? AND action_url=?', a, `/stories?id=${storyId(key)}`);
  try {
    expect(writePublisherFollow(db, a, 'pub_zayrovi', { following: true }, stamp(-10_000)).status).toBe('ok');
    for (const [key, status, publish, expiry] of fixture) db.run(`INSERT INTO stories(id,title,title_ar,media_url,publish_at,expires_at,status,created_at,updated_at)
      VALUES (?,?,?,'/media/story.jpg',?,?,?,?,?)`, storyId(key), `Story ${key}`, `قصة ${key}`, publish, expiry, status, time, time);
    await request(app).get(inbox).expect(401);
    const first = await auth(request(app).get(inbox)).expect(200).expect('Cache-Control', 'private, no-store');
    const delivered = first.body.data.filter((item: { action_url: string }) => item.action_url.includes('story_alert_fixture_'));
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ title: 'قصة جديدة من Zayrovi', message: 'قصة live', action_url: `/stories?id=${storyId('live')}`, read_at: null });
    const outsider = await auth(request(app).get(inbox).query({ accountId: a }), other.token).expect(200);
    expect(outsider.body.data.find((item: { id: string }) => item.id === delivered[0].id)).toBeUndefined();
    await auth(request(app).put(`${inbox}/read`)).send({ id: delivered[0].id }).expect(403);
    await auth(request(app).put(`${inbox}/read`)).set('x-csrf-token', follower.csrfToken).send({ id: delivered[0].id }).expect(200);
    const second = await auth(request(app).get(inbox)).expect(200);
    expect(second.body.data.find((item: { id: string }) => item.id === delivered[0].id).read_at).toBeTruthy();
    expect(rows('live')).toHaveLength(1);
    expect(writePublisherFollow(db, a, 'pub_zayrovi', { following: false }, time).status).toBe('ok');
    db.run("UPDATE stories SET status='PUBLISHED' WHERE id=?", storyId('draft'));
    await auth(request(app).get(inbox)).expect(200);
    expect(rows('draft')).toHaveLength(0);
  } finally {
    for (const [key] of fixture) db.run('DELETE FROM stories WHERE id=?', storyId(key));
    db.run('DELETE FROM customer_accounts WHERE id IN (?,?)', a, b);
  }
});
