/**
 * CATALOGUE OFFICIEL (12/11/2026) — remplace TOUT le catalogue précédent.
 *
 * Demande du propriétaire : « احذفهم نهائيا وعوضهم بالكاتالوج الجديد ». Les
 * vingt produits viennent du fichier `products_official.json` fourni (pages
 * officielles des marques) ; les données retenues sont dans
 * `officialCatalogue.json` et les photos sont servies par le serveur
 * (`/media/catalogue/official/…`) — jamais un lien distant qui peut casser.
 *
 * Deux étapes, appelées UNE seule fois par `runOnceDataMigration` :
 *   1. `purgeCatalogueProducts` — retire chaque ligne de `products` et toutes
 *      ses attaches : variantes, médias, attributs, stock et mouvements,
 *      favoris, liens de contenu, promotions. Les contenus qui citaient un
 *      produit (publications, reels, stories, news…) sont gardés, leur lien est
 *      simplement neutralisé ; les publications de démonstration qui ne
 *      vivaient QUE de ces produits sont archivées. Une commande garde son
 *      instantané (nom, prix) : seul l'identifiant devient nul.
 *   2. `installOfficialCatalogue` — catégories, marques, produits, photos,
 *      variantes (tailles), stock d'ouverture et champs de fiche.
 *
 * Prix : fixés en dinars à l'installation (prix source × taux retenu, arrondi
 * au dinar). `original_price` reste 0 : le recalcul de change ne les touche pas,
 * le CRM reste le seul à pouvoir les modifier.
 */
import type { QatafoDatabase } from '../db/database';
import catalogue from './officialCatalogue.json';
import { setContentProducts } from '../services/contentProducts';

export const OFFICIAL_CATALOGUE = catalogue;
export type OfficialProduct = (typeof catalogue.products)[number];

export const officialProductId = (key: string) => `product_official_${key}`;
export const officialCategoryId = (slug: string) => `category_official_${slug}`;

type Db = Pick<QatafoDatabase, 'run' | 'get' | 'all'>;

const tableExists = (db: Db, table: string) =>
  Boolean(db.get("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?", table));

const columnInfo = (db: Db, table: string, column: string) =>
  db.all<{ name: string; notnull: number }>(`PRAGMA table_info(${table})`).find((c) => c.name === column);

/** Tables dont les lignes n'ont aucun sens sans leur produit : supprimées. */
const OWNED_BY_PRODUCT = [
  'inventory_stock_movements',
  'inventory_stock_items',
  'catalogue_attribute_values',
  'catalogue_media',
  'catalogue_variants',
  'content_products',
  'promotion_products',
  'customer_favorites',
  'product_arrivals',
];

/**
 * Tables qui CITENT un produit sans en dépendre : le lien est neutralisé
 * (colonne mise à NULL), la ligne reste. Les tables AYWEBs ont leur propre
 * catalogue (`ayweb_products`) et ne sont pas concernées.
 */
const REFERENCES_PRODUCT = [
  'order_items',
  'purchase_order_lines',
  'goods_receipt_lines',
  'publications',
  'reels',
  'stories',
  'news_items',
  'magazine_drafts',
];

export interface CataloguePurgeReport {
  products: number;
  archivedPublications: number;
}

