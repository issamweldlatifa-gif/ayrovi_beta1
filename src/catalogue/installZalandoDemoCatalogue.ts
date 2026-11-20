import fs from 'node:fs';
import path from 'node:path';
import type { QatafoDatabase } from '../db/database';
import selection from './zalandoDemoCatalogue.json';

export const ZALANDO_DEMO_MIGRATION = 'zalando_demo_catalogue_v1';
export const ZALANDO_DEMO = selection;
export const zalandoDemoProductId = (key: string) => `product_official_${key}`;
const mediaPrefix = '/media/catalogue/zalando-demo-v1/';
const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Use integer cents and round once to a millime. No duty, commission or margin. */
export const demoTnd = (eurCents: number) => Math.round(eurCents * Math.round(selection.fxRateTndPerEur * 1_000_000) / 100_000) / 1_000;

export function checkZalandoDemoSelection() {
  if (selection.products.length !== 24 || selection.stockPerProduct !== 20 ||
      new Set(selection.products.map(item => item.key)).size !== 24) throw new Error('INVALID_ZALANDO_DEMO_SELECTION');
  for (const item of selection.products) {
    if (!/^zalando-p\d{3}$/.test(item.key) || !Number.isSafeInteger(item.priceEurCents) || item.priceEurCents <= 0 ||
        (item.volumes.length > 0 && (item.sizes.length !== 1 || item.sizes[0] !== item.volumes[0].label || item.priceEurCents !== item.volumes[0].priceEurCents)) ||
        !item.images.length || item.images.some(url => !url.startsWith(mediaPrefix) || !/^p\d{3}-\d+\.jpg$/.test(url.slice(mediaPrefix.length)) ||
          !fs.existsSync(path.resolve('assets', url.slice(1))))) throw new Error(`INVALID_ZALANDO_DEMO_PRODUCT:${item.id}`);
  }
}

/** Keep historical product identities where deleting them would lose operational history. */
function retirePriorCatalogue(db: QatafoDatabase, now: string) {
  const previous = db.all<{ id: string; historical: number }>(`SELECT p.id, (
    EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id=p.id) OR
    EXISTS (SELECT 1 FROM purchase_order_lines po WHERE po.product_id=p.id OR po.variant_id IN (SELECT id FROM catalogue_variants WHERE product_id=p.id)) OR
    EXISTS (SELECT 1 FROM goods_receipt_lines gr WHERE gr.product_id=p.id) OR
    EXISTS (SELECT 1 FROM inventory_stock_movements m WHERE m.product_id=p.id) OR
    EXISTS (SELECT 1 FROM inventory_stocktake_lines l JOIN inventory_stock_items s ON s.id=l.item_id WHERE s.product_id=p.id)
  ) historical FROM products p WHERE p.visibility='CATALOG'`);
  let deleted = 0;
  let archived = 0;
  for (const row of previous) {
    if (row.historical) {
      db.run("UPDATE products SET status='ARCHIVED', updated_at=? WHERE id=? AND status<>'ARCHIVED'", now, row.id);
      archived++;
    } else {
      // The remaining stock rows have no movement or count history. Keep cart external IDs so
      // checkout rejects the retired SKU rather than treating it as an external item.
      db.run('DELETE FROM inventory_stock_items WHERE product_id=?', row.id);
      db.run('DELETE FROM products WHERE id=?', row.id);
      deleted++;
    }
  }
  return { deleted, archived };
}

/** Spread at most 20 pieces over visible size choices; no extra stock per size. */
export function demoAllocation(choices: number, total = selection.stockPerProduct): number[] {
  if (choices <= 0) return [];
  if (total <= 1) return Array.from({ length: choices }, (_, i) => i === 0 ? Math.max(0, total) : 0);
  if (choices <= total) return Array.from({ length: choices }, (_, i) => Math.floor(total / choices) + Number(i < total % choices));
  const qty: number[] = Array.from({ length: choices }, () => 0);
  for (let i = 0; i < total; i++) qty[Math.round(i * (choices - 1) / (total - 1))] = 1;
  return qty;
}

