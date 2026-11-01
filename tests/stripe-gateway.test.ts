import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  cardGatewayAvailable,
  initiateStripeCardPayment,
  stripeConfig,
  verifyStripeCardPayment,
} from '../src/services/paymentGateway';

/**
 * Passerelle carte Stripe — tests isolés (aucun réseau, aucune base).
 *
 * Le SDK Stripe est remplacé par un double: on vérifie ce que ZAYROVI DEMANDE à
 * Stripe (montant, devise, moyen de paiement, référence) et comment il interprète
 * la réponse. Le contrôle de signature webhook, lui, est testé avec le vrai SDK
 * dans `tests/stripe-webhook-signature.test.ts`.
 */

const stripeMock = vi.hoisted(() => ({
  createCalls: [] as any[],
  retrieveCalls: [] as string[],
  createImpl: null as null | ((params: any) => Promise<any>),
  retrieveImpl: null as null | ((id: string) => Promise<any>),
}));

vi.mock('stripe', () => {
  class FakeStripe {
    checkout = {
      sessions: {
        create: async (params: any) => {
          stripeMock.createCalls.push(params);
          if (!stripeMock.createImpl) throw new Error('create stub manquant');
          return stripeMock.createImpl(params);
        },
        retrieve: async (id: string) => {
          stripeMock.retrieveCalls.push(id);
          if (!stripeMock.retrieveImpl) throw new Error('retrieve stub manquant');
          return stripeMock.retrieveImpl(id);
        },
      },
    };
    webhooks = { constructEvent: (payload: string) => JSON.parse(payload) };
    constructor(_key?: string, _options?: any) {}
  }
  return { default: FakeStripe };
});

const BASE_ENV = {
  STRIPE_SECRET_KEY: 'sk_test_fake_key_for_tests',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  STRIPE_CURRENCY: 'eur',
  PUBLIC_BASE_URL: 'https://ayrovi.example',
  KONNECT_API_KEY: '',
  KONNECT_WALLET_ID: '',
};

const identity = {
  orderId: 'order_1',
  orderNumber: 'AYR-2026-0001',
  transactionNumber: 'TXN-2026-000001',
  amountTnd: 118,
  firstName: 'Issam',
  lastName: 'Ben Ali',
  phone: '98 123 456',
  email: 'client@example.com',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, BASE_ENV);
  stripeMock.createCalls.length = 0;
  stripeMock.retrieveCalls.length = 0;
  stripeMock.createImpl = null;
  stripeMock.retrieveImpl = null;
});

afterEach(() => {
  for (const key of Object.keys(BASE_ENV)) {
    if ((originalEnv as any)[key] === undefined) delete (process.env as any)[key];
    else (process.env as any)[key] = (originalEnv as any)[key];
  }
});

describe('stripeConfig', () => {
  test('n’est pas prêt sans clé secrète ou sans base HTTPS', () => {
    process.env.STRIPE_SECRET_KEY = '';
    expect(stripeConfig().ready).toBe(false);
    expect(cardGatewayAvailable()).toBe(false);

    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_tests';
    process.env.PUBLIC_BASE_URL = 'http://insecure.example';
    expect(cardGatewayAvailable()).toBe(false);

    process.env.PUBLIC_BASE_URL = 'https://ayrovi.example';
    expect(cardGatewayAvailable()).toBe(true);
    expect(stripeConfig()).toMatchObject({ currency: 'eur', publicBaseUrl: 'https://ayrovi.example' });
  });

  test('refuse de démarrer un paiement sans configuration', async () => {
    process.env.STRIPE_SECRET_KEY = '';
    await expect(initiateStripeCardPayment(identity)).rejects.toThrow('CARD_GATEWAY_NOT_CONFIGURED');
    await expect(verifyStripeCardPayment({
      paymentRef: 'cs_test_abc12345', expectedAmountTnd: 118,
      expectedOrderNumber: identity.orderNumber, expectedTransactionNumber: identity.transactionNumber,
    })).rejects.toThrow('CARD_GATEWAY_NOT_CONFIGURED');
  });
});

