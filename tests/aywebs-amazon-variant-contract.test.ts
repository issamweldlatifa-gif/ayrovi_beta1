/**
 * AYWEBs — contrat de variantes Amazon (Phase 1, derrière AYWEBS_AMAZON_VARIANT_CONTRACT=1).
 *
 * Fixtures : pages Amazon.in réelles, prises d'un jeu public (Apache-2.0 / sans licence
 * explicite, voir REAL_CAPTURES.md), NETTOYÉES : scripts non liés aux variantes, iframes,
 * commentaires, identifiants de suivi et jetons retirés. Chaque test passe par le VRAI
 * script de lecture puis par la validation serveur.
 *
 * Règles verrouillées :
 *   1. drapeau désactivé ⇒ aucun refus de variante (comportement inchangé) ;
 *   2. fiche à variantes sans option choisie prouvée ⇒ VARIANT_NOT_PROVEN ;
 *   3. option choisie ≠ fiche ouverte ⇒ VARIANT_NOT_PROVEN ;
 *   4. option choisie « indisponible » ⇒ VARIANT_NOT_PROVEN ;
 *   5. option choisie disponible PROUVÉE ⇒ pas de refus de variante ;
 *   6. fiche simple (sans variante) ⇒ rien à prouver ;
 *   7. un nom d'option n'est jamais une preuve de stock (présence seule ⇒ refus).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import type { AyWebsCapturedPage } from '../shared/aywebsCapture';

const DIR = join(__dirname, 'fixtures', 'aywebs', 'amazon-in');
/** Les fixtures ne sont pas versionnées (source sans licence) : tests sautés si absentes, signalés. */
const FIXTURES_PRESENT = existsSync(join(DIR, 'amazon-in-variants-unavailable-B0CC4WHYRQ.html'));
const ASIN_OF = (file: string): string => file.match(/B0[A-Z0-9]{8}|\d{10}/)![0];

function readPage(file: string, dir = DIR, host = 'www.amazon.in'): { capture: AyWebsCapturedPage; url: string } {
  const asin = ASIN_OF(file);
  const url = `https://${host}/dp/${asin}`;
  const dom = new JSDOM(readFileSync(join(dir, file), 'utf8'), { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  const capture = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL))) as AyWebsCapturedPage;
  return { capture: { ...capture, capturedAt: new Date().toISOString() }, url };
}

/** Fiche à variantes : l'option choisie est la fiche ouverte, et son ASIN est prouvé. */
function variantCapture(overrides: Partial<NonNullable<AyWebsCapturedPage['amazon']>> = {}, availabilityText: string | null = null): {
  capture: AyWebsCapturedPage; url: string;
} {
  const url = 'https://www.amazon.in/dp/B0CC4WHYRQ';
  return {
    url,
    capture: {
      v: 1, url, canonicalUrl: url, title: 'Écouteurs test', brand: null, images: [],
      priceCandidates: [], currencyText: null, availabilityText, addToCartText: null,
      conditionText: null, selectedVariantTexts: [], variantTexts: [],
      capturedAt: new Date().toISOString(), diagnostics: [],
      amazon: {
        readerVersion: 1, pageAsin: 'B0CC4WHYRQ', selectedAsin: 'B0CC4WHYRQ',
        options: [
          { dimension: 'color', value: 'Green', asin: 'B0CC4WHYRQ', selected: true, availabilityEvidence: 'available', source: 'twister_dom' },
          { dimension: 'color', value: 'Black', asin: 'B09N3ZNHTY', selected: false, availabilityEvidence: 'available', source: 'twister_dom' },
        ],
        variants: [
          { asin: 'B0CC4WHYRQ', selected: true, dimensions: [{ name: 'color', value: 'Green' }], source: 'twister_dom' },
          { asin: 'B09N3ZNHTY', selected: false, dimensions: [{ name: 'color', value: 'Black' }], source: 'twister_dom' },
        ],
        ...overrides,
      },
    } as AyWebsCapturedPage,
  };
}

