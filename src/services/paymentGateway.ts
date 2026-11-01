import Stripe from 'stripe';

type StripeConfig = {
  ready: boolean;
  secretKey: string;
  webhookSecret: string;
  currency: string;
  publicBaseUrl: string;
};

type CardPaymentIdentity = {
  orderId: string;
  orderNumber: string;
  transactionNumber: string;
  amountTnd: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

function cleanBase(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * Stripe — passerelle carte ZAYROVI.
 *
 * Remplace Konnect (Tunisie) par Stripe (international).
 * TND n'est pas une devise Stripe supportée : le montant TND est facturé
 * dans STRIPE_CURRENCY (défaut: eur) à valeur numérique identique.
 * Ex: 50.000 TND → 5000 cents EUR. Une conversion FX pourra être ajoutée
 * via rateEUR si besoin (TND / rateEUR = EUR).
 *
 * Fallback Konnect conservé pour compatibilité test (KONNECT_API_KEY legacy).
 */
export function stripeConfig(): StripeConfig {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const currency = String(process.env.STRIPE_CURRENCY || 'eur').trim().toLowerCase() || 'eur';
  const publicBaseUrl = cleanBase(String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || ''));
  const ready = Boolean(secretKey && publicBaseUrl.startsWith('https://'));
  return { ready, secretKey, webhookSecret, currency, publicBaseUrl };
}

type KonnectLegacyConfig = {
  ready: boolean;
  baseUrl: string;
  apiKey: string;
  walletId: string;
  publicBaseUrl: string;
};

function konnectLegacyConfig(): KonnectLegacyConfig {
  const environment = String(process.env.KONNECT_ENVIRONMENT || 'production').trim().toLowerCase();
  const baseUrl = environment === 'sandbox'
    ? 'https://api.preprod.konnect.network/api/v2'
    : 'https://api.konnect.network/api/v2';
  const apiKey = String(process.env.KONNECT_API_KEY || '').trim();
  const walletId = String(process.env.KONNECT_WALLET_ID || '').trim();
  const publicBaseUrl = cleanBase(String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || ''));
  return { ready: Boolean(apiKey && walletId && publicBaseUrl.startsWith('https://')), baseUrl, apiKey, walletId, publicBaseUrl };
}

// Compatibilité : konnectConfig expose désormais la config Stripe (même forme ready/baseUrl/apiKey/walletId/publicBaseUrl)
export function konnectConfig(): StripeConfig {
  // Si Stripe prêt, on le retourne ; sinon on expose le legacy pour les tests qui lisent konnectConfig().ready
  const stripe = stripeConfig();
  if (stripe.ready) return stripe;
  const legacy = konnectLegacyConfig();
  // Adapter legacy vers StripeConfig shape pour que cardGatewayAvailable() fonctionne en fallback
  return {
    ready: legacy.ready,
    secretKey: legacy.apiKey,
    webhookSecret: '',
    currency: 'eur',
    publicBaseUrl: legacy.publicBaseUrl,
  } as any;
}

export function cardGatewayAvailable(): boolean {
  return stripeConfig().ready || konnectLegacyConfig().ready;
}

// Devises sans décimales chez Stripe (pas de centimes). Toutes les autres = 2 décimales.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf',
]);

function toStripeAmount(amountTnd: number, currency: string): number {
  const factor = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100;
  // TND → STRIPE_CURRENCY à taux 1:1 (MVP). Pour une conversion réelle:
  // amountStripe = amountTnd / fxRate (ex: / rateEUR pour EUR)
  return Math.round(amountTnd * factor);
}

function stripeClient(): Stripe {
  const config = stripeConfig();
  if (!config.secretKey) throw new Error('CARD_GATEWAY_NOT_CONFIGURED');
  return new Stripe(config.secretKey, { apiVersion: '2024-06-20' as any });
}

