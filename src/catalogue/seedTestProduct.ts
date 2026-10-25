/**
 * PRODUIT DE TEST FIXE — celui sur lequel on vérifie la fiche dans l'application.
 *
 * Demandé le 25/10/2026 : « حطّ produit ثابت، 100 قطعة متوفّرة، بالصور ». Il ne
 * s'agit donc pas d'une décoration : c'est une ligne réelle du catalogue, créée
 * une seule fois à l'installation, avec
 *   • deux couleurs ET cinq tailles (donc dix SKU, la vraie matrice) ;
 *   • cent pièces disponibles (dix par SKU, dans `inventory_stock_items`) ;
 *   • des photos servies par le serveur (`/media/catalogue/...`) ;
 *   • des noms de blocs et de sections écrits comme sur la maquette.
 *
 * Ce que ce fichier refuse de faire :
 *   • écraser un produit existant : si la ligne (par identifiant OU par slug)
 *     existe déjà, on ne touche à RIEN — le propriétaire peut l'avoir modifiée
 *     depuis le CRM, sa saisie gagne toujours ;
 *   • inventer un prix calculé : `original_price` reste 0 (aucun prix source),
 *     `final_price` est le prix de vente saisi, et le moteur de change ne le
 *     recalcule pas (une ligne à prix source nul est ignorée par le recalcul) ;
 *   • toucher au stock existant : les lignes créées ici ne sont posées que si
 *     la variante n'en a aucune.
 */
import type { QatafoDatabase } from '../db/database';

export const TEST_PRODUCT_ID = 'product_test_baskets';
export const TEST_PRODUCT_SLUG = 'baskets-route-homme';
export const TEST_PRODUCT_NAME = 'Baskets route homme';
/** Prix de vente publié, en dinars — la même colonne que remplit le CRM. */
export const TEST_PRODUCT_PRICE = 89;
export const TEST_PRODUCT_SIZES = ['40', '41', '42', '43', '44'] as const;
export const TEST_PRODUCT_COLORS = ['Gris', 'Noir'] as const;
/** 5 tailles × 2 couleurs × 10 pièces = 100 pièces disponibles. */
export const TEST_PRODUCT_STOCK_PER_VARIANT = 10;
export const TEST_PRODUCT_IMAGE = '/media/catalogue/baskets-gris-1.jpg';
export const TEST_PRODUCT_IMAGES = [
  '/media/catalogue/baskets-gris-1.jpg',
  '/media/catalogue/baskets-gris-2.jpg',
  '/media/catalogue/baskets-noir-1.jpg',
] as const;

/** Codes courts de SKU par couleur (A-Z et « - » uniquement). */
const COLOR_SKU: Record<string, string> = { Gris: 'GR', Noir: 'NO' };
/** Photo de la variante : la couleur a SA photo, jamais celle d'une autre. */
const COLOR_IMAGE: Record<string, string> = {
  Gris: '/media/catalogue/baskets-gris-1.jpg',
  Noir: '/media/catalogue/baskets-noir-1.jpg',
};

/**
 * Les quatre champs de la fiche, rangés dans les trois sections de la maquette.
 * `label` est le libellé affiché ; `section` est le slug de l'accordéon.
 */
const FICHE_FIELDS: Array<{ key: string; label: string; value: string; section: string; sortOrder: number }> = [
  { key: 'material', label: 'Matière', value: 'Cuir pleine fleur', section: 'matiere', sortOrder: 10 },
  { key: 'care', label: 'Entretien', value: 'Nettoyage à sec, jamais en machine', section: 'matiere', sortOrder: 12 },
  { key: 'poids', label: 'Poids', value: '420 g (pointure 42)', section: 'mesures', sortOrder: 20 },
  { key: 'garantie', label: 'Garantie', value: '6 mois sur la couture et la semelle', section: 'pratique', sortOrder: 70 },
];

/** Noms des blocs, tels que le CRM les écrit (`products.fiche_labels`). */
const FICHE_LABELS = {
  sections: {
    matiere: 'Matière et entretien',
    mesures: 'Taille et mesures',
    pratique: 'Garantie et livraison',
  },
};

const slugPart = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]+/g, '-');

/**
 * Crée le produit de test. Retourne `true` s'il a été créé, `false` si la ligne
 * existait déjà (ou si la base refuse : on ne bloque jamais le démarrage).
 */
