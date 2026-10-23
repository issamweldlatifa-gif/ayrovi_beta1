/**
 * AYWEBs — « où ai-je le droit d'injecter le lecteur ? » (23/10/2026, Zalando).
 *
 * Constat du client, capture d'écran à l'appui : sur zalando.de, le lecteur
 * partait TOUT SEUL sur une page de magasin (« Zalando is available in
 * Austria »), trois fois, sans qu'aucun bouton ne soit pressé — et le journal
 * disait « capture valide ». Injecter le lecteur sur une page d'accueil, un
 * rayon ou une redirection pays est une faute : on y lit des prix de
 * publicité, et l'écran peut ouvrir une feuille de choix sur « rien ».
 *
 * Ce que ces tests verrouillent, dans l'ordre de l'architecture :
 *   1. LE SERVEUR décide, par URL : `capture_injection` ∈ product_page |
 *      on_demand | never ;
 *   2. LE SERVEUR REJUGE la page lue quand l'URL ne peut rien prouver : une
 *      capture de magasin est refusée `NOT_A_PRODUCT_PAGE` — pas « prix
 *      illisible » ;
 *   3. LA RÈGLE de nature de page est UNE, et la copie de l'application ne
 *      dérive pas de celle du serveur (comparaison sur les 64 signaux).
 */
import { describe, expect, it } from 'vitest';

import { analyzeAyWebsUrl, captureInjectionFor } from '../src/aywebs/browser';
import {
  ayWebsPageSignalsOf, classifyAyWebsCapturedPage, validateAyWebsCapturedPage,
} from '../src/aywebs/webviewCapture';
import {
  classifyPageSignals as mobileClassify, pageSignalsOf as mobileSignals,
} from '../apps/mobile/src/features/aywebs/pageKind';
import { AYWEBS_CAPTURE_VERSION, type AyWebsPageSignals } from '../shared/aywebsCapture';

const ZALANDO_HOME = 'https://www.zalando.de/';
const ZALANDO_PRODUCT = 'https://www.zalando.de/nike-air-force-1-weiss-ni111a0s2-a0011.html';
const scrubbed = { cleanPastedUrl: (value: string) => value.trim() } as never;

describe('décision d’injection — le serveur, par URL', () => {
  it('Zalando, page d’accueil : aucune injection (motif de fiche absent)', () => {
    /* Le cas exact de la capture du client : la page s'ouvre, rien ne doit
       partir. Avant, `capturePage` était vrai pour toute page du catalogue. */
    const analysis = analyzeAyWebsUrl(ZALANDO_HOME, scrubbed);
    expect(analysis.isProductPage).toBe(false);
    expect(analysis.captureInjection).toBe('never');
  });

  it('Zalando, fiche produit : lecture permise, pré-lecture comprise', () => {
    const analysis = analyzeAyWebsUrl(ZALANDO_PRODUCT, scrubbed);
    expect(analysis.isProductPage).toBe(true);
    expect(analysis.captureInjection).toBe('product_page');
  });

  it('Amazon, rayon : aucune injection ; Amazon, fiche : product_page', () => {
    expect(analyzeAyWebsUrl('https://www.amazon.com/s?k=tablet', scrubbed).captureInjection).toBe('never');
    expect(analyzeAyWebsUrl('https://www.amazon.com/dp/B0GYM3V9H5', scrubbed).captureInjection).toBe('product_page');
  });

  it('boutique sans motif d’URL : lecture À LA DEMANDE, jamais en silence', () => {
    expect(analyzeAyWebsUrl('https://www.mediamarkt.de/de/product/_tv-123.html', scrubbed).captureInjection).toBe('on_demand');
    expect(captureInjectionFor({
      registered: true, recognition: 'capture', isProductPage: false, captureAllowed: true, externalCaptureAllowed: false,
    })).toBe('on_demand');
  });

  it('domaine inconnu : à la demande si la capture externe est ouverte', () => {
    expect(analyzeAyWebsUrl('https://shop.example.com/p/1234', scrubbed).captureInjection).toBe('on_demand');
    expect(captureInjectionFor({
      registered: false, recognition: 'none', isProductPage: false, captureAllowed: false, externalCaptureAllowed: false,
    })).toBe('never');
  });
});

/* ── La nature de la page lue ─────────────────────────────────────────────── */