// ---------- Legacy Konnect (fallback pour tests) ----------
async function konnectFetch(url: string, init: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error: any = new Error(`KONNECT_HTTP_${response.status}`);
      error.code = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function initiateKonnectFallback(input: CardPaymentIdentity): Promise<{ payUrl: string; paymentRef: string }> {
  const config = konnectLegacyConfig();
  if (!config.ready) throw new Error('CARD_GATEWAY_NOT_CONFIGURED');
  const amount = Math.round(input.amountTnd * 1000);
  if (!Number.isSafeInteger(amount) || amount < 100) throw new Error('CARD_AMOUNT_INVALID');
  const returnQuery = new URLSearchParams({
    cardPayment: 'verify', orderId: input.orderId, transaction: input.transactionNumber,
  }).toString();
  const callbackUrl = `${config.publicBaseUrl}/?${returnQuery}`;
  const payload = await konnectFetch(`${config.baseUrl}/payments/init-payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey },
    body: JSON.stringify({
      receiverWalletId: config.walletId,
      token: 'TND',
      amount,
      type: 'immediate',
      description: `Acompte ZAYROVI ${input.orderNumber}`,
      acceptedPaymentMethods: ['bank_card'],
      lifespan: 20,
      checkoutForm: false,
      addPaymentFeesToAmount: false,
      firstName: input.firstName.slice(0, 80),
      lastName: input.lastName.slice(0, 80),
      phoneNumber: input.phone.replace(/\s+/g, ''),
      email: input.email.slice(0, 254),
      orderId: `${input.orderNumber}:${input.transactionNumber}`,
      webhook: `${config.publicBaseUrl}/api/customer/payments/konnect/webhook`,
      silentWebhook: true,
      successUrl: callbackUrl,
      failUrl: callbackUrl,
      theme: 'light',
    }),
  });
  const payUrl = String(payload?.payUrl || '');
  const paymentRef = String(payload?.paymentRef || '');
  if (!/^https:\/\//i.test(payUrl) || !/^[A-Za-z0-9_-]{8,160}$/.test(paymentRef)) throw new Error('CARD_GATEWAY_INVALID_RESPONSE');
  return { payUrl, paymentRef };
}

async function verifyKonnectFallback(input: {
  paymentRef: string;
  expectedAmountTnd: number;
  expectedOrderNumber: string;
  expectedTransactionNumber: string;
}): Promise<VerifiedCardPayment> {
  const config = konnectLegacyConfig();
  if (!config.ready) throw new Error('CARD_GATEWAY_NOT_CONFIGURED');
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(input.paymentRef)) throw new Error('CARD_REFERENCE_INVALID');
  const payload = await konnectFetch(`${config.baseUrl}/payments/${encodeURIComponent(input.paymentRef)}`, {
    method: 'GET', headers: { accept: 'application/json', 'x-api-key': config.apiKey },
  });
  const payment = payload?.payment || payload;
  const paymentId = String(payment?.id || input.paymentRef);
  const paymentStatus = String(payment?.status || '').toLowerCase();
  const token = String(payment?.token || 'TND').toUpperCase();
  const providerOrderId = String(payment?.orderId || '');
  const expectedProviderOrderId = `${input.expectedOrderNumber}:${input.expectedTransactionNumber}`;
  const reachedAmount = Number(payment?.reachedAmount ?? payment?.amount ?? 0);
  const expectedAmount = Math.round(input.expectedAmountTnd * 1000);
  const transactions = Array.isArray(payment?.transactions) ? payment.transactions : [];
  const transactionStatuses = transactions.map((item: any) => String(item?.status || '').toLowerCase()).filter(Boolean);
  const expirationTime = payment?.expirationDate ? new Date(payment.expirationDate).getTime() : Number.NaN;
  const expired = Number.isFinite(expirationTime) && expirationTime < Date.now();
  const paid = paymentStatus === 'completed'
    && token === 'TND'
    && providerOrderId === expectedProviderOrderId
    && Number.isSafeInteger(reachedAmount)
    && reachedAmount === expectedAmount;
  const explicitlyFailed = (paymentStatus === 'completed' && !paid)
    || expired
    || transactionStatuses.some((status: string) => ['failed', 'failure', 'cancelled', 'canceled', 'rejected'].includes(status));
  const state: VerifiedCardPayment['state'] = paid ? 'PAID' : explicitlyFailed ? 'FAILED' : 'PENDING';
  return {
    state,
    paymentRef: paymentId,
    providerOrderId,
    reachedAmount,
    auditPayload: {
      paymentId,
      status: paymentStatus,
      token,
      orderId: providerOrderId,
      reachedAmount: Number.isFinite(reachedAmount) ? reachedAmount : null,
      expirationDate: payment?.expirationDate || null,
      transactionStatuses,
    },
  };
}

export async function initiateStripeCardPayment(input: CardPaymentIdentity): Promise<{ payUrl: string; paymentRef: string }> {
  const stripeReady = stripeConfig().ready;
  if (!stripeReady && konnectLegacyConfig().ready) {
    return initiateKonnectFallback(input);
  }
  const config = stripeConfig();
  if (!config.ready) throw new Error('CARD_GATEWAY_NOT_CONFIGURED');
  const currency = config.currency;
  const amount = toStripeAmount(input.amountTnd, currency);
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency);
  if (!Number.isSafeInteger(amount) || amount < (isZeroDecimal ? 1 : 50)) throw new Error('CARD_AMOUNT_INVALID');
  const returnQuery = new URLSearchParams({
    cardPayment: 'verify', orderId: input.orderId, transaction: input.transactionNumber,
  }).toString();
  const baseCallback = `${config.publicBaseUrl}/?${returnQuery}`;
  const successUrl = `${baseCallback}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = baseCallback;
  const stripe = stripeClient();

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    client_reference_id: `${input.orderNumber}:${input.transactionNumber}`,
    success_url: successUrl,
    cancel_url: cancelUrl,
    ...(input.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ? { customer_email: input.email.slice(0, 254) } : {}),
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `Acompte ZAYROVI ${input.orderNumber}`,
            description: `Transaction ${input.transactionNumber} — ${input.amountTnd.toFixed(3)} TND facturé en ${currency.toUpperCase()}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      transactionNumber: input.transactionNumber,
      amountTnd: String(input.amountTnd),
      firstName: input.firstName.slice(0, 80),
      lastName: input.lastName.slice(0, 80),
    },
    expires_at: Math.floor(Date.now() / 1000) + 20 * 60,
  };

  const session = await stripe.checkout.sessions.create(sessionParams);
  const payUrl = String((session as any).url || '');
  const paymentRef = String(session.id || '');
  if (!/^https:\/\//i.test(payUrl) || !/^[A-Za-z0-9_\-]{8,200}$/.test(paymentRef)) throw new Error('CARD_GATEWAY_INVALID_RESPONSE');
  return { payUrl, paymentRef };
}

// Alias historique
export const initiateKonnectCardPayment = initiateStripeCardPayment;

export type VerifiedCardPayment = {
  state: 'PAID' | 'PENDING' | 'FAILED';
  paymentRef: string;
  providerOrderId: string;
  reachedAmount: number;
  auditPayload: Record<string, unknown>;
};

export async function verifyStripeCardPayment(input: {
  paymentRef: string;
  expectedAmountTnd: number;
  expectedOrderNumber: string;
  expectedTransactionNumber: string;
}): Promise<VerifiedCardPayment> {
  const stripeReady = stripeConfig().ready;
  if (!stripeReady && konnectLegacyConfig().ready) {
    return verifyKonnectFallback(input);
  }
  const config = stripeConfig();
  if (!config.ready) throw new Error('CARD_GATEWAY_NOT_CONFIGURED');
  if (!/^[A-Za-z0-9_\-]{8,200}$/.test(input.paymentRef)) throw new Error('CARD_REFERENCE_INVALID');
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.retrieve(input.paymentRef);
  const paymentStatus = String((session as any).payment_status || '').toLowerCase();
  const sessionStatus = String((session as any).status || '').toLowerCase();
  const currency = String((session as any).currency || config.currency).toLowerCase();
  const expectedCurrency = config.currency.toLowerCase();
  const amountTotal = Number((session as any).amount_total ?? 0);
  const expectedAmount = toStripeAmount(input.expectedAmountTnd, expectedCurrency);
  const clientRef = String((session as any).client_reference_id || '');
  const expectedClientRef = `${input.expectedOrderNumber}:${input.expectedTransactionNumber}`;
  const expiresAt = (session as any).expires_at ? new Date(Number((session as any).expires_at) * 1000).toISOString() : null;
  const expired = Boolean((session as any).expires_at) && Number((session as any).expires_at) * 1000 < Date.now() && sessionStatus === 'expired';

  const paid = sessionStatus === 'complete'
    && paymentStatus === 'paid'
    && currency === expectedCurrency
    && clientRef === expectedClientRef
    && Number.isSafeInteger(amountTotal)
    && amountTotal === expectedAmount;

  const explicitlyFailed = (sessionStatus === 'complete' && !paid)
    || sessionStatus === 'expired'
    || expired
    || paymentStatus === 'unpaid' && sessionStatus === 'expired';

  const state: VerifiedCardPayment['state'] = paid ? 'PAID' : explicitlyFailed ? 'FAILED' : 'PENDING';
  return {
    state,
    paymentRef: String(session.id || input.paymentRef),
    providerOrderId: clientRef,
    reachedAmount: Number.isFinite(amountTotal) ? amountTotal : 0,
    auditPayload: {
      paymentId: String(session.id || input.paymentRef),
      status: sessionStatus,
      payment_status: paymentStatus,
      currency,
      client_reference_id: clientRef,
      expected_client_reference_id: expectedClientRef,
      amount_total: Number.isFinite(amountTotal) ? amountTotal : null,
      expected_amount: expectedAmount,
      expected_currency: expectedCurrency,
      expires_at: expiresAt,
      url: (session as any).url || null,
    },
  };
}

// Alias historique
export const verifyKonnectCardPayment = verifyStripeCardPayment;

/**
 * Vérifie la signature Stripe Webhook (POST /api/customer/payments/stripe/webhook).
 */
export function verifyStripeWebhookSignature(rawBody: Buffer | string, signature: string): Stripe.Event {
  const config = stripeConfig();
  if (!config.webhookSecret) throw new Error('STRIPE_WEBHOOK_NOT_CONFIGURED');
  const stripe = stripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
}
