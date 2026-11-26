/**
 * S Base — استخراج المنتجات من ردود SandBase.
 *
 * القاعدة الحاكمة: كل منصّة (Amazon, AliExpress, eBay…) ترجّع **شكلها الأصلي**،
 * وSandBase ما توحّدش الحقول. لذلك هنا:
 *   1. مسار مفضّل معروف (مثال `products` لأمازون، `shopping_results` لـGoogle)؛
 *   2. وإلا بحث عميق عن أي كائن «يشبه منتجاً» (عنوان + سعر/صورة).
 *
 * وما نلقاوهش **ما نخترعوهش**: كل حقل ناقص يتسجّل في `missing` باش الشاشة
 * تقول «المصدر ما عطاش المقاسات» بدل ما تعرض قيمة مزيفة.
 */

export interface SbaseProduct {
  id: string | null;
  title: string;
  url: string | null;
  image: string | null;
  priceText: string | null;
  amount: number | null;
  currency: string | null;
  store: string | null;
  /** البائع/الشركة داخل المتجر (1688: `shop_info.company_name`). */
  seller: string | null;
  rating: number | null;
  reviews: number | null;
  shipping: string | null;
  condition: string | null;
  /** 1688/Alibaba: أدنى كمّية للطلب — معلومة أساسية في الجملة، بلا تفسير من عندنا. */
  moq: string | null;
  /** حقول ما جابهاش المصدر (تسميات مختصرة: variants/colors/sizes/barcode…). */
  missing: string[];
}

export interface ExtractOptions {
  /** مسار المصفوفة اللي نعرفوها مسبقاً، مثال `['shopping_results']`. */
  arrays?: string[][];
  limit?: number;
  /** المتجر الافتراضي إذا المصدر ما يعطي «source/seller». */
  storeFallback?: string | null;
}

const TITLE_KEYS = ['product_title', 'productTitle', 'title', 'itemTitle', 'raw_title', 'productName', 'subject', 'name'];
const IMAGE_KEYS = ['product_photo', 'thumbnail', 'image', 'imageUrl', 'image_url', 'mainImage', 'imgUrl', 'product_image', 'pic', 'photo', 'picture', 'img'];
const MOQ_KEYS = ['moq', 'quantity_begin', 'min_order', 'minimum_order', 'moq_num'];
const URL_KEYS = ['product_url', 'productUrl', 'link', 'url', 'itemUrl', 'item_url', 'detail_url', 'product_link'];
const PRICE_TEXT_KEYS = ['product_price', 'price', 'salePrice', 'sale_price', 'itemPrice', 'current_price', 'priceText', 'formattedPrice'];
const PRICE_AMOUNT_KEYS = ['extracted_price', 'priceValue', 'price_value', 'salePriceValue', 'product_minimum_offer_price', 'price_min'];
const CURRENCY_KEYS = ['currency', 'currency_code', 'currencyCode', 'priceCurrency'];
const STORE_KEYS = ['source', 'merchant', 'store', 'mall', 'channel'];
const SELLER_KEYS = ['seller', 'seller_name', 'shopName', 'sellerName', 'seller_nick', 'company_name', 'companyName'];
const RATING_KEYS = ['product_star_rating', 'rating', 'star_rating', 'scoreRate'];
const REVIEWS_KEYS = ['product_num_ratings', 'reviews', 'review_count', 'ratings_count', 'totalReviews'];
const SHIPPING_KEYS = ['delivery', 'shipping', 'shippingText', 'freight'];
const CONDITION_KEYS = ['condition', 'itemCondition'];
const ID_KEYS = ['asin', 'product_id', 'item_id', 'itemId', 'productId', 'nid', 'offer_id', 'id'];

