import type { QatafoDatabase } from '../db/database';
import { BLACK_FRIDAY_MAX_PRODUCTS, DEFAULT_BLACK_FRIDAY, blackFridayDiscount, normalizeBlackFriday, type BlackFridaySettings } from '../../shared/blackFriday';
import { publicLinkedProduct } from '../services/shoppableContent';
import { demoTnd, ZALANDO_DEMO, zalandoDemoProductId } from './installZalandoDemoCatalogue';

export const BLACK_FRIDAY_KEY = 'mobile_black_friday_week';
export const BLACK_FRIDAY_DEMO_MIGRATION = 'mobile_black_friday_demo_v1';
/** Only existing demo stock. Never imports products or invents reference prices. */
export const BLACK_FRIDAY_DEMO = [
  ['zalando-p008', 25], ['zalando-p018', 20], ['zalando-p006', 30], ['zalando-p002', 25], ['zalando-p016', 15],
  ['zalando-p005', 20], ['zalando-p023', 25], ['zalando-p011', 20], ['zalando-p014', 15],
] as const;

type CatalogueRow = { id: string; name: string; brand: string; image: string; status: string; stock_status: string; final_price: number; compare_at_price: number | null };
const columns = 'id,name,brand_name AS brand,image,status,stock_status,final_price,compare_at_price';
const where = `visibility='CATALOG' AND status='ACTIVE' AND stock_status<>'OUT_OF_STOCK' AND final_price>0 AND compare_at_price>final_price AND TRIM(image)<>''`;
const toOffer = (row: CatalogueRow) => {
  const product = publicLinkedProduct('shoppable', row);
  const discountPercent = blackFridayDiscount(row.final_price, Number(row.compare_at_price));
  return product?.available && discountPercent > 0 ? { ...product, compareAtPrice: Number(row.compare_at_price), discountPercent } : null;
};
export function blackFridayOffers(db: QatafoDatabase, ids: readonly string[]) {
  if (!ids.length) return [];
  const bounded = ids.slice(0, BLACK_FRIDAY_MAX_PRODUCTS);
  const rows = new Map(db.all<CatalogueRow>(`SELECT ${columns} FROM products WHERE ${where} AND id IN (${bounded.map(() => '?').join(',')})`, ...bounded)
    .map(row => [row.id, toOffer(row)]));
  return bounded.flatMap(id => { const offer = rows.get(id); return offer ? [offer] : []; });
}
export function searchBlackFridayOffers(db: QatafoDatabase, query: string) {
  const pattern = `%${query.trim().slice(0, 100).replace(/[\\%_]/g, '\\$&')}%`;
  return db.all<CatalogueRow>(`SELECT ${columns} FROM products WHERE ${where}
    AND (name LIKE ? ESCAPE '\\' OR brand_name LIKE ? ESCAPE '\\' OR product_code LIKE ? ESCAPE '\\') ORDER BY updated_at DESC,id LIMIT 12`,
    pattern, pattern, pattern).flatMap(row => { const offer = toOffer(row); return offer ? [offer] : []; });
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
export function readPublicBlackFriday(db: QatafoDatabase) {
  const { enabled, productIds, ...display } = readBlackFridaySettings(db);
  if (!enabled) return null;
  const products = blackFridayOffers(db, productIds);
  if (!products.length) return null;
  return { ...display, cover: display.cover || products.at(-1)!.image, products, maxDiscount: Math.max(...products.map(p => p.discountPercent)) };
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
