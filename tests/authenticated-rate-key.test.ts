import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { QatafoDatabase } from '../src/db/database';
import { createCustomerSession, hashToken } from '../src/customer/auth';
import { clientRateLimitKey } from '../src/services/rateKey';
import { rateLimit } from '../src/server';

let db: QatafoDatabase;
const ip = '198.51.100.12';
const req = (token?: string, cookie = false) => ({ ip, headers: token ? cookie ? { cookie: `ayrovi_customer_session=${token}` } : { authorization: `Bearer ${token}` } : {} } as any);
function account() {
  const id = `security-${randomUUID()}`;
  const now = new Date().toISOString();
  db.run("INSERT INTO customer_accounts (id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)", id, 'Rate key test', now, now);
  return id;
}
function session(id: string) { return createCustomerSession(db, id, req()); }

beforeAll(() => { db = new QatafoDatabase(':memory:'); });
afterAll(() => { db.close(); });

describe('authenticated abuse budgets', () => {
  test('random Bearers/cookies and x-session-id rotations share the anonymous IP allowance', () => {
    for (let i = 0; i < 20; i++) {
      const r = req(randomUUID(), i % 2 === 0);
      r.headers['x-session-id'] = randomUUID();
      expect(clientRateLimitKey(r, db)).toBe(`ip:${ip}`);
    }
  });
  test('legitimate customers behind the same NAT keep independent budgets', () => {
    const alice = session(account()); const bob = session(account());
    expect(clientRateLimitKey(req(alice.token), db)).not.toBe(clientRateLimitKey(req(bob.token), db));
    expect(clientRateLimitKey(req(alice.token), db)).toBe(clientRateLimitKey(req(alice.token, true), db));
    expect(clientRateLimitKey(req(alice.token), db)).not.toContain(alice.token);
  });
  test('new sessions cannot multiply the budget of one authenticated account', () => {
    const id = account(); const a = session(id); const b = session(id);
    expect(clientRateLimitKey(req(a.token), db)).toBe(clientRateLimitKey(req(b.token), db));
  });
  test.each(['expired', 'revoked', 'blocked'] as const)('%s sessions revert to the IP budget immediately', (state) => {
    const id = account(); const s = session(id);
    expect(clientRateLimitKey(req(s.token), db)).toMatch(/^account:/);
    if (state === 'expired') db.run('UPDATE customer_sessions SET expires_at=? WHERE id=?', '2000-01-01T00:00:00.000Z', hashToken(s.token));
    if (state === 'revoked') db.run('DELETE FROM customer_sessions WHERE id=?', hashToken(s.token));
    if (state === 'blocked') db.run("UPDATE customer_accounts SET status='BLOCKED' WHERE id=?", id);
    expect(clientRateLimitKey(req(s.token), db)).toBe(`ip:${ip}`);
  });
  test('rotation of forged identities does not bypass the actual limiter middleware', () => {
    const limiter = rateLimit(`forged-security-${randomUUID()}`, 2, 60_000, r => clientRateLimitKey(r, db));
    for (let i = 0; i < 4; i++) {
      const next = vi.fn();
      const res: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
      limiter(req(randomUUID()), res, next);
      if (i < 2) expect(next).toHaveBeenCalledOnce();
      else { expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(429); expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String)); }
    }
  });
  test('missing store and oversized tokens fail safe without a database read', () => {
    expect(clientRateLimitKey(req('unknown'))).toBe(`ip:${ip}`);
    const store = { get: vi.fn() };
    expect(clientRateLimitKey(req('x'.repeat(513)), store as any)).toBe(`ip:${ip}`);
    expect(store.get).not.toHaveBeenCalled();
  });
});

test('all TTS/live-audio aliases share the actual mounted voice output guard', async () => {
  const { ASSISTANT_VOICE_OUTPUT_PATHS, assistantVoiceOutputRateLimit } = await import('../src/server');
  expect(ASSISTANT_VOICE_OUTPUT_PATHS).toEqual([
    '/api/assistant/voice/tts', '/api/assistant/voice/live-audio', '/api/assistant/tts', '/api/assistant/live-audio',
  ]);
  // Invoke the production middleware instance without invoking a paid provider.
  // Test mode allowance is 1000; production allowance is deliberately lower.
  for (let i = 0; i <= 1000; i++) {
    const next = vi.fn();
    const res: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    assistantVoiceOutputRateLimit({ ip: '198.51.100.201', path: ASSISTANT_VOICE_OUTPUT_PATHS[i % 4], headers: { authorization: `Bearer forged-${i}` } } as any, res, next);
    if (i < 1000) expect(next).toHaveBeenCalledOnce();
    else { expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(429); }
  }
});
