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
const ASIN_OF = (file: string): string => file.match(/B0[A-Z0-9]{8}/)![0];

function readPage(file: string): { capture: AyWebsCapturedPage; url: string } {
  const asin = ASIN_OF(file);
  const url = `https://www.amazon.in/dp/${asin}`;
  const dom = new JSDOM(readFileSync(join(DIR, file), 'utf8'), { url });
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
