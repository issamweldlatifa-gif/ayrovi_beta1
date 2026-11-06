import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import {
  SELECTION,
  selectionId,
  installPublicationSelection,
} from '../src/catalogue/installPublicationSelection';
import {
  inspectCatalogueSale,
  reserveCatalogueSale,
  releaseCatalogueReservations,
} from '../src/catalogue/localSale';
import { quoteCartLine } from '../src/services/cartQuote';

describe('Owner-approved ten-product catalogue and Publication experience', () => {
  test('ten real products, approved prices, genuine images, exactly 100 units and auditable opening movements', async () => {
    for (const item of SELECTION.products) {
      const id = selectionId(item.key);
      const response = await request(app).get('/api/public/products/' + id);
      expect(response.status).toBe(200);
      const product = db.get<any>('SELECT * FROM products WHERE id=?', id);
      expect(product.final_price).toBe(item.salePriceTND);
      expect(product.currency).toBe('TND');
      expect(product.original_price).toBe(0);
      expect(
        db.get<any>(
          'SELECT SUM(quantity) n FROM inventory_stock_items WHERE product_id=?',
          id
        ).n
      ).toBe(10);
      expect(
        db.get<any>(
          "SELECT SUM(quantity) n FROM inventory_stock_movements WHERE product_id=? AND reason='OPENING_BALANCE'",
          id
        ).n
      ).toBe(10);
      expect((await request(app).get(product.image)).status).toBe(200);
      const variants = db
        .all<any>('SELECT size FROM catalogue_variants WHERE product_id=?', id)
        .map((v) => v.size)
        .sort();
      expect(variants).toEqual(Object.keys(item.stock).sort());
    }
  });
  test('all known example posts have supplied media, coherent catalogue links and an actionable discovery entry', async () => {
    const feed = (
      await request(app).get('/api/public/social/publication-feed?limit=30')
    ).body.data.items;
    const examples = feed.filter(
      (p: any) =>
        p.id.startsWith('publication_showcase_') ||
        p.id.startsWith('publication_editorial_') ||
        ['pub_post_01', 'pub_post_02'].includes(p.id)
    );
    expect(examples).toHaveLength(13);
    for (const item of examples) {
      expect(item.image_url).toContain('/catalogue/publication-selection/');
      expect(item.action_label).toBeTruthy();
      expect(item.products.length).toBeGreaterThan(0);
      expect(
        JSON.parse(item.media_json).every((m: any) => m.fit === 'contain')
      ).toBe(true);
    }
  });
  test('does not reset catalogue price or consumed stock on reinstallation', () => {
    const id = selectionId('ordinary-hair-density');
    const stock = db.get<any>(
      'SELECT * FROM inventory_stock_items WHERE product_id=?',
      id
    );
    const product = db.get<any>('SELECT * FROM products WHERE id=?', id);
    try {
      db.run(
        'UPDATE inventory_stock_items SET quantity=7 WHERE id=?',
        stock.id
      );
      db.run('UPDATE products SET final_price=81 WHERE id=?', id);
      installPublicationSelection(db);
      expect(
        db.get<any>(
          'SELECT quantity FROM inventory_stock_items WHERE id=?',
          stock.id
        ).quantity
      ).toBe(7);
      expect(
        db.get<any>('SELECT final_price FROM products WHERE id=?', id)
          .final_price
      ).toBe(81);
    } finally {
      db.run(
        'UPDATE inventory_stock_items SET quantity=? WHERE id=?',
        stock.quantity,
        stock.id
      );
      db.run(
        'UPDATE products SET final_price=? WHERE id=?',
        product.final_price,
        id
      );
    }
  });
  test('cart respects sizes, cumulative quantities and the published TND price without import charges', async () => {
    const productId = selectionId('ck-henley-white');
    const session = 'selection-cart-qa';
    const post = (body: object) =>
      request(app)
        .post('/api/cart/catalog')
        .set('x-session-id', session)
        .send({ productId, ...body });
    try {
      expect((await post({})).status).toBe(409);
      expect((await post({ requestedSize: 'L' })).body.code).toBe(
        'VARIANT_UNAVAILABLE'
      );
      expect((await post({ requestedSize: 'S', quantity: 4 })).body.code).toBe(
        'INSUFFICIENT_STOCK'
      );
      const result = await post({ requestedSize: 'S', quantity: 2 });
      expect(result.status).toBe(201);
      expect(result.body.cartItem.priceTND).toBe(165.006);
      expect((await post({ requestedSize: 'S', quantity: 2 })).body.code).toBe(
        'INSUFFICIENT_STOCK'
      );
      const cart = (
        await request(app).get('/api/cart/items').set('x-session-id', session)
      ).body;
      expect(cart.items[0].availability).toBe('available');
      expect(cart.items[0].priceTrustReason).toBe('CATALOGUE_CURRENT_PRICE');
      expect(
        (
          await request(app)
            .patch('/api/cart/items/' + result.body.cartItem.id)
            .set('x-session-id', session)
            .send({ quantity: 4 })
        ).body.code
      ).toBe('INSUFFICIENT_STOCK');
      expect(db.getItems(session)[0].quantity).toBe(2);
      const line = db.getItems(session)[0];
      const quote = quoteCartLine(db, line);
      expect(quote.price.totalTND).toBe(330.012);
      expect(
        quote.price.customsFeeTND +
          quote.price.freightTND +
          quote.price.serviceFeeTND
      ).toBe(0);
    } finally {
      db.run('DELETE FROM cart_items WHERE session_id=?', session);
    }
  });
  test('reservation is atomic, prevents overselling and cancellation releases it only once', () => {
    const id = selectionId('mk-bri-ruched');
    const variant = inspectCatalogueSale(db, id, '42.5', '', 2);
    const orderId = 'selection-order-qa';
    try {
      db.transaction(() => {
        reserveCatalogueSale(
          db,
          {
            id: 'line-1',
            externalId: 'catalog-' + id,
            requestedSize: '42.5',
            quantity: 2,
          },
          orderId
        );
        expect(() => inspectCatalogueSale(db, id, '42.5', '', 1)).toThrow();
        releaseCatalogueReservations(db, orderId);
        releaseCatalogueReservations(db, orderId);
        expect(inspectCatalogueSale(db, id, '42.5', '', 2).available).toBe(2);
        throw new Error('ROLLBACK_QA');
      });
    } catch (error) {
      expect((error as Error).message).toBe('ROLLBACK_QA');
    }
    expect(
      db.get<any>(
        'SELECT quantity FROM inventory_stock_items WHERE id=?',
        variant.stocks[0].id
      ).quantity
    ).toBe(2);
    expect(
      db.get<any>(
        'SELECT COUNT(*) n FROM inventory_stock_movements WHERE reference_id=?',
        orderId
      ).n
    ).toBe(0);
  });
});