describe('contrat de variantes Amazon — drapeau', () => {
  beforeEach(() => { process.env.AYWEBS_AMAZON_VARIANT_CONTRACT = '1'; });
  afterEach(() => { delete process.env.AYWEBS_AMAZON_VARIANT_CONTRACT; });

  it('drapeau désactivé ⇒ aucun refus de variante', () => {
    delete process.env.AYWEBS_AMAZON_VARIANT_CONTRACT;
    const { capture, url } = variantCapture({ selectedAsin: null });
    expect(validateAyWebsCapturedPage(capture, url).rejection).not.toBe('VARIANT_NOT_PROVEN');
  });
});

describe.skipIf(!FIXTURES_PRESENT)('contrat de variantes Amazon — fiches réelles (lecteur + serveur)', () => {
  beforeEach(() => { process.env.AYWEBS_AMAZON_VARIANT_CONTRACT = '1'; });
  afterEach(() => { delete process.env.AYWEBS_AMAZON_VARIANT_CONTRACT; });

  it('le lecteur publie l\'option choisie et ses variantes, sans index numérique comme nom', () => {
    const { capture } = readPage('amazon-in-variants-unavailable-B0CC4WHYRQ.html');
    const values = (capture.amazon?.options || []).map((o) => o.value);
    expect(capture.amazon?.selectedAsin).toBe('B0CC4WHYRQ');
    expect(capture.amazon?.pageAsin).toBe('B0CC4WHYRQ');
    expect(values).toEqual(expect.arrayContaining(['Green', 'Black']));
    expect(values.every((v) => !/^\d+$/.test(v))).toBe(true);
  });

  it('option choisie sans disponibilité prouvée et sans texte « en stock » ⇒ VARIANT_NOT_PROVEN', () => {
    const { capture, url } = readPage('amazon-in-variants-unavailable-B0CC4WHYRQ.html');
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.ok).toBe(false);
    expect(result.rejection).toBe('VARIANT_NOT_PROVEN');
    expect(result.notes.join(' ')).toContain('variant:selected_availability_unproven');
  });

  it('fiche dont l\'unique variante est la fiche ouverte ⇒ aucun refus de variante (le prix est refusé ailleurs : devise INR non supportée)', () => {
    const { capture, url } = readPage('amazon-in-variants-unavailable-B0CYWHJJTN.html');
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.rejection).not.toBe('VARIANT_NOT_PROVEN');
    expect(result.rejection).toBe('NO_PRICE_TEXT');
  });

  it('fiche simple sans variante ⇒ aucun refus de variante', () => {
    const { capture, url } = readPage('amazon-in-simple-B0D8BFWH5J.html');
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.rejection).not.toBe('VARIANT_NOT_PROVEN');
  });
});

