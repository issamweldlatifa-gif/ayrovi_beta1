import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { tunisIsoDay } from '../src/services/promotions';

const session = `price-flow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const sessionHeaders = { 'x-session-id': session };

// Test-only source examples. The application itself never ships sample products.
const cases = [
  { title: 'Chaussures de running', sourcePrice: 44.99, sourceCurrency: 'EUR', variant: 'Pointure 42' },
  { title: 'Robe en coton', sourcePrice: 21.99, sourceCurrency: 'EUR', variant: 'Taille M' },
  { title: 'Sérum soin visage 50 ml', sourcePrice: 18.30, sourceCurrency: 'EUR', variant: 'Contenance 50 ml' },
  { title: 'Eau de parfum 30 ml', sourcePrice: 58, sourceCurrency: 'EUR', variant: 'Contenance 30 ml' },
  { title: 'Smartphone Android', sourcePrice: 260, sourceCurrency: 'USD' },
  { title: 'Ordinateur portable laptop', sourcePrice: 485, sourceCurrency: 'USD' },
  { title: 'Écouteurs sans fil', sourcePrice: 23, sourceCurrency: 'EUR' },
  { title: 'Canapé trois places', sourcePrice: 120, sourceCurrency: 'EUR' },
  { title: 'Objet générique sans variante', sourcePrice: 10, sourceCurrency: 'EUR' },
];

const formatted = (value: number) => value.toLocaleString('fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';

describe('the product quote is exactly the cart line and checkout pricing source', () => {
  afterAll(() => db.clearCart(session));

  it.each(cases)('$title: sourced quote equals cart price, even if the client sends a forged total', async (product) => {
    const { title, sourcePrice, sourceCurrency } = product;
    const quote = await request(app).post('/api/public/pricing/cart-line')
      .send({ title, sourcePrice, sourceCurrency, quantity: 1 });
    expect(quote.status).toBe(200);
    expect(quote.body.data.lineTotalTND).toBeGreaterThan(0);
    // The cart consumes the source price. Client priceTND is not trusted.
    const added = await request(app).post('/api/cart/items').set(sessionHeaders).send({
      store: 'generic', externalId: null, url: `https://shop.example/item/${encodeURIComponent(title)}`,
      title, imageUrl: '', sourcePrice, sourceCurrency, priceTND: 1, quantity: 1,
      variant: 'variant' in product ? product.variant : undefined,
    });
    expect(added.status).toBe(201);
    const cart = await request(app).get('/api/cart/items').set(sessionHeaders);
    expect(cart.body.success).toBe(true);
    const line = cart.body.items.find((item: { title: string }) => item.title === title);
    expect(line.lineTotalTND).toBe(quote.body.data.lineTotalTND);
    expect(formatted(line.lineTotalTND)).toBe(formatted(quote.body.data.lineTotalTND));
    expect(cart.body.totalTND).toBe(added.body.totalTND);
    expect(cart.body.totalTND).toBeCloseTo(cart.body.items.reduce((sum: number, item: { lineTotalTND: number }) => sum + item.lineTotalTND, cart.body.deliveryTND), 3);
  });

  it('a quantity change re-quotes the exact line, not a guessed unit-price multiplication', async () => {
    const item = (await request(app).get('/api/cart/items').set(sessionHeaders)).body.items[0];
    const changed = await request(app).patch(`/api/cart/items/${item.id}`).set(sessionHeaders).send({ quantity: 3 });
    expect(changed.status).toBe(200);
    const quote = await request(app).post('/api/public/pricing/cart-line').send({
      title: item.title, sourcePrice: item.sourcePrice, sourceCurrency: item.sourceCurrency, quantity: 3,
    });
    const cart = await request(app).get('/api/cart/items').set(sessionHeaders);
    expect(cart.body.items.find((current: { id: string }) => current.id === item.id).lineTotalTND).toBe(quote.body.data.lineTotalTND);
  });

  it('when a server promotion is active, both views show the same discounted line and original', async () => {
    const dayId = `day_${tunisIsoDay()}`;
    const rule = db.get<{ active: number }>('SELECT active FROM promo_rules WHERE id=?', dayId)!;
    db.run('UPDATE promo_rules SET active=1 WHERE id=?', dayId);
    try {
      const product = { title: 'Gel soin du visage 50 ml', sourcePrice: 24, sourceCurrency: 'EUR', quantity: 1 };
      const quote = await request(app).post('/api/public/pricing/cart-line').send(product);
      const added = await request(app).post('/api/cart/items').set(sessionHeaders).send({ ...product,
        store: 'generic', externalId: null, url: 'https://shop.example/promoted', imageUrl: '', priceTND: -123,
      });
      expect(added.status).toBe(201);
      const cart = await request(app).get('/api/cart/items').set(sessionHeaders);
      const line = cart.body.items.find((item: { title: string }) => item.title === product.title);
      expect(quote.body.data.promo).not.toBeNull();
      expect(line.promo?.percent).toBe(quote.body.data.promo.percent);
      expect(line.lineTotalTND).toBe(quote.body.data.lineTotalTND);
      expect(line.originalLineTotalTND).toBe(quote.body.data.originalLineTotalTND);
    } finally {
      db.run('UPDATE promo_rules SET active=? WHERE id=?', rule.active, dayId);
    }
  });

  it('empty carts have neither a fabricated total nor a delivery charge', async () => {
    db.clearCart(session);
    const empty = await request(app).get('/api/cart/items').set(sessionHeaders);
    expect(empty.body.items).toEqual([]);
    expect(empty.body.deliveryTND).toBe(0);
    expect(empty.body.totalTND).toBe(0);
  });
});
