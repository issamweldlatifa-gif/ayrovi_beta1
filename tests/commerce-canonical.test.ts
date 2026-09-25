import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { normalizeSerpApiMatch, normalizeCatalogRow, priceCommerceProduct, projectCandidate, projectProduct } from '../src/ayrovix/services/commerceProduct';
import { verifyCommerceProduct } from '../src/ayrovix/commerceQuote';
import { snapshotLinePrice } from '../src/ayrovix/cartPricing';
import { prepareProductOrder } from '../client/src/ayrovix/services/orderProduct';
import { validateProductForCart } from '../shared/commerceProduct';
import { listingIdentityUrl } from '../shared/listingIdentity';

const url = 'https://merchant-shop.com/products/womens-42?color=black&utm_source=lens';
const image = 'https://cdn.merchant-shop.com/images/sku-42.jpg';
const source = (overrides: Record<string, unknown> = {}) => ({
  title: 'Sourced sneaker model 2026', brand: 'Example', source: 'Merchant Shop', link: url,
  price: { value: 79.95, currency: 'EUR' }, original_price: { value: 99.95, currency: 'EUR' },
  thumbnail: image, images: [image, 'https://cdn.merchant-shop.com/images/sku-42-side.jpg'],
  description: 'Description published by the merchant.', rating: 4.2, reviews: 37,
  options: [
    { name: 'Size', options: [{ id: 's42', label: '42 EU', available: true }, { id: 's43', label: '43 EU', available: false }] },
    { name: 'Color', options: [{ id: 'black', label: 'Black' }, { id: 'white', label: 'White' }, { id: 'red', label: 'Red' }] },
  ],
  variants: [
    { id: 'merchant-42-black', attributes: { Size: 's42', Color: 'black' }, price: { value: 84.95, currency: 'EUR' }, available: true },
    { id: 'merchant-43-white', attributes: { Size: 's43', Color: 'white' }, price: { value: 89.95, currency: 'EUR' }, available: false },
  ],
  ...overrides,
});

