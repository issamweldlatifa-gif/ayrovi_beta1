import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

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

/** A secret is only usable when it is long, non-temporary and not the auth key. */
function strongSecret(value: string): boolean {
  return Buffer.byteLength(value) >= 32 && !/placeholder|change.?me|example|development/i.test(value);
}

let derivedNoticeShown = false;

/**
 * Secret de signature des cotations AYROVIX.
 *
 * ── Le défaut fermé ─────────────────────────────────────────────────────────
 * En production, l'absence de `AYROVIX_QUOTE_SECRET` retombait sur une constante
 * PUBLIÉE DANS CE DÉPÔT : n'importe qui pouvait donc forger un prix « vérifié ».
 *
 * ── Ce qui se passe désormais ───────────────────────────────────────────────
 *  1. `AYROVIX_QUOTE_SECRET` présent et solide → il est utilisé ;
 *  2. absent en production → une clé est DÉRIVÉE de `CUSTOMER_AUTH_SECRET` par
 *     HKDF-SHA256, avec une étiquette de domaine distincte. Aucun secret n'est
 *     réutilisé tel quel : la clé de cotation ne peut pas servir à signer une
 *     session, et inversement. Le service démarre donc sans coupure, mais un
 *     avertissement demande la variable dédiée ;
 *  3. rien de solide nulle part (production) → refus de démarrer : mieux vaut
 *     une panne visible qu'une signature que tout le monde peut imiter ;
 *  4. développement/test → constante locale, comme avant.
 */
export function validateQuoteSecret(): string {
  const configured = String(process.env.AYROVIX_QUOTE_SECRET || '').trim();
  const customerSecret = String(process.env.CUSTOMER_AUTH_SECRET || '').trim();
  if (configured) {
    if (!strongSecret(configured) || configured === customerSecret) throw new Error('AYROVIX_QUOTE_SECRET_INVALID');
    return configured;
  }
  if (!['development', 'test', undefined].includes(process.env.NODE_ENV)) {
    if (!strongSecret(customerSecret)) throw new Error('AYROVIX_QUOTE_SECRET_NOT_CONFIGURED');
    if (!derivedNoticeShown) {
      derivedNoticeShown = true;
      console.warn('[AYROVIX] AYROVIX_QUOTE_SECRET absent : clé de cotation dérivée de CUSTOMER_AUTH_SECRET (HKDF). '
        + 'Définissez un secret dédié pour séparer complètement les domaines de signature.');
    }
    return Buffer.from(hkdfSync('sha256', customerSecret, 'ayrovi:quote-salt:v1', 'ayrovi:ayrovix-quote:v1', 32)).toString('hex');
  }
  return 'ayrovi-development-price-quote-secret-2026';
}

function secret(): string { return validateQuoteSecret(); }

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

/**
 * Read a signed quote. The signature is checked FIRST: an unsigned or altered
 * payload is never parsed into claims, so nothing downstream can treat
 * attacker-controlled JSON as a quote. Expiry is deliberately NOT checked here
 * — callers that only display when a quote lapses must still recognise a token
 * that was authentic but is now stale. `verifyAyrovixPriceToken` is the gate.
 */
export function inspectAyrovixPriceToken(token: unknown): QuoteClaims | null {
  if (typeof token !== 'string' || token.length > 5000) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(sign(payload));
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  let claims: QuoteClaims;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (claims == null || typeof claims !== 'object' || claims.v !== 1) return null;
  if (!Number.isFinite(claims.expiresAt) || !Number.isFinite(claims.price) || claims.price <= 0) return null;
  if (!['VERIFIED', 'PENDING_MANUAL'].includes(claims.status)) return null;
  return claims;
}

export function verifyAyrovixPriceToken(token: unknown, expected: {
  price: number;
  currency: string;
  title: string;
  referenceUrl?: string;
  status: AyrovixQuoteStatus;
}, now = Date.now()): boolean {
  const claims = inspectAyrovixPriceToken(token);
  if (!claims) return false;
  return claims.expiresAt >= now
    && Math.abs(Number(claims.price) - Math.round(expected.price * 100) / 100) < 0.001
    && claims.currency === expected.currency
    && claims.title === cleanTitle(expected.title)
    && claims.referenceUrl === cleanUrl(expected.referenceUrl)
    && claims.status === expected.status;
}
