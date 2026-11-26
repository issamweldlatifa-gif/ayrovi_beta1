/**
 * S Base — تفاصيل منتج واحد: **تصميم واحد، بيانات على قياس كل متجر**.
 *
 * المشكل: Amazon ترجّع `item_specifications` + `variants`، Taobao ترجّع
 * `sku_props` + `sku_base`، eBay ترجّع `item_specifics` + `variations`،
 * Google ترجّع `specifications` + `offers`. هنا نحوّلوهم كلهم إلى **شكل واحد**
 * تفهمو شاشة واحدة:
 *
 *   { title, brand, price, images[], description, specs[], variants[], … }
 *
 * والقاعدة الذهبية: كل حاجة ما لقيناهاش تتسجّل في `missing` — ما نكمّلوش
 * بالفراغ ولا بقيمة مخترعة. المقاسات/الألوان تظهر كان المصدر عطاهم فعلاً.
 */

export interface SbaseVariantValue {
  label: string;
  /** null = المصدر ما قالش (ما نكتبوش «متوفّر» ولا «نافد»). */
  available: boolean | null;
  image: string | null;
}

export interface SbaseVariantGroup {
  name: string;
  values: SbaseVariantValue[];
}

export interface SbaseSpec {
  name: string;
  value: string;
}

export interface SbaseDetail {
  title: string | null;
  brand: string | null;
  priceText: string | null;
  amount: number | null;
  currency: string | null;
  oldPriceText: string | null;
  rating: number | null;
  reviews: number | null;
  availability: string | null;
  seller: string | null;
  url: string | null;
  images: string[];
  description: string | null;
  specs: SbaseSpec[];
  /** «المقاسات والحركات»: مجموعة لكل بُعد (المقاس، اللون…). */
  variants: SbaseVariantGroup[];
  /**
   * وزن الحزمة كما أعلنه المصدر (kg) — يغذّي الشحن في **محرّك السعر** بدون أي
   * تقدير من عندنا. null = المصدر ما نشرش وزناً (المحرّك يستعمل وزن التصنيف).
   * Apify: `variants[].weightGrams` موثّق على صفحة الـactor (26/11/2026).
   */
  weightKg: number | null;
  /** حقول ما عطاهاش المصدر (variants/specs/description/images/price/…). */
  missing: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const FIRST_KEYS = {
  title: ['title', 'product_title', 'productTitle', 'name'],
  brand: ['brand', 'brand_name', 'brandName'],
  description: ['description', 'product_description_text', 'short_description'],
  availability: ['availability', 'stock', 'availability_signal'],
  seller: ['seller', 'seller_name', 'shop_title', 'shopName', 'store'],
  url: ['product_link', 'product_url', 'detail_url', 'link', 'url'],
};

function text(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** يقرأ مساراً منقّطاً داخل JSON بلا انفجار. */
function at(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current)) {
      const index = Number(key);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    return isRecord(current) ? current[key] : undefined;
  }, data);
}

