/**
 * AYWEBs — ورقة الاختيار من القراءة المحلية (20/10/2026).
 *  • الخيارات والمقاسات تجي من الصفحة مع ASIN ودليل التوفّر ;
 *  • التوفّر غير المثبت لا يفتح التأكيد أبداً ;
 *  • الاختيار الناقص أو غير الموجود يُرفض بسبب واضح ;
 *  • لا سعر محلي : السعر يأتي من الخادم عند الإضافة.
 */
import { describe, expect, it } from 'vitest';

import {
  groupsFromVariants, localAddReadiness, localVariantsFromCapture, optionsFromVariants, productFromCapture,
} from '@/features/aywebs/localProduct';

const CAPTURE = {
  title: 'T-shirt Coton',
  brand: 'Acme',
  images: [{ url: 'https://m.media-amazon.com/a.jpg' }, 'https://m.media-amazon.com/b.jpg', 'pas-une-url'],
  availabilityText: 'In stock',
  amazon: {
    pageAsin: 'B0PAGE0001',
    selectedAsin: 'B0PAGE0001',
    options: [
      { dimension: 'size', value: 'M', asin: 'B0SIZEMM01', selected: false, availabilityEvidence: 'available' },
      { dimension: 'size', value: 'L', asin: 'B0SIZELL02', selected: true, availabilityEvidence: 'unavailable' },
      { dimension: 'color', value: 'Noir', asin: 'B0SIZEMM01', selected: false, availabilityEvidence: 'available' },
    ],
    variants: [
      { asin: 'B0SIZEMM01', dimensions: [{ name: 'size', value: 'M' }, { name: 'color', value: 'Noir' }], selected: false },
      { asin: 'B0SIZELL02', dimensions: [{ name: 'size', value: 'L' }, { name: 'color', value: 'Noir' }], selected: true },
      { asin: 'B0SIZEXX03', dimensions: [{ name: 'size', value: 'XL' }], selected: false },
    ],
  },
};

describe('variantes depuis la capture', () => {
  it('ASIN, attributs et disponibilité prouvée par variante', () => {
    const variants = localVariantsFromCapture(CAPTURE);
    expect(variants.find((v) => v.asin === 'B0SIZEMM01')).toEqual({
      asin: 'B0SIZEMM01', attributes: { size: 'M', color: 'Noir' }, availability: 'AVAILABLE',
    });
    expect(variants.find((v) => v.asin === 'B0SIZELL02')?.availability).toBe('OUT_OF_STOCK');
  });

  it('variante sans preuve de disponibilité ⇒ UNKNOWN (jamais AVAILABLE par défaut)', () => {
    expect(localVariantsFromCapture(CAPTURE).find((v) => v.asin === 'B0SIZEXX03')?.availability).toBe('UNKNOWN');
  });

  it('groupes d\'attributs dans l\'ordre de la page, sans doublons', () => {
    const groups = groupsFromVariants(localVariantsFromCapture(CAPTURE));
    expect(groups).toEqual([
      { attribute: 'size', values: ['M', 'L', 'XL'] },
      { attribute: 'color', values: ['Noir'] },
    ]);
  });

  it('options : ASIN comme sourceVariantId, sans prix local', () => {
    const options = optionsFromVariants(localVariantsFromCapture(CAPTURE));
    expect(options[0].sourceVariantId).toBe('B0SIZEMM01');
    expect(options.every((o) => o.totalTnd === null && o.price === null)).toBe(true);
  });

  it('pas de section Amazon ⇒ aucune variante', () => {
    expect(localVariantsFromCapture({ title: 'x' })).toEqual([]);
  });
});

describe('produit depuis la capture', () => {
  it('titre, images http seulement, aucun prix local', () => {
    const product = productFromCapture(CAPTURE, 'https://www.amazon.com/dp/B0PAGE0001', 'amazon', 'Amazon');
    expect(product.title).toBe('T-shirt Coton');
    expect(product.images).toEqual(['https://m.media-amazon.com/a.jpg', 'https://m.media-amazon.com/b.jpg']);
    expect(product.price).toBeNull();
    expect(product.ayroviPricing).toBeNull();
    expect(product.sourceDomain).toBe('www.amazon.com');
  });
});

describe('prêt à confirmer (règles locales)', () => {
  const variants = localVariantsFromCapture(CAPTURE);
  const groups = groupsFromVariants(variants);

  it('choix complet et disponible ⇒ prêt', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'M', color: 'Noir' }, pageInStockText: false });
    expect(r.ready).toBe(true);
  });

  it('attribut manquant ⇒ VARIANT_REQUIRED et le nom de l\'attribut', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'M' }, pageInStockText: false });
    expect(r).toMatchObject({ ready: false, code: 'VARIANT_REQUIRED', missingAttributes: ['color'] });
  });

  it('variante en rupture ⇒ VARIANT_UNAVAILABLE', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'L', color: 'Noir' }, pageInStockText: true });
    expect(r.code).toBe('VARIANT_UNAVAILABLE');
    expect(r.ready).toBe(false);
  });

  it('combinaison absente de la page ⇒ VARIANT_UNKNOWN', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'XL', color: 'Noir' }, pageInStockText: true });
    expect(r.code).toBe('VARIANT_UNKNOWN');
  });

  it('disponibilité inconnue ⇒ STOCK_UNKNOWN (pas d\'ajout)', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'XL' }, pageInStockText: true });
    expect(r.ready).toBe(false);
    expect(r.code).toBe('VARIANT_REQUIRED');
    const xl = localAddReadiness({ groups: [{ attribute: 'size', values: ['XL'] }], variants, selection: { size: 'XL' }, pageInStockText: true });
    expect(xl).toMatchObject({ ready: false, code: 'STOCK_UNKNOWN' });
  });

  it('produit sans variante : prêt seulement si la page dit « en stock »', () => {
    expect(localAddReadiness({ groups: [], variants: [], selection: {}, pageInStockText: true }).ready).toBe(true);
    expect(localAddReadiness({ groups: [], variants: [], selection: {}, pageInStockText: false })).toMatchObject({ ready: false, code: 'STOCK_UNKNOWN' });
  });
});
