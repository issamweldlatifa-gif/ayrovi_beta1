/**
 * Fiche produit publique — ce que le CRM remplit doit ARRIVER à l'application.
 *
 * Le défaut corrigé le 24/10/2026 : les photos supplémentaires et la vidéo
 * vivaient dans `catalogue_media`, mais `GET /api/public/products/:id` ne
 * renvoyait que `products.image` (le miroir de la principale). On pouvait donc
 * téléverser dix images et une vidéo depuis le CRM et n'en voir qu'une.
 *
 * Ce test crée un vrai produit (famille → sous-catégorie, deux images, une
 * vidéo, deux attributs dont un vide), puis lit la réponse publique :
 *   • la famille est la RACINE de l'arbre, pas une liste en dur ;
 *   • la galerie contient les deux images, la principale en tête ;
 *   • la vidéo est exposée à part (elle ne remplace jamais la photo) ;
 *   • un attribut sans valeur ne sort pas.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';

/**
 * `better-sqlite3` est un module natif : il se compile/installe avec les scripts
 * npm. Dans un bac à sable où cette compilation est impossible (pas d'en-têtes
 * Node téléchargeables), la suite est **sautée explicitement** — jamais
 * contournée en silence. En CI, où la dépendance est construite, elle tourne.
 */
const sqliteAvailable = (() => {
  try {
    require.resolve('better-sqlite3');
    // Le module se résout même sans binaire compilé : on vérifie qu'il CHARGE.
    const Database = require('better-sqlite3');
    const probe = new Database(':memory:');
    probe.close();
    return true;
  } catch {
    return false;
  }
})();

let app: any;
let db: any;

const NOW = new Date().toISOString();
const FAMILY = 'cat_test_family';
const CHILD = 'cat_test_child';
const PRODUCT = 'prd_test_fiche_media';

function cleanup() {
  db.run('DELETE FROM catalogue_attribute_values WHERE product_id=?', PRODUCT);
  db.run("DELETE FROM catalogue_attributes WHERE attribute_key IN ('test_material','test_care')");
  db.run('DELETE FROM catalogue_media WHERE product_id=?', PRODUCT);
  db.run('DELETE FROM products WHERE id=?', PRODUCT);
  db.run('DELETE FROM catalogue_categories WHERE id IN (?,?)', CHILD, FAMILY);
}

describe.skipIf(!sqliteAvailable)('GET /api/public/products/:id — la fiche reçoit tout le CRM', () => {
beforeAll(async () => {
  ({ app, db } = await import('../src/server'));
  cleanup();
  db.run(
    `INSERT INTO catalogue_categories (id,name,slug,parent_id,status,sort_order,description,created_at,updated_at)
     VALUES (?,?,?,NULL,'ACTIVE',1,'',?,?)`,
    FAMILY, 'ملابس نساء', 'test-femme', NOW, NOW,
  );
  db.run(
    `INSERT INTO catalogue_categories (id,name,slug,parent_id,status,sort_order,description,created_at,updated_at)
     VALUES (?,?,?,?,'ACTIVE',1,'',?,?)`,
    CHILD, 'جاكيتات', 'test-jackets', FAMILY, NOW, NOW,
  );
  db.run(
    `INSERT INTO products (id,name,description,image,additional_images,category,category_id,source_url,
       original_price,currency,final_price,stock_status,status,visibility,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    PRODUCT, 'Veste en cuir test', 'Une veste décrite par le CRM.', 'https://cdn.example/primary.jpg',
    '[]', 'جاكيتات', CHILD, 'https://example.com/p', 100, 'EUR', 249, 'AVAILABLE', 'ACTIVE', 'CATALOG', NOW, NOW,
  );
  // Deux images dans le catalogue : la principale puis une seconde.
  db.run(
    `INSERT INTO catalogue_media (id,product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at)
     VALUES (?,?,NULL,'IMAGE',?,'',1,1,?,?)`,
    'med_test_1', PRODUCT, 'https://cdn.example/primary.jpg', NOW, NOW,
  );
  db.run(
    `INSERT INTO catalogue_media (id,product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at)
     VALUES (?,?,NULL,'IMAGE',?,'',2,0,?,?)`,
    'med_test_2', PRODUCT, 'https://cdn.example/second.jpg', NOW, NOW,
  );
  db.run(
    `INSERT INTO catalogue_media (id,product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at)
     VALUES (?,?,NULL,'VIDEO',?,'',3,0,?,?)`,
    'med_test_3', PRODUCT, 'https://cdn.example/reel.mp4', NOW, NOW,
  );
  db.run(
    `INSERT INTO catalogue_attributes (id,attribute_key,label,data_type,applies_to,options,status,sort_order,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    'attr_test_material', 'test_material', 'الخامة', 'TEXT', 'product', '[]', 'ACTIVE', 1, NOW, NOW,
  );
  db.run(
    `INSERT INTO catalogue_attributes (id,attribute_key,label,data_type,applies_to,options,status,sort_order,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    'attr_test_care', 'test_care', 'العناية', 'TEXT', 'product', '[]', 'ACTIVE', 2, NOW, NOW,
  );
  db.run(
    `INSERT INTO catalogue_attribute_values (id,attribute_key,product_id,variant_id,value_text,created_at,updated_at)
     VALUES (?,?,?,NULL,?,?,?)`,
    'val_test_1', 'test_material', PRODUCT, 'جلد طبيعي', NOW, NOW,
  );
  // Attribut déclaré mais VIDE : il ne doit pas sortir (la donnée absente disparaît).
  db.run(
    `INSERT INTO catalogue_attribute_values (id,attribute_key,product_id,variant_id,value_text,created_at,updated_at)
     VALUES (?,?,?,NULL,?,?,?)`,
    'val_test_2', 'test_care', PRODUCT, '   ', NOW, NOW,
  );
});

afterAll(cleanup);

  test('famille = racine de l’arbre (donnée du CRM, pas une liste en dur)', async () => {
    const response = await request(app).get(`/api/public/products/${PRODUCT}`);
    expect(response.status).toBe(200);
    expect(response.body.data.family).toEqual({ id: FAMILY, name: 'ملابس نساء', slug: 'test-femme' });
  });

  test('galerie : toutes les images du catalogue, principale d’abord', async () => {
    const response = await request(app).get(`/api/public/products/${PRODUCT}`);
    expect(response.body.data.sheet.images).toEqual([
      'https://cdn.example/primary.jpg',
      'https://cdn.example/second.jpg',
    ]);
  });

  test('la vidéo est exposée à part et ne remplace pas la photo', async () => {
    const response = await request(app).get(`/api/public/products/${PRODUCT}`);
    expect(response.body.data.sheet.videos).toEqual(['https://cdn.example/reel.mp4']);
    expect(response.body.data.sheet.images[0]).toBe('https://cdn.example/primary.jpg');
  });

  test('attributs : libellé + valeur, dans l’ordre du CRM, vides exclus', async () => {
    const response = await request(app).get(`/api/public/products/${PRODUCT}`);
    // `section` fait partie du contrat public depuis 6bf7bb5 (sections d'attributs
    // pilotées par le CRM) : '' quand l'attribut n'est rattaché à aucune section.
    expect(response.body.data.attributes).toEqual([
      { key: 'test_material', label: 'الخامة', type: 'TEXT', section: '', value: 'جلد طبيعي' },
    ]);
  });
});