export function purgeCatalogueProducts(db: Db, now = new Date().toISOString()): CataloguePurgeReport {
  const ids = db.all<{ id: string }>('SELECT id FROM products').map((row) => row.id);
  if (ids.length === 0) return { products: 0, archivedPublications: 0 };
  const inList = `(SELECT id FROM products)`;

  // Les publications de démonstration qui ne portaient QUE des produits retirés
  // seraient des cartes vides : archivées (jamais supprimées — le CRM les garde).
  let archivedPublications = 0;
  if (tableExists(db, 'publications')) {
    const linked = db.all<{ id: string }>(
      `SELECT DISTINCT p.id FROM publications p
        WHERE p.status <> 'archive'
          AND (p.product_id IN ${inList}
               OR EXISTS (SELECT 1 FROM content_products c WHERE c.content_kind='publication' AND c.content_id=p.id AND c.product_id IN ${inList}))`,
    );
    for (const row of linked) {
      db.run("UPDATE publications SET status='archive', content_mode='normal', updated_at=? WHERE id=?", now, row.id);
    }
    archivedPublications = linked.length;
  }

  for (const table of OWNED_BY_PRODUCT) {
    if (!tableExists(db, table) || !columnInfo(db, table, 'product_id')) continue;
    db.run(`DELETE FROM ${table} WHERE product_id IN ${inList}`);
  }
  for (const table of REFERENCES_PRODUCT) {
    if (!tableExists(db, table)) continue;
    const column = columnInfo(db, table, 'product_id');
    if (!column) continue;
    if (column.notnull) db.run(`DELETE FROM ${table} WHERE product_id IN ${inList}`);
    else db.run(`UPDATE ${table} SET product_id=NULL WHERE product_id IN ${inList}`);
  }
  if (tableExists(db, 'reels') && columnInfo(db, 'reels', 'content_mode')) {
    db.run("UPDATE reels SET content_mode='normal' WHERE content_mode='shoppable' AND product_id IS NULL");
  }
  // Paniers : la ligne catalogue perd son lien (le client la voit indisponible).
  if (tableExists(db, 'cart_items') && columnInfo(db, 'cart_items', 'external_id')) {
    db.run(`UPDATE cart_items SET external_id=NULL WHERE store='catalog' AND external_id IN ${inList}`);
  }
  // Blocs Publication de démonstration : réinstallés avec le nouveau catalogue.
  if (tableExists(db, 'publication_blocks')) db.run("DELETE FROM publication_blocks WHERE id LIKE 'pubblock_demo_%'");

  db.run('DELETE FROM products');

  // Catégories et marques créées pour l'ancienne sélection, désormais vides.
  db.run(
    `DELETE FROM catalogue_categories WHERE id LIKE 'category_selection_%'
       AND NOT EXISTS (SELECT 1 FROM catalogue_categories child WHERE child.parent_id=catalogue_categories.id)`,
  );
  db.run(`DELETE FROM brands WHERE id LIKE 'brand_selection_%'`);
  return { products: ids.length, archivedPublications };
}

const brandCategory = (family: string) => (family === 'electronics' ? 'TECH' : 'FASHION');
const slug = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Libellés des sections de fiche, selon la famille du produit. */
const FICHE_SECTIONS = {
  clothing: { matiere: 'Matière et entretien', mesures: 'Coupe et tailles', pratique: 'Livraison et retours' },
  electronics: { matiere: 'Conception', mesures: 'Dimensions et autonomie', pratique: 'Caractéristiques techniques' },
} as const;

/** Section de chaque champ de fiche (les clés sont celles de `officialCatalogue.json`). */
const FIELD_SECTION: Record<string, keyof (typeof FICHE_SECTIONS)['clothing']> = {
  material: 'matiere',
  care: 'matiere',
  coupe: 'mesures',
  poids: 'mesures',
  autonomie: 'mesures',
  caracteristiques: 'pratique',
  contenu: 'pratique',
  garantie: 'pratique',
};

