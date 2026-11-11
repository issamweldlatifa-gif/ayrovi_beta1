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


/**
 * Empreinte factice calculée une fois : quand l'adresse n'existe pas (ou n'a pas
 * de mot de passe), on fait QUAND MÊME un calcul scrypt complet. Sans cela, la
 * réponse « inconnu » revenait en ~1 ms et la réponse « mauvais mot de passe » en
 * ~50 ms : le chronomètre suffisait à dresser la liste des clients.
 */
let dummyHash = '';
export function burnPasswordCheck(password: string): false {
  dummyHash ||= hashPassword('ayrovi-dummy-password-never-valid');
  verifyPassword(password, dummyHash);
  return false;
}
