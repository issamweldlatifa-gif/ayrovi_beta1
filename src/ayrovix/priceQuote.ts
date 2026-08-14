import { createHmac, timingSafeEqual } from 'node:crypto';

export type AyrovixQuoteStatus = 'VERIFIED' | 'PENDING_MANUAL';

interface QuoteClaims {
  v: 1;
  price: number;
  currency: string;
  title: string;
  referenceUrl: string;
  status: AyrovixQuoteStatus;
  expiresAt: number;
}

function secret(): string {
  const configured = String(process.env.AYROVIX_QUOTE_SECRET || process.env.CUSTOMER_AUTH_SECRET || '').trim();
  if (configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('AYROVIX_QUOTE_SECRET_NOT_CONFIGURED');
  return 'ayrovi-development-price-quote-secret-2026';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function cleanTitle(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function cleanUrl(value: unknown): string {
  return String(value || '').trim().slice(0, 4096);
}

export function createAyrovixPriceToken(input: {
  price: number;
  currency: string;
  title: string;
  referenceUrl?: string;
  status: AyrovixQuoteStatus;
}, ttlMs = 30 * 60_000): string | null {
  if (!Number.isFinite(input.price) || input.price <= 0 || !/^[A-Z]{3}$/.test(input.currency)) return null;
  const claims: QuoteClaims = {
    v: 1,
    price: Math.round(input.price * 100) / 100,
    currency: input.currency,
    title: cleanTitle(input.title),
    referenceUrl: cleanUrl(input.referenceUrl),
    status: input.status,
    expiresAt: Date.now() + ttlMs,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyAyrovixPriceToken(token: unknown, expected: {
  price: number;
  currency: string;
  title: string;
  referenceUrl?: string;
  status: AyrovixQuoteStatus;
}): boolean {
  if (typeof token !== 'string' || token.length > 5000) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(sign(payload));
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return false;
  let claims: QuoteClaims;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return false; }
  return claims.v === 1
    && claims.expiresAt >= Date.now()
    && Math.abs(Number(claims.price) - Math.round(expected.price * 100) / 100) < 0.001
    && claims.currency === expected.currency
    && claims.title === cleanTitle(expected.title)
    && claims.referenceUrl === cleanUrl(expected.referenceUrl)
    && claims.status === expected.status;
}
