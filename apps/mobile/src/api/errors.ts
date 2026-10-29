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
  /** الكاميرا أو الملف المحلي تعذّر استعماله قبل وصول الطلب للخادم. */
  | 'device'
  /** الطلب أُلغي من الطرف اللي طلبو (مثلاً خروج من الشاشة). */
  | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  /** المدة قبل ما ينجم يُعاد المحاولة، من `Retry-After` (بالمللي ثانية). */
  readonly retryAfterMs: number;
  /** Champs non lus renvoyés par le serveur (ex. `price`, `currency`), pour dire lequel manque. */
  readonly missingFields: string[];

  constructor(kind: ApiErrorKind, message: string, options: {
    status?: number; code?: string; retryAfterMs?: number; cause?: unknown; missingFields?: string[];
  } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? 0;
    this.code = options.code ?? '';
    this.retryAfterMs = options.retryAfterMs ?? 0;
    this.missingFields = options.missingFields ?? [];
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

/** Nom lisible du champ manquant (FR / AR), pour dire au client lequel manque. */
const MISSING_FIELD_LABELS: Record<string, { fr: string; ar: string }> = {
  title: { fr: 'le titre', ar: 'عنوان المنتج' },
  price: { fr: 'le prix', ar: 'السعر' },
  verified_price: { fr: 'un prix confirmé', ar: 'سعراً مؤكّداً' },
  currency: { fr: 'la devise', ar: 'العملة' },
  verified_currency: { fr: 'une devise confirmée', ar: 'عملة مؤكّدة' },
};

function missingFieldLabels(fields: readonly string[]): { fr: string; ar: string } | null {
  const known = fields.filter((field) => MISSING_FIELD_LABELS[field]);
  if (!known.length) return null;
  const frLabels = known.map((field) => MISSING_FIELD_LABELS[field]!.fr);
  const fr = frLabels.length > 1
    ? `${frLabels.slice(0, -1).join(', ')} et ${frLabels[frLabels.length - 1]}`
    : frLabels[0]!;
  const ar = known.map((field) => MISSING_FIELD_LABELS[field]!.ar).join(' و');
  return {
    fr: `Nous n’avons pas pu lire ${fr} de ce produit. Réessayez, ou ouvrez la fiche depuis la boutique.`,
    ar: `تعذّرت قراءة ${ar} لهذا المنتج. يرجى إعادة المحاولة أو فتح صفحة المنتج من المتجر.`,
  };
}

export function userMessage(error: unknown): LocalizedMessage {
  if (!isApiError(error)) {
    return { fr: 'Une erreur inattendue est survenue.', ar: 'حدث خطأ غير متوقّع.' };
  }
  // Format de réponse non conforme : ce n'est PAS une lecture incomplète, on le dit.
  if (error.code === 'CONTRACT_MISMATCH') {
    const fields = error.missingFields.length ? ` (${error.missingFields.join(', ')})` : '';
    return {
      fr: `Le serveur a répondu dans un format inattendu${fields}. Réessayez ; si cela persiste, signalez-le au support.`,
      ar: `استلمنا استجابة بتنسيق غير متوقّع${fields}. يرجى إعادة المحاولة، وإذا استمرّت المشكلة تواصل مع الدعم.`,
    };
  }
  // Lecture AYWEBs incomplète : le serveur a répondu, mais le titre ou le prix manque.
  if (error.code === 'CAPTURE_INCOMPLETE') {
    const missing = missingFieldLabels(error.missingFields);
    if (missing) return missing;
    return {
      fr: 'Nous n’avons pas pu lire le titre ou le prix de ce produit. Réessayez, ou ouvrez la fiche depuis la boutique.',
      ar: 'تعذّرت قراءة اسم المنتج أو سعره. يرجى إعادة المحاولة أو فتح صفحة المنتج مباشرة من المتجر.',
    };
  }
  switch (error.kind) {
    case 'network':
      return { fr: 'Pas de connexion. Vérifiez votre réseau.', ar: 'لا يوجد اتصال بالإنترنت. يرجى التحقّق من الشبكة.' };
    case 'timeout':
      return { fr: 'Le serveur met trop de temps à répondre.', ar: 'استغرقت الاستجابة وقتاً أطول من المعتاد. يرجى إعادة المحاولة.' };
    case 'aborted':
      return { fr: 'Requête interrompue.', ar: 'تم إيقاف الطلب.' };
    case 'malformed':
      return { fr: 'Réponse illisible du serveur.', ar: 'تعذّرت قراءة البيانات المستلمة. يرجى إعادة المحاولة.' };
    case 'device':
      return {
        fr: "La photo n'a pas pu être lue sur le téléphone. Rouvrez la caméra ou choisissez-la dans la galerie.",
        ar: 'تعذّرت قراءة الصورة من الهاتف. أعد فتح الكاميرا أو اخترها من المعرض.',
      };
    default:
      break;
  }
  if (error.status === 429) {
    return { fr: 'Trop de requêtes — patientez un instant.', ar: 'طلبات كثيرة جداً — يرجى الانتظار لحظة.' };
  }
  if (error.status === 404) {
    return { fr: 'Contenu introuvable.', ar: 'المحتوى المطلوب غير متوفّر.' };
  }
  if (error.status >= 500) {
    return { fr: 'Le service est momentanément indisponible.', ar: 'الخدمة غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.' };
  }
  return { fr: 'La demande n’a pas abouti.', ar: 'تعذّر إتمام الطلب. يرجى إعادة المحاولة.' };
}
