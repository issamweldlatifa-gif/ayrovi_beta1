import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProductPageHtml } from '../src/scraper/productPageParser';
import { checkPriceText, priceFromText } from '../src/scraper/priceIntegrity';

/**
 * AYWEBs — INTÉGRITÉ DU PRIX (« Phase 0 », 06/10/2026).
 *
 * Ces tests figent les DEUX lectures fausses reproduites par l'audit du
 * 06/10/2026, à partir des pages réellement enregistrées ce jour-là :
 *
 *   1. /dp/B0D1XD1ZV3 (mobile, Amazon US) — la grappe de prix rendait
 *      « $6.99$6.99 » (prix hors-écran + visible concaténés) et AYROVI
 *      publiait **6996.99** avec `price_verified=true`.
 *   2. /dp/B0D1XD1ZV3 (Amazon DE, page rendue) — le seul montant « lisible »
 *      était **€18.74**, prix d'une PUBLICITÉ pour un autre ASIN
 *      (`B0CFQN45PF`), publié lui aussi comme vérifié.
 *
 * Règle tenue par cette suite : un montant ambigu ne devient JAMAIS un prix.
 * Mieux vaut « prix non confirmé » qu'un chiffre inventé.
 */
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', 'aywebs', name), 'utf8');

describe('AYWEBs — verdict d’intégrité du prix (unitaire)', () => {
  const cases: Array<{ text: string; ok: boolean; value: number; reason: string | null }> = [
    // Les deux concaténations observées en production le 06/10/2026.
    { text: '$6.99$6.99', ok: false, value: 0, reason: 'DUPLICATED_TEXT' },
    { text: '35.1435.14', ok: false, value: 0, reason: 'DUPLICATED_TEXT' },
    { text: '€18.74€18.74', ok: false, value: 0, reason: 'DUPLICATED_TEXT' },
    // Même montant répété (hors-écran + visible séparés par une espace).
    { text: '$6.99 $6.99', ok: false, value: 0, reason: 'DUPLICATED_TEXT' },
    // Deux montants : prix barré, fourchette, « à partir de ».
    { text: '6.99 - 7.99', ok: false, value: 0, reason: 'MULTIPLE_AMOUNTS' },
    { text: '6.99 € 7.99', ok: false, value: 0, reason: 'MULTIPLE_AMOUNTS' },
    { text: '$15.99 $12.99', ok: false, value: 0, reason: 'REPEATED_SYMBOL' },
    // Séparateurs qu'aucune locale n'écrit.
    { text: '1,299,00', ok: false, value: 0, reason: 'MALFORMED_NUMBER' },
    // Devises contradictoires.
    { text: '€18.74 USD', ok: false, value: 0, reason: 'CURRENCY_CONFLICT' },
    // Hors bornes.
    { text: '0', ok: false, value: 0, reason: 'OUT_OF_RANGE' },
    { text: '', ok: false, value: 0, reason: 'EMPTY' },
    { text: 'Prix indisponible', ok: false, value: 0, reason: 'NO_DIGITS' },
    // Formats légitimes : ils doivent continuer à passer.
    { text: '$6.99', ok: true, value: 6.99, reason: null },
    { text: '6.99', ok: true, value: 6.99, reason: null },
    { text: '109,00 €', ok: true, value: 109, reason: null },
    { text: '1 299,00 €', ok: true, value: 1299, reason: null },
    { text: '1.299,00 €', ok: true, value: 1299, reason: null },
    { text: '6.996,99', ok: true, value: 6996.99, reason: null },
    { text: '$1,299.00 USD', ok: true, value: 1299, reason: null },
    { text: 'Prix : 109,00 € TTC', ok: true, value: 109, reason: null },
    { text: 'د.ت 250,00', ok: true, value: 250, reason: null },
  ];

  for (const testCase of cases) {
    it(`« ${testCase.text} » → ${testCase.ok ? testCase.value : testCase.reason}`, () => {
      const check = checkPriceText(testCase.text);
      expect(check.ok).toBe(testCase.ok);
      expect(check.value).toBe(testCase.value);
      expect(check.reason).toBe(testCase.reason);
      expect(priceFromText(testCase.text)).toBe(testCase.value);
    });
  }

  it('n’accepte jamais un montant ≥ 1 000 000 (borne historique conservée)', () => {
    expect(checkPriceText('999999').ok).toBe(true);
    expect(checkPriceText('1000000').ok).toBe(false);
  });
});

describe('AYWEBs — lecture réelle des pages enregistrées (goldens)', () => {
  it('Amazon US mobile : le prix concaténé ne devient plus 6996.99 — la grappe rend 6.99', () => {
    const parsed = parseProductPageHtml(
      fixture('amazon-us-mobile-concat-price.html'),
      'https://www.amazon.com/dp/B0D1XD1ZV3',
      'amazon',
    );
    // Le défaut d'origine :
    expect(parsed.price).not.toBe(6996.99);
    // La lecture correcte, reconstruite depuis `a-price-whole`/`a-price-fraction` :
    expect(parsed.price).toBe(6.99);
    expect(parsed.priceSource).toBe('dom');
    // La devise reste NON vérifiée : « $ » seul n'est pas une preuve (USD/CAD/AUD…).
    expect(parsed.currency).toBe('');
    expect(parsed.currencyVerified).toBe(false);
    expect(parsed.title).toContain('AirPods');
    expect(parsed.images.length).toBeGreaterThan(0);
  });

  it('Amazon DE rendu : le prix d’une publicité (18.74 €, autre ASIN) n’est plus publié', () => {
    const parsed = parseProductPageHtml(
      fixture('amazon-de-rendered-sponsored-price.html'),
      'https://www.amazon.de/dp/B0D1XD1ZV3',
      'amazon',
    );
    expect(parsed.price).not.toBe(18.74);
    expect(parsed.price).toBe(0);
    expect(parsed.priceSource).toBe('none');
    // Le titre, lui, reste lisible : la page est bien la fiche du produit.
    expect(parsed.title).toContain('AirPods');
  });

  it('page « coquille » (3,7 Ko) : aucun prix, aucune image, jamais de valeur inventée', () => {
    const parsed = parseProductPageHtml(
      fixture('amazon-shell.html'),
      'https://www.amazon.com/dp/B0D1XD1ZV3',
      'amazon',
    );
    expect(parsed.price).toBe(0);
    expect(parsed.currency).toBe('');
    expect(parsed.images).toEqual([]);
    expect(parsed.priceSource).toBe('none');
  });
});
