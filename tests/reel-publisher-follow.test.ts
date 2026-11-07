import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { createCustomerSession } from '../src/customer/auth';
const owner = 'reel-follow-read-qa',
  publisher = 'reel-follow-publisher-qa';
let token = '',
  csrf = '';
beforeAll(() => {
  const now = new Date().toISOString();
  db.run(
    "INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,'Reel follow QA','ACTIVE',?,?)",
    owner,
    now,
    now
  );
  db.run(
    "INSERT INTO story_publishers(id,slug,name,subtitle,avatar,official,created_at,updated_at) VALUES (?,?,'Reel follow QA','','',0,?,?)",
    publisher,
    publisher,
    now,
    now
  );
  const session = createCustomerSession(db, owner, {
    ip: '127.0.0.1',
    headers: {},
  } as any);
  token = session.token;
  csrf = session.csrfToken;
});
afterAll(() => {
  db.run('DELETE FROM publication_follows WHERE publisher_id=?', publisher);
  db.run('DELETE FROM story_publishers WHERE id=?', publisher);
  db.run('DELETE FROM customer_accounts WHERE id=?', owner);
});
const path = `/api/public/social/publishers/${publisher}/follow`;
describe('Reel options reuse the persisted Publication follow relation', () => {
  test('guest read is false, private and does not create a relation', async () => {
    const response = await request(app).get(path);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('private');
    expect(response.body.data.following).toBe(false);
    expect(
      db.get(
        'SELECT 1 FROM publication_follows WHERE publisher_id=?',
        publisher
      )
    ).toBeUndefined();
  });
  test('confirmed follow and unfollow can be read back, without leaking to a guest', async () => {
    for (const following of [true, false]) {
      const written = await request(app)
        .put(path)
        .set('Authorization', `Bearer ${token}`)
        .set('x-csrf-token', csrf)
        .send({ following });
      expect(written.status).toBe(200);
      const read = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${token}`);
      expect(read.body.data.following).toBe(following);
      expect((await request(app).get(path)).body.data.following).toBe(false);
    }
  });
  test('unknown publishers are not invented', async () => {
    expect(
      (
        await request(app).get(
          '/api/public/social/publishers/unknown-reel-publisher/follow'
        )
      ).status
    ).toBe(404);
  });
});
