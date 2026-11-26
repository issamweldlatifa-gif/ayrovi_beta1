/**
 * S Base — البحث بالصورة. **من 1688 نفسها، بلا SerpApi.**
 *
 * قرار المالك (26/11/2026): «بحث بالصورة لا علاقة له بـ SerpApi». قبل، هذي
 * القناة كانت تمرّ من Google Lens عبر SerpApi: مفتاح ثانٍ، فاتورة ثانية،
 * quota ينفد، وأسواق أجنبية على نتيجة متجرين صينيين. توّا:
 *
 *   صورة المستعمل → خادمنا ينشرها في رابط عمومي مؤقّت → 1688 تجيب المتشابهات.
 *
 * علاش رابط عمومي: `/v1/api/1688/search/cross-border-by-image` ما تقبلش ملفاً،
 * تقبل `imgUrl` (صورة على الأنترنت). لهذا الصورة تتخزّن في الذاكرة عندنا
 * 10 دقائق، برمز عشوائي، وتتحوّل JPEG قبل ما تنشر — والـTTL يكفي لنداء 1688.
 *
 * الصدق: كل نتيجة تحمل 1688 وحدها، الثمن بالـCNY كما عطاه المصدر، وMOQ كما هو.
 * ما نضيفوش سعراً، ما نحوّلوش عملة، وما نخترعوش نتيجة إذا الردّ فارغ.
 */

