import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { attachOcerexExtractionsToOrder, saveOcerexExtraction, updateOcerexExtraction } from '../src/ocerex/store';
import { quoteOcerex } from '../src/ocerex/pricing';
import { resolveOcerexPrices } from '../src/ocerex/priceResolver';
import { detectStrikeInRegion } from '../src/ocerex/strikeDetection';
import { validateOcerexUrl } from '../src/ocerex/validation';
import type { OcerexOcrToken } from '../src/ocerex/types';
import { quoteCartLine } from '../src/services/cartQuote';
import { millimes, orderLocalDelivery } from '../src/services/pricing';
import { app, db } from '../src/server';

function token(text: string, extra: Partial<OcerexOcrToken> = {}): OcerexOcrToken {
  return { text, confidence: extra.confidence ?? 0.92, x: extra.x ?? 12, y: extra.y ?? 12, width: extra.width ?? 90, height: extra.height ?? 18, struck: extra.struck ?? false };
}

const supported = (code: string) => ['TND', 'EUR', 'USD', 'GBP', 'JPY'].includes(code);

describe('OCEREX reference price selection', () => {
  test('product struck-through price is the reference, not the discounted price', () => {
    const decision = resolveOcerexPrices([
      token('Nike Air Force 1', { y: 12, width: 180 }),
      token('$79.99', { y: 48, struck: true }),
      token('$49.99', { y: 78 }),
    ], { currencySupported: supported });
    expect(decision.type).toBe('PRODUCT');
    expect(decision.referencePrice).toBe(79.99);
    expect(decision.currency).toBe('USD');
    expect(decision.priceContext).toBe('REFERENCE');
    expect(decision.referencePrice).not.toBe(49.99);
  });

  test('several struck prices on one product use the highest valid reference', () => {
    const decision = resolveOcerexPrices([
      token('$79.99', { y: 20, struck: true }),
      token('$89.50', { y: 20, x: 140, struck: true }),
      token('$49.99', { y: 52 }),
    ], { currencySupported: supported });
    expect(decision.referencePrice).toBe(89.5);
  });

  test('a percentage discount never invents an original price', () => {
    const decision = resolveOcerexPrices([
      token('Nike Air Force 1', { y: 10, width: 160 }),
      token('$40.00', { y: 40 }),
      token('-50%', { y: 68 }),
    ], { currencySupported: supported });
    expect(decision.referencePrice).toBeNull();
    expect(decision.code).toBe('NO_REFERENCE_PRICE');
    expect(decision.referencePrice).not.toBe(80);
  });

  test('random numbers without a price signal are not a price', () => {
    const decision = resolveOcerexPrices([
      token('128 colors', { y: 10 }),
      token('size 42', { y: 36 }),
      token('4.8 stars', { y: 60 }),
    ]);
    expect(decision.code).toBe('NO_PRICE_FOUND');
    expect(decision.referencePrice).toBeNull();
  });

  test('cart reference total wins over a larger product price and is not a sum', () => {
    const decision = resolveOcerexPrices([
      token('Cart', { y: 8 }),
      token('3 items', { y: 8, x: 70 }),
      token('Sneakers', { y: 48 }),
      token('$40.00', { y: 72, struck: true }),
      token('Jacket', { y: 110 }),
      token('$200.00', { y: 134, struck: true }),
      token('Original total', { y: 200 }),
      token('/$180/', { y: 224, struck: true }),
      token('Total', { y: 260 }),
      token('$120.00', { y: 284 }),
    ], { currencySupported: supported });
    expect(decision.type).toBe('CART');
    expect(decision.priceContext).toBe('CART_REFERENCE_TOTAL');
    expect(decision.referencePrice).toBe(180);
    expect(decision.referencePrice).not.toBe(200);
    expect(decision.referencePrice).not.toBe(240);
    expect(decision.referencePrice).not.toBe(120);
  });

  test('a cart without a reference total is incomplete, even if a product price is larger', () => {
    const decision = resolveOcerexPrices([
      token('Basket', { y: 8 }),
      token('2 items', { y: 8, x: 80 }),
      token('Shirt', { y: 40 }),
      token('$90.00', { y: 64 }),
      token('Hat', { y: 100 }),
      token('$40.00', { y: 124 }),
      token('Total', { y: 180 }),
      token('$80.00', { y: 204 }),
    ], { currencySupported: supported });
    expect(decision.type).toBe('CART');
    expect(decision.referencePrice).toBeNull();
    expect(decision.code).toBe('NO_REFERENCE_PRICE');
  });

  test('multiple products without a cart total are not guessed', () => {
    const decision = resolveOcerexPrices([
      token('Product A', { y: 10 }),
      token('$30.00', { y: 34, struck: true }),
      token('Product B', { y: 140 }),
      token('$70.00', { y: 164, struck: true }),
    ], { currencySupported: supported });
    expect(decision.type).toBe('UNKNOWN');
    expect(decision.code).toBe('UNSUPPORTED_SCREEN');
    expect(decision.referencePrice).toBeNull();
  });

  test('shipping, tax and coupon are not the pricing basis', () => {
    const decision = resolveOcerexPrices([
      token('Coat', { y: 8, width: 80 }),
      token('$79.99', { y: 36, struck: true }),
      token('Shipping', { y: 80 }),
      token('$12.00', { y: 80, x: 100 }),
      token('VAT', { y: 108 }),
      token('$4.00', { y: 108, x: 70 }),
      token('Coupon', { y: 136 }),
      token('$10.00', { y: 136, x: 90 }),
    ], { currencySupported: supported });
    expect(decision.referencePrice).toBe(79.99);
    expect(decision.findings.find((item) => item.value === 12)?.semanticType).toBe('SHIPPING');
    expect(decision.findings.find((item) => item.value === 4)?.semanticType).toBe('TAX');
  });

  test('multiple currencies stay attached to their own amounts', () => {
    const decision = resolveOcerexPrices([
      token('Boots', { y: 8 }),
      token('£64.00', { y: 36, struck: true }),
      token('Shipping', { y: 80 }),
      token('€9.90', { y: 80, x: 110 }),
    ], { currencySupported: supported });
    expect(decision.referencePrice).toBe(64);
    expect(decision.currency).toBe('GBP');
  });

  test('low OCR confidence is never a final reference price', () => {
    const decision = resolveOcerexPrices([
      token('Sneaker', { y: 8 }),
      token('$79.99', { y: 36, struck: true, confidence: 0.2 }),
    ], { currencySupported: supported });
    expect(decision.confidenceLevel).toBe('LOW');
    expect(decision.code).toBe('LOW_CONFIDENCE');
    expect(decision.referencePrice).toBeNull();
  });

  test('an unsupported currency is not converted inside OCEREX', () => {
    const decision = resolveOcerexPrices([
      token('Bag', { y: 8 }),
      token('¥199.00', { y: 36, struck: true }),
    ], { currencySupported: supported });
    expect(decision.referencePrice).toBe(199);
    expect(decision.currency).toBeNull();
    expect(decision.currencyStatus).toBe('AMBIGUOUS');
  });
});

