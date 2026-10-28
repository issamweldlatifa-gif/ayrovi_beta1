import { describe, expect, it } from 'vitest';
import { parseAyWebsResolvedProduct } from '@/api/aywebs';
import { selectionQuote } from '@/features/aywebs/selectionQuote';
import {
  buildVariantMatrixKey,
  clearVariantMatrixCache,
  readCachedSelectionProof,
  resolveQuantityTotalTnd,
  upsertVariantMatrixCache,
} from '@/features/aywebs/variantMatrixCache';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT } from '@/features/aywebs/networkObserverScript';

describe('AYWEBs Mobile — VariantMatrixCache, lookup 0 ms, paliers quantité & observer réseau', () => {
  it('fusionne la matrice initiale et les lectures delta sans jamais effacer les variantes précédentes ni hériter du prix de base', () => {
    clearVariantMatrixCache();
    const matrixKey = buildVariantMatrixKey({
      storeId: 'shein',
      sourceUrl: 'https://fr.shein.com/Ensemble-enfant-p-51200911.html',
      productId: 'SHEIN-51200911',
    });

    const initialProduct = parseAyWebsResolvedProduct({
      product_id: 'aywprd_initial',
      store_id: 'shein',
      store_name: 'SHEIN',
      source_url: 'https://fr.shein.com/Ensemble-enfant-p-51200911.html',
      source_domain: 'fr.shein.com',
      title: 'Ensemble enfant hiver',
      brand: 'SHEIN Kids',
      images: ['https://img.ltwebstatic.com/noir.jpg'],
      price: 13.9,
      currency: 'EUR',
      price_verified: true,
      currency_verified: true,
      availability: { state: 'AVAILABLE', reason: 'in_stock', checked_at: '2026-10-28T00:00:00Z', source: 'webview', quantity_hint: 15 },
      purchase_mode: 'ASSISTED',
      integration_type: 'WEBVIEW',
      ayrovi_pricing: {
        total_tnd: 82.4,
        pricing_version: 4,
        quantity_totals_tnd: [82.4, 152.1, 221.8],
        breakdown: null,
      },
      variant_groups: [
        { attribute: 'Couleur', values: ['Noir', 'Beige'] },
        { attribute: 'Âge', values: ['4-5Y', '8-9Y'] },
        { attribute: 'Type', values: ['Standard', 'Doublé Polaire'] },
      ],
      variant_details: [
        {
          source_variant_id: 'shein:51200911:4Y_STD',
          attributes: { Couleur: 'Noir', 'Âge': '4-5Y', Type: 'Standard' },
          label: 'Noir / 4-5Y / Standard',
          price: 13.9,
          currency: 'EUR',
          quoted_price: 13.9,
          quoted_currency: 'EUR',
          price_source: 'VARIANT',
          availability: 'AVAILABLE',
          availability_reason: 'sku_in_stock_capture:15',
          stock: 15,
          image: 'https://img.ltwebstatic.com/noir.jpg',
          ayrovi_pricing: { total_tnd: 82.4, pricing_version: 4, quantity_totals_tnd: [82.4, 152.1, 221.8] },
        },
        {
          source_variant_id: 'shein:51200911:8Y_FLEECE',
          attributes: { Couleur: 'Noir', 'Âge': '8-9Y', Type: 'Doublé Polaire' },
          label: 'Noir / 8-9Y / Doublé Polaire',
          price: 21.9,
          currency: 'EUR',
          quoted_price: 21.9,
          quoted_currency: 'EUR',
          price_source: 'VARIANT',
          availability: 'LOW_STOCK',
          availability_reason: 'sku_low_stock_capture:4',
          stock: 4,
          quantity_tiers: [{ minQuantity: 2, unitPrice: 19.5 }],
          image: 'https://img.ltwebstatic.com/noir.jpg',
          ayrovi_pricing: { total_tnd: 118.9, pricing_version: 4, quantity_totals_tnd: [118.9, 206.5, 305.0] },
        },
        {
          source_variant_id: 'shein:51200933:4Y_STD',
          variant_url: 'https://fr.shein.com/Ensemble-enfant-p-51200933.html',
          attributes: { Couleur: 'Beige', 'Âge': '4-5Y', Type: 'Standard' },
          label: 'Beige / 4-5Y / Standard',
          price: null,
          currency: '',
          quoted_price: null,
          quoted_currency: '',
          price_source: 'UNKNOWN',
          availability: 'UNKNOWN',
          availability_reason: 'sku_stock_unspecified_capture',
          image: 'https://img.ltwebstatic.com/beige.jpg',
          ayrovi_pricing: null,
        },
      ],
      variant_quotes: [],
      from_cache: false,
      cache_age_ms: null,
    });

    const snap1 = upsertVariantMatrixCache({
      matrixKey,
      product: initialProduct,
      selection: { Couleur: 'Noir', 'Âge': '4-5Y', Type: 'Standard' },
      capture: { url: 'https://fr.shein.com/Ensemble-enfant-p-51200911.html', tag: 'noir' },
      quoteToken: 'tok_noir',
      sourceUrl: 'https://fr.shein.com/Ensemble-enfant-p-51200911.html',
    });

    /* 1. Bascule en mémoire vers Noir + 8-9Y + Doublé Polaire => 118.9 TND immédiat + remise palier q=2 */
    const qFleece = selectionQuote({
      page: null,
      quotes: snap1.variantQuotes,
      combinations: snap1.variantDetails,
      selection: { Couleur: 'Noir', 'Âge': '8-9Y', Type: 'Doublé Polaire' },
    });
    expect(qFleece.unitTnd).toBe(118.9);
    expect(qFleece.sourcePrice).toBe(21.9);
    expect(resolveQuantityTotalTnd(qFleece, 1)).toBe(118.9);
    expect(resolveQuantityTotalTnd(qFleece, 2)).toBe(206.5);
    expect(resolveQuantityTotalTnd(qFleece, 2)).toBeLessThan(118.9 * 2);

    /* 2. Bascule vers Beige non vérifié => unitTnd: null (jamais 82.4 !) + missingVariantUrl prêt */
    const qBeigeUnverified = selectionQuote({
      page: {
        selection: { Couleur: 'Noir', 'Âge': '4-5Y', Type: 'Standard' },
        unitTnd: 82.4,
        availability: 'AVAILABLE',
        stock: 15,
        sourcePrice: 13.9,
        sourceCurrency: 'EUR',
      },
      quotes: snap1.variantQuotes,
      combinations: snap1.variantDetails,
      selection: { Couleur: 'Beige', 'Âge': '4-5Y', Type: 'Standard' },
    });
    expect(qBeigeUnverified.unitTnd).toBeNull();
    expect(qBeigeUnverified.sourcePrice).toBeNull();
    expect(qBeigeUnverified.missingVariantUrl).toBe('https://fr.shein.com/Ensemble-enfant-p-51200933.html');

    /* 3. Lecture delta unique de Beige => fusionnée dans le cache SANS perdre Noir ! */
    const beigeDeltaProduct = parseAyWebsResolvedProduct({
      product_id: 'aywprd_beige',
      store_id: 'shein',
      store_name: 'SHEIN',
      source_url: 'https://fr.shein.com/Ensemble-enfant-p-51200933.html',
      source_domain: 'fr.shein.com',
      title: 'Ensemble enfant hiver Beige',
      brand: 'SHEIN Kids',
      images: ['https://img.ltwebstatic.com/beige.jpg'],
      price: 15.5,
      currency: 'EUR',
      price_verified: true,
      currency_verified: true,
      availability: { state: 'AVAILABLE', reason: 'in_stock', checked_at: '2026-10-28T00:00:00Z', source: 'webview', quantity_hint: 9 },
      purchase_mode: 'ASSISTED',
      integration_type: 'WEBVIEW',
      ayrovi_pricing: { total_tnd: 89.7, pricing_version: 4, quantity_totals_tnd: [89.7, 166.7], breakdown: null },
      variant_groups: [],
      variant_details: [],
      variant_quotes: [],
      from_cache: false,
      cache_age_ms: null,
    });

    const snap2 = upsertVariantMatrixCache({
      matrixKey,
      product: beigeDeltaProduct,
      selection: { Couleur: 'Beige', 'Âge': '4-5Y', Type: 'Standard' },
      capture: { url: 'https://fr.shein.com/Ensemble-enfant-p-51200933.html', tag: 'beige' },
      quoteToken: 'tok_beige',
      sourceUrl: 'https://fr.shein.com/Ensemble-enfant-p-51200933.html',
    });

    const qBeigeAfterDelta = selectionQuote({
      page: null,
      quotes: snap2.variantQuotes,
      combinations: snap2.variantDetails,
      selection: { Couleur: 'Beige', 'Âge': '4-5Y', Type: 'Standard' },
    });
    expect(qBeigeAfterDelta.unitTnd).toBe(89.7);
    expect(qBeigeAfterDelta.sourcePrice).toBe(15.5);

    /* Et revenir à Noir + 8-9Y + Doublé Polaire reste instantané en mémoire (118.9 TND) ! */
    const qBackToNoir = selectionQuote({
      page: null,
      quotes: snap2.variantQuotes,
      combinations: snap2.variantDetails,
      selection: { Couleur: 'Noir', 'Âge': '8-9Y', Type: 'Doublé Polaire' },
    });
    expect(qBackToNoir.unitTnd).toBe(118.9);
    expect(readCachedSelectionProof(matrixKey, { Couleur: 'Noir', 'Âge': '4-5Y', Type: 'Standard' })?.quoteToken).toBe('tok_noir');
    expect(readCachedSelectionProof(matrixKey, { Couleur: 'Beige', 'Âge': '4-5Y', Type: 'Standard' })?.quoteToken).toBe('tok_beige');
  });

  it('résout le conflit Amazon 2D (Color $109 vs Size $119) grâce à la priorité de la combinaison exacte', () => {
    const q = selectionQuote({
      page: {
        selection: { Size: 'Small', Color: 'Obsidian' },
        unitTnd: 375.0,
        availability: 'AVAILABLE',
        stock: null,
        sourcePrice: 99,
        sourceCurrency: 'USD',
      },
      quotes: [
        { group: 'Color', value: 'Emerald Leaf', availability: 'AVAILABLE', stock: null, sourcePrice: 109, currency: 'USD', priceFrom: false, totalTnd: 410.0, pricingVersion: 4 },
        { group: 'Size', value: 'Medium', availability: 'AVAILABLE', stock: null, sourcePrice: 119, currency: 'USD', priceFrom: false, totalTnd: 446.5, pricingVersion: 4 },
      ],
      combinations: [
        {
          attributes: { size: 'Medium', color: 'Emerald Leaf' },
          totalTnd: 446.5,
          quotedPrice: 119,
          quotedCurrency: 'USD',
          availability: 'AVAILABLE',
        },
      ],
      selection: { Size: 'Medium', Color: 'Emerald Leaf' },
    });
    expect(q.unitTnd).toBe(446.5);
    expect(q.sourcePrice).toBe(119);
    expect(q.availability).toBe('AVAILABLE');
  });

  it('fournit un script observateur réseau ES5 idempotent et borné', () => {
    expect(AYWEBS_NETWORK_OBSERVER_SCRIPT).toContain('__aywebsNetObserverInstalled');
    expect(AYWEBS_NETWORK_OBSERVER_SCRIPT).toContain('__aywebsNetPayloads');
    expect(AYWEBS_NETWORK_OBSERVER_SCRIPT).not.toMatch(/\b(?:const|let)\b|=>/);
  });
});
