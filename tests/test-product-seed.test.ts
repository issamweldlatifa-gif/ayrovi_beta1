/**
 * PRODUIT DE TEST FIXE — cent pièces, trois photos, deux couleurs, cinq tailles.
 *
 * Ce que ce test prouve, de bout en bout : la ligne créée par l'installation est
 * LISIBLE par l'application, avec exactement ce que la maquette demande —
 *   • la fiche est publiée (prix > 0, statut ACTIVE) donc `purchasable` ;
 *   • cent pièces disponibles au total (dix par SKU, dix SKU) ;
 *   • une galerie de trois photos servies par le serveur (`/media/...`) ;
 *   • une photo par couleur, jamais empruntée à l'autre ;
 *   • les noms de blocs et de sections écrits comme dans le CRM ;
 *   • deux relances de l'installation n'écrasent pas une ligne modifiée à la main.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';

const sqliteAvailable = (() => {
  try {
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

beforeAll(async () => {
  ({ app, db } = await import('../src/server'));
});

describe.skipIf(!sqliteAvailable)('produit de test — ce que l’écran reçoit', () => {
  test('la fiche est publiée, avec un prix et les noms de blocs du CRM', async () => {
    const response = await request(app).get('/api/public/products/product_test_baskets');
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.name).toBe('Baskets route homme');
    expect(data.finalPrice).toBe(89);
    expect(data.currency).toBe('TND');
    // Aucun prix barré, aucune remise : la maquette n'en a pas.
    expect(data.compareAtPrice).toBeNull();
    expect(data.ficheLabels.sections.matiere).toBe('Matière et entretien');
    expect(data.ficheLabels.sections.mesures).toBe('Taille et mesures');
    expect(data.ficheLabels.sections.pratique).toBe('Garantie et livraison');
  });

  test('cent pièces disponibles, dix SKU, deux couleurs et cinq tailles', async () => {
    const { body } = await request(app).get('/api/public/products/product_test_baskets');
    const sheet = body.data.sheet;
    expect(sheet.purchasable).toBe(true);
    expect(sheet.variants).toHaveLength(10);
    expect(sheet.variants.every((variant: any) => variant.available)).toBe(true);
    const total = sheet.variants.reduce((sum: number, variant: any) => sum + Number(variant.stock ?? 0), 0);
    expect(total).toBe(100);
    const sizes = sheet.dimensions.find((dimension: any) => dimension.key === 'size');
    const colors = sheet.dimensions.find((dimension: any) => dimension.key === 'color');
    expect(sizes.values.map((value: any) => value.value)).toEqual(['40', '41', '42', '43', '44']);
    expect(colors.values.map((value: any) => value.value)).toEqual(['Gris', 'Noir']);
    expect(sizes.values.every((value: any) => value.available)).toBe(true);
  });

  test('trois photos, la principale en tête, une photo par couleur', async () => {
    const { body } = await request(app).get('/api/public/products/product_test_baskets');
    const images: string[] = body.data.sheet.images;
    expect(images[0]).toBe('/media/catalogue/baskets-gris-1.jpg');
    expect(images).toContain('/media/catalogue/baskets-gris-2.jpg');
    expect(images).toContain('/media/catalogue/baskets-noir-1.jpg');
    const grey = body.data.sheet.variants.find((variant: any) => variant.color === 'Gris');
    const black = body.data.sheet.variants.find((variant: any) => variant.color === 'Noir');
    expect(grey.images).toEqual(['/media/catalogue/baskets-gris-1.jpg']);
    expect(black.images).toEqual(['/media/catalogue/baskets-noir-1.jpg']);
  });

  test('les champs de la fiche arrivent avec leur libellé, dans leur section', async () => {
    const { body } = await request(app).get('/api/public/products/product_test_baskets');
    const byKey = Object.fromEntries(body.data.attributes.map((attribute: any) => [attribute.key, attribute]));
    expect(byKey.material).toMatchObject({ label: 'Matière', section: 'matiere', value: 'Cuir pleine fleur' });
    expect(byKey.care.section).toBe('matiere');
    expect(byKey.poids.section).toBe('mesures');
    expect(byKey.garantie.section).toBe('pratique');
  });

  test('les photos sont réellement servies (pas seulement écrites en base)', async () => {
    const response = await request(app).get('/media/catalogue/baskets-gris-1.jpg');
    expect(response.status).toBe(200);
    expect(String(response.headers['content-type'])).toContain('image/jpeg');
  });

  test('relancer l’installation ne réécrit pas le produit (la saisie du CRM gagne)', async () => {
    const { seedTestProduct } = await import('../src/catalogue/seedTestProduct');
    db.run("UPDATE products SET name='Baskets route homme — édition' WHERE id='product_test_baskets'");
    expect(seedTestProduct(db)).toBe(false);
    const row = db.get<any>('SELECT name FROM products WHERE id=?', 'product_test_baskets');
    expect(row.name).toBe('Baskets route homme — édition');
    db.run("UPDATE products SET name='Baskets route homme' WHERE id='product_test_baskets'");
  });
});
