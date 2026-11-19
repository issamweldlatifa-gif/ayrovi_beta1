import { createHash } from 'node:crypto';
const WINDOW_MS = 15 * 60_000;
const MAX_BUCKETS = 25_000;
const accountKey = (email: string) => createHash('sha256').update(email).digest('base64url');
type Bucket = { failures: number; expiresAt: number };

/** Per-router bounds. Shared storage / edge throttling remains necessary for multiple replicas. */
export function createLoginThrottle() {
  const ipBuckets = new Map<string, Bucket>();
  const accountBuckets = new Map<string, Bucket>();
  let nextSweep = 0;
  const get = (store: Map<string, Bucket>, key: string, now: number) => {
    const value = store.get(key);
    if (value && value.expiresAt > now) return value;
    if (value) store.delete(key);
    return undefined;
  };
  function increment(store: Map<string, Bucket>, key: string, now: number) {
    const old = get(store, key, now);
    if (old) { old.failures++; return; }
    if (store.size < MAX_BUCKETS) store.set(key, { failures: 1, expiresAt: now + WINDOW_MS });
  }
  return {
    wait(ip: string, email: string, now = Date.now()) {
      if (now >= nextSweep) {
        for (const store of [ipBuckets, accountBuckets]) for (const [key, bucket] of store) if (bucket.expiresAt <= now) store.delete(key);
        nextSweep = now + 30_000;
      }
      const address = get(ipBuckets, ip, now);
      const account = email ? get(accountBuckets, accountKey(email), now) : undefined;
      if ((!address && ipBuckets.size >= MAX_BUCKETS) || (email && !account && accountBuckets.size >= MAX_BUCKETS)) return 30;
      return Math.ceil(Math.max(0, address && address.failures >= 8 ? address.expiresAt - now : 0, account && account.failures >= 12 ? account.expiresAt - now : 0) / 1000);
    },
    failure(ip: string, email: string, now = Date.now()) {
      increment(ipBuckets, ip, now);
      if (email) increment(accountBuckets, accountKey(email), now);
    },
    success(ip: string, email: string) { ipBuckets.delete(ip); if (email) accountBuckets.delete(accountKey(email)); },
  };
}