describe('contrat de variantes Amazon — cas synthétiques', () => {
  beforeEach(() => { process.env.AYWEBS_AMAZON_VARIANT_CONTRACT = '1'; });
  afterEach(() => { delete process.env.AYWEBS_AMAZON_VARIANT_CONTRACT; });

  it('option choisie absente ⇒ selected_unproven', () => {
    const { capture, url } = variantCapture({ selectedAsin: null });
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.rejection).toBe('VARIANT_NOT_PROVEN');
    expect(result.notes.join(' ')).toContain('variant:selected_unproven');
  });

  it('option choisie hors des variantes ⇒ selected_not_in_variants', () => {
    const { capture, url } = variantCapture({ selectedAsin: 'B0ZZZZZZZZ' });
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.notes.join(' ')).toContain('variant:selected_not_in_variants');
  });

  it('option choisie ≠ fiche ouverte ⇒ selected_not_page', () => {
    const { capture, url } = variantCapture({ pageAsin: 'B09N3ZNHTY' });
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.rejection).toBe('VARIANT_NOT_PROVEN');
    expect(result.notes.join(' ')).toContain('variant:selected_not_page');
  });

  it('option choisie indisponible ⇒ selected_unavailable', () => {
    const selectedUnavailable = [
      { dimension: 'color', value: 'Green', asin: 'B0CC4WHYRQ', selected: true, availabilityEvidence: 'unavailable' as const, source: 'twister_dom' },
    ];
    const { capture, url } = variantCapture({ options: selectedUnavailable }, 'In stock');
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.notes.join(' ')).toContain('variant:selected_unavailable');
  });

  it('option choisie disponible prouvée ⇒ aucun refus de variante', () => {
    const { capture, url } = variantCapture({});
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.rejection).not.toBe('VARIANT_NOT_PROVEN');
  });

  it('un simple nom d\'option présent n\'est PAS une preuve de stock', () => {
    const optionOnly = [
      { dimension: 'color', value: 'Green', asin: 'B0CC4WHYRQ', selected: true, availabilityEvidence: 'unknown' as const, source: 'twister_dom' },
    ];
    const { capture, url } = variantCapture({ options: optionOnly }, null);
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.rejection).toBe('VARIANT_NOT_PROVEN');
    expect(result.notes.join(' ')).toContain('variant:selected_availability_unproven');
  });

  it('un ASIN de variante mal formé est ignoré (jamais pris pour une variante)', () => {
    const { capture, url } = variantCapture({
      variants: [{ asin: 'not-an-asin', selected: false, dimensions: [{ name: 'color', value: 'X' }] }],
      options: [{ dimension: 'color', value: 'Green', asin: 'B0CC4WHYRQ', selected: true, availabilityEvidence: 'available' }],
    }, 'In stock');
    const result = validateAyWebsCapturedPage(capture, url);
    expect(result.rejection).not.toBe('VARIANT_NOT_PROVEN');
  });
});

describe.skipIf(!FIXTURES_PRESENT)('lecture du titre Amazon (#productTitle)', () => {
  for (const file of [
    'amazon-in-variants-unavailable-B0CC4WHYRQ.html',
    'amazon-in-variants-unavailable-B0CYWHJJTN.html',
    'amazon-in-simple-B0D8BFWH5J.html',
  ]) {
    it(`titre non vide pour ${file}`, () => {
      const { capture } = readPage(file);
      expect(typeof capture.title).toBe('string');
      expect((capture.title || '').length).toBeGreaterThan(5);
    });
  }
});

/** Pages amazon.com en rupture (urp2015, Apache-2.0), nettoyées — `#availability` = « Currently unavailable ». */
const US_DIR = join(__dirname, 'fixtures', 'aywebs', 'amazon-us');
const US_FIXTURES_PRESENT = existsSync(join(US_DIR, 'amazon-us-oos-simple-0641674791.html'));

describe.skipIf(!US_FIXTURES_PRESENT)('pages en rupture de stock (amazon.com)', () => {
  for (const file of [
    'amazon-us-oos-simple-0641674791.html',
    'amazon-us-oos-simple-B0000224VM.html',
    'amazon-us-oos-simple-0000037214.html',
  ]) {
    it(`titre et disponibilité lus, aucun prix accepté : ${file}`, () => {
      process.env.AYWEBS_AMAZON_VARIANT_CONTRACT = '1';
      try {
        const { capture, url } = readPage(file, US_DIR, 'www.amazon.com');
        expect((capture.title || '').length).toBeGreaterThan(5);
        expect(capture.availabilityText || '').toMatch(/currently unavailable/i);
        expect(capture.priceCandidates).toEqual([]);
        const result = validateAyWebsCapturedPage(capture, url);
        expect(result.ok).toBe(false);
        expect(result.price).toBe(0);
        expect(result.rejection).toBe('OUT_OF_STOCK');
      } finally {
        delete process.env.AYWEBS_AMAZON_VARIANT_CONTRACT;
      }
    });
  }
});