describe('canonical product truth through results, detail, order and cart', () => {
  it('preserves URL provenance and all sourced fields, with a single signed price for each exact offer', () => {
    const product = priceCommerceProduct(db, normalizeSerpApiMatch(source()));
    const result = projectCandidate(product, 73);
    const detail = projectProduct(product);
    expect(result.canonical).toBe(product);
    expect(detail.canonical).toBe(product);
    expect(product.identity.source).toBe('serpapi');
    expect(product.identity.sourceUrl).toBe(url);
    expect(product.media.originalImages).toEqual([image, 'https://cdn.merchant-shop.com/images/sku-42-side.jpg']);
    expect(product.basic.description).toBe('Description published by the merchant.');
    expect(product.rating).toEqual({ value: 4.2, reviewCount: 37 });
    expect(product.pricing).toMatchObject({ sourcePrice: 79.95, sourceCurrency: 'EUR', referencePrice: 99.95 });
    expect(result.priceTnd).toBe(product.pricing.ayroviPriceTnd);
    expect(detail.priceTnd).toBe(result.priceTnd);
    expect(product.variants.groups.map(group => group.id)).toEqual(['size', 'color']);
    expect(product.variants.offers.map(offer => offer.id)).toEqual(['merchant-42-black', 'merchant-43-white']);
    expect(product.variants.offers[0]).toMatchObject({ selection: { size: 's42', color: 'black' }, sourcePrice: 84.95, sourceCurrency: 'EUR' });
    expect(verifyCommerceProduct(product)).toBe(true);
    const selected = { size: 's42', color: 'black' };
    const checked = validateProductForCart(product, selected, 2);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.price).toMatchObject({ sourcePrice: 84.95, sourceCurrency: 'EUR',
      unitPriceTnd: product.variants.offers[0].ayroviPriceTnd, offerId: 'merchant-42-black' });
    const order = prepareProductOrder(detail, { productUrl: url, selectedOptions: selected,
      quantity: 2, size: '42 EU', color: 'Black', note: 'Please pack safely', variantOption: null });
    expect(order).toMatchObject({ product, selectedVariants: selected, quantity: 2 });
    expect(order).not.toHaveProperty('priceTND');
    expect(order).not.toHaveProperty('sourcePrice');
  });

  it('preserves documented but unavailable variants and rejects unlisted combinations and invalid quantities', () => {
    const product = priceCommerceProduct(db, normalizeSerpApiMatch(source()));
    expect(product.variants.groups[0].options[1]).toMatchObject({ id: 's43', available: false });
    expect(validateProductForCart(product, {}, 1)).toMatchObject({ ok: false, reason: 'VARIANT_REQUIRED' });
    expect(validateProductForCart(product, { size: 's42', color: 'red' }, 1)).toMatchObject({ ok: false, reason: 'INVALID_VARIANT' });
    expect(validateProductForCart(product, { size: 's43', color: 'white' }, 1)).toMatchObject({ ok: false, reason: 'VARIANT_UNAVAILABLE' });
    expect(validateProductForCart(product, { size: '44', color: 'black' }, 1)).toMatchObject({ ok: false, reason: 'INVALID_VARIANT' });
    expect(validateProductForCart(product, { size: 's42', color: 'black' }, 100)).toMatchObject({ ok: false, reason: 'QUANTITY_INVALID' });
    expect(verifyCommerceProduct({ ...product, pricing: { ...product.pricing, ayroviPriceTnd: 1 } })).toBe(false);
    expect(verifyCommerceProduct({ ...product, media: { ...product.media, primaryImage: 'https://other-shop.com/unknown.png' } })).toBe(false);
    expect(verifyCommerceProduct({ ...product, variants: { groups: [], offers: [] } })).toBe(false);
  });

  it('does not borrow the general price for a source-listed variant without its own price', () => {
    const product = priceCommerceProduct(db, normalizeSerpApiMatch(source({
      variants: [{ id: 'merchant-42-black', attributes: { Size: 's42', Color: 'black' }, available: true }],
    })));
    expect(validateProductForCart(product, { size: 's42', color: 'black' }, 1))
      .toMatchObject({ ok: false, reason: 'VARIANT_PRICE_UNAVAILABLE' });
    const sole = priceCommerceProduct(db, normalizeSerpApiMatch(source({
      options: [{ name: 'Size', options: ['Only Size'] }],
      variants: [{ id: 'sole', attributes: { Size: 'Only Size' }, price: 85, available: true }],
    })));
    expect(sole.variants.groups[0].required).toBe(true);
    expect(validateProductForCart(sole, {}, 1)).toMatchObject({ ok: false, reason: 'VARIANT_REQUIRED' });
    expect(validateProductForCart(sole, { size: 'Only Size' }, 1)).toMatchObject({ ok: true });
  });

  it('keeps identical listing IDs stable across tracking params but distinct merchant variants separate', () => {
    const base = normalizeSerpApiMatch(source({ product_id: null }));
    const tracked = normalizeSerpApiMatch(source({ link: url.replace('utm_source=lens', 'utm_source=card') }));
    const variant = normalizeSerpApiMatch(source({ link: url.replace('color=black', 'color=white') }));
    expect(base.id).toBe(tracked.id);
    expect(base.id).not.toBe(variant.id);
    expect(base.identity.sourceUrl).not.toBe(tracked.identity.sourceUrl);
    expect(listingIdentityUrl(base.identity.sourceUrl!)).not.toContain('utm_source');
  });

  it.each([
    ['clothing size', 'Merchant coat', [{ name: 'Taille', options: ['M', 'L'] }], ['taille']],
    ['skincare shade and volume', 'Hydrating cream', [{ name: 'Shade', options: ['No 1', 'No 2'] }, { name: 'Volume', options: ['30 ml', '50 ml'] }], ['shade', 'volume']],
    ['phone storage and RAM', 'Mobile handset', [{ name: 'Storage', options: ['128 GB', '256 GB'] }, { name: 'RAM', options: ['8 GB', '12 GB'] }], ['storage', 'ram']],
    ['laptop CPU and memory', 'Portable computer', [{ name: 'Processor', options: ['A1', 'A2'] }, { name: 'Memory', options: ['8 GB', '16 GB'] }], ['processor', 'memory']],
    ['furniture material and dimensions', 'Office table', [{ name: 'Material', options: ['Oak', 'Pine'] }, { name: 'Dimensions', options: ['120 cm', '160 cm'] }], ['material', 'dimensions']],
    ['electronics without variants', 'Audio receiver', [], []],
  ])('%s retains only the option groups actually supplied by the source', (_kind, title, options, ids) => {
    const normalized = normalizeSerpApiMatch(source({ title, options, variants: undefined, original_price: undefined }));
    expect(normalized.variants.groups.map(group => group.id)).toEqual(ids);
    expect(normalized.variants.offers).toEqual([]);
    expect(normalized.basic.title).toBe(title);
  });

  it('unknown fields and unsupported currencies stay unknown, never filled from a title, image or default FX', () => {
    const missing = priceCommerceProduct(db, normalizeSerpApiMatch({ title: 'Shoe 42 Black', link: url, price: '30 KWD' }));
    expect(missing.variants.groups).toEqual([]);
    expect(missing.pricing.sourcePrice).toBe(30);
    expect(missing.pricing.sourceCurrency).toBe('KWD');
    expect(missing.pricing.ayroviPriceTnd).toBeNull();
    expect(missing.rating.value).toBeNull();
    expect(missing.media.originalImages).toEqual([]);
    expect(missing.availability).toBe('unknown');
    expect(validateProductForCart(missing, {}, 1)).toMatchObject({ ok: false, reason: 'PRICE_UNAVAILABLE' });
    const noCurrency = normalizeSerpApiMatch({ title: 'Untitled source currency', link: url, price: 30 });
    expect(noCurrency.pricing.sourceCurrency).toBeNull();
  });

  it('normalizes catalog cards with the same model rather than trusting stale CMS final-price fields', () => {
    const row = { id: 'catalog-item', name: 'Merchant table', source_url: 'https://store-shop.com/table',
      source_platform: 'Store', original_price: 80, currency: 'EUR', stock_status: null,
      image: '/uploads/table.jpg', additional_images: JSON.stringify(['/uploads/table-2.jpg']),
      final_price: 1 };
    const product = priceCommerceProduct(db, normalizeCatalogRow(row));
    expect(product.identity.source).toBe('catalog');
    expect(product.availability).toBe('unknown');
    expect(product.media.originalImages).toEqual(['/uploads/table.jpg', '/uploads/table-2.jpg']);
    expect(product.pricing.ayroviPriceTnd).toBeGreaterThan(1);
    expect(verifyCommerceProduct(product)).toBe(true);
  });

  it('cart endpoint enforces HMAC and group selections and persists a price snapshot for quantity', async () => {
    const agent = request.agent(app);
    const sessionId = `canonical-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requested = await agent.post('/api/customer/auth/otp/request').send({ phone: '97 542 618' });
    expect(requested.status).toBe(201);
    const verified = await agent.post('/api/customer/auth/otp/verify').send({
      challengeId: requested.body.data.challengeId, code: requested.body.data.developmentCode, cartSessionId: sessionId,
    });
    expect(verified.status).toBe(200);
    const csrf = verified.body.data.csrfToken;
    const product = priceCommerceProduct(db, normalizeSerpApiMatch(source()));
    const post = (body: object) => agent.post('/api/cart/items').set('x-session-id', sessionId).set('x-csrf-token', csrf).send(body);
    expect((await post({ product: { ...product, basic: { ...product.basic, title: 'tampered' } }, selectedVariants: { size: 's42', color: 'black' }, quantity: 2 })).body.code).toBe('INVALID_PRODUCT_QUOTE');
    expect((await post({ product, selectedVariants: { size: 's42' }, quantity: 2 })).body.code).toBe('VARIANT_REQUIRED');
    expect((await post({ product, selectedVariants: { size: 's42', color: 'red' }, quantity: 2 })).body.code).toBe('INVALID_VARIANT');
    const added = await post({ product, selectedVariants: { size: 's42', color: 'black' }, quantity: 2,
      priceTND: 0.001, title: 'do not trust', imageUrl: 'https://other-shop.com/fake.jpg' });
    expect(added.status).toBe(201);
    const item = added.body.cartItem;
    expect(item.title).toBe(product.basic.title);
    expect(item.imageUrl).toBe(product.media.primaryImage);
    expect(item.merchantName).toBe('Merchant Shop');
    expect(item.sourcePrice).toBe(84.95);
    expect(item.priceTND).toBe(product.variants.offers[0].ayroviPriceTnd);
    expect(item.productId).toBe(product.id);
    expect(item.selectedVariants).toEqual({ color: 'black', size: 's42' });
    expect(item.priceSnapshot.unit.totalTND).toBe(item.priceTND);
    expect(snapshotLinePrice(item)?.totalTND).toBe(added.body.totalTND - (db.getPricingRules().localDeliveryTND || 0));
    const account = db.get<{ account_id: string | null }>('SELECT account_id FROM cart_items WHERE id=?', item.id);
    const preserved = db.getItems(sessionId, account?.account_id || undefined)[0];
    expect(preserved.priceSnapshot).toEqual(item.priceSnapshot);
    expect(preserved.title).toBe(product.basic.title);
    expect(preserved.merchantName).toBe('Merchant Shop');
    const checkout = await agent.post('/api/checkout').set('x-session-id', sessionId)
      .set('x-csrf-token', csrf).send({ email: 'canonical@ayrovi.test', termsAccepted: true, locale: 'fr-TN',
        name: 'Client Canonical', phone: '97542618', city: 'Tunis', address: 'Rue du Commerce, Tunis', paymentMethod: 'card' });
    expect([200, 201]).toContain(checkout.status);
    const ordered = db.get<any>('SELECT * FROM order_items WHERE order_id=?', checkout.body.orderId);
    expect(ordered).toMatchObject({ merchant_name: 'Merchant Shop', product_name: product.basic.title,
      source_url: url, original_price: 84.95, currency: 'EUR', quantity: 2 });
    expect(Number(ordered.total_tnd)).toBe(snapshotLinePrice(item)?.totalTND);
    expect(JSON.parse(ordered.pricing_snapshot).totalTND).toBe(Number(ordered.total_tnd));

    const beforeFx = db.getPricingRules();
    try {
      db.run("UPDATE pricing_config SET rate_eur=?, version=version+1 WHERE id='default'", beforeFx.rateEUR * 1.25);
      const stale = await post({ product, selectedVariants: { size: 's42', color: 'black' }, quantity: 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('STALE_PRODUCT_QUOTE');
      const refreshed = priceCommerceProduct(db, product);
      expect(refreshed.pricing.ayroviPriceTnd).not.toBe(product.pricing.ayroviPriceTnd);
      const addedFresh = await post({ product: refreshed, selectedVariants: { size: 's42', color: 'black' }, quantity: 1 });
      expect(addedFresh.status).toBe(201);
      expect(addedFresh.body.cartItem.priceTND).toBe(refreshed.variants.offers[0].ayroviPriceTnd);
      // The completed order retains its original source/TND snapshot across FX updates.
      expect(Number(db.get<any>('SELECT total_tnd FROM order_items WHERE order_id=?', checkout.body.orderId).total_tnd))
        .toBe(Number(ordered.total_tnd));
    } finally {
      db.run("UPDATE pricing_config SET rate_eur=?, version=? WHERE id='default'", beforeFx.rateEUR, beforeFx.version);
    }
  });
});
