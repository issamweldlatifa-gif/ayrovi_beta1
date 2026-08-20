import { describe, expect, test } from 'vitest';
import {
  DEFAULT_CUSTOMS_CATEGORIES,
  calculatePrice,
  classifyCustomsCategory,
  getEffectiveExchangeRate,
  millimes,
  type PricingRules,
} from '../src/services/pricing';
import { db } from '../src/server';

function rules(overrides: Partial<PricingRules> = {}): PricingRules {
  return {
    id: 'default',
    version: 1,
    rateEUR: 4,
    rateUSD: 4,
    rateGBP: 4.8,
    rateJPY: 0.0265,
    exchangeBufferPercent: 3,
    freightPerKgTND: 13,
    localDeliveryTND: 8,
    commissionPercent: 10,
    minimumCommissionTND: 0,
    rpdPercent: 3,
    rpdMinimumTND: 10,
    defaultTvaRate: 0.19,
    expressFeeTND: 15,
    categories: DEFAULT_CUSTOMS_CATEGORIES,
    customsFeePercent: 0,
    shippingFeeTND: 25,
    serviceFeePercent: 8,
    minimumServiceFeeTND: 10,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AYSONIC CIF pricing engine', () => {
  test('millimes avoid binary float drift', () => {
    expect(millimes(0.1 + 0.2)).toBe(0.3);
    expect(millimes(21.99 * 4.12)).toBe(90.599);
  });

  test('effective EUR rate applies the 3% buffer', () => {
    expect(getEffectiveExchangeRate(rules(), 'EUR')).toBe(4.12);
    expect(getEffectiveExchangeRate(rules(), 'TND')).toBe(1);
  });

  test('classifies shoes, computers and restricted drones', () => {
    expect(classifyCustomsCategory('Nike Air Force 1 sneakers').category.id).toBe('fashion_shoes');
    expect(classifyCustomsCategory('Apple MacBook Air laptop').category.id).toBe('tech_computers');
    expect(classifyCustomsCategory('FPV drone camera').category.status).toBe('RESTRICTED');
    expect(classifyCustomsCategory('parfum Dior').category.id).toBe('beauty_fragrance');
    expect(classifyCustomsCategory('article générique').uncertain).toBe(true);
  });

  test('50 EUR sneaker lands on the published CIF example', () => {
    const quote = calculatePrice(rules(), 50, 'EUR', { title: 'sneakers Nike Air Force 1', weightKg: 1.2 })!;
    expect(quote.restricted).toBe(false);
    expect(quote.categoryId).toBe('fashion_shoes');
    expect(quote.exchangeRate).toBe(4.12);
    expect(quote.convertedPriceTND).toBe(206);
    expect(quote.freightTND).toBe(15.6);
    expect(quote.cifTND).toBe(221.6);
    expect(quote.dutyTND).toBe(66.48);
    expect(quote.tvaTND).toBe(54.735);
    expect(quote.rpdTND).toBe(10);
    expect(quote.serviceFeeTND).toBe(20.6);
    expect(quote.localDeliveryTND).toBe(8);
    expect(quote.totalTND).toBe(381.415);
  });

  test('restricted items never produce a payable total', () => {
    const quote = calculatePrice(rules(), 199, 'USD', { title: 'camera drone' })!;
    expect(quote.restricted).toBe(true);
    expect(quote.totalTND).toBe(0);
    expect(quote.dutyTND).toBe(0);
  });

  test('line quotes omit local delivery so the cart adds it once', () => {
    const unit = calculatePrice(rules(), 21.99, 'EUR', { title: 'ensemble tendance', includeLocalDelivery: true })!;
    const line = calculatePrice(rules(), 21.99, 'EUR', { title: 'ensemble tendance', includeLocalDelivery: false, quantity: 2 })!;
    expect(unit.localDeliveryTND).toBe(8);
    expect(line.localDeliveryTND).toBe(0);
    expect(line.weightKg).toBe(1);
    expect(line.totalTND + 8).toBeGreaterThan(unit.totalTND);
  });

  test('live database rules seed the new CIF parameters', () => {
    const live = db.getPricingRules();
    expect(live.exchangeBufferPercent).toBe(3);
    expect(live.freightPerKgTND).toBe(13);
    expect(live.localDeliveryTND).toBe(8);
    expect(live.commissionPercent).toBe(10);
    expect(live.rpdPercent).toBe(3);
    expect(live.rpdMinimumTND).toBe(10);
    expect(live.categories.some((item) => item.id === 'fashion_shoes')).toBe(true);
    const quote = calculatePrice(live, 50, 'EUR', { title: 'chaussures sneakers', weightKg: 1.2 })!;
    expect(quote.totalTND).toBe(381.415);
  });
});
