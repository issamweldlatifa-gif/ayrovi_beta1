import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import Stripe from 'stripe';
import { verifyStripeWebhookSignature } from '../src/services/paymentGateway';

/**
 * Signature du webhook Stripe — testé avec le VRAI SDK (aucun réseau).
 *
 * C'est la seule barrière qui empêche un tiers de faire croire à un paiement :
 * `generateTestHeaderString` produit exactement l'en-tête `stripe-signature`
 * que Stripe enverra, et `verifyStripeWebhookSignature` doit l'accepter — puis
 * refuser tout corps modifié.
 */

const ENV = { STRIPE_SECRET_KEY: 'sk_test_fake_key_for_tests', STRIPE_WEBHOOK_SECRET: 'whsec_test_secret' };
const originalEnv = { ...process.env };

beforeEach(() => Object.assign(process.env, ENV));
afterEach(() => {
  for (const key of Object.keys(ENV)) {
    if ((originalEnv as any)[key] === undefined) delete (process.env as any)[key];
    else (process.env as any)[key] = (originalEnv as any)[key];
  }
});

const payload = JSON.stringify({
  id: 'evt_test_1',
  object: 'event',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_abc12345', object: 'checkout.session', payment_status: 'paid' } },
});

const stripe = new Stripe('sk_test_fake_key_for_tests', { apiVersion: '2023-10-16' });

describe('verifyStripeWebhookSignature', () => {
  test('accepte une signature Stripe valide', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
    const event = verifyStripeWebhookSignature(payload, header);
    expect(event.type).toBe('checkout.session.completed');
    expect((event.data as any).object.id).toBe('cs_test_abc12345');
  });

  test('rejette un corps modifié après signature', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
    const tampered = payload.replace('cs_test_abc12345', 'cs_test_zzz99999');
    expect(() => verifyStripeWebhookSignature(tampered, header)).toThrow();
  });

  test('rejette une signature produite avec un autre secret', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_autre_secret' });
    expect(() => verifyStripeWebhookSignature(payload, header)).toThrow();
  });

  test('refuse de vérifier quand aucun secret n’est configuré', () => {
    process.env.STRIPE_WEBHOOK_SECRET = '';
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
    expect(() => verifyStripeWebhookSignature(payload, header)).toThrow('STRIPE_WEBHOOK_NOT_CONFIGURED');
  });
});
