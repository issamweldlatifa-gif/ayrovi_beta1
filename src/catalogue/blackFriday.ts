import type { QatafoDatabase } from '../db/database';
import { BLACK_FRIDAY_MAX_PRODUCTS, DEFAULT_BLACK_FRIDAY, blackFridayDiscount, normalizeBlackFriday, resolveBlackFridayCollections, type BlackFridaySettings } from '../../shared/blackFriday';
import { publicLinkedProduct } from '../services/shoppableContent';
import { demoTnd, ZALANDO_DEMO, zalandoDemoProductId } from './installZalandoDemoCatalogue';

export const BLACK_FRIDAY_KEY = 'mobile_black_friday_week';
export const BLACK_FRIDAY_DEMO_MIGRATION = 'mobile_black_friday_demo_v1';
/** Only existing demo stock. Never imports products or invents reference prices. */
export const BLACK_FRIDAY_DEMO = [
  ['zalando-p008', 25], ['zalando-p018', 20], ['zalando-p006', 30], ['zalando-p002', 25], ['zalando-p016', 15],
  ['zalando-p005', 20], ['zalando-p023', 25], ['zalando-p011', 20], ['zalando-p014', 15],
] as const;

type CatalogueRow = { id: string; name: string; brand: string; image: string; status: string; stock_status: string; final_price: number; compare_at_price: number | null; original_price: number; currency: string };
const columns = 'id,name,brand_name AS brand,image,status,stock_status,final_price,compare_at_price,original_price,currency';
const eligible = `visibility='CATALOG' AND status='ACTIVE' AND stock_status<>'OUT_OF_STOCK' AND final_price>0 AND TRIM(image)<>''`;
const directPrice = (row: CatalogueRow) => row.currency === 'TND' && row.original_price === 0;
const adminOffer = (row: CatalogueRow) => ({ id: row.id, name: row.name, image: row.image, price: row.final_price, compareAtPrice: row.compare_at_price,
  discountPercent: blackFridayDiscount(row.final_price, Number(row.compare_at_price)), canEditPrice: directPrice(row) });
const toOffer = (row: CatalogueRow) => {
  const product = publicLinkedProduct('shoppable', row);
  const discountPercent = blackFridayDiscount(row.final_price, Number(row.compare_at_price));
  return product?.available && discountPercent > 0 ? { ...product, compareAtPrice: Number(row.compare_at_price), discountPercent } : null;
};
function campaignRows(db: QatafoDatabase, ids: readonly string[]) {
  const bounded = ids.slice(0, BLACK_FRIDAY_MAX_PRODUCTS);
  if (!bounded.length) return [];
  const rows = new Map(db.all<CatalogueRow>(`SELECT ${columns} FROM products WHERE ${eligible} AND id IN (${bounded.map(() => '?').join(',')})`, ...bounded)
    .map(row => [row.id, row]));
  return bounded.flatMap(id => { const row = rows.get(id); return row ? [row] : []; });
}
export function blackFridayOffers(db: QatafoDatabase, ids: readonly string[]) {
  return campaignRows(db, ids).flatMap(row => { const offer = toOffer(row); return offer ? [offer] : []; });
}
export const blackFridayAdminOffers = (db: QatafoDatabase, ids: readonly string[]) => campaignRows(db, ids).map(adminOffer);
export function searchBlackFridayOffers(db: QatafoDatabase, query: string) {
  const pattern = `%${query.trim().slice(0, 100).replace(/[\\%_]/g, '\\$&')}%`;
  return db.all<CatalogueRow>(`SELECT ${columns} FROM products WHERE ${eligible}
    AND (name LIKE ? ESCAPE '\\' OR brand_name LIKE ? ESCAPE '\\' OR product_code LIKE ? ESCAPE '\\')
    ORDER BY (compare_at_price>final_price) DESC,updated_at DESC,id LIMIT 12`, pattern, pattern, pattern).map(adminOffer);
}
const validPrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0.001 && value <= 1_000_000 && Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001;
export function updateBlackFridayCataloguePrice(db: QatafoDatabase, id: string, input: unknown, now: string) {
  if (!input || typeof input !== 'object' || !/^[A-Za-z0-9_-]{1,150}$/.test(id)) return { status: 'invalid' } as const;
  const { price, compareAtPrice, expectedPrice, expectedCompareAtPrice } = input as Record<string, unknown>;
  if (!validPrice(price) || !validPrice(compareAtPrice) || !blackFridayDiscount(price, compareAtPrice) || !validPrice(expectedPrice) ||
      (expectedCompareAtPrice !== null && !validPrice(expectedCompareAtPrice))) return { status: 'invalid' } as const;
  const row = campaignRows(db, [id])[0];
  if (!row || !directPrice(row)) return { status: 'invalid' } as const;
  if (row.final_price !== expectedPrice || row.compare_at_price !== expectedCompareAtPrice) return { status: 'conflict' } as const;
  db.run('UPDATE products SET final_price=?,compare_at_price=?,updated_at=? WHERE id=?', price, compareAtPrice, now, id);
  return { status: 'saved', before: adminOffer(row), offer: adminOffer({ ...row, final_price: price, compare_at_price: compareAtPrice }) } as const;
}
export function readBlackFridaySettings(db: QatafoDatabase): BlackFridaySettings {
  const raw = db.get<{ setting_value: string }>('SELECT setting_value FROM settings WHERE setting_key=?', BLACK_FRIDAY_KEY)?.setting_value;
  try { return normalizeBlackFriday(JSON.parse(raw ?? 'null')) ?? DEFAULT_BLACK_FRIDAY; }
  catch { return DEFAULT_BLACK_FRIDAY; }
}
export function saveBlackFridaySettings(db: QatafoDatabase, raw: unknown, now: string) {
  const settings = normalizeBlackFriday(raw);
  if (!settings || (settings.enabled && blackFridayOffers(db, settings.productIds).length !== settings.productIds.length)) return null;
  db.run('UPDATE settings SET setting_value=?,updated_at=? WHERE setting_key=?', JSON.stringify(settings), now, BLACK_FRIDAY_KEY);
  return settings;
}
export function readPublicBlackFriday(db: QatafoDatabase, now = Date.now()) {
  const { enabled, productIds, collections, ...display } = readBlackFridaySettings(db);
  if (!enabled || (display.endsAt && Date.parse(display.endsAt) <= now)) return null;
  const offers = blackFridayOffers(db, productIds);
  const eligible = new Set(offers.map(offer => offer.id));
  // Links in the public payload must point only to eligible catalogue offers.
  const active = resolveBlackFridayCollections(collections, offers, display.endsAt, now);
  const visible = new Set(active.flatMap(collection => collection.products.map(offer => offer.id)));
  const products = collections.length ? offers.filter(offer => visible.has(offer.id)) : offers;
  if (!products.length) return null;
  const publicCollections = collections.filter(collection => active.some(item => item.id === collection.id))
    .map(collection => ({ ...collection, productIds: collection.productIds.filter(id => eligible.has(id)) }));
  return { ...display, collections: publicCollections, cover: display.cover || products.at(-1)!.image,
    featureCover: display.featureCover || display.cover || products[0]!.image, products, maxDiscount: Math.max(...products.map(p => p.discountPercent)) };
}

