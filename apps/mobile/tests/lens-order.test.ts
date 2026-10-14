import { describe, expect, it } from 'vitest';
import type { LensCandidate, LensVariantOption } from '../src/api/lens';
import { parseCandidate } from '../src/api/lens';
import {
  buildCartPayload, completeOffer, effectiveChoice, missingChoice, orderBlock, resolveSelection, toStoreKey,
} from '../src/features/lens/productOrder';

const option = (over: Partial<LensVariantOption>): LensVariantOption => ({
  id: null, label: '', size: null, color: null, available: true, availability: 'available',
  price: null, currency: null, priceTnd: null, priceToken: null, ...over,
});

const candidate = (over: Partial<LensCandidate> = {}): LensCandidate => ({
  id: 'c1', kind: 'external', title: 'Robe', promo: null, description: null, brand: 'Z', model: null,
  colors: ['Rouge', 'Bleu'], sizes: ['M', 'L'], source: 'shein', sourceUrl: 'https://www.shein.com/p/1', image: 'https://img/1.jpg',
  images: [], colorImages: null, price: 20, currency: 'EUR', priceTnd: 85,
  originalPrice: null, originalPriceTnd: null, priceOrigin: null, availability: 'in_stock',
  availabilityCheckedAt: null, availabilityExpiresAt: null, sourceRead: null, sourceCondition: null,
  optionLabel: null, rating: null, ratingCount: null, ratingKind: null, match: null,
  offerCount: 0, offers: [], priceToken: 'tok-general', priceVerificationStatus: 'VERIFIED', variantOptions: [],
  ...over,
});

describe('Lens — متجر من الرابط', () => {
  it('نفس تصنيف الموقع، والباقي generic', () => {
    expect(toStoreKey('https://www.SHEIN.com/x')).toBe('shein');
    expect(toStoreKey('https://www.amazon.fr/dp/1')).toBe('amazon');
    expect(toStoreKey('https://example.tn/p')).toBe('generic');
  });
});

describe('Lens — اختيار المتغيّر', () => {
  it('بلا اختيار ⇒ العرض العام', () => {
    const sel = resolveSelection(candidate(), '', '');
    expect(sel.kind).toBe('general');
    expect(orderBlock(sel)).toBeNull();
  });
  it('مطابقة واحدة ⇒ عرض المتغيّر ورمزه', () => {
    const c = candidate({
      variantOptions: [option({ id: 'v-m', label: 'M', size: 'M', price: 22, currency: 'EUR', priceTnd: 90, priceToken: 'tok-m' })],
    });
    const sel = resolveSelection(c, 'm', '');
    expect(sel.kind).toBe('matched');
    expect(sel.offer.priceToken).toBe('tok-m');
    expect(sel.offer.fromVariant).toBe(true);
  });
  it('عدة مطابقات ⇒ ambiguous، ولا طلب', () => {
    const c = candidate({
      variantOptions: [option({ size: 'M', color: 'Rouge' }), option({ size: 'M', color: 'Rouge', id: 'x' })],
    });
    const sel = resolveSelection(c, 'M', 'Rouge');
    expect(sel.kind).toBe('ambiguous');
    expect(orderBlock(sel)).toBe('ambiguous');
  });
  it('مقاس غير موجود ⇒ manual، ولا طلب', () => {
    const sel = resolveSelection(candidate(), 'XXL', '');
    expect(sel.kind).toBe('manual');
    expect(orderBlock(sel)).toBe('manual');
  });
  it('متغيّر غير متوفر لا يُختار، سواء قالها عقد الاختيار أو المخزون', () => {
    const disabled = candidate({ variantOptions: [option({ size: 'M', available: false, priceToken: 'tok' })] });
    const outOfStock = candidate({ variantOptions: [option({ size: 'M', availability: 'unavailable', priceToken: 'tok' })] });
    expect(resolveSelection(disabled, 'M', '').kind).toBe('manual');
    expect(resolveSelection(outOfStock, 'M', '').kind).toBe('manual');
  });
});

describe('Lens — اكتمال العرض', () => {
  it('بلا رمز موقّع ⇒ لا طلب، حتى مع سعر', () => {
    const sel = resolveSelection(candidate({ priceToken: null }), '', '');
    expect(completeOffer(sel.offer)).toBe(false);
    expect(orderBlock(sel)).toBe('incomplete');
    expect(buildCartPayload({ candidate: candidate({ priceToken: null }), selection: sel, size: '', color: '', quantity: 1, customerNote: '' })).toBeNull();
  });
  it('بلا سعر ⇒ لا حمولة مختلقة', () => {
    const c = candidate({ price: null, priceTnd: null });
    const sel = resolveSelection(c, '', '');
    expect(buildCartPayload({ candidate: c, selection: sel, size: '', color: '', quantity: 1, customerNote: '' })).toBeNull();
  });
});