test('the existing order core charges the published price and reserves the selected SKU transactionally', () => {
  const accountId = 'selection-order-account';
  const session = 'selection-order-session';
  const id = selectionId('mk-bri-ruched');
  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      db.run(
        "INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,'Selection QA','ACTIVE',?,?)",
        accountId,
        now,
        now
      );
      db.addItem(
        session,
        {
          store: 'zayrovi',
          externalId: 'catalog-' + id,
          url: 'https://catalog.local/' + id,
          title: 'Ballerines',
          imageUrl: '/media/catalogue/publication-selection/mk-bri-ruched.jpg',
          sourcePrice: 454.904,
          sourceCurrency: 'TND',
          priceTND: 454.904,
          requestedSize: '42.5',
          requestedColor: 'Bordeaux',
          quantity: 2,
          priceVerificationStatus: 'VERIFIED',
        },
        accountId
      );
      const order = db.createOrderFromCart(
        session,
        {
          name: 'Selection QA',
          email: 'selection@example.test',
          phone: '22345678',
          governorate: 'Tunis',
          address: 'Adresse QA',
          paymentMethod: 'PENDING_SELECTION',
          latitude: null,
          longitude: null,
          locale: 'fr-TN',
          termsAcceptedAt: now,
        },
        accountId
      );
      expect(order.totalTND).toBeCloseTo(
        909.808 + db.getPricingRules().localDeliveryTND,
        3
      );
      expect(
        db.get<any>(
          'SELECT product_id FROM order_items WHERE order_id=?',
          order.orderId
        ).product_id
      ).toBe(id);
      expect(() =>
        inspectCatalogueSale(db, id, '42.5', 'Bordeaux', 1)
      ).toThrow();
      releaseCatalogueReservations(db, order.orderId);
      expect(
        inspectCatalogueSale(db, id, '42.5', 'Bordeaux', 2).available
      ).toBe(2);
      throw new Error('ROLLBACK_ORDER_QA');
    });
  } catch (error) {
    expect((error as Error).message).toBe('ROLLBACK_ORDER_QA');
  }
  expect(
    db.get('SELECT id FROM customer_accounts WHERE id=?', accountId)
  ).toBeUndefined();
});

test('an archived catalogue line remains readable and removable, but is not trusted for checkout', async () => {
  const productId = selectionId('ordinary-hair-density');
  const session = 'selection-archive-cart';
  try {
    const add = await request(app)
      .post('/api/cart/catalog')
      .set('x-session-id', session)
      .send({ productId });
    expect(add.status).toBe(201);
    db.run("UPDATE products SET status='ARCHIVED' WHERE id=?", productId);
    const cart = await request(app)
      .get('/api/cart/items')
      .set('x-session-id', session);
    expect(cart.status).toBe(200);
    expect(cart.body.items[0].availability).toBe('unavailable');
    expect(cart.body.items[0].priceTrust).toBe('STALE');
    expect(
      (
        await request(app)
          .delete('/api/cart/items/' + add.body.cartItem.id)
          .set('x-session-id', session)
      ).status
    ).toBe(200);
  } finally {
    db.run("UPDATE products SET status='ACTIVE' WHERE id=?", productId);
    db.run('DELETE FROM cart_items WHERE session_id=?', session);
  }
});