describe('OCEREX strike detection', () => {
  test('a thin continuous line through a price box is a strike; a blank box is not', () => {
    const width = 220;
    const height = 80;
    const pixels = new Uint8Array(width * height);
    pixels.fill(255);
    for (let x = 24; x < 170; x += 1) pixels[40 * width + x] = 0;
    expect(detectStrikeInRegion(pixels, width, height, { x: 16, y: 24, width: 170, height: 32 })).toBe(true);
    expect(detectStrikeInRegion(pixels, width, height, { x: 16, y: 48, width: 170, height: 24 })).toBe(false);
  });
});

describe('OCEREX price engine integration', () => {
  test('the displayed quote is the existing cart quote plus the existing order delivery', () => {
    const title = 'Nike Air Force 1';
    const quoted = quoteOcerex(db, 79.99, 'USD', title);
    const line = quoteCartLine(db, { sourcePrice: 79.99, sourceCurrency: 'USD', title, quantity: 1 });
    expect(quoted.line).toEqual(line.price);
    expect(quoted.totalTND).toBe(millimes(line.price.totalTND + orderLocalDelivery(db.getPricingRules())));
    expect(quoted.pricingVersion).toBe(db.getPricingRules().version);
  });

  test('OCEREX does not carry a second pricing formula', () => {
    const source = readFileSync('src/ocerex/pricing.ts', 'utf8');
    expect(source).toContain('quoteCartLine');
    expect(source).toContain('orderLocalDelivery');
    expect(source).not.toMatch(/rateUSD|freightPerKg|\* 0\.08|RATES_TO_TND/);
    expect(readFileSync('src/ocerex/routes.ts', 'utf8')).toContain('sourcePrice: row.reference_price');
    expect(readFileSync('src/ocerex/routes.ts', 'utf8')).toContain('extractProductFromUrl');
  });
});

