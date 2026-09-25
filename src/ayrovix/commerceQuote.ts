import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { CommerceProduct } from '../../shared/commerceProduct';

/** Server-owned quote: signs the entire source/variant/price provenance, not a
 * client-calculated price string. A changed option, image, URL, title or TND
 * amount invalidates the quote. Stale quotes must be refreshed, not repriced
 * silently while adding to the basket.
 */
function secret(): string {
  const configured = String(process.env.AYROVIX_QUOTE_SECRET || process.env.CUSTOMER_AUTH_SECRET || '').trim();
  if (configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('AYROVIX_QUOTE_SECRET_NOT_CONFIGURED');
  return 'ayrovi-development-price-quote-secret-2026';
}
function fingerprint(product: CommerceProduct): string {
  return createHash('sha256').update(JSON.stringify({ ...product, quoteToken: null })).digest('base64url');
}
function mac(payload: string): Buffer { return createHmac('sha256', secret()).update(payload).digest(); }

export function signCommerceProduct(product: CommerceProduct, ttlMs = 30 * 60_000): string {
  const claims = { v: 2, id: product.id, fingerprint: fingerprint(product), expiresAt: Date.now() + ttlMs };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${mac(payload).toString('base64url')}`;
}

export function verifyCommerceProduct(product: CommerceProduct): boolean {
  if (!product || typeof product !== 'object' || !product.quoteToken || typeof product.quoteToken !== 'string' || product.quoteToken.length > 2000) return false;
  const [payload, signature, extra] = product.quoteToken.split('.');
  if (!payload || !signature || extra) return false;
  try {
    const actual = Buffer.from(signature, 'base64url');
    const wanted = mac(payload);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return false;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { v?: number; id?: string; fingerprint?: string; expiresAt?: number };
    return claims.v === 2 && claims.id === product.id && typeof claims.expiresAt === 'number'
      && claims.expiresAt >= Date.now() && claims.fingerprint === fingerprint(product);
  } catch { return false; }
}
