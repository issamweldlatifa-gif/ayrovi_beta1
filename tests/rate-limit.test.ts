import { describe, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { otpRateLimitKey, rateLimit } from '../src/server';

function responseMock() {
  const res: any = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: null as unknown,
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return res;
}

describe('API rate-limit keying', () => {
  test('an IP-only bucket cannot be multiplied by rotating caller-controlled session IDs', () => {
    const middleware = rateLimit(`rate-test-${randomUUID()}`, 1, 60_000);
    const nextA = vi.fn();
    middleware({ ip: '198.51.100.8', headers: { 'x-session-id': 'session-alpha' } } as any, responseMock(), nextA);
    expect(nextA).toHaveBeenCalledOnce();

    const response = responseMock();
    const nextB = vi.fn();
    middleware({ ip: '198.51.100.8', headers: { 'x-session-id': 'session-beta' } } as any, response, nextB);
    expect(nextB).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(429);
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });

    const nextOtherIp = vi.fn();
    middleware({ ip: '198.51.100.9', headers: { 'x-session-id': 'session-alpha' } } as any, responseMock(), nextOtherIp);
    expect(nextOtherIp).toHaveBeenCalledOnce();
  });

  test('OTP target keys normalize Tunisian local and international phone notation without storing the phone', () => {
    const local = otpRateLimitKey({ ip: '203.0.113.4', body: { phone: '12 345 678' } } as any);
    const international = otpRateLimitKey({ ip: '203.0.113.4', body: { phone: '+216-12-345-678' } } as any);
    const internationalPrefix = otpRateLimitKey({ ip: '203.0.113.4', body: { phone: '00216 12 345 678' } } as any);
    expect(local).toBe(international);
    expect(international).toBe(internationalPrefix);
    expect(local).not.toContain('12345678');
  });

  test('a composite phone bucket remains separate from an independent IP bucket', () => {
    const byIp = rateLimit(`rate-ip-${randomUUID()}`, 2, 60_000);
    const byTarget = rateLimit(`rate-target-${randomUUID()}`, 1, 60_000, (req) => `${req.ip}:${req.body?.phoneHash}`);
    const run = (middleware: ReturnType<typeof rateLimit>, ip: string, phoneHash: string) => {
      const res = responseMock(); const next = vi.fn();
      middleware({ ip, headers: {}, body: { phoneHash } } as any, res, next);
      return { res, next };
    };

    expect(run(byIp, '203.0.113.8', 'one').next).toHaveBeenCalledOnce();
    expect(run(byTarget, '203.0.113.8', 'one').next).toHaveBeenCalledOnce();
    expect(run(byTarget, '203.0.113.8', 'two').next).toHaveBeenCalledOnce();
    expect(run(byIp, '203.0.113.8', 'two').next).toHaveBeenCalledOnce();
    expect(run(byIp, '203.0.113.8', 'three').next).not.toHaveBeenCalled();
  });
});
