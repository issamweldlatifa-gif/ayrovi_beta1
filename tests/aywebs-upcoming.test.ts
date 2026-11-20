import request from 'supertest';
import { expect, test } from 'vitest';
import { app, db } from '../src/server';
import { createAdminSession, setAdminCookie } from '../src/admin/auth';
import { normalizeAywebsUpcoming, upcomingCountdown, UPCOMING_WEEK_MS } from '../shared/aywebsUpcoming';
import { AYWEBS_UPCOMING_KEY, readAywebsUpcoming, seedAywebsUpcoming } from '../src/services/aywebsUpcoming';

const url = '/api/admin/aywebs-upcoming';
const publicUrl = '/api/public/aywebs-upcoming';
const store = { id: 'clarks', opensAt: '2050-05-01T12:00:00+01:00', image: '/media/cover.jpg' };

test('normalizes bounded rows and counts down from an absolute deadline', () => {
  expect(upcomingCountdown(store.opensAt, Date.parse(store.opensAt) - UPCOMING_WEEK_MS)).toEqual({ days: 7, hours: 0, minutes: 0, seconds: 0 });
  expect(upcomingCountdown(store.opensAt, Date.parse(store.opensAt) + 500)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  expect(normalizeAywebsUpcoming({ enabled: true, stores: [store] })?.stores[0]?.opensAt).toBe('2050-05-01T11:00:00.000Z');
  for (const stores of [[store, store], [{ ...store, opensAt: '2050-05-01T12:00' }], [{ ...store, image: '/uploads/%2e%2e/secret.jpg' }]]) {
    expect(normalizeAywebsUpcoming({ enabled: true, stores })).toBeNull();
  }
});

test('admin controls stores and deadlines; the public list excludes unsupported edits and expired cards', async () => {
  const initial = readAywebsUpcoming(db);
  expect(initial.stores.map(row => row.id)).toEqual(['timberland', 'clarks', 'decathlon']);
  seedAywebsUpcoming(db, new Date('2050-05-01T00:00:00Z'));
  expect(readAywebsUpcoming(db)).toEqual(initial);
  const row = db.get('SELECT id FROM admin_users WHERE email=?', process.env.ADMIN_EMAIL);
  const session = createAdminSession(db, row, true);
  let cookie = '';
  setAdminCookie({ setHeader: (_name: string, value: string) => { cookie = value.split(';')[0]!; } } as any, session.token);
  const authenticate = (req: request.Test) => req.set('Cookie', cookie).set('x-csrf-token', session.csrfToken);
  await request(app).put(url).send({ enabled: true, stores: [store] }).expect(401);
  const choices = await authenticate(request(app).get(url)).expect(200);
  expect(choices.body.choices.some((choice: { id: string }) => choice.id === 'shein')).toBe(false);
  try {
    await authenticate(request(app).put(url)).send({ enabled: true, stores: [{ ...store, id: 'shein' }] }).expect(400);
    await authenticate(request(app).put(url)).send({ enabled: true, stores: [store, { ...store, id: 'timberland', opensAt: '2020-01-01T00:00Z' }] }).expect(200);
    const visible = await request(app).get(publicUrl).expect(200).expect('Cache-Control', 'no-store');
    expect(visible.body.data.stores).toEqual([{ ...store, opensAt: '2050-05-01T11:00:00.000Z', name: 'Clarks', logo: '/stores/clarks.png' }]);
    await authenticate(request(app).put(url)).send({ enabled: false, stores: [store] }).expect(200);
    expect((await request(app).get(publicUrl).expect(200)).body.data.stores).toEqual([]);
  } finally {
    db.run('UPDATE settings SET setting_value=? WHERE setting_key=?', JSON.stringify(initial), AYWEBS_UPCOMING_KEY);
  }
});
