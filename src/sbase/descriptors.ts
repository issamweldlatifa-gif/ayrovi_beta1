/**
 * S Base — كتالوغ المصادر. **مزوّد واحد = Apify.**
 *
 * تاريخ القرار (المالك، نهائي):
 *   • 26/11/2026 — S Base = **1688 وحدها** (Alibaba.com أُزيلت: بحث كلمة بركة،
 *     بلا صورة ولا تفاصيل ولا مقاسات — بطاقة المنتج ما تنكمّلش بها).
 *   • 26/11/2026 — قرار المالك النهائي: المزوّد القديم يُحذف كلياً والتعويض
 *     بـApify. المزوّد الجديد بُني جانب القديم، فُعّل بمتغيّر البيئة، وبعد
 *     الحذف النهائي **Apify هو المزوّد الوحيد** — لا Alibaba، لا SerpApi/Lens.
 *
 * الحقائق مأخوذة من صفحات Apify (قُرأت في 2026‑11‑26):
 *   • `sourabhbgp/1688-scraper` — بحث (`mode:search`, keywords EN/中文,
 *     sortType `normal`, maxItems) وتفاصيل (`mode:product_detail`, offerIds
 *     تقبل المعرّف **ولا الرابط**) — **3.99$/1000 صفّ + 0.005$/run**.
 *   • `topapi/image-search-1688-api` — بحث بالصورة في POST واحد (Server actor)
 *     بـbase64 — **0.20$/1000 نتيجة، مجّاناً إذا 0 نتيجة**.
 *
 * الأثمنة كلها **منشورة** على صفحات Apify وتظهر في الشاشة كما هي — ما نلمّسهاش.
 */
import {
  APIFY_DETAIL_COST_USD,
  APIFY_IMAGE_COST_USD,
  APIFY_SEARCH_COST_USD,
} from './apify';

/** المزوّد — واحد منذ 26/11/2026. */
export type SbaseProviderId = 'apify';

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

export interface SbaseSourceDescriptor {
  id: string;
  label: string;
  /** المتجر/الواجهة اللي يشوفها المستعمل. */
  vendor: string;
  /** actor Apify اللي ينفّذ البحث والتفاصيل (يوثّق في /sources). */
  actor: string;
  /** ثمن البحث المنشور (USD): 0.005$/run + 20 صفّ × 3.99/1000. */
  costUsd: number;
  /** 1688 عبر Apify تُحاسب بالصفّ ضمن السقف — الكلفة المعروضة تُغطّي البحث كاملاً. */
  billedPerResult: boolean;
  /** run-based (POST runs → poll → dataset) — الشاشة تعرضه كما هو. */
  async: boolean;
  /** مقترح من البداية في شريط البحث. */
  defaultEnabled: boolean;
  supports: SbaseSupports;
  /** الحقول اللي الردّ يوصلها فعلاً (للشفافية في الشاشة). */
  fields: string[];
  markets: SbaseMarket[];
  defaultMarket: string | null;
  /** مسارات المصفوفة المعروفة داخل الردّ المُوحَّد. */
  arrays: string[][];
  /** نداء التفاصيل: `offerIds` يقبل المعرّف ولا الرابط — بلا بدنيل منفصل. */
  detail: {
    costUsd: number;
    requiresId: false;
  };
}

export const SBASE_1688_ACTOR = 'sourabhbgp~1688-scraper';

export const SBASE_SOURCES: SbaseSourceDescriptor[] = [
  {
    id: '1688',
    label: '1688',
    vendor: '1688.com',
    actor: SBASE_1688_ACTOR,
    costUsd: APIFY_SEARCH_COST_USD,
    billedPerResult: false,
    async: true,
    defaultEnabled: true,
    supports: { keyword: true, url: true, image: true, details: true, price: true, variants: true, barcode: false },
    fields: ['title', 'price', 'currency', 'image', 'link', 'moq', 'store'],
    markets: [],
    defaultMarket: null,
    arrays: [['items']],
    detail: {
      costUsd: APIFY_DETAIL_COST_USD,
      requiresId: false,
    },
  },
];

/**
 * قناة الصورة = **عدة متاجر، كل واحد بactor موثّق** — النتائج تُجمَّع بلا دمج:
 * كل متجر بمجموعته (زمنو/خطئو/كلفته) ونتائجه موسومة باسمه.
 *
 *   • `1688` — Server actor بPOST واحد بbase64، ما فماش run ولا dataset؛
 *     الردّ في نفس الطلب ({ok, count, items[], meta})، مجّاني إذا 0 نتيجة.
 *
 * أسماء الـactors القابلة للتجاوز بمتغيّرات البيئة تُقرأ في `apify.ts` وقت النداء.
 */
export const SBASE_IMAGE_SOURCES = [
  {
    id: '1688',
    label: '1688 · photo',
    vendor: '1688.com',
    actor: 'topapi~image-search-1688-api',
    /** Server actor: POST واحد للنقطة `.apify.actor` — بلا run ولا polling. */
    kind: 'server-actor' as const,
    costUsd: APIFY_IMAGE_COST_USD,
    store: '1688' as const,
    supports: { keyword: false, url: false, image: true, details: false, price: true, variants: false, barcode: false },
    storeFromResults: false,
  },
  /* AliExpress خرج من مصادر S BASE (قرار المالك 27/11 — هوية المصادر:
     AYWEBS = Global Retail Shopping، S BASE = China Wholesale & Sourcing).
     Ali في ZAYROVI تُدار من AYWEBS (محوّل كامل + متصفّح داخلي) — هنا تكرار.
     العودة إن احتاجت: سطر واحد وسيط — الدوال في apify.ts بقيت. */
];

/** القناة الأولى (1688) تبقى معروضة كما هي للتوافق — المصدر الكامل في `SBASE_IMAGE_SOURCES`. */
export const SBASE_IMAGE_SOURCE = SBASE_IMAGE_SOURCES[0];

export function findSbaseSource(id: string): SbaseSourceDescriptor | null {
  return SBASE_SOURCES.find((source) => source.id === id) ?? null;
}

/** ما تعرضه الشاشة للعميل: القدرات الحقيقية + الكلفة المنشورة. */
export function describeSbaseSources(options: { configured: boolean } = { configured: false }) {
  return SBASE_SOURCES.map((source) => ({
    id: source.id,
    label: source.label,
    vendor: source.vendor,
    actor: source.actor,
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