const SYMBOLS: Record<string, string> = {
  $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'CNY', '₹': 'INR', '₺': 'TRY', '₽': 'RUB', 'zł': 'PLN', kr: 'SEK',
};
const CODES = ['TND', 'EUR', 'USD', 'GBP', 'CNY', 'JPY', 'AED', 'SAR', 'TRY', 'PLN', 'SEK', 'CAD', 'AUD', 'INR'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function shopInfo(record: Record<string, unknown>): Record<string, unknown> {
  const shop = record.shop_info;
  return isRecord(shop) ? shop : {};
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown, options: { threeDecimals?: boolean } = {}): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d.,-]/g, '').replace(/\s/g, '');
    if (!normalized) return null;
    // «1.549,00» / «1,549.00» / «14,99» / «45.000» : الفاصلة الأخيرة هي العشرية.
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    let cleaned = normalized;
    if (lastComma > -1 && lastDot > -1) {
      cleaned = lastComma > lastDot
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
    } else if (lastComma > -1) {
      const decimals = normalized.length - lastComma - 1;
      // «12,500 TND» = 12 dinars 500 millimes : en Tunisie le troisième chiffre
      // après la virgule est une décimale, pas un séparateur de milliers.
      cleaned = decimals === 3
        ? (options.threeDecimals ? normalized.replace('.', '').replace(',', '.') : normalized.replace(/,/g, ''))
        : normalized.replace(',', '.');
    } else if (lastDot > -1) {
      const decimals = normalized.length - lastDot - 1;
      cleaned = decimals === 3 && !options.threeDecimals ? normalized.replace(/\./g, '') : normalized;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** يقرأ نص سعر مثل «1 234,56 €» أو «$14.99» ⇒ { amount, currency }. */
export function parsePriceText(value: unknown): { amount: number | null; currency: string | null } {
  const text = asText(value);
  if (!text) return { amount: null, currency: null };
  let currency: string | null = null;
  const upper = text.toUpperCase();
  for (const code of CODES) {
    if (new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`).test(upper)) { currency = code; break; }
  }
  if (!currency) {
    for (const [symbol, code] of Object.entries(SYMBOLS)) {
      if (text.includes(symbol)) { currency = code; break; }
    }
  }
  return { amount: asNumber(text, { threeDecimals: currency === 'TND' }), currency };
}

function looksLikeProduct(record: Record<string, unknown>): boolean {
  const title = asText(pick(record, TITLE_KEYS));
  if (!title) return false;
  const hasPrice = asText(pick(record, PRICE_TEXT_KEYS)) ?? asNumber(pick(record, PRICE_AMOUNT_KEYS));
  const hasImage = asText(pick(record, IMAGE_KEYS));
  return Boolean(hasPrice || hasImage);
}

export function normalizeProduct(record: Record<string, unknown>, options: ExtractOptions = {}): SbaseProduct | null {
  const title = asText(pick(record, TITLE_KEYS));
  if (!title) return null;

  const rawPriceText = asText(pick(record, PRICE_TEXT_KEYS));
  const rawAmount = asNumber(pick(record, PRICE_AMOUNT_KEYS));
  const parsed = parsePriceText(rawPriceText);
  const amount = rawAmount ?? parsed.amount;
  const currency = asText(pick(record, CURRENCY_KEYS))?.toUpperCase() ?? parsed.currency;

  const product: SbaseProduct = {
    id: asText(pick(record, ID_KEYS)),
    title,
    url: asText(pick(record, URL_KEYS)),
    image: asText(pick(record, IMAGE_KEYS)),
    priceText: rawPriceText,
    amount,
    currency,
    store: asText(pick(record, STORE_KEYS)) ?? options.storeFallback ?? null,
    // 1688 met le vendeur en sous-objet (`shop_info.company_name`), pas à plat.
    seller: asText(pick(record, SELLER_KEYS)) ?? asText(pick(shopInfo(record), ['company_name', 'shop_name'])) ?? null,
    rating: asNumber(pick(record, RATING_KEYS)),
    reviews: asNumber(pick(record, REVIEWS_KEYS)),
    shipping: asText(pick(record, SHIPPING_KEYS)),
    condition: asText(pick(record, CONDITION_KEYS)),
    moq: asText(pick(record, MOQ_KEYS)),
    missing: [],
  };

  if (!product.image) product.missing.push('image');
  if (product.amount === null && !product.priceText) product.missing.push('price');
  if (!product.currency) product.missing.push('currency');
  if (!product.url) product.missing.push('link');
  if (product.rating === null) product.missing.push('rating');
  if (!product.store) product.missing.push('store');
  if (!product.seller) product.missing.push('seller');

  return product;
}

/** يمشي في JSON ويجمع كل كائن يشبه منتجاً (بعمق محدود، بلا انفجار). */
function deepCollect(value: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 6 || out.length >= 400) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) deepCollect(item, out, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  if (looksLikeProduct(value)) out.push(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isRecord(child)) deepCollect(child, out, depth + 1);
  }
}

function readPath(data: unknown, path: string[]): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (Array.isArray(current)) {
      const index = Number(key);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (isRecord(current)) {
      current = current[key];
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

function dedupe(products: SbaseProduct[]): SbaseProduct[] {
  const seen = new Set<string>();
  const result: SbaseProduct[] = [];
  for (const product of products) {
    const key = product.url || (product.id ? `id:${product.id}` : `t:${product.title.toLowerCase()}`);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(product);
  }
  return result;
}

/** يحوّل ردّ SandBase إلى قائمة منتجات موحّدة (بلا اختراع حقول). */
export function extractProducts(data: unknown, options: ExtractOptions = {}): SbaseProduct[] {
  const limit = options.limit ?? 20;
  const preferred = options.arrays ?? [];
  for (const path of preferred) {
    const list = readPath(data, path);
    if (!Array.isArray(list) || list.length === 0) continue;
    const mapped = list
      .filter(isRecord)
      .map((record) => normalizeProduct(record, options))
      .filter((item): item is SbaseProduct => Boolean(item));
    if (mapped.length > 0) return dedupe(mapped).slice(0, limit);
  }

  const collected: Record<string, unknown>[] = [];
  deepCollect(data, collected);
  const mapped = collected
    .map((record) => normalizeProduct(record, options))
    .filter((item): item is SbaseProduct => Boolean(item));
  return dedupe(mapped).slice(0, limit);
}

/** الحقول اللي ما عطاهاش **أي** منتج في الردّ — تظهر في الشاشة كصدق مصدر. */
export function missingFacets(products: SbaseProduct[]): string[] {
  if (products.length === 0) return [];
  const facets = new Set<string>();
  for (const product of products) for (const field of product.missing) facets.add(field);
  return [...facets].sort();
}
