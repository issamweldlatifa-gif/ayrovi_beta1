type KonnectConfig = {
  ready: boolean;
  baseUrl: string;
  apiKey: string;
  walletId: string;
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

export function konnectConfig(): KonnectConfig {
  const environment = String(process.env.KONNECT_ENVIRONMENT || 'production').trim().toLowerCase();
  const baseUrl = environment === 'sandbox'
    ? 'https://api.preprod.konnect.network/api/v2'
    : 'https://api.konnect.network/api/v2';
  const apiKey = String(process.env.KONNECT_API_KEY || '').trim();
  const walletId = String(process.env.KONNECT_WALLET_ID || '').trim();
  const publicBaseUrl = cleanBase(String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || ''));
  return { ready: Boolean(apiKey && walletId && publicBaseUrl.startsWith('https://')), baseUrl, apiKey, walletId, publicBaseUrl };
}

export function cardGatewayAvailable(): boolean {
  return konnectConfig().ready;
}

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

export async function initiateKonnectCardPayment(input: CardPaymentIdentity): Promise<{ payUrl: string; paymentRef: string }> {
  const config = konnectConfig();
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
      description: `Acompte AYROVI ${input.orderNumber}`,
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

export type VerifiedCardPayment = {
  state: 'PAID' | 'PENDING' | 'FAILED';
  paymentRef: string;
  providerOrderId: string;
  reachedAmount: number;
  auditPayload: Record<string, unknown>;
};

export async function verifyKonnectCardPayment(input: {
  paymentRef: string;
  expectedAmountTnd: number;
  expectedOrderNumber: string;
  expectedTransactionNumber: string;
}): Promise<VerifiedCardPayment> {
  const config = konnectConfig();
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
  // A completed payment with any identity/currency/amount mismatch is terminally invalid,
  // never a pending success candidate.
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