describe('initiateStripeCardPayment', () => {
  test('crée une Checkout Session carte, en centimes, avec la référence commande', async () => {
    stripeMock.createImpl = async () => ({
      id: 'cs_test_abc12345',
      object: 'checkout.session',
      url: 'https://checkout.stripe.com/c/pay/cs_test_abc12345',
    });

    const result = await initiateStripeCardPayment(identity);

    expect(result).toEqual({
      payUrl: 'https://checkout.stripe.com/c/pay/cs_test_abc12345',
      paymentRef: 'cs_test_abc12345',
    });
    expect(stripeMock.createCalls).toHaveLength(1);
    const params = stripeMock.createCalls[0];
    expect(params.mode).toBe('payment');
    expect(params.payment_method_types).toEqual(['card']);
    expect(params.client_reference_id).toBe('AYR-2026-0001:TXN-2026-000001');
    expect(params.line_items[0].price_data.currency).toBe('eur');
    expect(params.line_items[0].price_data.unit_amount).toBe(11800);
    expect(params.success_url).toContain('https://ayrovi.example/?cardPayment=verify');
    expect(params.success_url).toContain('{CHECKOUT_SESSION_ID}');
    expect(params.cancel_url).toContain('cardPayment=verify');
    // Contrainte Stripe : la session doit vivre au moins 30 minutes.
    expect(params.expires_at - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(30 * 60);
    expect(params.metadata.transactionNumber).toBe('TXN-2026-000001');
    expect(params.customer_email).toBe('client@example.com');
  });

  test('rejette une réponse Stripe inexploitable (pas d’URL)', async () => {
    stripeMock.createImpl = async () => ({ id: 'cs_test_abc12345', object: 'checkout.session' });
    await expect(initiateStripeCardPayment(identity)).rejects.toThrow('CARD_GATEWAY_INVALID_RESPONSE');
  });

  test('ignore un email invalide au lieu de faire échouer le paiement', async () => {
    stripeMock.createImpl = async () => ({
      id: 'cs_test_abc12345', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_abc12345',
    });
    await initiateStripeCardPayment({ ...identity, email: 'pas-un-email' });
    expect(stripeMock.createCalls[0].customer_email).toBeUndefined();
  });
});

describe('verifyStripeCardPayment', () => {
  const verify = (overrides: Partial<Parameters<typeof verifyStripeCardPayment>[0]> = {}) => verifyStripeCardPayment({
    paymentRef: 'cs_test_abc12345',
    expectedAmountTnd: 118,
    expectedOrderNumber: identity.orderNumber,
    expectedTransactionNumber: identity.transactionNumber,
    ...overrides,
  });

  test('PAID seulement si statut, devise, montant ET référence correspondent', async () => {
    stripeMock.retrieveImpl = async () => ({
      id: 'cs_test_abc12345', object: 'checkout.session', status: 'complete', payment_status: 'paid',
      currency: 'eur', amount_total: 11800, client_reference_id: 'AYR-2026-0001:TXN-2026-000001',
    });
    const result = await verify();
    expect(result.state).toBe('PAID');
    expect(result.reachedAmount).toBe(11800);
    expect(result.providerOrderId).toBe('AYR-2026-0001:TXN-2026-000001');
    expect(result.auditPayload).toMatchObject({ currency: 'eur', amount_total: 11800, expected_amount: 11800 });
  });

  test('un montant différent est un échec terminal, jamais un succès en attente', async () => {
    stripeMock.retrieveImpl = async () => ({
      id: 'cs_test_abc12345', object: 'checkout.session', status: 'complete', payment_status: 'paid',
      currency: 'eur', amount_total: 11700, client_reference_id: 'AYR-2026-0001:TXN-2026-000001',
    });
    expect((await verify()).state).toBe('FAILED');
  });

  test('une référence de commande étrangère est un échec', async () => {
    stripeMock.retrieveImpl = async () => ({
      id: 'cs_test_abc12345', object: 'checkout.session', status: 'complete', payment_status: 'paid',
      currency: 'eur', amount_total: 11800, client_reference_id: 'AYR-OTHER:TXN-OTHER',
    });
    expect((await verify()).state).toBe('FAILED');
  });

  test('une devise inattendue est un échec', async () => {
    stripeMock.retrieveImpl = async () => ({
      id: 'cs_test_abc12345', object: 'checkout.session', status: 'complete', payment_status: 'paid',
      currency: 'usd', amount_total: 11800, client_reference_id: 'AYR-2026-0001:TXN-2026-000001',
    });
    expect((await verify()).state).toBe('FAILED');
  });

  test('une session ouverte reste PENDING ; expirée devient FAILED', async () => {
    stripeMock.retrieveImpl = async () => ({
      id: 'cs_test_abc12345', object: 'checkout.session', status: 'open', payment_status: 'unpaid',
      currency: 'eur', amount_total: 11800, client_reference_id: 'AYR-2026-0001:TXN-2026-000001',
    });
    expect((await verify()).state).toBe('PENDING');

    stripeMock.retrieveImpl = async () => ({
      id: 'cs_test_abc12345', object: 'checkout.session', status: 'expired', payment_status: 'unpaid',
      currency: 'eur', amount_total: 11800, client_reference_id: 'AYR-2026-0001:TXN-2026-000001',
    });
    expect((await verify()).state).toBe('FAILED');
  });

  test('refuse une référence qui n’est pas un identifiant Stripe', async () => {
    await expect(verify({ paymentRef: 'pas un id!' })).rejects.toThrow('CARD_REFERENCE_INVALID');
    expect(stripeMock.retrieveCalls).toHaveLength(0);
  });
});
