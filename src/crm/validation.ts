/**
 * AYROVI CRM 360 (E1) — validation partagée.
 *
 * Mêmes conventions que les autres modules : aucune valeur arbitraire ne vient d'un
 * `req.body` brut ; chaque champ passe par un nettoyeur typé et une limite de longueur.
 */
import { CRM_ERRORS, CRM_LIMITS, type CrmErrorCode } from './types';

export interface CrmValidationIssue {
  field: string;
  reason: string;
}

export function fail(field: string, reason: string): CrmValidationIssue {
  return { field, reason };
}

/** Identifiants : texte court, sans SQL ni blanc. */
export function isValidId(value: unknown): boolean {
  return typeof value === 'string' && value.length >= 1 && value.length <= 160 && /^[A-Za-z0-9._-]+$/.test(value);
}

export function cleanText(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanMultiline(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

/** Longueur « raisonnable » pour un champ de saisie ; renvoie null si absente. */
export function optionalString(value: unknown, max: number): string | null {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

export function parseDateOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** 0/1 ou booléen → entier 0/1. */
export function parseFlag(value: unknown): number {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

export function parsePositiveInt(value: unknown, fallback: number, max = 10_000): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function parsePageSize(value: unknown, fallback = 25): number {
  return parsePositiveInt(value, fallback, CRM_LIMITS.PAGE_SIZE_MAX);
}

export function isValidEnum<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** E-mail : simple et sûr (aucune exécution, aucun HTML). */
export function validateEmail(value: unknown): CrmValidationIssue | null {
  if (value === undefined || value === null || value === '') return null;
  const email = String(value).trim().slice(0, CRM_LIMITS.EMAIL_MAX);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail('email', 'Adresse e-mail invalide.');
  return null;
}

/**
 * Téléphone : vide accepté. Numéro tunisien normalisé en `+216xxxxxxxx` (réutilise le
 * normaliseur existant du site) ; un numéro étranger au format E.164 ± est accepté tel quel.
 */
export function validatePhone(value: unknown): CrmValidationIssue | { phone: string; normalized: string } | null {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim().slice(0, CRM_LIMITS.PHONE_MAX);
  if (!raw) return null;
  const tunisian = raw.replace(/\D/g, '');
  if (tunisian.startsWith('216') && tunisian.length === 11) {
    return { phone: `+${tunisian}`, normalized: tunisian };
  }
  if (tunisian.startsWith('00216') && tunisian.length === 14) {
    return { phone: `+216${tunisian.slice(5)}`, normalized: tunisian.slice(5) };
  }
  if (/^\+216[24579]\d{7}$/.test(raw.replace(/\s/g, '')) || /^[24579]\d{7}$/.test(tunisian)) {
    const digits = tunisian.startsWith('216') ? tunisian.slice(3) : tunisian.length === 8 ? tunisian : tunisian.replace(/^00216/, '');
    return { phone: `+216${digits.slice(-8)}`, normalized: digits.slice(-8) };
  }
  // International/E.164 libre : on garde ce qui est lisible, on ne normalise pas.
  if (/^\+[0-9]{7,15}$/.test(raw.replace(/[\s-]/g, ''))) {
    const digits = raw.replace(/[\s-]/g, '');
    return { phone: digits, normalized: digits.replace(/^\+/, '') };
  }
  return fail('phone', 'Numéro de téléphone invalide.');
}

/** Liste de tags : tableau JSON sûr, borné, sans doublon. */
export function parseTags(value: unknown): CrmValidationIssue | { tags: string[] } {
  const raw = Array.isArray(value) ? value : [];
  if (raw.length > CRM_LIMITS.TAGS_MAX) return fail('tags', `Maximum ${CRM_LIMITS.TAGS_MAX} étiquettes.`);
  const tags: string[] = [];
  for (const tag of raw) {
    const cleaned = String(tag ?? '').trim().slice(0, 40).toLowerCase();
    if (cleaned && !tags.includes(cleaned)) tags.push(cleaned);
  }
  return { tags };
}

/** Gouverneurs : convertit une erreur métier en réponse HTTP contrôlée. */
export const CRM_STATUS_BY_CODE: Record<string, number> = {
  [CRM_ERRORS.NOT_FOUND]: 404,
  [CRM_ERRORS.PARTY_NOT_FOUND]: 404,
  [CRM_ERRORS.CONTACT_NOT_FOUND]: 404,
  [CRM_ERRORS.ACTIVITY_NOT_FOUND]: 404,
  [CRM_ERRORS.TASK_NOT_FOUND]: 404,
  [CRM_ERRORS.NOTE_NOT_FOUND]: 404,
  [CRM_ERRORS.ISSUE_NOT_FOUND]: 404,
  [CRM_ERRORS.COMMUNICATION_NOT_FOUND]: 404,
  [CRM_ERRORS.DUPLICATE_PARTY]: 409,
  [CRM_ERRORS.DUPLICATE_CONTACT]: 409,
  [CRM_ERRORS.ALREADY_LINKED]: 409,
  [CRM_ERRORS.BAD_TRANSITION]: 409,
  [CRM_ERRORS.IMMUTABLE]: 409,
  [CRM_ERRORS.PERMISSION_DENIED]: 403,
};

export function httpStatusFor(code: CrmErrorCode | string): number {
  return CRM_STATUS_BY_CODE[code] ?? 400;
}
