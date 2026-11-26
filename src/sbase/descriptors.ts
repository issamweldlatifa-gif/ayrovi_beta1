/**
 * S Base — كتالوغ المصادر. **مصدر واحد = endpoint واحد.**
 *
 * قرار المالك (26/11/2026): S Base = **1688 وحدها**. البحث بالصورة يمرّ من
 * شاشة 1688 نفسها (`/v1/api/1688/search/cross-border-by-image`)، وZ Lens يتفضّل
 * على حالو — ما فماش SerpApi هنا.
 *
 * وAlibaba.com تنحّت في نفس اليوم: عندها بحث بالكلمة بركة — لا صورة، لا تفاصيل،
 * لا مقاسات، لا توفّر. بطاقة المنتج اللي نوعدو بيها ما تنجّمش تتكمّل بها، فما
 * نبيعوهاش. ترجيعها = سطر واحد هنا إذا تبدّل رأي المالك.
 *
 * الحقائق مأخوذة من صفحات SandBase (قُرأت في 2026‑11‑26):
 *   • 1688: بحث بالكلمة (cross-border, `language`) · بحث بالصورة (`imgUrl`) ·
 *     تفاصيل بالمعرّف أو بالرابط (`item/detail`, `item/detail-by-url`) ·
 *     مراجعات · شحن · متجر.  ← كل هذا موثّق.
 *   • Alibaba.com: **بحث بالكلمة فقط** (`/v1/api/alibaba/search`, حتى 25 نتيجة).
 *     ما فماش صورة، ما فماش تفاصيل، ما فماش رابط منتج. نعلنوها كما هي.
 */

export interface SbaseSupports {
  keyword: boolean;
  url: boolean;
  image: boolean;
  details: boolean;
  price: boolean;
  variants: boolean;
  barcode: boolean;
}

export interface SbaseMarket {
  code: string;
  label: string;
}

/**
 * بنية نداء التفاصيل: **كل متجر بوحدو**، والـbody يتبنى من نتيجة البحث.
 * إذا المتجر ما عندوش endpoint تفاصيل موثّق، `detail` يبقى غايب
 * و`supports.details=false` — ما نخترعوش واحداً.
 */
export interface SbaseDetailInput {
  id: string | null;
  title: string;
  url: string | null;
  market: string | null;
}

export interface SbaseDetailDescriptor {
  endpoint: string;
  costUsd: number;
  async: boolean;
  /** يشترط معرّف منتج قبل النداء. */
  requiresId: boolean;
  buildBody: (input: SbaseDetailInput) => Record<string, unknown>;
  /** بدنيل موثّق عندما نعرف الرابط فقط (1688: detail-by-url). */
  byUrl?: {
    endpoint: string;
    costUsd: number;
    buildBody: (input: SbaseDetailInput) => Record<string, unknown>;
  };
}

/** بحث بالصورة: endpoint منفصل عند المصدر نفسه (1688). */
export interface SbaseImageDescriptor {
  endpoint: string;
  costUsd: number;
  /** الـbody يتبنى من رابط صورة **عمومي** (SandBase تجيب الصورة بنفسها). */
  buildBody: (imageUrl: string) => Record<string, unknown>;
}

export interface SbaseSourceDescriptor {
  id: string;
  label: string;
  /** المتجر/الواجهة اللي يشوفها المستعمل. */
  vendor: string;
  /** المسار الحقيقي على api.sandbase.ai. */
  endpoint: string;
  /** سعر النداء المعلن (USD) — null إذا الصفحة ما نشرتش سعراً. */
  costUsd: number | null;
  /**
   * بعض المصادر (Alibaba سابقاً) تحاسب بكل نتيجة بدل سعر ثابت للنداء.
   * الخانة تبقى موجودة باش الشاشة ما تكذبش إذا رجّعنا مصدراً من هذا النوع.
   */
  billedPerResult: boolean;
  /** الـendpoint يشتغل بـrun + polling حسب التوثيق. */
  async: boolean;
  /** مقترح من البداية في شريط البحث. */
  defaultEnabled: boolean;
  supports: SbaseSupports;
  /** الحقول اللي الردّ يوصلها فعلاً (للشفافية في الشاشة). */
  fields: string[];
  markets: SbaseMarket[];
  defaultMarket: string | null;
  /** مسارات المصفوفة المعروفة داخل `outputs[0].data`. */
  arrays: string[][];
  buildBody: (query: string, market: string | null) => Record<string, unknown>;
  /** نداء التفاصيل + الخيارات. غايب ⇒ `supports.details=false`. */
  detail?: SbaseDetailDescriptor;
  /** بحث بالصورة عند المصدر. غايب ⇒ `supports.image=false`. */
  image?: SbaseImageDescriptor;
}

