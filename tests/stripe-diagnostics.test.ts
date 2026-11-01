import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { stripeDiagnostics } from '../src/services/paymentGateway';

const KEYS = ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_CURRENCY','PUBLIC_BASE_URL','KONNECT_API_KEY','KONNECT_WALLET_ID','NODE_ENV','RENDER'];
const before: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) before[k] = process.env[k]; });
afterEach(() => { for (const k of KEYS) { if (before[k] === undefined) delete (process.env as any)[k]; else (process.env as any)[k] = before[k]; } });

describe('stripeDiagnostics', () => {
  test('nomme chaque variable manquante, sans jamais exposer de secret', () => {
    process.env.STRIPE_SECRET_KEY = ''; process.env.STRIPE_WEBHOOK_SECRET = ''; process.env.PUBLIC_BASE_URL = '';
    delete process.env.RENDER; process.env.NODE_ENV = 'test';
    const d = stripeDiagnostics();
    expect(d.ready).toBe(false);
    expect(d.missing).toEqual(expect.arrayContaining(['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','PUBLIC_BASE_URL']));
    const serialized = JSON.stringify(d);
    expect(serialized).not.toMatch(/sk_|whsec_/);
  });

  test('expose le mode test/live et l’URL webhook exacte quand la config est complète', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_51abcdef'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xyz';
    process.env.PUBLIC_BASE_URL = 'https://ayrovi-beta1-moo8.onrender.com'; process.env.STRIPE_CURRENCY = 'eur';
    process.env.NODE_ENV = 'test';
    const d = stripeDiagnostics();
    expect(d.ready).toBe(true);
    expect(d.missing).toEqual([]);
    expect(d.secretKey).toEqual({ present: true, mode: 'test' });
    expect(d.webhookUrl).toBe('https://ayrovi-beta1-moo8.onrender.com/api/customer/payments/stripe/webhook');
    expect(JSON.stringify(d)).not.toContain('sk_test_51abcdef');
  });
});