function captureOf(signals: Partial<AyWebsPageSignals>, extra: Record<string, unknown> = {}) {
  return {
    v: AYWEBS_CAPTURE_VERSION,
    url: ZALANDO_HOME,
    canonicalUrl: null,
    title: signals.hasTitle ? 'Zalando is available in Austria' : null,
    priceCandidates: signals.hasPrice ? [{ text: '$29.99', source: 'dom' }] : [],
    availabilityText: null,
    addToCartText: signals.hasPurchaseControl ? 'Ajouter au panier' : null,
    variantGroups: signals.hasVariants ? [{ name: 'Taille', values: ['S', 'M'], selected: ['M'] }] : [],
    images: signals.hasImages ? ['https://img.example.com/a.jpg'] : [],
    capturedAt: new Date().toISOString(),
    amazon: signals.hasProductShell
      ? { readerVersion: 2, pageAsin: 'B0GYM3V9H5', selectedAsin: 'B0GYM3V9H5', options: [], variants: [] }
      : null,
    ...extra,
  };
}

describe('nature de la page — règle fermée', () => {
  it('une page de magasin (titre, aucune vente) n’est PAS une fiche', () => {
    const capture = captureOf({ hasTitle: true, hasImages: true });
    expect(classifyAyWebsCapturedPage(ayWebsPageSignalsOf(capture as never))).toEqual({
      kind: 'STOREFRONT', reason: 'aucun_repere_de_fiche',
    });
    const validation = validateAyWebsCapturedPage(capture, ZALANDO_HOME, { requireProductPage: true });
    expect(validation.ok).toBe(false);
    expect(validation.rejection).toBe('NOT_A_PRODUCT_PAGE');
    expect(validation.notes).toContain('page_kind:STOREFRONT');
  });

  it('un prix SANS identité d’article est une bannière, pas un produit', () => {
    const capture = captureOf({ hasPrice: true, hasImages: true });
    expect(classifyAyWebsCapturedPage(ayWebsPageSignalsOf(capture as never)).kind).toBe('AD');
    expect(validateAyWebsCapturedPage(capture, ZALANDO_HOME, { requireProductPage: true }).rejection).toBe('NOT_A_PRODUCT_PAGE');
  });

  it('une fiche (prix + titre) passe ; une coquille produit Amazon passe même sans prix', () => {
    expect(classifyAyWebsCapturedPage(ayWebsPageSignalsOf(captureOf({ hasTitle: true, hasPrice: true }) as never)).kind).toBe('PRODUCT_CARD');
    const shell = captureOf({ hasProductShell: true, hasImages: true });
    expect(classifyAyWebsCapturedPage(ayWebsPageSignalsOf(shell as never)).kind).toBe('PRODUCT_CARD');
  });

  it('fiche Amazon avec prix : la nature de page ne bloque jamais le chemin URL', () => {
    const capture = captureOf(
      { hasTitle: true, hasPrice: true, hasProductShell: true },
      { url: 'https://www.amazon.com/dp/B0GYM3V9H5', title: 'Vince Camuto dress' },
    );
    const validation = validateAyWebsCapturedPage(capture, 'https://www.amazon.com/dp/B0GYM3V9H5');
    /* Sans `requireProductPage`, la validation ne regarde pas la nature : Amazon
       est prouvé par son URL. Le champ reste disponible pour l'audit. */
    expect(validation.ok).toBe(true);
  });
});

describe('la règle de l’application ne dérive pas de celle du serveur', () => {
  /* 2^6 combinaisons : toutes les natures possibles, comparées une à une. */
  const flags: Array<keyof AyWebsPageSignals> = [
    'hasTitle', 'hasPrice', 'hasPurchaseControl', 'hasVariants', 'hasImages', 'hasProductShell',
  ];
  const cases: AyWebsPageSignals[] = [];
  for (let mask = 0; mask < 2 ** flags.length; mask += 1) {
    const signals = {} as AyWebsPageSignals;
    flags.forEach((flag, index) => { signals[flag] = Boolean(mask & (1 << index)); });
    cases.push(signals);
  }

  it('64 combinaisons, mêmes verdicts des deux côtés', () => {
    for (const signals of cases) {
      expect(mobileClassify(signals), JSON.stringify(signals)).toEqual(classifyAyWebsCapturedPage(signals));
    }
  });

  it('les mêmes captures réelles donnent les mêmes signaux', () => {
    const samples = [
      captureOf({ hasTitle: true, hasImages: true }),
      captureOf({ hasTitle: true, hasPrice: true, hasVariants: true }),
      captureOf({ hasProductShell: true, hasImages: true }),
      captureOf({ hasPrice: true }),
    ];
    for (const capture of samples) {
      expect(mobileSignals(capture)).toEqual(ayWebsPageSignalsOf(capture as never));
    }
  });
});
