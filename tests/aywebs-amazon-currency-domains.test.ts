/**
 * AYWEBs — devise par domaine Amazon non-USD (19/10/2026).
 *
 * Avant : `$` n'était reconnu comme devise que pour les domaines USD ; sur
 * amazon.ca / .com.au / .sg / .com.mx / .com.br aucune règle de remplacement
 * n'existait, donc la preuve de devise échouait alors que le prix était lu.
 * Ces tests fixent la devise locale de chaque domaine, sans toucher au
 * comportement USD existant ni à la vérification du prix.
 */
import { describe, expect, it } from 'vitest';

import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';

const capturedAt = new Date().toISOString();

function payloadFor(url: string, priceText: string, currencyText: string | null = null) {
  return {
    v: 1,
    url,
    canonicalUrl: url,
    capturedAt,
    title: 'Produit test',
    brand: '',
    images: [],
    priceCandidates: [{ text: priceText, source: 'dom' }],
    currencyText,
    availabilityText: 'En stock',
    addToCartText: 'Ajouter au panier',
    conditionText: 'Neuf',
    selectedVariantTexts: [],
    variantTexts: [],
  };
}

const cases: Array<{ url: string; price: string; iso: string; value: number }> = [
  { url: 'https://www.amazon.ca/dp/B0TESTCA01', price: 'C$ 49.99', iso: 'CAD', value: 49.99 },
  { url: 'https://www.amazon.com.au/dp/B0TESTAU01', price: 'A$ 59.00', iso: 'AUD', value: 59 },
  { url: 'https://www.amazon.sg/dp/B0TESTSG01', price: 'S$ 39.90', iso: 'SGD', value: 39.9 },
  { url: 'https://www.amazon.com.mx/dp/B0TESTMX01', price: 'MX$ 1,299.00', iso: 'MXN', value: 1299 },
  { url: 'https://www.amazon.com.br/dp/B0TESTBR01', price: 'R$ 199,90', iso: 'BRL', value: 199.9 },
];

describe('devise locale par domaine Amazon', () => {
  for (const c of cases) {
    it(`${new URL(c.url).hostname} : ${c.price} ⇒ ${c.iso}`, () => {
      const result = validateAyWebsCapturedPage(payloadFor(c.url, c.price), c.url);
      expect(result.currency).toBe(c.iso);
      expect(result.currencyVerified).toBe(true);
      expect(result.price).toBe(c.value);
    });
  }

  it('amazon.com (USD) reste inchangé : « $ » ⇒ USD', () => {
    const url = 'https://www.amazon.com/dp/B0TESTUS01';
    const result = validateAyWebsCapturedPage(payloadFor(url, '$49.99'), url);
    expect(result.currency).toBe('USD');
  });

  it('`$` nu sur amazon.ca reste ambigu (CAD ou USD) : aucune preuve sans code publié', () => {
    const url = 'https://www.amazon.ca/dp/B0TESTCA02';
    const result = validateAyWebsCapturedPage(payloadFor(url, '$49.99'), url);
    expect(result.currencyVerified).toBe(false);
    expect(result.notes.join(' ')).toContain('currency_symbol_host_ambiguous:USD');
  });

  it('une devise publiée qui contredit le symbole reste refusée', () => {
    const url = 'https://www.amazon.ca/dp/B0TESTCA03';
    const result = validateAyWebsCapturedPage(payloadFor(url, '$49.99', 'EUR'), url);
    expect(result.currencyVerified).toBe(false);
  });
});