describe('OCEREX HTTP', () => {
  const session = `ocerex-${Date.now()}`;

  test('rejects an invalid image before OCR', async () => {
    const response = await request(app)
      .post('/api/ocerex/analyze')
      .set('x-session-id', session)
      .attach('image', Buffer.from('not an image'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(response.status).toBe(415);
    expect(response.body.code).toBe('INVALID_IMAGE');
  });

  test('rejects an invalid product link', async () => {
    const saved = saveOcerexExtraction(db, {
      sessionId: session,
      decision: resolveOcerexPrices([token('Shoe', { y: 8 }), token('$79.99', { y: 36, struck: true })], { currencySupported: supported }),
    });
    const response = await request(app)
      .post('/api/ocerex/resolve')
      .set('x-session-id', session)
      .send({ extractionId: saved.id, url: 'not a link' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_URL');
  });

  test('accepts a public product URL shape without inventing a price from it', () => {
    expect(validateOcerexUrl('https://www.nike.com/t/air-force-1')).toMatch(/^https:\/\/www\.nike\.com\//);
    expect(validateOcerexUrl('http://127.0.0.1/secret')).toBeNull();
    expect(validateOcerexUrl('javascript:alert(1)')).toBeNull();
  });

  test('backend recalculates and ignores a client-supplied price', async () => {
    const decision = resolveOcerexPrices([
      token('Nike Air Force 1', { y: 8, width: 180 }),
      token('$79.99', { y: 40, struck: true }),
      token('$49.99', { y: 70 }),
    ], { currencySupported: supported });
    const saved = saveOcerexExtraction(db, { sessionId: session, decision });
    updateOcerexExtraction(db, saved.id, session, { source_url: 'https://www.nike.com/t/air-force-1', platform: 'nike', status: 'RESOLVED' });
    const calculated = await request(app)
      .post('/api/ocerex/calculate')
      .set('x-session-id', session)
      .send({ extractionId: saved.id, referencePrice: 1, ayroviPrice: 1 });
    expect(calculated.status).toBe(200);
    expect(calculated.body.referencePrice).toBe(79.99);
    expect(calculated.body.sourceCurrency).toBe('USD');
    expect(calculated.body.ayroviPrice).toBe(quoteOcerex(db, 79.99, 'USD', 'Nike Air Force 1').totalTND);
    expect(calculated.body.ayroviPrice).not.toBe(1);

    const committed = await request(app)
      .post('/api/ocerex/commit')
      .set('x-session-id', session)
      .send({ extractionId: saved.id, referencePrice: 1, ayroviPrice: 1 });
    expect(committed.status).toBe(201);
    const cart = await request(app).get('/api/cart/items').set('x-session-id', session);
    const item = cart.body.items.find((entry: { sourceUrl: string }) => entry.sourceUrl.includes('nike.com'));
    expect(item.sourcePrice).toBe(79.99);
    expect(item.sourceCurrency).toBe('USD');
    expect(item.priceTND).not.toBe(1);
  });

  test('order creation stores the extraction metadata after the existing checkout quote', () => {
    const now = new Date().toISOString();
    const accountId = `ocerex_account_${Date.now()}`;
    const orderSession = `ocerex-order-${Date.now()}`;
    db.run(`INSERT INTO customer_accounts (id,display_name,email,email_verified_at,status,created_at,updated_at)
      VALUES (?,'Client OCEREX','ocerex@ayrovi.test',?,'ACTIVE',?,?)`, accountId, now, now, now);
    const decision = resolveOcerexPrices([
      token('Panier', { y: 8 }),
      token('Original total', { y: 40 }),
      token('/$180/', { y: 64, struck: true }),
      token('Total', { y: 96 }),
      token('$120', { y: 120 }),
    ], { currencySupported: supported });
    const saved = saveOcerexExtraction(db, { sessionId: orderSession, accountId, decision });
    updateOcerexExtraction(db, saved.id, orderSession, {
      source_url: 'https://www.shein.com/cart',
      platform: 'shein',
      product_title: 'Panier',
      status: 'COMMITTED',
    });
    db.addItem(orderSession, {
      store: 'shein',
      externalId: `ocerex-${saved.id}`,
      url: 'https://www.shein.com/cart',
      title: 'Panier',
      imageUrl: '',
      sourcePrice: 180,
      sourceCurrency: 'USD',
      priceTND: 1,
      referenceUrl: 'https://www.shein.com/cart',
      quantity: 1,
    }, accountId);
    const order = db.createOrderFromCart(orderSession, {
      name: 'Client OCEREX', email: 'ocerex@ayrovi.test', phone: '98111022', governorate: 'Tunis', address: 'Tunis',
      paymentMethod: 'BANK_TRANSFER', latitude: null, longitude: null, termsAcceptedAt: now, locale: 'fr-TN',
    }, accountId);
    expect(attachOcerexExtractionsToOrder(db, orderSession, accountId, order.orderId)).toBe(1);
    const item = db.get<any>('SELECT * FROM order_items WHERE order_id=?', order.orderId);
    expect(item.ocerex_extraction_id).toBe(saved.id);
    expect(item.original_price).toBe(180);
    expect(item.currency).toBe('USD');
    expect(item.total_tnd).toBe(quoteCartLine(db, { sourcePrice: 180, sourceCurrency: 'USD', title: 'Panier', quantity: 1 }).price.totalTND);
    const stored = db.get<any>('SELECT * FROM ocerex_extractions WHERE id=?', saved.id);
    expect(stored.order_id).toBe(order.orderId);
    expect(stored.pricing_version).toBe(db.getPricingRules().version);
    expect(stored.metadata_json).not.toMatch(/data:image|base64/);
  });
});

describe('OCEREX first use', () => {
  test('onboarding completion is stored per account and is not shown again', async () => {
    const { markOcerexOnboardingComplete, ocerexOnboardingComplete } = await import('../client/src/features/ocerex/utils/preferences');
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    expect(ocerexOnboardingComplete(storage, null)).toBe(false);
    markOcerexOnboardingComplete(storage, null);
    expect(ocerexOnboardingComplete(storage, null)).toBe(true);
    expect(ocerexOnboardingComplete(storage, 'account-1')).toBe(false);
    markOcerexOnboardingComplete(storage, 'account-1');
    expect(ocerexOnboardingComplete(storage, 'account-1')).toBe(true);
  });
});

describe('OCEREX copy and navigation', () => {
  test('the specified Arabic states and the navigation item exist', () => {
    const onboarding = readFileSync('client/src/features/ocerex/screens/OcerexOnboarding.tsx', 'utf8');
    const home = readFileSync('client/src/features/ocerex/screens/OcerexHome.tsx', 'utf8');
    const result = readFileSync('client/src/features/ocerex/screens/OcerexResult.tsx', 'utf8');
    const errors = readFileSync('client/src/features/ocerex/screens/OcerexError.tsx', 'utf8');
    const processing = readFileSync('client/src/features/ocerex/screens/OcerexProcessing.tsx', 'utf8');
    expect(onboarding).toContain('حوّل السعر من صورة إلى طلب مع Ayrovi.');
    expect(onboarding).toContain('ابدأ مع Ocerex');
    expect(home).toContain('ارفع صورة السعر');
    expect(home).toContain('رفع صورة');
    expect(home).toContain('التقاط صورة');
    expect(processing).toContain('جاري قراءة الصورة...');
    expect(result).toContain('تم استخراج السعر بنجاح');
    expect(result).toContain('متابعة الطلب');
    expect(errors).toContain('لم نتمكن من العثور على سعر واضح.');
    expect(errors).toContain('تعذر تحديد السعر المرجعي بدقة.');
    expect(errors).toContain('لم يتم العثور على سعر مرجعي واضح.');
    expect(errors).toContain('الرابط غير صالح.');
    expect(errors).toContain('الصورة غير واضحة كمنتج أو سلة.');
    expect(errors).toContain('حدث خطأ أثناء تحليل الصورة.');
    expect(readFileSync('client/src/components/BottomNavBar.tsx', 'utf8')).toContain('app:ocerex');
    expect(readFileSync('client/src/App.tsx', 'utf8')).toContain('OcerexScreen');
    expect(readFileSync('src/api/routes.ts', 'utf8')).toContain('attachOcerexExtractionsToOrder');
  });

  test('generated strike image is detected by the same visual rule', async () => {
    const width = 240;
    const height = 90;
    const raw = Buffer.alloc(width * height, 255);
    for (let x = 30; x < 180; x += 1) raw[46 * width + x] = 0;
    const png = await sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();
    const decoded = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
    expect(detectStrikeInRegion(pixels, decoded.info.width, decoded.info.height, { x: 20, y: 30, width: 180, height: 32 })).toBe(true);
  });
});
