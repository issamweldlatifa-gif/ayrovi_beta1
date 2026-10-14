/**
 * PANIER CATALOGUE — un seul prix, celui de la boutique (08/10/2026).
 *
 * Le défaut fermé : `POST /api/cart/items` REcalcule le prix depuis
 * `sourcePrice` + `sourceCurrency`. Un produit du catalogue porte déjà son
 * prix publié (`final_price`). Repasser par le calcul produisait un DEUXIÈME
 * prix pour le même article — parfois différent (frais de catégorie, devise,
 * arrondis) — et l'application affichait deux chiffres pour une même chose.
 *
 * C'est ce défaut qui avait fait retirer le bouton « ajouter au panier » de
 * l'écran produit (Q1). `POST /api/cart/catalog` le répare : le prix de la
 * ligne est **exactement** `final_price`, ni recalculé ni réinterprété.
 */
import { afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';

const created: string[] = [];

function makeProduct(over: Record<string, unknown> = {}) {
  const id = `catalogtest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO products (id,name,description,image,additional_images,brand_id,brand_name,category,
      source_url,source_platform,original_price,currency,converted_price,customs_fee,shipping_fee,
      service_fee,final_price,express_available,stock_status,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    String(over.name ?? 'Produit catalogue test'),
    'description test',
    '/uploads/p.jpg',
    '[]',
    null,
    'SHEIN',
    'MODE',
    'https://shein.example/p/test',
    'SHEIN',
    Number(over.original_price ?? 20),
    String(over.currency ?? 'EUR'),
    Number(over.converted_price ?? 67),
    Number(over.customs_fee ?? 10),
    Number(over.shipping_fee ?? 8),
    Number(over.service_fee ?? 5),
    Number(over.final_price ?? 90),
    0,
    String(over.stock_status ?? 'AVAILABLE'),
    'ACTIVE',
    now,
    now,
  );
  created.push(id);
  return id;
}

afterAll(() => {
  for (const id of created) {
    try {
      db.run('DELETE FROM products WHERE id=?', id);
      db.run('DELETE FROM cart_items WHERE external_id=?', `catalog-${id}`);
    } catch {
      /* nettoyage best-effort */
    }
  }
});

const post = (body: Record<string, unknown>, session: string) =>
  request(app).post('/api/cart/catalog').set('x-session-id', session).send(body);

describe('POST /api/cart/catalog', () => {
  test('le prix de la ligne est `final_price` — PAS un prix recalculé', async () => {
    const productId = makeProduct({ original_price: 20, currency: 'EUR', final_price: 137.55 });
    const session = `sess-catalog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const response = await post({ productId }, session);
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const line = response.body.cartItem;
    expect(Number(line.priceTND)).toBe(137.55);
    // La preuve : un recalcul depuis 20 € ne donnerait pas 137.55 TND.
    expect(Number(line.priceTND)).not.toBe(Number(line.sourcePrice));
    expect(line.priceVerificationStatus).toBe('VERIFIED');
  });

  test('un produit SANS prix publié est refusé (409 NO_PRICE), pas ajouté à 0.00', async () => {
    const productId = makeProduct({ final_price: 0 });
    const session = `sess-catalog-np-${Date.now()}`;

    const response = await post({ productId }, session);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('NO_PRICE');
  });

  test('un produit épuisé est refusé (409 OUT_OF_STOCK)', async () => {
    const productId = makeProduct({ stock_status: 'OUT_OF_STOCK' });
    const session = `sess-catalog-oos-${Date.now()}`;

    const response = await post({ productId }, session);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('OUT_OF_STOCK');
  });

  test('un identifiant invalide est refusé (400) — pas de requête SQL', async () => {
    const response = await post({ productId: "'; DROP TABLE products; --" }, `sess-catalog-bad-${Date.now()}`);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_PRODUCT');
  });

  test('un produit inexistant est 404, pas 500', async () => {
    const response = await post({ productId: 'introuvable' }, `sess-catalog-404-${Date.now()}`);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  test('la quantité est bornée à 1..99', async () => {
    const productId = makeProduct();
    const session = `sess-catalog-qty-${Date.now()}`;

    const response = await post({ productId, quantity: 500 }, session);
    expect(response.status).toBe(201);
    expect(Number(response.body.cartItem.quantity)).toBe(99);
  });

  test('le même produit deux fois ⇒ la ligne est FUSIONNÉE (pas dupliquée)', async () => {
    const productId = makeProduct();
    const session = `sess-catalog-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await post({ productId }, session);
    const second = await post({ productId }, session);
    expect(second.status).toBe(201);
    expect(Number(second.body.cartItem.quantity)).toBe(2);
    expect(String(second.body.cartItem.externalId)).toBe(`catalog-${productId}`);
  });
});
