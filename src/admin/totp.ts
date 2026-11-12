/**
 * Double authentification de la console (TOTP, RFC 6238) — 12/11/2026.
 *
 * Recommandation n°1 de l'audit d'authentification (`docs/auth-audit-2026-11-11_AR.md`) :
 * la console décide des prix et des remboursements, un mot de passe seul ne suffit pas.
 *
 * Choix retenus :
 *  • TOTP standard (SHA-1, 30 s, 6 chiffres) : Google Authenticator, Microsoft
 *    Authenticator, 1Password, Aegis… — aucune dépendance, `node:crypto` seulement ;
 *  • fenêtre ±1 pas (horloge du téléphone décalée de 30 s acceptée) ;
 *  • anti-rejeu : un pas déjà consommé est refusé (`totp_last_step`) ;
 *  • secret chiffré au repos (AES-256-GCM), clé dérivée de `ADMIN_TOTP_KEY`
 *    (sinon `CUSTOMER_AUTH_SECRET`) ;
 *  • 8 codes de secours à usage unique, stockés en empreinte SHA-256 ;
 *  • activation volontaire par chaque compte ; un compte `users:write` peut la
 *    réinitialiser pour un collègue bloqué, `ADMIN_BOOTSTRAP_RESET` aussi.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
export const TOTP_ISSUER = 'ZAYROVI Console';
export const RECOVERY_CODE_COUNT = 8;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = String(input || '').toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Secret base32 invalide.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Nouveau secret : 20 octets (160 bits), la taille recommandée par la RFC 4226. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** HOTP (RFC 4226) pour un compteur donné. */
export function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.max(0, Math.floor(counter))));
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function totpCode(secret: string, nowMs: number = Date.now()): string {
  return hotp(secret, totpStep(nowMs));
}

function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Vérifie un code TOTP. Renvoie le pas accepté (à mémoriser contre le rejeu) ou
 * `null`. Un pas `<= lastStep` est refusé même s'il est juste.
 */
export function verifyTotp(secret: string, code: unknown, lastStep = 0, nowMs: number = Date.now()): number | null {
  const candidate = String(code ?? '').replace(/\s/g, '');
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(candidate)) return null;
  const current = totpStep(nowMs);
  let accepted: number | null = null;
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    const step = current + delta;
    // On compare toujours toutes les positions : durée indépendante du résultat.
    if (safeEqualText(hotp(secret, step), candidate) && step > lastStep && accepted === null) accepted = step;
  }
  return accepted;
}

export function otpauthUrl(secret: string, account: string, issuer: string = TOTP_ISSUER): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ───────────────────────── Codes de secours ───────────────────────── */

/** Format `abcd-efgh` (sans caractères ambigus 0/o/1/l). */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const chars = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
  });
}

export function normalizeRecoveryCode(code: unknown): string {
  const clean = String(code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : '';
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(`ayrovi-admin-recovery:${normalizeRecoveryCode(code)}`).digest('hex');
}

export function looksLikeRecoveryCode(code: unknown): boolean {
  return /^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(String(code ?? '').trim()) && !/^\d+$/.test(String(code ?? '').replace(/-/g, ''));
}

/** Consomme un code de secours : renvoie la nouvelle liste d'empreintes, ou `null`. */
export function consumeRecoveryCode(hashes: readonly string[], code: unknown): string[] | null {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return null;
  const target = hashRecoveryCode(normalized);
  let index = -1;
  hashes.forEach((hash, i) => { if (index < 0 && safeEqualText(hash, target)) index = i; });
  if (index < 0) return null;
  return hashes.filter((_, i) => i !== index);
}

export function parseRecoveryHashes(raw: unknown): string[] {
  try {
    const value = JSON.parse(String(raw ?? '[]'));
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && /^[0-9a-f]{64}$/.test(item)) : [];
  } catch { return []; }
}

/* ───────────────────────── Chiffrement au repos ───────────────────────── */

function encryptionKey(): Buffer {
  const material = String(process.env.ADMIN_TOTP_KEY || process.env.CUSTOMER_AUTH_SECRET || '').trim()
    || 'ayrovi-dev-only-admin-totp-key';
  return createHash('sha256').update(`ayrovi-admin-totp:v1:${material}`).digest();
}

export function sealTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${body.toString('base64url')}`;
}

export function openTotpSecret(sealed: unknown): string | null {
  const parts = String(sealed ?? '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[1], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
  } catch { return null; }
}
