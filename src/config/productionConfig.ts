import path from 'node:path';

/** Fail closed before opening SQLite or serving requests when production secrets
 * and persistent storage are missing or still contain sample values. */
export function assertProductionConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  const production = env.NODE_ENV === 'production';
  if (env.RENDER && !production) {
    throw new Error('Unsafe deployment configuration: NODE_ENV must be production on Render.');
  }
  if (!production) return;

  const missing: string[] = [];
  const adminEmail = String(env.ADMIN_EMAIL || '').trim();
  const adminPassword = String(env.ADMIN_PASSWORD || '');
  const customerSecret = String(env.CUSTOMER_AUTH_SECRET || '');
  const databasePath = String(env.DATABASE_PATH || '').trim();
  const baseUrl = String(env.PUBLIC_BASE_URL || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) missing.push('ADMIN_EMAIL');
  if (adminPassword.length < 12 || /replace|placeholder|example|demo/i.test(adminPassword) || adminPassword === 'AyroviBeta2026!') missing.push('ADMIN_PASSWORD');
  if (customerSecret.length < 32 || /replace|placeholder|example|demo/i.test(customerSecret)) missing.push('CUSTOMER_AUTH_SECRET');
  if (!databasePath || !path.isAbsolute(databasePath)) missing.push('DATABASE_PATH (absolute persistent path)');
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      missing.push('PUBLIC_BASE_URL (HTTPS origin only)');
    }
  } catch { missing.push('PUBLIC_BASE_URL (HTTPS origin only)'); }

  if (env.ADMIN_BOOTSTRAP_RESET?.trim() && env.ADMIN_BOOTSTRAP_RESET.trim().length < 32) {
    missing.push('ADMIN_BOOTSTRAP_RESET (one-time token, 32+ characters)');
  }
  if (env.TRUST_PROXY_HOPS != null && env.TRUST_PROXY_HOPS !== '') {
    const hops = Number(env.TRUST_PROXY_HOPS);
    if (!Number.isInteger(hops) || hops < 0 || hops > 5) missing.push('TRUST_PROXY_HOPS (integer 0..5)');
  }

  if (missing.length) throw new Error(`Unsafe production configuration. Fix: ${[...new Set(missing)].join(', ')}`);
}