function deepFindString(data: unknown, keys: string[], depth = 0): string | null {
  if (depth > 5 || !isRecord(data)) return null;
  for (const key of keys) {
    const value = text(data[key]);
    if (value) return value;
  }
  for (const value of Object.values(data)) {
    if (isRecord(value)) {
      const found = deepFindString(value, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function collectImageUrls(data: unknown, depth = 0, out: Set<string> = new Set()): Set<string> {
  if (depth > 6 || out.size >= 12) return out;
  if (typeof data === 'string') {
    if (/^https?:\/\/.+\.(jpe?g|png|webp)(\?|$)/i.test(data) || /^https?:\/\/[^/]*alicdn\.com\//i.test(data)) out.add(data);
    return out;
  }
  if (Array.isArray(data)) {
    // Les URLs de galerie arrivent aussi en `//img…` (protocole relatif alicdn).
    for (const item of data) collectImageUrls(item, depth + 1, out);
    return out;
  }
  if (!isRecord(data)) return out;
  for (const [key, value] of Object.entries(data)) {
    if (/image|thumbnail|photo|picture|img|media|gallery/i.test(key)) collectImageUrls(value, depth + 1, out);
  }
  return out;
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  return /^https:\/\//i.test(trimmed) ? trimmed : null;
}

function specsFromPairs(pairs: unknown, limit = 24): SbaseSpec[] {
  const specs: SbaseSpec[] = [];
  if (Array.isArray(pairs)) {
    for (const entry of pairs) {
      if (!isRecord(entry)) continue;
      const name = text(entry.name) ?? text(entry.key) ?? text(entry.label);
      const value = text(entry.value) ?? text(entry.text);
      if (name && value) specs.push({ name: name.slice(0, 60), value: value.slice(0, 160) });
      if (specs.length >= limit) break;
    }
  } else if (isRecord(pairs)) {
    for (const [name, raw] of Object.entries(pairs)) {
      const value = text(raw);
      if (!name || !value) continue;
      // Champs internes/techniques : pas des caractéristiques client.
      if (/^(asin|best_sellers_rank|customer_reviews|link|url|image|images)$/i.test(name)) continue;
      specs.push({ name: name.replace(/_/g, ' ').slice(0, 60), value: value.slice(0, 160) });
      if (specs.length >= limit) break;
    }
  }
  return specs;
}

function toBoolOrNull(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0 ? true : null;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    if (/^(0|false|no|out of stock|sold out|نافد)$/.test(trimmed)) return false;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed) > 0 ? true : false;
    return true;
  }
  return null;
}

/** Taobao/1688 : `sku_props[{name, values[{name, vid, image}]}]`. */
function taobaoVariants(item: Record<string, unknown>): SbaseVariantGroup[] {
  const props = item.sku_props;
  if (!Array.isArray(props)) return [];
  const groups: SbaseVariantGroup[] = [];
  for (const group of props) {
    if (!isRecord(group)) continue;
    // Taobao: `name` · 1688: `prop_name`. La même forme, un seul normaliseur.
    const name = text(group.name) ?? text(group.prop_name);
    const values = Array.isArray(group.values) ? group.values : [];
    if (!name || values.length === 0) continue;
    groups.push({
      name,
      values: values.map((entry) => ({
        label: text(isRecord(entry) ? entry.name : entry) ?? '—',
        available: null,
        image: isRecord(entry) ? normalizeUrl(text(entry.image) ?? '') : null,
      })).filter((value) => value.label !== '—'),
    });
  }
  return groups;
}

/** Amazon/eBay : `variants` tableau d'objets, ou objet {couleur: [...]}. */
function genericVariants(data: unknown): SbaseVariantGroup[] {
  const holder = isRecord(data) ? (data.variants ?? data.variations ?? data.variant_options) : undefined;
  if (!holder) return [];

  if (Array.isArray(holder)) {
    const values: SbaseVariantValue[] = [];
    for (const entry of holder.slice(0, 30)) {
      if (!isRecord(entry)) continue;
      const label = text(entry.title) ?? text(entry.name) ?? text(entry.value) ?? text(entry.asin) ?? text(entry.id);
      if (!label) continue;
      values.push({
        label: label.slice(0, 60),
        available: toBoolOrNull(entry.in_stock ?? entry.available ?? entry.availability ?? entry.stock),
        image: normalizeUrl(text(entry.thumbnail) ?? text(entry.image) ?? '' ),
      });
    }
    return values.length > 0 ? [{ name: 'options', values }] : [];
  }

  if (isRecord(holder)) {
    const groups: SbaseVariantGroup[] = [];
    for (const [name, raw] of Object.entries(holder)) {
      if (!Array.isArray(raw)) continue;
      const values = raw
        .map((entry) => (isRecord(entry)
          ? {
            label: text(entry.name) ?? text(entry.value) ?? text(entry.title) ?? '',
            available: toBoolOrNull(entry.in_stock ?? entry.available ?? entry.availability),
            image: normalizeUrl(text(entry.image) ?? ''),
          }
          : { label: text(entry) ?? '', available: null, image: null }))
        .filter((value) => value.label);
      if (values.length > 0) groups.push({ name, values });
    }
    return groups;
  }
  return [];
}

/**
 * 1688 (`/v1/api/1688/item/detail`) له شكل خاص: `attribute.propsList`،
 * `sku_props[].prop_name`، `price_info.price` نصّي بالـCNY، `item.companyName`،
 * و`is_sold_out`. نحوّلو هنا بدل ما نخلّطو القواعد العامة.
 */
function import1688(root: Record<string, unknown>): {
  specs: SbaseSpec[]; variants: SbaseVariantGroup[]; seller: string | null;
  amount: number | null; currency: string | null; availability: string | null; url: string | null;
} {
  const item = isRecord(root.item) ? root.item : {};
  const props = isRecord(root.attribute) ? root.attribute.propsList : undefined;
  const specs = specsFromPairs(props);
  // Selon l'endpoint, `sku_props` est à la racine ou dans `item`.
  const variants = taobaoVariants(item.sku_props === undefined ? { ...item, sku_props: root.sku_props } : item);
  const seller = text(item.companyName)
    ?? text(at(root, 'shop_info.shop_name'))
    ?? text(at(root, 'shop_info.company_name'));
  const rawPrice = text(at(root, 'price_info.price'))
    ?? text(at(root, 'price_info.price_min'))
    ?? text(at(root, 'price_info.sale_price'));
  const amount = rawPrice ? Number(rawPrice.replace(/[^\d.]/g, '')) || null : null;
  const currency = text(at(root, 'currency'))?.toUpperCase() ?? (amount !== null ? 'CNY' : null);
  const soldOut = root.is_sold_out;
  const availability = soldOut === true ? 'out_of_stock' : soldOut === false ? 'in_stock' : null;
  const itemId = text(at(root, 'item_id')) ?? text(item.item_id);
  const url = itemId ? `https://detail.1688.com/offer/${itemId}.html` : null;
  return { specs, variants, seller, amount, currency, availability, url };
}

/**
 * وزن الحزمة من الحقول الموثّقة فقط: `weightGrams` (Apify، من variants أو
 * علوي)، `packageDimensions.weightG`، `weightG`. الغياب = null — ما نقدّرش
 * وزناً ولا نحوّلوه من حجم.
 */
function weightKgFrom(root: Record<string, unknown>): number | null {
  const packageDimensions = isRecord(root.packageDimensions) ? root.packageDimensions : {};
  const grams = [root.weightGrams, root.packageWeightGrams, root.packageWeightG, packageDimensions.weightG, root.weightG]
    .find((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
  return typeof grams === 'number' ? grams / 1000 : null;
}

/** يحوّل ردّ أي متجر إلى تفاصيل موحّدة، بلا اختراع. */
export function extractDetail(data: unknown): SbaseDetail {
  const root = isRecord(data) ? data : {};
  const product = isRecord(root.product_result) ? root.product_result
    : isRecord(root.product_results) ? root.product_results
      : isRecord(root.item) ? root.item
        : root;

  const native1688 = root.attribute !== undefined || root.sku_props !== undefined || root.price_info !== undefined
    ? import1688(root)
    : null;

  const title = text(at(product, 'title'))
    ?? deepFindString(root, FIRST_KEYS.title);
  const brand = text(at(product, 'brand')) ?? text(at(root, 'brand'))
    ?? text(at(root, 'item_specifications.brand')) ?? text(at(root, 'product_details.brand_name'))
    ?? text(at(root, 'item.brandName'));

  // Prix : eBay sous `buy.buy_it_now.price`, Taobao sous `skus.price`, Amazon `product_price`.
  const priceNode = at(product, 'buy.buy_it_now.price') ?? at(product, 'price') ?? at(product, 'skus.price')
    ?? at(product, 'price_info.sale_price') ?? at(root, 'product_price');
  let amount: number | null = null;
  let currency: string | null = null;
  if (isRecord(priceNode)) {
    const rawAmount = priceNode.amount ?? priceNode.value;
    amount = typeof rawAmount === 'number' ? rawAmount : (typeof rawAmount === 'string' ? Number(rawAmount.replace(/[^\d.]/g, '')) || null : null);
    currency = text(priceNode.currency)?.toUpperCase() ?? null;
  } else if (typeof priceNode === 'string') {
    const match = priceNode.replace(/\s/g, '').match(/([\d.,]+)/);
    const parsed = match ? Number(match[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) : Number.NaN;
    amount = Number.isFinite(parsed) ? parsed : null;
    currency = /€/.test(priceNode) ? 'EUR' : /\$/.test(priceNode) ? 'USD' : /TND/i.test(priceNode) ? 'TND' : /¥|元|CNY/i.test(priceNode) ? 'CNY' : null;
  } else if (typeof priceNode === 'number') {
    amount = priceNode;
  }
  if (amount === null && native1688?.amount != null) {
    amount = native1688.amount;
    currency = currency ?? native1688.currency;
  }

  const specs = specsFromPairs(product.specifications)
    .concat(specsFromPairs(root.product_details))
    .concat(specsFromPairs(root.item_specifications))
    .concat(specsFromPairs(isRecord(root.item) ? root.item.properties : undefined))
    .concat(native1688 ? native1688.specs : []);

  const variants = (native1688 ? native1688.variants : taobaoVariants(isRecord(root.item) ? root.item : {}))
    .concat(genericVariants(root))
    .concat(genericVariants(product));

  const images = [...collectImageUrls(product.images ?? product.media ?? product.thumbnails ?? root.media ?? root.images ?? [])]
    .map(normalizeUrl)
    .filter((value): value is string => Boolean(value))
    .slice(0, 10);

  const description = text(at(product, 'description'))
    ?? (Array.isArray(root.about_item) ? root.about_item.map((entry) => text(entry)).filter(Boolean).join('\n') || null : null);

  const detail: SbaseDetail = {
    title,
    brand,
    priceText: typeof priceNode === 'string' ? priceNode : null,
    amount,
    currency,
    oldPriceText: text(at(product, 'old_price')) ?? text(at(root, 'product_original_price')),
    rating: typeof at(product, 'rating') === 'number' ? at(product, 'rating') as number
      : typeof at(root, 'product_star_rating') === 'string' ? Number(at(root, 'product_star_rating')) || null : null,
    reviews: typeof at(product, 'reviews') === 'number' ? at(product, 'reviews') as number : null,
    availability: text(at(product, 'availability')) ?? text(at(product, 'quantity.availability_signal'))
      ?? text(at(root, 'stock')) ?? native1688?.availability ?? null,
    seller: text(at(root, 'seller.shop_title')) ?? text(at(root, 'seller_results.name'))
      ?? text(at(product, 'seller')) ?? native1688?.seller ?? null,
    // 1688 renvoie `detail_url` = image CDN : on garde l'URL canonique du produit.
    url: normalizeUrl(text(at(product, 'product_link')) ?? text(at(root, 'product_url')) ?? '')
      ?? native1688?.url ?? null,
    images,
    description: description ? description.slice(0, 2000) : null,
    specs,
    variants: variants.filter((group) => group.values.length > 0),
    weightKg: weightKgFrom(root),
    missing: [],
  };

  if (!detail.title) detail.missing.push('title');
  if (detail.amount === null && !detail.priceText) detail.missing.push('price');
  if (!detail.currency) detail.missing.push('currency');
  if (detail.images.length === 0) detail.missing.push('images');
  if (detail.specs.length === 0) detail.missing.push('specs');
  if (detail.variants.length === 0) detail.missing.push('variants');
  if (!detail.description) detail.missing.push('description');
  if (!detail.seller) detail.missing.push('seller');

  return detail;
}