describe('rupture : OUT_OF_STOCK (au lieu de NO_PRICE_TEXT)', () => {
  const url = 'https://www.amazon.com/dp/B0000224VM';
  const base = (availabilityText: string | null, withPrice = false) => ({
    v: 1, url, canonicalUrl: url, title: 'Chapeau de test', brand: null, images: [],
    priceCandidates: withPrice ? [{ text: '$19.99', source: 'dom' as const }] : [],
    currencyText: null, availabilityText, addToCartText: null, conditionText: null,
    selectedVariantTexts: [], variantTexts: [], capturedAt: new Date().toISOString(), diagnostics: [],
    amazon: { readerVersion: 1, pageAsin: 'B0000224VM', selectedAsin: null, options: [], variants: [] },
  }) as unknown as AyWebsCapturedPage;

  it('texte « Currently unavailable » sans prix ⇒ OUT_OF_STOCK', () => {
    expect(validateAyWebsCapturedPage(base('Currently unavailable. We don\'t know when or if this item will be back in stock.'), url).rejection).toBe('OUT_OF_STOCK');
  });
  it('variante française « Actuellement indisponible » sans prix ⇒ OUT_OF_STOCK', () => {
    expect(validateAyWebsCapturedPage(base('Actuellement indisponible.'), url).rejection).toBe('OUT_OF_STOCK');
  });
  it('aucun texte de disponibilité et aucun prix ⇒ NO_PRICE_TEXT (inchangé)', () => {
    expect(validateAyWebsCapturedPage(base(null), url).rejection).toBe('NO_PRICE_TEXT');
  });
  it('en stock sans prix ⇒ NO_PRICE_TEXT (pas OUT_OF_STOCK)', () => {
    expect(validateAyWebsCapturedPage(base('In stock.'), url).rejection).toBe('NO_PRICE_TEXT');
  });
  it('un prix publié n\'est jamais écarté par OUT_OF_STOCK (refus par la règle de prix)', () => {
    expect(validateAyWebsCapturedPage(base('Currently unavailable.', true), url).rejection).not.toBe('OUT_OF_STOCK');
  });
});

describe.skipIf(!US_FIXTURES_PRESENT)('ancien tracé Amazon à variantes (amazon.com)', () => {
  const file = 'amazon-us-variants-legacy-B00008I8YM.html';
  it('lit le choix (ASIN de la fiche), et chaque taille avec son ASIN et son état', () => {
    const { capture } = readPage(file, US_DIR, 'www.amazon.com');
    expect(capture.amazon?.pageAsin).toBe('B00008I8YM');
    expect(capture.amazon?.selectedAsin).toBe('B00008I8YM');
    const sizes = (capture.amazon?.options || []).filter((o) => o.dimension === 'size');
    expect(sizes.length).toBeGreaterThan(5);
    expect(sizes.every((o) => /^[A-Z0-9]{10}$/.test(o.asin || ''))).toBe(true);
    expect(sizes.some((o) => o.availabilityEvidence === 'available')).toBe(true);
  });
  it('le libellé est le texte visible, jamais l\'index de la liste (« 2,B0000ZC7J2 » ⇒ « 7 »)', () => {
    const { capture } = readPage(file, US_DIR, 'www.amazon.com');
    const seven = (capture.amazon?.options || []).find((o) => o.asin === 'B0000ZC7J2');
    expect(seven?.value).toBe('7');
  });
  it('option choisie sans disponibilité prouvée ⇒ VARIANT_NOT_PROVEN (flag on)', () => {
    process.env.AYWEBS_AMAZON_VARIANT_CONTRACT = '1';
    try {
      const { capture, url } = readPage(file, US_DIR, 'www.amazon.com');
      const result = validateAyWebsCapturedPage(capture, url);
      expect(result.rejection).toBe('VARIANT_NOT_PROVEN');
    } finally {
      delete process.env.AYWEBS_AMAZON_VARIANT_CONTRACT;
    }
  });
});
