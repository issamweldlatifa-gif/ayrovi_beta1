/**
 * أخطاء الـ API — نوع واحد لكل ما قد يفشل، باش الواجهة تعرض رسالة صادقة
 * بدل ما تخمّن.
 *
 * عقد الخادم (مقروء من الكود، `src/server.ts`):
 *   نجاح : { success: true,  data: … }                       (+ serverTime أحياناً)
 *   فشل  : { success: false, code: 'RATE_LIMITED' | 'API_NOT_FOUND' | 'INTERNAL_ERROR' | …, error: '…' }
 *
 * `400/413` → `INVALID_JSON`/`PAYLOAD_TOO_LARGE`، `429` يجي معه `Retry-After` بالثواني.
 */

export type ApiErrorKind =
  /** ما وصلناش للخادم أصلاً: شبكة مقطوعة، DNS، TLS… */
  | 'network'
  /** الخادم ما جاوبش في الوقت المحدّد. */
  | 'timeout'
  /** ردّ الخادم بخطأ HTTP. `status` و`code` يوصفوه. */
  | 'http'
  /** ردّ 200 لكن المحتوى موش الصيغة المتفق عليها. */
  | 'malformed'
  /** الطلب أُلغي من الطرف اللي طلبو (مثلاً خروج من الشاشة). */
  | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  /** المدة قبل ما ينجم يُعاد المحاولة، من `Retry-After` (بالمللي ثانية). */
  readonly retryAfterMs: number;

  constructor(kind: ApiErrorKind, message: string, options: {
    status?: number; code?: string; retryAfterMs?: number; cause?: unknown;
  } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? 0;
    this.code = options.code ?? '';
    this.retryAfterMs = options.retryAfterMs ?? 0;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /** لا فماش شبكة: الواجهة تعرض «بلا إنترنت» موش «خطأ في الخادم». */
  get isOffline(): boolean {
    return this.kind === 'network';
  }

  /** الطلب أُلغي لأن الشاشة تسكّرت — ما يستحقّش أي رسالة للمستعمل. */
  get isAborted(): boolean {
    return this.kind === 'aborted';
  }
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;

/**
 * رسالة موجّهة للمستعمل، بالعربية والفرنسية، مشتقّة من نوع الخطأ —
 * موش من نص الخادم: نص الخادم فرنسي دائماً، والمستعمل العربي يستحقّ رسالة بلغته.
 */
export interface LocalizedMessage { fr: string; ar: string }

export function userMessage(error: unknown): LocalizedMessage {
  if (!isApiError(error)) {
    return { fr: 'Une erreur inattendue est survenue.', ar: 'صار خطأ غير متوقّع.' };
  }
  switch (error.kind) {
    case 'network':
      return { fr: 'Pas de connexion. Vérifiez votre réseau.', ar: 'ما فماش اتصال. تحقّق من الشبكة.' };
    case 'timeout':
      return { fr: 'Le serveur met trop de temps à répondre.', ar: 'الخادم ياخذ وقت برشة باش يجاوب.' };
    case 'aborted':
      return { fr: 'Requête interrompue.', ar: 'الطلب تقطع.' };
    case 'malformed':
      return { fr: 'Réponse illisible du serveur.', ar: 'ردّ غير مفهوم من الخادم.' };
    default:
      break;
  }
  if (error.status === 429) {
    return { fr: 'Trop de requêtes — patientez un instant.', ar: 'طلبات برشة — استنّى شوية.' };
  }
  if (error.status === 404) {
    return { fr: 'Contenu introuvable.', ar: 'المحتوى ما موجودش.' };
  }
  if (error.status >= 500) {
    return { fr: 'Le service est momentanément indisponible.', ar: 'الخدمة ما متوفّرةش توّا.' };
  }
  return { fr: 'La demande n’a pas abouti.', ar: 'الطلب ما نجحش.' };
}
