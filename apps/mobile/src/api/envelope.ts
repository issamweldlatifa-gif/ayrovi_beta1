/**
 * فكّ غلاف الـ API — منطق نقي، بلا شبكة، قابل للاختبار مباشرة.
 *
 * الخادم يلفّ كل ردّ في `{ success, data }` أو `{ success, code, error }`.
 * هنا بالضبط نرفض ما هو خارج العقد: ردّ 200 بمحتوى موش غلاف يبقى خطأ
 * (`malformed`) — «نجح» موش معناها «فهمت»ّ.
 */
import { ApiError } from './errors';

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  code?: string;
  error?: string;
  serverTime?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** يستخرج `data` من غلاف ناجح، ويرمي `ApiError` على كل ما سواه. */
export function unwrap<T>(payload: unknown, options: { status?: number; source?: string } = {}): T {
  const { status = 200, source = '' } = options;
  const where = source ? ` (${source})` : '';

  if (!isRecord(payload)) {
    throw new ApiError('malformed', `Réponse non-objet${where}`, { status });
  }

  // Refus explicite du serveur : on garde son code et son message.
  if (payload.success === false) {
    const code = typeof payload.code === 'string' ? payload.code : '';
    const message = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : `Réponse refusée${where}`;
    throw new ApiError('http', message, { status, code });
  }

  // Objet sans `success` : ce n'est pas l'enveloppe du contrat. Un 200 ne rend
  // pas un corps arbitraire valide (page d'un proxy, JSON d'un autre service).
  if (payload.success !== true) {
    throw new ApiError('malformed', `Enveloppe absente${where}`, { status });
  }

  // `data` absent est légitime quand le contrat dit « rien à servir » (null) :
  // on renvoie undefined et l'appelant décide. Un `data` PRÉSENT mais illisible
  // n'est pas distingué ici — les fonctions d'API valident leur propre forme.
  return payload.data as T;
}

/** `Retry-After` : secondes (norme) ou date HTTP. Retourne des millisecondes. */
export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

/** يقرأ غلافاً فاشلاً من جسم غير معروف (يُستعمل عند ردود غير 2xx). */
export function failureFrom(status: number, payload: unknown, retryAfterMs = 0): ApiError {
  const code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : '';
  const text = isRecord(payload) && typeof payload.error === 'string' ? payload.error.trim() : '';
  // Le CODE est conservé même quand le serveur n'a pas joint de texte : c'est
  // lui qui permet à l'écran de dire la vérité (503 RESET_UNAVAILABLE n'est pas
  // « erreur serveur », c'est « l'envoi d'e-mails n'est pas configuré »).
  if (text) return new ApiError('http', text, { status, code, retryAfterMs });
  return new ApiError('http', `HTTP ${status}`, { status, code, retryAfterMs });
}
