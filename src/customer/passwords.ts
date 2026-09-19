import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Mots de passe e-mail — scrypt avec sel unique et comparaison en temps constant. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (typeof stored !== 'string' || !stored) return false;
  const [scheme, salt, digest] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