describe('Lens — حمولة السلة', () => {
  it('حمولة مكتملة بالحقول التي يقبلها الخادم', () => {
    const c = candidate({
      variantOptions: [option({
        id: 'v-l', label: 'L · Bleu', size: 'L', color: 'Bleu', price: 22, currency: 'EUR', priceTnd: 90, priceToken: 'tok-l',
      })],
    });
    const payload = buildCartPayload({
      candidate: c, selection: resolveSelection(c, 'L', 'Bleu'), size: 'L', color: 'Bleu', quantity: 2, customerNote: '  merci  ',
    });
    expect(payload).toMatchObject({
      store: 'shein',
      externalId: 'v-l',
      url: 'https://www.shein.com/p/1',
      referenceUrl: 'https://www.shein.com/p/1',
      sourcePrice: 22,
      sourceCurrency: 'EUR',
      priceTND: 90,
      requestedSize: 'L',
      requestedColor: 'Bleu',
      priceVerificationStatus: 'VERIFIED',
      priceToken: 'tok-l',
      quantity: 2,
      customerNote: 'merci',
      variant: 'L · Bleu',
    });
  });
  it('مقاس بلا متغيّر مطابق ⇒ لا حمولة (الخادم لا يقبل مقاساً بلا عقد)', () => {
    const c = candidate();
    expect(buildCartPayload({ candidate: c, selection: resolveSelection(c, 'L', ''), size: 'L', color: '', quantity: 1, customerNote: '' })).toBeNull();
  });
  it('VERIFIED فقط إن قالت النتيجة ذلك؛ وإلا PENDING_MANUAL', () => {
    const c = candidate({ priceVerificationStatus: 'PENDING_MANUAL' });
    const payload = buildCartPayload({ candidate: c, selection: resolveSelection(c, '', ''), size: 'M', color: 'Rouge', quantity: 1, customerNote: '' });
    expect(payload?.priceVerificationStatus).toBe('PENDING_MANUAL');
  });
  it('الكمية محصورة بين 1 و99', () => {
    const c = candidate();
    const sel = resolveSelection(c, '', '');
    expect(buildCartPayload({ candidate: c, selection: sel, size: 'M', color: 'Rouge', quantity: 0, customerNote: '' })?.quantity).toBe(1);
    expect(buildCartPayload({ candidate: c, selection: sel, size: 'M', color: 'Rouge', quantity: 500, customerNote: '' })?.quantity).toBe(99);
  });
});

describe('Lens — تحليل الرمز والمتغيرات', () => {
  it('الرمز بلا VERIFIED ⇒ PENDING_MANUAL', () => {
    const parsed = parseCandidate({ id: 'a', sourceUrl: 'https://x.y', priceVerificationStatus: 'VERIFIED', priceToken: '' });
    expect(parsed.priceVerificationStatus).toBe('PENDING_MANUAL');
    expect(parsed.priceToken).toBeNull();
  });
  it('المتغيّرات تُقرأ بحالة مغلقة', () => {
    const parsed = parseCandidate({
      id: 'a', sourceUrl: 'https://x.y',
      variantOptions: [{ label: 'M', size: 'M', available: true, availability: 'peut-être' }],
    });
    expect(parsed.variantOptions[0].availability).toBe('unknown');
    expect(parsed.variantOptions[0].size).toBe('M');
  });
});

describe('الاختيار لازم يكون من الزبون', () => {
  it('منتج عنده مقاسات ولا مقاس مختار ⇒ الطلب موقوف (ما نختارش عنه)', () => {
    const c = candidate({ colors: [] });
    expect(missingChoice(c, '', '')).toBe(true);
    expect(buildCartPayload({ candidate: c, selection: resolveSelection(c, '', ''), size: '', color: '', quantity: 1, customerNote: '' })).toBeNull();
  });

  it('منتج عنده مقاسات والزبون اختار ⇒ مسموح', () => {
    const c = candidate({ colors: [] });
    expect(missingChoice(c, 'M', '')).toBe(false);
  });

  it('منتج بلا مقاسات ولا ألوان ⇒ لا اختيار مطلوب', () => {
    const c = candidate({ sizes: [], colors: [] });
    expect(missingChoice(c, '', '')).toBe(false);
  });
});

describe('استثناء الخيار الواحد', () => {
  it('منتج بمقاس واحد ⇒ لا يُطلب اختيار، والمقاس هو المعتمد', () => {
    const c = candidate({ sizes: ['100 ml'], colors: [] });
    expect(missingChoice(c, '', '')).toBe(false);
    expect(effectiveChoice(c, '', '').size).toBe('100 ml');
    const choice = effectiveChoice(c, '', '');
    const payload = buildCartPayload({
      candidate: c, selection: resolveSelection(c, choice.size, choice.color), size: choice.size, color: choice.color, quantity: 1, customerNote: '',
    });
    expect(payload?.requestedSize).toBe('100 ml');
  });

  it('منتج بلون واحد ⇒ اللون معتمد تلقائياً، والمقاس ما زال اختيار الزبون', () => {
    const c = candidate({ colors: ['Noir'] });
    expect(effectiveChoice(c, '', '').color).toBe('Noir');
    expect(missingChoice(c, '', '')).toBe(true);
  });
});
