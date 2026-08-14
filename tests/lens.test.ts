import { describe, expect, test } from 'vitest';
import { analyzeOcrText, classifyFinding, extractPriceCandidates } from '../src/ayrovix/services/ocrPrices';
import { mergeVisionOcr } from '../src/ayrovix/services/lensPipeline';
import { detectPriceCorrection, classifyPriceError } from '../src/assistant/learning';
import type { AyrovixIdentification } from '../src/ayrovix/types';

const visionWith = (pricing: Partial<NonNullable<AyrovixIdentification['pricing']>>, confidence = 0.9): AyrovixIdentification => ({
  input_kind: 'product_screenshot',
  category: 'mode',
  brand: 'Nike',
  model: null,
  color: [],
  visible_text: [],
  possible_model_codes: [],
  description: 'test',
  confidence,
  detected_price: { amount: pricing.sale_price ?? 0, currency: pricing.currency ?? '', label: pricing.sale_price ? 'product_price' : 'none', confidence },
  pricing: {
    sale_price: pricing.sale_price ?? null,
    original_price: pricing.original_price ?? null,
    shipping_price: pricing.shipping_price ?? null,
    total_price: pricing.total_price ?? null,
    currency: pricing.currency ?? null,
    discount_percent: pricing.discount_percent ?? null,
  },
  products: [],
  url: null,
  seller: null,
});

describe('OCR price understanding (dataset §28)', () => {
  test('1. image claire, prix unique', () => {
    const report = analyzeOcrText('Nike Air Max\n59.99 €');
    expect(report.salePrice).toBe(59.99);
    expect(report.currency).toBe('EUR');
    expect(report.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('2. sale + original : jamais le plus grand par défaut', () => {
    const report = analyzeOcrText('Robe été\nWas 59.99 EUR\nNow 39.99 EUR');
    expect(report.salePrice).toBe(39.99);
    expect(report.originalPrice).toBe(59.99);
  });

  test('3. product + shipping distincts', () => {
    const report = analyzeOcrText('Product 29.99 €\nShipping 5.99 €');
    expect(report.salePrice).toBe(29.99);
    expect(report.shippingPrice).toBe(5.99);
  });

  test('4. multiple produits : chaque montant conservé', () => {
    const report = analyzeOcrText('Product A 19.99 EUR\nProduct B 29.99 EUR\nProduct C 39.99 EUR');
    const values = report.findings.map((finding) => finding.value).sort((a, b) => a - b);
    expect(values).toEqual([19.99, 29.99, 39.99]);
  });

  test('5. petit prix avec symbole préfixé', () => {
    const report = analyzeOcrText('€4.99 only');
    expect(report.salePrice).toBe(4.99);
  });

  test('6. devise USD', () => {
    const report = analyzeOcrText('Sneakers $45.00');
    expect(report.currency).toBe('USD');
    expect(report.salePrice).toBe(45);
  });

  test('7. total vs produit : le total n\'est pas le prix produit', () => {
    const report = analyzeOcrText('Product 29.99 €\nShipping 5.99 €\nTotal 35.98 €');
    expect(report.salePrice).toBe(29.99);
    expect(report.totalPrice).toBe(35.98);
  });

  test('8. discount lisible avec contexte promo', () => {
    const report = analyzeOcrText('Old price 59.99 €\n-33% remise\nNow 39.99 €');
    expect(report.discountPercent).toBe(33);
    expect(report.salePrice).toBe(39.99);
  });

  test('9. pourcentage sans contexte promo ignoré (100% coton)', () => {
    const report = analyzeOcrText('T-shirt 100% coton\n12.50 €');
    expect(report.discountPercent).toBeNull();
    expect(report.salePrice).toBe(12.5);
  });

  test('10. aucun prix lisible : rien n\'est inventé', () => {
    const report = analyzeOcrText('Bienvenue sur la boutique');
    expect(report.salePrice).toBeNull();
    expect(report.totalPrice).toBeNull();
    expect(report.confidence).toBe(0);
  });
});

describe('Fusion Vision ↔ OCR (confiance §14/§15)', () => {
  test('accord vision/ocr → confiance haute et vérifié', () => {
    const merged = mergeVisionOcr(visionWith({ sale_price: 39.99, currency: 'EUR' }), analyzeOcrText('Now 39.99 EUR'), []);
    expect(merged.pricing.sale_price).toBe(39.99);
    expect(merged.confidence).toBeGreaterThanOrEqual(0.9);
    expect(merged.verified).toBe(true);
    expect(merged.warnings).not.toContain('PRICE_MISMATCH_VISION_OCR');
  });

  test('désaccord → confiance médium + warning, pas de valeur inventée', () => {
    const merged = mergeVisionOcr(visionWith({ sale_price: 59.99, currency: 'EUR' }, 0.85), analyzeOcrText('Now 39.99 EUR'), []);
    expect(merged.warnings).toContain('PRICE_MISMATCH_VISION_OCR');
    expect(merged.confidence).toBeLessThan(0.9);
    expect(merged.verified).toBe(false);
  });

  test('prix promo au-dessus de l\'ancien prix → bascule sûre', () => {
    const merged = mergeVisionOcr(visionWith({ sale_price: 59.99, original_price: 39.99, currency: 'EUR' }), null, []);
    expect(merged.pricing.sale_price).toBe(39.99);
    expect(merged.pricing.original_price).toBe(59.99);
    expect(merged.warnings).toContain('SALE_ABOVE_ORIGINAL');
  });

  test('low confidence → warning de vérification', () => {
    const merged = mergeVisionOcr(visionWith({ sale_price: 12, currency: 'EUR' }, 0.4), null, []);
    expect(merged.warnings).toContain('LOW_CONFIDENCE_VERIFY_NEEDED');
  });

  test('OCR complète la vision (livraison manquante)', () => {
    const merged = mergeVisionOcr(visionWith({ sale_price: 29.99, currency: 'EUR' }), analyzeOcrText('Product 29.99 €\nShipping 5.99 €'), []);
    expect(merged.pricing.shipping_price).toBe(5.99);
  });
});

describe('Apprentissage : corrections & taxonomie', () => {
  test('détection de correction client (arabe + français)', () => {
    expect(detectPriceCorrection('لا، السعر 39.99 €')).toEqual({ value: 39.99, currency: 'EUR' });
    expect(detectPriceCorrection('non, 39,99 EUR')).toEqual({ value: 39.99, currency: 'EUR' });
    expect(detectPriceCorrection('d accord merci')).toBeNull();
  });

  test('taxonomie des erreurs', () => {
    expect(classifyPriceError(39.99, 59.99, 'EUR', 'EUR')).toBe('SALE_VS_ORIGINAL_PRICE');
    expect(classifyPriceError(39.99, 39.99, 'EUR', 'USD')).toBe('WRONG_CURRENCY');
    expect(classifyPriceError(39.99, null, null, null)).toBe('PRICE_MISSED');
  });

  test('candidates extraction rejette les montants invalides', () => {
    const candidates = extractPriceCandidates('9999999 €\n-5 €\n12.50 €');
    expect(candidates.map((c) => c.value)).toEqual([12.5]);
  });

  test('classifyFinding : contexte livraison', () => {
    const finding = classifyFinding({ value: 5.99, currency: 'EUR', explicit: true, line: 'Shipping 5.99 €', index: 0 }, '');
    expect(finding.role).toBe('shipping');
  });
});
