import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { stripeDiagnostics } from '../src/services/paymentGateway';

/**
 * Diagnostic Stripe — aucune valeur secrète ne doit sortir, et une variable mal
 * nommée doit être NOMMÉE. Ces deux garanties sont la raison d'être du endpoint :
 * une clé absente se manifeste autrement par un simple bouton grisé.
 */

const KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CURRENCY', 'PUBLIC_BASE_URL',
  'KONNECT_API_KEY', 'KONNECT_WALLET_ID', 'NODE_ENV', 'RENDER'];
const before: Record<string, string | undefined> = {};

beforeEach(() => { for (const key of KEYS) before[key] = process.env[key]; });
afterEach(() => {
  for (const key of KEYS) {
    if (before[key] === undefined) delete (process.env as any)[key];
    else (process.env as any)[key] = before[key];
  }
});

describe('stripeDiagnostics', () => {
  test('nomme chaque variable manquante sans jamais exposer de secret', () => {
    process.env.STRIPE_SECRET_KEY = '';
    process.env.STRIPE_WEBHOOK_SECRET = '';
    process.env.PUBLIC_BASE_URL = '';
    delete process.env.RENDER;
    process.env.NODE_ENV = 'test';

    const diagnostic = stripeDiagnostics();

    expect(diagnostic.ready).toBe(false);
    expect(diagnostic.missing).toEqual(expect.arrayContaining(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PUBLIC_BASE_URL']));
    expect(JSON.stringify(diagnostic)).not.toMatch(/sk_test|sk_live|whsec_/);
  });

  test('rapporte le mode test/live et l’URL webhook exacte quand tout est configuré', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_51abcdef';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xyz';
    process.env.PUBLIC_BASE_URL = 'https://ayrovi-beta1-moo8.onrender.com';
    process.env.STRIPE_CURRENCY = 'eur';
    process.env.NODE_ENV = 'test';

    const diagnostic = stripeDiagnostics();

    expect(diagnostic.ready).toBe(true);
    expect(diagnostic.missing).toEqual([]);
    expect(diagnostic.secretKey).toEqual({ present: true, mode: 'test' });
    expect(diagnostic.webhookUrl).toBe('https://ayrovi-beta1-moo8.onrender.com/api/customer/payments/stripe/webhook');
    // Le diagnostic cite les NOMS, jamais les valeurs.
    expect(JSON.stringify(diagnostic)).not.toContain('sk_test_51abcdef');
    expect(JSON.stringify(diagnostic)).not.toContain('whsec_xyz');
  });

  test('détecte un nom mal orthographié au lieu de dire simplement « absent »', () => {
    process.env.STRIPE_SECRET_KEY = '';
    process.env.STRIPE_WEBHOOK_SECRET = '';
    process.env.PUBLIC_BASE_URL = 'https://ayrovi.example';
    (process.env as any).STRIPE_SECRET = 'sk_test_51abcdef';
    process.env.NODE_ENV = 'test';
    try {
      const diagnostic = stripeDiagnostics();
      expect(diagnostic.envVarNames).toContain('STRIPE_SECRET');
      expect(diagnostic.hints.join(' ')).toContain('STRIPE_SECRET');
      expect(JSON.stringify(diagnostic)).not.toContain('sk_test_51abcdef');
    } finally {
      delete (process.env as any).STRIPE_SECRET;
    }
  });

  test('signale une valeur entourée de guillemets', () => {
    process.env.STRIPE_SECRET_KEY = '"sk_test_51abcdef"';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xyz';
    process.env.PUBLIC_BASE_URL = 'https://ayrovi.example';
    process.env.NODE_ENV = 'test';

    const diagnostic = stripeDiagnostics();
    expect(diagnostic.secretKey.present).toBe(true);
    expect(diagnostic.hints.join(' ')).toMatch(/guillemets/);
  });
});