export const BLACK_FRIDAY_COLLECTIONS_MIGRATION = 'mobile_black_friday_collections_v1';
export function installBlackFridayCollections(db: QatafoDatabase, now: string) {
  const settings = readBlackFridaySettings(db);
  if (!settings.enabled || settings.collections.length || settings.featureCover ||
    settings.featureTitleFr !== DEFAULT_BLACK_FRIDAY.featureTitleFr || settings.featureTitleAr !== DEFAULT_BLACK_FRIDAY.featureTitleAr ||
    settings.featureCtaFr !== DEFAULT_BLACK_FRIDAY.featureCtaFr || settings.featureCtaAr !== DEFAULT_BLACK_FRIDAY.featureCtaAr || settings.productIds.length !== BLACK_FRIDAY_DEMO.length ||
    !BLACK_FRIDAY_DEMO.every(([key]) => settings.productIds.includes(zalandoDemoProductId(key)))) return;
  const demo = [
    ['vans', 'Vans – Vestiaire street', 'فانس – ستايل الشارع', 7, ['p008', 'p006', 'p011']],
    ['streetwear', 'Basiques urbains', 'أساسيات يومية', 9, ['p018', 'p005']],
    ['casual', 'Le vestiaire casual', 'إطلالات كاجوال', 8, ['p002', 'p023']],
    ['beauty', 'Beauté & soins', 'جمال وعناية', 10, ['p016', 'p014']],
  ] as const;
  settings.collections = demo.map(([id, titleFr, titleAr, days, skus]) => ({ id, titleFr, titleAr, demo: true,
    cover: `/media/catalogue/black-friday-demo-v1/${id}.jpg`, endsAt: new Date(Date.parse(now) + days * 86_400_000).toISOString(),
    productIds: skus.map(sku => zalandoDemoProductId(`zalando-${sku}`)) }));
  db.run('UPDATE settings SET setting_value=?,updated_at=? WHERE setting_key=?', JSON.stringify(settings), now, BLACK_FRIDAY_KEY);
}

/** One-time, price-guarded demo repricing. Editing/pausing the section never modifies catalogue prices. */
export function installBlackFridayDemo(db: QatafoDatabase, now: string) {
  if (db.get('SELECT 1 FROM settings WHERE setting_key=?', BLACK_FRIDAY_KEY)) return;
  const ids: string[] = [];
  for (const [key, percent] of BLACK_FRIDAY_DEMO) {
    const sample = ZALANDO_DEMO.products.find(item => item.key === key);
    if (!sample) throw new Error(`Unknown Black Friday demo SKU: ${key}`);
    const id = zalandoDemoProductId(key);
    const regular = demoTnd(sample.priceEurCents);
    const sale = Math.floor(Math.round(regular * 1000) * (100 - percent) / 100) / 1000;
    db.run(`UPDATE products SET compare_at_price=final_price, final_price=?, updated_at=?
      WHERE id=? AND product_code=? AND source_platform='ZAYROVI' AND currency='TND'
      AND visibility='CATALOG' AND status='ACTIVE' AND stock_status<>'OUT_OF_STOCK'
      AND original_price=0 AND compare_at_price IS NULL AND final_price=? AND converted_price=?`, sale, now, id, `ZFR-${sample.id}`, regular, regular);
    ids.push(id);
  }
  const products = blackFridayOffers(db, ids);
  const coverKey = 'zalando-p016';
  const cover = products.some(product => product.id === zalandoDemoProductId(coverKey))
    ? ZALANDO_DEMO.products.find(item => item.key === coverKey)?.images[1] ?? '' : '';
  const settings: BlackFridaySettings = { ...DEFAULT_BLACK_FRIDAY, cover, enabled: products.length > 0, productIds: products.map(product => product.id) };
  db.run("INSERT INTO settings (id, category, setting_key, setting_value, value_type, label, updated_at) VALUES (?, 'INTERFACE', ?, ?, 'JSON', ?, ?)",
    BLACK_FRIDAY_KEY, BLACK_FRIDAY_KEY, JSON.stringify(settings), 'Black Friday Week (mobile)', now);
}
