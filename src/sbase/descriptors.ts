/**
 * S Base — كتالوغ المصادر. **مصدر واحد = endpoint واحد.**
 *
 * كل سطر هنا مبني على صفحة توثيق حقيقية في SandBase (نُسخت في 2026‑11‑19)؛
 * ما فماش لا تجميع، لا محرّك موحّد، ولا صلة بـAYWEBs. تزيد منصّة جديدة =
 * سطر واحد هنا (+ محوّل حقول إذا كان الردّ غريباً).
 *
 * `supports` تقول الحقيقة فقط: كل هذه الـendpoints **بحث بالكلمات**. ما فيهم
 * بحث بالصورة (SandBase ما عندها Lens)، ولا بحث بـURL، ولا باركود، ولا
 * مقاسات/ألوان (تلك تحتاج endpoint ثانٍ للتفاصيل، وهو خارج v1).
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

export interface SbaseSourceDescriptor {
  id: string;
  label: string;
  /** المتجر/الواجهة اللي يشوفها المستعمل. */
  vendor: string;
  /** المسار الحقيقي على api.sandbase.ai. */
  endpoint: string;
  /** سعر النداء المعلن (USD) — null إذا الصفحة ما نشرتش سعراً. */
  costUsd: number | null;
  /** الـendpoint يشتغل بـrun + polling حسب التوثيق. */
  async: boolean;
  /**
   * متجر مقترح من البداية في شريط البحث (المتاجر الموجّهة للحريف).
   * الباقي موجود لكن مطفي: المستعمل يشعّلو بضغطة، والفلتر يتحكّم في الكلفة.
   */
  defaultEnabled: boolean;
  supports: SbaseSupports;
  /** الحقول اللي الردّ يوصلها فعلاً (للشفافية في الشاشة). */
  fields: string[];
  markets: SbaseMarket[];
  defaultMarket: string | null;
  /** مسارات المصفوفة المعروفة داخل `outputs[0].data`. */
  arrays: string[][];
  buildBody: (query: string, market: string | null) => Record<string, unknown>;
}

const SUPPORTS_KEYWORD: SbaseSupports = {
  keyword: true, url: false, image: false, details: false, price: true, variants: false, barcode: false,
};

const AMAZON_MARKETS: SbaseMarket[] = [
  { code: 'FR', label: 'France' }, { code: 'DE', label: 'Allemagne' }, { code: 'IT', label: 'Italie' },
  { code: 'ES', label: 'Espagne' }, { code: 'GB', label: 'Royaume-Uni' }, { code: 'US', label: 'États-Unis' },
  { code: 'TR', label: 'Turquie' }, { code: 'AE', label: 'Émirats' }, { code: 'NL', label: 'Pays-Bas' },
  { code: 'BE', label: 'Belgique' }, { code: 'PL', label: 'Pologne' }, { code: 'SE', label: 'Suède' },
];