export function installOfficialCatalogue(db: Db, now = new Date().toISOString()): number {
  for (const [index, category] of catalogue.categories.entries()) {
    const existing = db.get<{ id: string }>('SELECT id FROM catalogue_categories WHERE slug=?', category.slug);
    if (existing) continue;
    db.run(
      `INSERT INTO catalogue_categories(id,name,slug,status,sort_order,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,?,?)`,
      officialCategoryId(category.slug), category.name, category.slug, index, now, now,
    );
  }

  let created = 0;
  for (const [index, item] of catalogue.products.entries()) {
    const id = officialProductId(item.key);
    if (db.get('SELECT id FROM products WHERE id=? OR slug=?', id, item.key)) continue;

    let brand = db.get<{ id: string; name: string }>('SELECT id,name FROM brands WHERE name=? COLLATE NOCASE', item.brand);
    if (!brand) {
      brand = { id: `brand_official_${slug(item.brand)}`, name: item.brand };
      db.run(
        'INSERT INTO brands(id,name,category,created_at,updated_at) VALUES (?,?,?,?,?)',
        brand.id, item.brand, brandCategory(item.family), now, now,
      );
    }
    const category = db.get<{ id: string; name: string }>('SELECT id,name FROM catalogue_categories WHERE slug=?', item.category);
    const code = `ZOF-${String(index + 1).padStart(3, '0')}`;
    const family = item.family === 'electronics' ? 'electronics' : 'clothing';
    const sizeLabel = family === 'electronics' ? 'Modèle' : item.category === 'chaussures' ? 'Pointure' : 'Taille';

    db.run(
      `INSERT INTO products (
         id, name, description, image, additional_images, brand_id, brand_name, category, category_id,
         source_url, source_platform, original_price, currency, converted_price, customs_fee, shipping_fee,
         service_fee, final_price, compare_at_price, express_available, stock_status, status,
         product_code, slug, product_type, visibility, fiche_labels, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,'','ZAYROVI',0,'TND',?,0,0,0,?,?,0,'AVAILABLE','ACTIVE',?,?,'STANDARD','CATALOG',?,?,?)`,
      id, item.name, item.description, item.images[0], JSON.stringify(item.images.slice(1)),
      brand.id, brand.name, category?.name ?? item.category, category?.id ?? null,
      item.salePriceTND, item.salePriceTND, item.compareAtTND ?? null,
      code, item.key, JSON.stringify({ size: sizeLabel, sections: FICHE_SECTIONS[family] }), now, now,
    );

    item.images.forEach((url, position) => {
      db.run(
        `INSERT INTO catalogue_media (id, product_id, variant_id, media_type, url, alt_text, sort_order, is_primary, created_at, updated_at)
         VALUES (?,?,NULL,'IMAGE',?,?,?,?,?,?)`,
        `media_${id}_${position + 1}`, id, url, item.name, position, position === 0 ? 1 : 0, now, now,
      );
    });

    for (const [position, size] of item.sizes.entries()) {
      const sizeKey = slug(size) || 'unique';
      const variantId = `var_${id}_${sizeKey}`;
      db.run(
        `INSERT INTO catalogue_variants (id, product_id, sku, barcode, size, color, status, sort_order, created_at, updated_at)
         VALUES (?,?,?,NULL,?,?,'ACTIVE',?,?,?)`,
        variantId, id, `${code}-${sizeKey.toUpperCase()}`, size, item.color, position, now, now,
      );
      db.run(
        `INSERT INTO inventory_stock_items (id, product_id, variant_id, location, quantity, reorder_point, status, last_movement_at, created_at, updated_at)
         VALUES (?,?,?,'MAIN',?,2,'ACTIVE',?,?,?)`,
        `stock_${variantId}`, id, variantId, item.stockPerSize, now, now, now,
      );
    }

    const fields = [
      ...item.fields,
      { key: 'reference_marque', label: 'Référence marque', value: item.sku },
    ];
    for (const [position, field] of fields.entries()) {
      const section = FIELD_SECTION[field.key] ?? 'pratique';
      if (!db.get('SELECT id FROM catalogue_attributes WHERE attribute_key=?', field.key)) {
        db.run(
          `INSERT INTO catalogue_attributes (id, attribute_key, label, data_type, applies_to, options, families, section, status, sort_order, created_at, updated_at)
           VALUES (?,?,?,'TEXT','product','[]','[]',?,'ACTIVE',?,?,?)`,
          `attr_${field.key}`, field.key, field.label, section, 10 + position, now, now,
        );
      }
      db.run(
        `INSERT INTO catalogue_attribute_values (id, attribute_key, product_id, variant_id, value_text, created_at, updated_at)
         VALUES (?,?,?,NULL,?,?,?)`,
        `attrv_${id}_${field.key}`, field.key, id, field.value, now, now,
      );
    }
    created += 1;
  }
  return created;
}

/**
 * Reels du propriétaire : les deux clips qui montrent des articles du nouveau
 * catalogue (défilé → vêtements, baskets → chaussures) reçoivent leurs produits.
 * Les autres (bijoux, maison, parfum) restent sans produit plutôt que d'afficher
 * un article sans rapport.
 */
export const OFFICIAL_REEL_PRODUCTS: Record<string, string[]> = {
  reel_owner_clothing_v1: ['zara-pleated-mini-dress', 'tnf-1996-retro-nuptse', 'levis-501-original', 'hm-relaxed-cotton-shirt'],
  reel_owner_shoes_v1: ['converse-chuck-taylor-hi', 'new-balance-574-core'],
};

/** Pose les produits des Reels du propriétaire (lien de contenu ordonné + premier produit). */
export function linkOfficialReelProducts(db: QatafoDatabase, now = new Date().toISOString()): number {
  let linked = 0;
  for (const [reelId, keys] of Object.entries(OFFICIAL_REEL_PRODUCTS)) {
    if (!db.get('SELECT id FROM reels WHERE id=?', reelId)) continue;
    const ids = keys.map(officialProductId).filter((id) => db.get('SELECT id FROM products WHERE id=?', id));
    if (ids.length === 0) continue;
    setContentProducts(db, 'reel', reelId, ids, now);
    db.run("UPDATE reels SET content_mode='shoppable', product_id=?, updated_at=? WHERE id=?", ids[0], now, reelId);
    linked += 1;
  }
  return linked;
}