/** Called once inside the database's migration transaction, after a verified backup. */
export function installZalandoDemoCatalogue(db: QatafoDatabase, now = new Date().toISOString()) {
  if (db.get("SELECT 1 FROM products WHERE product_code LIKE 'ZFR-P___' LIMIT 1")) {
    throw new Error('ZALANDO_DEMO_CATALOGUE_ALREADY_PRESENT_WITHOUT_MIGRATION_MARKER');
  }
  const retirement = retirePriorCatalogue(db, now);
  const categories = new Map<string, string>();
  for (const item of selection.products) {
    const categorySlug = slug(item.category);
    const categoryId = categories.get(categorySlug) || db.get<{ id: string }>('SELECT id FROM catalogue_categories WHERE slug=?', categorySlug)?.id || `category_demo_${categorySlug}`;
    if (!categories.has(categorySlug)) {
      db.run(`INSERT OR IGNORE INTO catalogue_categories(id,name,slug,status,sort_order,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,?,?)`,
        categoryId, item.category, categorySlug, categories.size, now, now);
      db.run("UPDATE catalogue_categories SET status='ACTIVE',updated_at=? WHERE id=? AND status<>'ACTIVE'", now, categoryId);
      categories.set(categorySlug, categoryId);
    }
    const brandId = db.get<{ id: string }>('SELECT id FROM brands WHERE name=? COLLATE NOCASE ORDER BY id LIMIT 1', item.brand)?.id || `brand_demo_${slug(item.brand)}`;
    db.run('INSERT OR IGNORE INTO brands(id,name,category,created_at,updated_at) VALUES (?,?,?,?,?)', brandId, item.brand, 'FASHION', now, now);
    const id = zalandoDemoProductId(item.key);
    const code = `ZFR-${item.id}`;
    const price = demoTnd(item.priceEurCents);
    const description = [item.description, 'Stock de démonstration ZAYROVI, distinct de celui du marchand.',
      !item.sizes.length ? 'Taille non renseignée : vente de démonstration sans choix de taille.' : ''].filter(Boolean).join('\n\n');
    db.run(`INSERT INTO products (id,name,description,image,additional_images,brand_id,brand_name,category,category_id,
      source_url,source_platform,original_price,currency,converted_price,customs_fee,shipping_fee,service_fee,final_price,
      express_available,stock_status,status,product_code,slug,product_type,visibility,fiche_labels,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'','ZAYROVI',0,'TND',?,0,0,0,?,0,'AVAILABLE','ACTIVE',?,?,'STANDARD','CATALOG',?,?,?)`,
      id, item.title, description, item.images[0], JSON.stringify(item.images.slice(1)), brandId, item.brand, item.category, categoryId,
      price, price, code, item.key, JSON.stringify({ size: item.volumes.length ? 'Volume' : 'Taille' }), now, now);
    for (const [i, url] of item.images.entries()) {
      db.run(`INSERT INTO catalogue_media (id,product_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at)
        VALUES (?,?,'IMAGE',?,?,?,?,?,?)`, `media_${id}_${i + 1}`, id, url, item.title, i, Number(i === 0), now, now);
    }
    const sizes = item.sizes.length ? item.sizes : [null];
    const quantities = demoAllocation(sizes.length);
    for (const [index, size] of sizes.entries()) {
      const variant = size === null ? null : `var_${id}_${index + 1}`;
      if (variant) db.run(`INSERT INTO catalogue_variants (id,product_id,sku,size,color,status,sort_order,created_at,updated_at)
        VALUES (?,?,?,?,?,'ACTIVE',?,?,?)`, variant, id, `${code}-${index + 1}`, size, item.color, index, now, now);
      db.run(`INSERT INTO inventory_stock_items (id,product_id,variant_id,location,quantity,reorder_point,status,created_at,updated_at)
        VALUES (?,?,?,'MAIN',?,2,'ACTIVE',?,?)`, `stock_${variant || id}`, id, variant, quantities[index], now, now);
    }
    const field = 'reference_marque';
    db.run(`INSERT OR IGNORE INTO catalogue_attributes (id,attribute_key,label,data_type,applies_to,options,families,section,status,sort_order,created_at,updated_at)
      VALUES ('attr_reference_marque',?,'Référence marque','TEXT','product','[]','[]','pratique','ACTIVE',10,?,?)`, field, now, now);
    db.run(`INSERT INTO catalogue_attribute_values (id,attribute_key,product_id,variant_id,value_text,created_at,updated_at)
      VALUES (?,?,?,NULL,?,?,?)`, `attrv_${id}_${field}`, field, id, item.reference, now, now);
  }
  return { ...retirement, created: selection.products.length };
}
