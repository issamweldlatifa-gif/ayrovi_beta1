/**
 * AYROVI — primitives de requête et de validation partagées (P2.3).
 *
 * Le contexte : le module Stock (P2.2) avait ses propres `paginationOf`, `sortOf`,
 * `isIdentifier`, `textField`. Le module Achats (P2.3) allait les recopier — trois
 * implémentations de « lire une page, borner un texte, valider un tri » dans le même dépôt,
 * c'est exactement la dette que P2.x ferme. Ces quatre helpers descendent donc ici, SANS
 * changer de comportement : `src/inventory/validation.ts` les ré-exporte et ses appelants
 * n'ont pas bougé.
 *
 * Forme plate `Check<T>` (et non une union discriminée) : avec `strict: false` dans ce
 * dépôt, une union ne se réduit pas et chaque appelant finirait par un `!`.
 */

export interface FieldIssue { field: string; reason: string }

export interface Check<T> {
  ok: boolean;
  value?: T;
  code?: string;
  message?: string;
  details?: FieldIssue[];
}

export function fail(defaultCode: string, message: string, details?: FieldIssue[]): Check<never> {
  return { ok: false, code: defaultCode, message, ...(details && details.length ? { details } : {}) };
}

export function pass<T>(value: T): Check<T> {
  return { ok: true, value };
}

/** Une `Check` ne se déduit pas d'une autre : on propage le refus avec son propre code. */
export function propagate<T>(check: Check<any>, defaultCode: string): Check<T> {
  return { ok: false, code: check.code ?? defaultCode, message: check.message ?? 'Payload invalide.', details: check.details };
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** Un identifiant est un identifiant : ni SQL, ni chemin, ni texte libre. */
export function isIdentifier(value: unknown): boolean {
  return typeof value === 'string' && ID_RE.test(value.trim());
}

/** Texte borné, jamais coupé silencieusement. */
export function textField(value: unknown, field: string, max = 500, defaultCode = 'VALIDATION'): Check<string> {
  const text = String(value ?? '').trim();
  if (text.length > max) return fail(defaultCode, `« ${field} » dépasse ${max} caractères.`, [{ field, reason: 'LENGTH' }]);
  return pass(text);
}

/** Entier borné (les deux bornes sont incluses) — une faute de frappe n'est pas une donnée métier. */
export function integerField(
  value: unknown, field: string, min: number, max: number, defaultCode = 'VALIDATION',
): Check<number> {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    return fail(defaultCode, `« ${field} » doit être un nombre entier.`, [{ field, reason: 'INTEGER' }]);
  }
  if (number < min || number > max) {
    return fail(defaultCode, `« ${field} » doit être compris entre ${min.toLocaleString('fr-FR')} et ${max.toLocaleString('fr-FR')}.`, [{ field, reason: 'RANGE' }]);
  }
  return pass(number);
}

/** Un nombre positif à deux décimales (les montants sont lus tels quels, pas arrondis ici). */
export function decimalField(
  value: unknown, field: string, min: number, max: number, defaultCode = 'VALIDATION',
): Check<number> {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    return fail(defaultCode, `« ${field} » doit être un nombre entre ${min} et ${max.toLocaleString('fr-FR')}.`, [{ field, reason: 'RANGE' }]);
  }
  return pass(Math.round(number * 100) / 100);
}

/** Une valeurclose dans un enum connu : le serveur ne devine jamais. */
export function enumField<T extends string>(
  value: unknown, field: string, allowed: readonly T[], fallback: T | null = null, defaultCode = 'VALIDATION',
): Check<T | null> {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return pass(fallback);
  if (!(allowed as readonly string[]).includes(raw)) {
    return fail(defaultCode, `« ${field} » doit valoir ${allowed.join(', ')}.`, [{ field, reason: 'ENUM' }]);
  }
  return pass(raw as T);
}

/* ------------------------------------------------------------------ *
 * Emplacement de stock : grammaire unique, deux vocabulaires d'erreur.
 * ------------------------------------------------------------------ */

const LOCATION_RE = /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * Un emplacement est une étiquette courte (« MAIN », « TUNIS-1 »), pas du texte libre. La
 * règle vit ici parce que deux modules la partagent (Stock P2.2, Achats P2.3) ; chaque module
 * garde son propre code d'erreur, que le client connaît déjà.
 */
export function locationLabelField(value: unknown, field: string, defaultCode: string, fallback = 'MAIN'): Check<string> {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return pass(fallback);
  if (!LOCATION_RE.test(raw)) {
    return fail(defaultCode, `« ${field} » doit être une étiquette courte (lettres, chiffres, - et _).`, [{ field, reason: 'FORMAT' }]);
  }
  return pass(raw);
}

/** Une page d'API ne dépasse jamais 100 lignes, quel que soit ce que le client envoie. */
export function paginationOf(query: { page?: unknown; pageSize?: unknown; page_size?: unknown }) {
  const page = Math.max(1, Number(query.page) || 1);
  const requested = Number(query.pageSize ?? query.page_size ?? 20);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(requested) ? requested : 20));
  return { page, pageSize };
}

/**
 * Tri : seule une colonne de l'allowlist est adressable. Un nom inconnu retombe sur
 * l'ordre par défaut au lieu de produire une erreur — et surtout aucun nom arbitraire
 * n'atteint le SQL.
 */
export function sortOf(query: { sort?: unknown; direction?: unknown }, allowed: readonly string[], fallback: string) {
  const key = String(query.sort ?? '').trim();
  const direction = String(query.direction ?? 'asc').trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return { key: allowed.includes(key) ? key : '', direction, fallback };
}

/** Résultat plat commun aux services (mêmes champs que `Check`, nommé pour le service). */
export interface ServiceResult<T> { ok: boolean; value?: T; code?: string; message?: string }

export function serviceFail(code: string, message: string): ServiceResult<never> {
  return { ok: false, code, message };
}

export function serviceOk<T>(value: T): ServiceResult<T> {
  return { ok: true, value };
}