/** 1688 cross-border: `language` ما تقبلش `fr` (10 لغات بلا الفرنسية) ⇒ `en`. */
export const SBASE_1688_LANGUAGE = 'en';

export const SBASE_SOURCES: SbaseSourceDescriptor[] = [
  {
    id: '1688',
    label: '1688',
    vendor: '1688.com',
    endpoint: '/v1/api/1688/search/cross-border',
    costUsd: 0.014286,
    billedPerResult: false,
    async: false,
    defaultEnabled: true,
    supports: { keyword: true, url: true, image: true, details: true, price: true, variants: true, barcode: false },
    fields: ['title', 'price', 'currency', 'image', 'link', 'moq', 'store'],
    markets: [],
    defaultMarket: null,
    arrays: [['items']],
    buildBody: (query) => ({
      keyword: query, language: SBASE_1688_LANGUAGE, page: '1', pageSize: 20, sort: 'default',
    }),
    image: {
      endpoint: '/v1/api/1688/search/cross-border-by-image',
      costUsd: 0.014286,
      buildBody: (imageUrl) => ({
        imgUrl: imageUrl, language: SBASE_1688_LANGUAGE, page: '1', pageSize: 20, sort: 'default',
      }),
    },
    detail: {
      endpoint: '/v1/api/1688/item/detail',
      costUsd: 0.014286,
      async: false,
      requiresId: true,
      buildBody: (input) => ({ itemId: input.id }),
      byUrl: {
        endpoint: '/v1/api/1688/item/detail-by-url',
        costUsd: 0.014286,
        buildBody: (input) => ({ url: input.url, language: SBASE_1688_LANGUAGE }),
      },
    },
  },
];

/**
 * قناة الصورة = **1688**، موش خدمة خارجية.
 *
 * علاش هذا التغيير (26/11/2026): كانت القناة تمرّ من SerpApi (Google Lens) —
 * مزوّد ثاني، مفتاح ثاني، فاتورة ثانية، وأسواق لا علاقة لها بالمصدرين
 * الباقيين. توّا الصورة تروح لنفس شاشة 1688 اللي تجيب النتائج: صورة → 1688،
 * كلمة → 1688 + Alibaba.com.
 */
export const SBASE_IMAGE_SOURCE = {
  id: '1688',
  label: '1688 · photo',
  vendor: '1688.com',
  endpoint: '/v1/api/1688/search/cross-border-by-image',
  costUsd: 0.014286,
  store: '1688' as const,
  supports: { keyword: false, url: false, image: true, details: false, price: true, variants: false, barcode: false },
  storeFromResults: false,
} as const;

export function findSbaseSource(id: string): SbaseSourceDescriptor | null {
  return SBASE_SOURCES.find((source) => source.id === id) ?? null;
}

/** ما تعرضه الشاشة للعميل: القدرات الحقيقية + الكلفة + الأسواق. */
export function describeSbaseSources(options: { configured: boolean } = { configured: false }) {
  return SBASE_SOURCES.map((source) => ({
    id: source.id,
    label: source.label,
    vendor: source.vendor,
    supports: source.supports,
    fields: source.fields,
    markets: source.markets,
    defaultMarket: source.defaultMarket,
    costUsd: source.costUsd,
    billedPerResult: source.billedPerResult,
    async: source.async,
    defaultEnabled: source.defaultEnabled,
    /** «مضبوط» يعني مفتاح السيرفر موجود — موش نتيجة اختبار حيّة. */
    configured: options.configured,
  }));
}

/** تحقّق مدخلات البحث قبل ما نخلّصو فلوس في نداء خاطئ. */
export function validateSbaseQuery(value: unknown): { query: string } | { error: string } {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (text.length < 2) return { error: 'اكتب كلمتين على الأقل للبحث (2 أحرف).' };
  if (text.length > 90) return { error: 'الكلمة طويلة برشة (90 حرفاً كحد أقصى).' };
  return { query: text };
}