export const SBASE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export class SbaseImageError extends Error {
  code: string;
  status: number;
  /** كود المزوّد (SANDBASE_… / APIFY_…) عندما يكون السبب من المزوّد — للتشخيص. */
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
 * خطأ المزوّد → خطأ S Base **بمعناه الحقيقي**.
 *
 * 26/11/2026: كل فشل كان يخرج `SBASE_IMAGE_INVALID` + 400، أي **يلوم صورة
 * المستخدم** على عطب خارجي. توّا كل سبب بكودو وحالتو، وكود المزوّد محفوظ.
 */
const PROVIDER_FAILURES: Array<{ match: RegExp; code: string; status: number; message: string }> = [
  {
    match: /NOT_CONFIGURED/,
    code: 'SBASE_IMAGE_NOT_CONFIGURED', status: 503,
    message: 'مفتاح SandBase موش مضبوط على الخادم: البحث بالصورة موقوف.',
  },
  {
    match: /TIMEOUT/,
    code: 'SBASE_IMAGE_TIMEOUT', status: 504,
    message: '1688 ما جاوبتش في الوقت المسموح. جرّب مرة أخرى.',
  },
  {
    match: /RATE_LIMIT/,
    code: 'SBASE_IMAGE_RATE_LIMITED', status: 429,
    message: 'SandBase طلبت تخفيف النداءات (429). استنّى دقيقة.',
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
    message: 'رصيد SandBase ما يكفيش لبحث بالصورة.',
  },
  {
    // SandBase رجّعت 4xx على `imgUrl`: ما نجحتش تجيب الصورة من رابطنا.
    match: /HTTP_4\d\d/,
    code: 'SBASE_IMAGE_URL_REJECTED', status: 502,
    message: '1688 ما نجحتش تقرا رابط الصورة اللي نشرناه. جرّب صورة أخرى.',
  },
];

export function sbaseImageFailureFrom(error: unknown): SbaseImageError {
  if (error instanceof SbaseImageError) return error;
  const candidate = (error ?? {}) as { code?: unknown; message?: unknown };
  const providerCode = String(candidate.code ?? '').trim() || null;
  const providerMessage = String(candidate.message ?? '').trim();
  /*
   * 26/11/2026 — « parameter validation failed: /page: expected integer, but got
   * string » : c'était NOTRE requête qui était mal formée (page envoyé en
   * texte), et l'écran l'affichait comme « 1688 n'a pas pu lire l'image ».
   * Une faute de notre côté doit se nommer comme telle, jamais comme un défaut
   * de la photo de l'utilisateur.
   */
  if (/parameter validation|expected integer|expected (string|number|boolean)|unexpected/i.test(providerMessage)) {
    return new SbaseImageError(
      'SBASE_IMAGE_REQUEST_INVALID',
      'الطلب اللي بعثناه لـ1688 غير صالح — خطأ من عندنا، ماشي في صورتك.',
      502,
      providerCode,
    );
  }
  // `SANDBASE_HTTP` perd le statut du fournisseur : il reste dans le message.
  if (providerCode === 'SANDBASE_HTTP' && /HTTP 4\d\d/.test(providerMessage)) {
    return new SbaseImageError(
      'SBASE_IMAGE_URL_REJECTED',
      '1688 ما نجحتش تقرا رابط الصورة اللي نشرناه. جرّب صورة أخرى.',
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

import { SBASE_IMAGE_SOURCE, findSbaseSource } from './descriptors';
import { runSandbaseCall, sandbaseConfigured } from './client';
import { extractProducts, type SbaseProduct } from './extract';

/** القناة جاهزة = مفتاح SandBase موجود (ما فماش مفتاح ثانٍ، ما فماش SerpApi). */
export function sbaseImageReady(): boolean {
  return sandbaseConfigured();
}

export interface SbaseImageResult {
  items: SbaseProduct[];
  durationMs: number;
  endpoint: string;
  costUsd: number;
}

/**
 * فحص قبل الدفع: الصورة اللي نشرناها **مقروءة فعلاً من الأنترنت**؟
 *
 * علاش (26/11/2026): في التجربة الحيّة رجّعت 1688 رفضاً للرابط، والتطبيق قال
 * «جرّب صورة أخرى» — أي لام المستعمل على عطب في نشرنا. هذا الفحص يسبق النداء
 * المدفوع: إذا رابطنا ما يتقراش، الخطب في **خادمنا**، والكلفة ما تتصرفش
 * (`$0.014286` كان يتخلّص حتى في النداء الفاشل من جهتنا).
 *
 * ما نصلّحوش الرابط: كان الخادم يخدم `SBASE_PUBLIC_URL` غالطة، الفحص يقولها
 * بالكود بدل ما نخمّنو من رسالة المزوّد.
 */
export async function assertSbasePhotoReachable(
  imageUrl: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 6_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(imageUrl, {
      method: 'GET',
      headers: { Accept: 'image/*', 'User-Agent': 'ZAYROVI-SBase/1.0' },
      signal: controller.signal,
    });
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok || !type.startsWith('image/')) {
      throw new SbaseImageError(
        'SBASE_PHOTO_UNREACHABLE',
        `رابط الصورة اللي نشرناه ما يتقراش (HTTP ${response.status}).`,
        503,
      );
    }
  } catch (error) {
    if (error instanceof SbaseImageError) throw error;
    const name = (error as { name?: string })?.name;
    throw new SbaseImageError(
      'SBASE_PHOTO_UNREACHABLE',
      name === 'AbortError' || name === 'TimeoutError'
        ? 'رابط الصورة اللي نشرناه ما جاوبش في الوقت المسموح.'
        : 'رابط الصورة اللي نشرناه ما يتوصلش من الأنترنت — اضبط SBASE_PUBLIC_URL.',
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * رابط صورة عمومي → منتجات 1688 متشابهة.
 *
 * `imageUrl` لازم يكون **متاح للأنترنت**: 1688 تجيبو بنفسها. الخادم ينشر
 * الصورة المؤقّتة (شوف `publishSbasePhoto` في routes.ts) ويعطينا الرابط.
 */
export async function searchSbaseByImage(imageUrl: string): Promise<SbaseImageResult> {
  if (!sbaseImageReady()) {
    throw new SbaseImageError(
      'SBASE_IMAGE_NOT_CONFIGURED',
      'مفتاح SandBase موش مضبوط على الخادم: البحث بالصورة موقوف.',
      503,
    );
  }
  const url = String(imageUrl ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    // ما نوعدوش بمستحيل: بلا رابط عمومي ما فماش بحث بالصورة.
    throw new SbaseImageError('SBASE_IMAGE_UNKNOWN', 'رابط الصورة موش صالح للبحث.', 502);
  }
  const source = findSbaseSource(SBASE_IMAGE_SOURCE.id);
  const descriptor = source?.image;
  if (!descriptor) {
    throw new SbaseImageError('SBASE_IMAGE_NOT_CONFIGURED', 'هذا المتجر ما عندوش بحث بالصورة.', 503);
  }
  const run = await runSandbaseCall(descriptor.endpoint, descriptor.buildBody(url), { asyncHint: false });
  const items = extractProducts(run.data, {
    arrays: [['items']],
    limit: 20,
    // كل نتيجة من هذا النداء = 1688، والنصّ يقولها بدل ما يخمّن متجراً.
    storeFallback: source.label,
    // Tous ces résultats viennent de 1688 : le vendeur reste dans `seller`.
  }).map((item) => ({ ...item, store: source.label }));
  // بلا نتائج = حالة عادية (`empty` في المسار)، موش خطأ.
  return { items, durationMs: run.durationMs, endpoint: descriptor.endpoint, costUsd: descriptor.costUsd };
}