export function seedTestProduct(db: QatafoDatabase, now = new Date().toISOString()): boolean {
  const existing = db.get<{ id: string }>(
    'SELECT id FROM products WHERE id=? OR slug=?',
    TEST_PRODUCT_ID,
    TEST_PRODUCT_SLUG,
  );
  if (existing) return false;

  db.run(
    `INSERT INTO products (
       id, name, description, image, additional_images, brand_id, brand_name, category, category_id,
       source_url, source_platform, original_price, currency, converted_price, customs_fee, shipping_fee,
       service_fee, final_price, compare_at_price, express_available, stock_status, status,
       product_code, slug, product_type, visibility, fiche_labels, created_at, updated_at
     ) VALUES (?,?,?,?,?,NULL,?,?,NULL,'','ZAYROVI',0,'TND',?,0,0,0,?,NULL,0,'AVAILABLE','ACTIVE',
       'PRD-BSK-001',?,'STANDARD','CATALOG',?,?,?)`,
    TEST_PRODUCT_ID,
    TEST_PRODUCT_NAME,
    'Cuir pleine fleur, semelle crantée de 4 cm. Un classique qui va avec tout.',
    TEST_PRODUCT_IMAGE,
    JSON.stringify(TEST_PRODUCT_IMAGES.slice(1)),
    'ZAYROVI',
    'Chaussures',
    TEST_PRODUCT_PRICE, // converted_price : le prix publié, sans frais inventés
    TEST_PRODUCT_PRICE, // final_price
    TEST_PRODUCT_SLUG,
    JSON.stringify(FICHE_LABELS),
    now,
    now,
  );

  // Une photo principale au niveau du produit (la galerie), puis la photo de
  // chaque variante — c'est ce qui donne « la photo du gris » et « la photo du noir ».
  db.run(
    `INSERT INTO catalogue_media (id, product_id, variant_id, media_type, url, alt_text, sort_order, is_primary, created_at, updated_at)
     VALUES (?,?,NULL,'IMAGE',?,'',0,1,?,?)`,
    `media_${TEST_PRODUCT_ID}_main`, TEST_PRODUCT_ID, TEST_PRODUCT_IMAGE, now, now,
  );
  TEST_PRODUCT_IMAGES.slice(1).forEach((url, index) => {
    db.run(
      `INSERT INTO catalogue_media (id, product_id, variant_id, media_type, url, alt_text, sort_order, is_primary, created_at, updated_at)
       VALUES (?,?,NULL,'IMAGE',?,'',?,0,?,?)`,
      `media_${TEST_PRODUCT_ID}_${index + 2}`, TEST_PRODUCT_ID, url, 20 + index, now, now,
    );
  });

  let position = 100;
  for (const color of TEST_PRODUCT_COLORS) {
    for (const size of TEST_PRODUCT_SIZES) {
      const variantId = `var_${TEST_PRODUCT_ID}_${COLOR_SKU[color]}_${size}`;
      const sku = `ZY-BSK-${COLOR_SKU[color]}-${size}`;
      db.run(
        `INSERT INTO catalogue_variants (id, product_id, sku, barcode, size, color, status, sort_order, created_at, updated_at)
         VALUES (?,?,?,NULL,?,?,'ACTIVE',?,?,?)`,
        variantId, TEST_PRODUCT_ID, sku, size, color, position, now, now,
      );
      position += 1;
      const stockId = `stock_${variantId}`;
      const already = db.get<{ id: string }>('SELECT id FROM inventory_stock_items WHERE product_id=? AND variant_id=?', TEST_PRODUCT_ID, variantId);
      if (!already) {
        db.run(
          `INSERT INTO inventory_stock_items (id, product_id, variant_id, location, quantity, reorder_point, status, last_movement_at, created_at, updated_at)
           VALUES (?,?,?, 'MAIN', ?,2,'ACTIVE',?,?,?)`,
          stockId, TEST_PRODUCT_ID, variantId, TEST_PRODUCT_STOCK_PER_VARIANT, now, now, now,
        );
      }
      const image = COLOR_IMAGE[color];
      if (image) {
        db.run(
          `INSERT INTO catalogue_media (id, product_id, variant_id, media_type, url, alt_text, sort_order, is_primary, created_at, updated_at)
           VALUES (?,?,?,'IMAGE',?,?,10,0,?,?)`,
          `media_${variantId}`, TEST_PRODUCT_ID, variantId, image, color, now, now,
        );
      }
    }
  }

  // Les champs de la fiche : l'attribut n'est créé que s'il n'est pas déjà
  // déclaré (la matrice du catalogue reste la propriétaire des attributs).
  for (const field of FICHE_FIELDS) {
    const declared = db.get<{ id: string }>('SELECT id FROM catalogue_attributes WHERE attribute_key=?', field.key);
    if (!declared) {
      db.run(
        `INSERT INTO catalogue_attributes (id, attribute_key, label, data_type, applies_to, options, families, section, status, sort_order, created_at, updated_at)
         VALUES (?,?,?,'TEXT','product','[]','[]',?,'ACTIVE',?,?,?)`,
        `attr_${field.key}`, field.key, field.label, field.section, field.sortOrder, now, now,
      );
    }
    db.run(
      `INSERT INTO catalogue_attribute_values (id, attribute_key, product_id, variant_id, value_text, created_at, updated_at)
       VALUES (?,?,?,NULL,?,?,?)`,
      `attrv_${TEST_PRODUCT_ID}_${field.key}`, field.key, TEST_PRODUCT_ID, field.value, now, now,
    );
  }

  return true;
}

/** Nom de SKU déterministe — exporté pour que les tests n'inventent pas le leur. */
export function testProductSku(color: string, size: string): string {
  return `ZY-BSK-${COLOR_SKU[color] ?? slugPart(color)}-${size}`;
}
