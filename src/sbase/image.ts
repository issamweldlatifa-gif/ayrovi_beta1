/**
 * S Base — قناة الصورة: **كل فشل بكوده وحالتو الحقيقية**.
 *
 * التاريخ (26/11/2026): القناة مرّت من SerpApi/Google Lens (رابط عمومي وسَبر
 * شبكي)، وتوّا من **Apify** (Server actor، base64 في POST واحد — بلا نشر ولا سَبر). الموحّد عبر كل العهود: خطأ المزوّد **ما يتفوترش**
 * «ما فماش نتائج» وما يتلبسش «صورة غالطة» — الكود يحمل السبب والحالة تختار
 * سلوك الشاشة، وكود المزوّد يُعاد للتشخيص من التطبيق بلا سجلّات خادم.
 *
 * الأكواد: SBASE_IMAGE_EMPTY 400 · SBASE_IMAGE_INVALID 400 (الصورة لا تُفكّ —
 * الغلطة العميلية الوحيدة) · SBASE_IMAGE_TOO_LARGE 413 (رفض محلي مجّاني تحت
 * حدّ الـ1MB الموثّق) · SBASE_IMAGE_TIMEOUT 504 · SBASE_IMAGE_RATE_LIMITED 429 ·
 * SBASE_IMAGE_PROVIDER_AUTH 503 · SBASE_IMAGE_BALANCE 402 ·
 * SBASE_IMAGE_PROVIDER_REFUSED 502 · SBASE_IMAGE_PROVIDER_DOWN 502 ·
 * SBASE_IMAGE_NOT_CONFIGURED 503 · SBASE_IMAGE_UNKNOWN 502.
 */

export class SbaseImageError extends Error {
  code: string;
  status: number;
  /** كود المزوّد (APIFY_…) عندما يكون السبب من المزوّد — للتشخيص. */
  providerCode: string | null;
  constructor(code: string, message: string, status = 502, providerCode: string | null = null) {
    super(message);
    this.name = 'SbaseImageError';
    this.code = code;
    this.status = status;
    this.providerCode = providerCode;
  }
}

/**
 * خطأ المزوّد → خطأ قناة الصورة **بمعناه الحقيقي**.
 *
 * 26/11/2026: كل فشل كان يخرج `SBASE_IMAGE_INVALID` + 400، أي يلوم صورة
 * المستخدم على عطب خارجي. توّا كل سبب بكودو وحالتو، وكود المزوّد محفوظ.
 */
const PROVIDER_FAILURES: Array<{ match: RegExp; code: string; status: number; message: string }> = [
  {
    match: /NOT_CONFIGURED/,
    code: 'SBASE_IMAGE_NOT_CONFIGURED', status: 503,
    message: 'مفتاح Apify موش مضبوط على الخادم: البحث بالصورة موقوف.',
  },
  {
    match: /TIMEOUT/,
    code: 'SBASE_IMAGE_TIMEOUT', status: 504,
    message: '1688 ما جاوبتش في الوقت المسموح. جرّب مرة أخرى.',
  },
  {
    match: /RATE_LIMIT/,
    code: 'SBASE_IMAGE_RATE_LIMITED', status: 429,
    message: 'المزوّد طلبت تخفيف النداءات (429). استنّى دقيقة.',
  },
  {
    match: /UNAUTHORIZED/,
    code: 'SBASE_IMAGE_PROVIDER_AUTH', status: 503,
    message: 'المزوّد رفض مفتاح الخادم (401/403).',
  },
  {
    // 26/11/2026 — مزوّد Apify: تنفيذ البحث فشل عنده (ok=false) — فشل معلن.
    match: /APIFY_FAILED/,
    code: 'SBASE_IMAGE_PROVIDER_REFUSED', status: 502,
    message: 'بحث الصورة ما كمّلش عند المزوّد. جرّب مرة أخرى.',
  },
  {
    match: /APIFY_HTTP|APIFY_NETWORK|APIFY_MALFORMED/,
    code: 'SBASE_IMAGE_PROVIDER_DOWN', status: 502,
    message: 'خدمة الصور موش متاحة توّا — جرّب بعد دقيقة.',
  },
  {
    match: /BALANCE/,
    code: 'SBASE_IMAGE_BALANCE', status: 402,
    message: 'رصيد المزوّد ما يكفيش لبحث بالصورة.',
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function sbaseImageFailureFrom(error: unknown): SbaseImageError {
  if (error instanceof SbaseImageError) return error;
  const candidate = (error ?? {}) as { code?: unknown; message?: unknown };
  const providerCode = String(candidate.code ?? '').trim() || null;
  const providerMessage = String(candidate.message ?? '').trim();
  /*
   * 26/11/2026 — « parameter validation failed… » : c'était NOTRE requête qui
   * était mal formée, et l'écran l'affichait comme « 1688 n'a pas pu lire
   * l'image ». Une faute de notre côté doit se nommer comme telle, jamais
   * comme un défaut de la photo de l'utilisateur.
   */
  if (/parameter validation|expected integer|expected (string|number|boolean)|unexpected/i.test(providerMessage)) {
    return new SbaseImageError(
      'SBASE_IMAGE_REQUEST_INVALID',
      'الطلب اللي بعثناه لـ1688 غير صالح — خطأ من عندنا، ماشي في صورتك.',
      502,
      providerCode,
    );
  }
  // صورة ما تتقراش = غلطة العميل الحقيقية (الوحيدة اللي تستحق 400).
  if (providerCode === 'INVALID_IMAGE') {
    return new SbaseImageError(
      'SBASE_IMAGE_INVALID',
      providerMessage || 'الصورة ما تتقراش. جرّب صورة JPEG أو PNG أخرى.',
      400,
      providerCode,
    );
  }
  /*
   * 26/11/2026 — مزوّد Apify: أكواد قناة الصورة المصوّرة مسبقاً (SBASE_IMAGE_*،
   * مثال الرفض المحلي المجّاني SBASE_IMAGE_TOO_LARGE/413) تمرّ **كما هي** —
   * حالتها الصحيحة وصلت من عندنا، وما يتعادش تفسيرها «صورة غالطة» ولا «مزوّد نازل».
   */
  const candidateStatus = (candidate as { status?: unknown }).status;
  if (providerCode && providerCode.startsWith('SBASE_IMAGE_') && typeof candidateStatus === 'number') {
    return new SbaseImageError(providerCode, providerMessage, candidateStatus, null);
  }
  for (const failure of PROVIDER_FAILURES) {
    if (providerCode && failure.match.test(providerCode)) {
      return new SbaseImageError(failure.code, failure.message, failure.status, providerCode);
    }
  }
  if (/image|format|pixel|unsupported|corrupt/i.test(providerMessage)) {
    return new SbaseImageError('SBASE_IMAGE_INVALID', 'الصورة ما تتقراش. جرّب صورة JPEG أو PNG أخرى.', 400, providerCode);
  }
  return new SbaseImageError(
    'SBASE_IMAGE_UNKNOWN',
    'تعذّر البحث بالصورة لسبب غير معروف. البحث بالكلمة يخدم عادي.',
    502,
    providerCode,
  );
}