export const SBASE_SOURCES: SbaseSourceDescriptor[] = [
  {
    id: 'aliexpress',
    defaultEnabled: true,
    label: 'AliExpress',
    vendor: 'aliexpress.com',
    endpoint: '/v1/api/aliexpress/search/products',
    costUsd: 0.014286,
    async: false,
    supports: SUPPORTS_KEYWORD,
    fields: ['title', 'price', 'image', 'link'],
    markets: [],
    defaultMarket: null,
    arrays: [],
    buildBody: (query) => ({ q: query, page: '1', sort: 'default' }),
  },
  {
    id: 'amazon',
    defaultEnabled: true,
    label: 'Amazon',
    vendor: 'amazon.fr',
    endpoint: '/v1/api/amazon/search-products',
    costUsd: 0.014286,
    async: false,
    supports: SUPPORTS_KEYWORD,
    fields: ['title', 'price', 'image', 'link', 'store', 'rating', 'reviews', 'shipping'],
    markets: AMAZON_MARKETS,
    defaultMarket: 'FR',
    arrays: [['products']],
    buildBody: (query, market) => ({ keyword: query, country: market || 'FR', page: 1 }),
  },
  {
    id: 'ebay',
    defaultEnabled: true,
    label: 'eBay',
    vendor: 'ebay.fr',
    endpoint: '/v1/api/ebay/search',
    costUsd: 0.015,
    async: true,
    supports: { ...SUPPORTS_KEYWORD, details: false },
    fields: ['title', 'price', 'image', 'link', 'store', 'rating', 'shipping', 'condition'],
    markets: [],
    defaultMarket: null,
    arrays: [['organic_results'], ['items']],
    buildBody: (query) => ({ _nkw: query, _pgn: '1' }),
  },
  {
    id: 'google-shopping',
    defaultEnabled: true,
    label: 'Google Shopping',
    vendor: 'google.com',
    endpoint: '/v1/api/google-shopping/search',
    costUsd: 0.015,
    async: true,
    supports: SUPPORTS_KEYWORD,
    fields: ['title', 'price', 'image', 'link', 'store', 'rating'],
    markets: [
      { code: 'fr', label: 'France' }, { code: 'de', label: 'Allemagne' }, { code: 'it', label: 'Italie' },
      { code: 'es', label: 'Espagne' }, { code: 'us', label: 'États-Unis' }, { code: 'tn', label: 'Tunisie' },
    ],
    defaultMarket: 'fr',
    arrays: [['shopping_results']],
    buildBody: (query, market) => ({ q: query, gl: market || 'fr', hl: 'fr' }),
  },
  {
    id: 'bing-shopping',
    defaultEnabled: false,
    label: 'Bing Shopping',
    vendor: 'bing.com',
    endpoint: '/v1/api/bing-shopping/search',
    costUsd: 0.015,
    async: true,
    supports: SUPPORTS_KEYWORD,
    fields: ['title', 'price', 'image', 'link', 'store', 'rating'],
    markets: [
      { code: 'fr', label: 'France' }, { code: 'de', label: 'Allemagne' }, { code: 'us', label: 'États-Unis' },
      { code: 'gb', label: 'Royaume-Uni' },
    ],
    defaultMarket: 'fr',
    arrays: [['shopping_results']],
    buildBody: (query, market) => ({ q: query, cc: market || 'fr' }),
  },
  {
    id: 'taobao',
    defaultEnabled: false,
    label: 'Taobao',
    vendor: 'taobao.com',
    endpoint: '/v1/api/taobao/search/items',
    costUsd: 0.0278,
    async: false,
    supports: SUPPORTS_KEYWORD,
    fields: ['title', 'price', 'image', 'link', 'store'],
    markets: [],
    defaultMarket: null,
    arrays: [['model', 'itemList']],
    buildBody: (query) => ({ keyword: query, page: 1 }),
  },
  {
    id: '1688',
    defaultEnabled: false,
    label: '1688',
    vendor: '1688.com',
    endpoint: '/v1/api/1688/search/items',
    costUsd: null,
    async: false,
    supports: SUPPORTS_KEYWORD,
    fields: ['title', 'price', 'image', 'link', 'store'],
    markets: [],
    defaultMarket: null,
    arrays: [],
    buildBody: (query) => ({ keyword: query, page: 1 }),
  },
];

/**
 * البحث بالصورة في S Base **موش** endpoint من SandBase: هو قناة ثانية (Google
 * Lens عبر SerpApi، نفس المزوّد اللي يستعملو Z Lens). نعلنوها هنا كوصف مستقلّ
 * باش الشاشة تعرضها بصدق، وما نخلطوهاش مع capacidade متاع متجر.
 */
export const SBASE_IMAGE_SOURCE = {
  id: 'google-lens',
  label: 'Google Lens',
  vendor: 'google.com',
  supports: { keyword: true, url: false, image: true, details: false, price: true, variants: false, barcode: false },
  /** المصدر يرجع المتجر لكل نتيجة (source) — الفلتر يتبنى من النتائج نفسها. */
  storeFromResults: true,
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
