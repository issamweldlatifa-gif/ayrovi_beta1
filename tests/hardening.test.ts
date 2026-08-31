import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { createCustomerSession } from '../src/customer/auth';

describe('AYROVI production hardening', () => {
  test('security headers are unified and unknown API routes stay JSON 404', async () => {
    // Keep this assertion independent from the generated public/ build so a
    // clean CI checkout can verify the global middleware before `npm run build`.
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.headers['x-request-id']).toMatch(/^[A-Za-z0-9._:-]{8,100}$/);
    expect(health.headers['content-security-policy']).toContain("media-src 'self' blob: https:");
    expect(health.headers['content-security-policy']).toContain("object-src 'none'");

    const missing = await request(app).get('/api/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.type).toContain('json');
    expect(missing.body.code).toBe('API_NOT_FOUND');

    const invalidJson = await request(app)
      .post('/api/public/pricing/preview')
      .set('Content-Type', 'application/json')
      .send('{"originalPrice":');
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.type).toContain('json');
    expect(invalidJson.body.code).toBe('INVALID_JSON');
  });

  test('readiness checks SQLite without pretending optional providers are ready', async () => {
    const ready = await request(app).get('/api/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
    expect(ready.body.database).toBe('ok');
    expect(ready.body.capabilities.assistant).toBe(false);
  });

  test('public social payloads expose only public fields', async () => {
    const publications = await request(app).get('/api/public/social/publications');
    expect(publications.status).toBe(200);
    expect(publications.body.data.length).toBeGreaterThan(0);
    for (const publication of publications.body.data) {
      expect(publication).not.toHaveProperty('remark');
      expect(publication).not.toHaveProperty('status');
      expect(publication).not.toHaveProperty('created_at');
      expect(publication).not.toHaveProperty('updated_at');
    }

    const publishers = await request(app).get('/api/public/story-publishers');
    expect(publishers.status).toBe(200);
    expect(publishers.body.data[0]).toHaveProperty('id');
    expect(publishers.body.data[0]).toHaveProperty('slug');

    const reels = await request(app).get('/api/public/social/reels');
    expect(reels.status).toBe(200);
    expect(reels.body.data.length).toBeGreaterThan(0);
    for (const reel of reels.body.data) {
      expect(reel).not.toHaveProperty('status');
      expect(reel).not.toHaveProperty('created_at');
      expect(reel).not.toHaveProperty('updated_at');
    }
  });

  test('social targets are validated and guest views are deduplicated by session', async () => {
    const withoutSession = await request(app)
      .post('/api/public/social/interact')
      .send({ targetId: 'reel_demo_01', type: 'view' });
    expect(withoutSession.status).toBe(400);
    expect(withoutSession.body.code).toBe('SOCIAL_SESSION_REQUIRED');

    const unknown = await request(app)
      .post('/api/public/social/interact')
      .set('x-session-id', 'hardening-unknown-session')
      .send({ targetId: 'not_a_real_target', type: 'view' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('SOCIAL_TARGET_NOT_FOUND');

    const sessionId = `hardening-view-${Date.now()}`;
    const first = await request(app)
      .post('/api/public/social/interact')
      .set('x-session-id', sessionId)
      .send({ targetId: 'reel_demo_01', type: 'view' });
    const second = await request(app)
      .post('/api/public/social/interact')
      .set('x-session-id', sessionId)
      .send({ targetId: 'reel_demo_01', type: 'view' });
    expect(first.status).toBe(200);
    expect(first.body.data.recorded).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.data.recorded).toBe(false);

    const counts = await request(app).get('/api/public/social/counts?ids=reel_demo_01');
    expect(counts.body.data.reel_demo_01.views).toBe(1);

    const legacy = await request(app)
      .post('/api/public/social/reels/reel_demo_01/view')
      .set('x-session-id', 'hardening-legacy-session');
    expect(legacy.status).toBe(410);
    expect(legacy.body.code).toBe('ENDPOINT_REPLACED');
  });

  test('reel likes require authentication, CSRF and toggle one authoritative record', async () => {
    const guest = await request(app)
      .post('/api/public/social/interact')
      .set('x-session-id', 'hardening-guest-like')
      .send({ targetId: 'reel_demo_01', type: 'like' });
    expect(guest.status).toBe(401);

    const accountId = `hardening_account_${Date.now()}`;
    const now = new Date().toISOString();
    db.run(`INSERT INTO customer_accounts (id,display_name,email,email_verified_at,status,created_at,updated_at)
      VALUES (?,?,?,?,'ACTIVE',?,?)`, accountId, 'Hardening Client', `${accountId}@example.com`, now, now, now);
    const session = createCustomerSession(db, accountId, { ip: '127.0.0.1', headers: {} } as any);
    const like = () => request(app)
      .post('/api/public/social/interact')
      .set('Cookie', `ayrovi_customer_session=${encodeURIComponent(session.token)}`)
      .set('x-csrf-token', session.csrfToken)
      .set('x-session-id', 'hardening-auth-like')
      .send({ targetId: 'reel_demo_01', type: 'like' });

    const first = await like();
    expect(first.status).toBe(200);
    expect(first.body.data.liked).toBe(true);
    expect(first.body.data.likesCount).toBe(1);

    const second = await like();
    expect(second.status).toBe(200);
    expect(second.body.data.liked).toBe(false);
    expect(second.body.data.likesCount).toBe(0);
  });

  test('Admin media upload rejects a spoofed image before writing it', async () => {
    const admin = request.agent(app);
    const login = await admin.post('/api/admin/auth/login').send({
      email: 'admin@ayrovi.tn',
      password: 'AyroviBeta2026!',
    });
    expect(login.status).toBe(200);
    const response = await admin
      .post('/api/admin/uploads')
      .set('x-csrf-token', login.body.data.csrfToken)
      .send({ dataUrl: `data:image/jpeg;base64,${Buffer.from('not-a-real-image').toString('base64')}` });
    expect(response.status).toBe(415);
    expect(response.body.code).toBe('INVALID_MEDIA');
  });

  test('social mutation limiter is active before the public router', async () => {
    const sessionId = `hardening-rate-${Date.now()}`;
    const statuses: number[] = [];
    for (let index = 0; index < 13; index += 1) {
      const response = await request(app)
        .post('/api/public/social/interact')
        .set('x-session-id', sessionId)
        .send({ targetId: 'reel_demo_01', type: 'view' });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 12)).toEqual(Array(12).fill(200));
    expect(statuses[12]).toBe(429);
  });
});
