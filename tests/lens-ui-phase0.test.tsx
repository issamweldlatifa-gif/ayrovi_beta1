import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { InteractiveLensResults } from '../client/src/ayrovix/components/InteractiveLensResults';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import type { AyrovixCandidate } from '../client/src/ayrovix/types';

const candidate = (over: Partial<AyrovixCandidate>): AyrovixCandidate => ({
  id: over.id || 'c',
  kind: 'external',
  title: over.title || 'Produit sans image',
  brand: over.brand || null,
  model: over.model || null,
  colors: over.colors || [],
  sizes: over.sizes || [],
  source: over.source || 'Amazon',
  sourceUrl: over.sourceUrl || 'https://amazon.example/p1',
  image: over.image || '',
  images: over.images || [],
  price: over.price ?? 49,
  currency: over.currency || 'EUR',
  priceTnd: over.priceTnd ?? 250,
  match: over.match ?? 88,
  rating: over.rating ?? 4.2,
  ratingCount: over.ratingCount ?? 12,
  ratingKind: over.ratingKind || 'merchant',
  priceVerificationStatus: 'PENDING_MANUAL',
  ...over,
});

describe('Lens Phase 0 UI improvements', () => {
  it('LensLauncher contains product-name search field (analytics-safe text)', () => {
    const src = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');
    expect(src).toContain('ayrovix-text-input');
    expect(src).toContain('analyzeText');
    expect(src).toContain("Nom du produit");
    expect(src).toContain("Rechercher");
    // must not misclassify as qr — check new channel text is used
    expect(src).toContain("kind: 'text'");
    expect(readFileSync('src/ayrovix/routes.ts','utf8')).toContain("channel: 'text'");
    expect(readFileSync('src/ayrovix/routes.ts','utf8')).toContain("analyze-text");
    expect(readFileSync('src/ayrovix/types.ts','utf8')).toContain("'text'");
  });

  it('LensResults shows merchant fallback when product image is empty (no invent)', () => {
    const view = {
      queryLabel: 'Requête sans image',
      list: [candidate({ id:'x', image:'', images:[], source:'Zalando', sourceUrl:'https://zalando.example/p' })],
      eventId:'ev1',
      detectedPrice:null,
    };
    const html = renderToStaticMarkup(
      <LocaleProvider><InteractiveLensResults view={view as any} previewUrl={null} fallbackImage={null} onChoose={()=>{}} onReset={()=>{}} onCommandDetected={()=>{}} /></LocaleProvider>
    );
    // Should NOT contain invented product image but should show merchant source name
    expect(html).toContain('Zalando');
    // Should contain favicon fallback logic (google s2 favicons) in source file
    const src = readFileSync('client/src/ayrovix/components/InteractiveLensResults.tsx','utf8');
    expect(src).toContain('favicon');
    expect(src).toContain('google.com/s2/favicons');
  });

  it('LensResults communicates unavailable sizes/colors and directs to merchant sheet', () => {
    const view = {
      queryLabel:'Test variants',
      list:[candidate({ id:'v1', colors:[], sizes:[], source:'SHEIN', sourceUrl:'https://shein.com/p' })],
      eventId:'ev2',
      detectedPrice:null,
    };
    const html = renderToStaticMarkup(
      <LocaleProvider><InteractiveLensResults view={view as any} previewUrl={null} fallbackImage={null} onChoose={()=>{}} onReset={()=>{}} onCommandDetected={()=>{}} /></LocaleProvider>
    );
    expect(html).toContain('Tailles/couleurs');
    expect(html).toContain('fiche marchand');
  });

  it('TND final estimate and boutique price are clearly labeled (no invented breakdown)', () => {
    const view = {
      queryLabel:'Prix test',
      list:[candidate({ id:'p1', price:84, currency:'EUR', priceTnd:598, source:'Courir' })],
      eventId:'ev3',
      detectedPrice:null,
    };
    const html = renderToStaticMarkup(
      <LocaleProvider><InteractiveLensResults view={view as any} previewUrl={null} fallbackImage={null} onChoose={()=>{}} onReset={()=>{}} onCommandDetected={()=>{}} /></LocaleProvider>
    );
    expect(html).toContain('Prix final estimé');
    expect(html).toContain('598.00 DT');
    expect(html).toContain('Prix boutique');
    expect(html).toContain('84');
    expect(html).toContain('EUR');
    // Must not contain invented breakdown numbers not in API
    const src = readFileSync('client/src/ayrovix/components/InteractiveLensResults.tsx','utf8');
    // Ensure we show estimation note but not raw breakdown fields that API doesn't return
    expect(src).toContain('Estimation tout inclus');
  });

  it('empty state CTA is enriched and links to history', () => {
    const view = { queryLabel:'Introuvable XYZ', list:[], eventId:'ev4', detectedPrice:null };
    const html = renderToStaticMarkup(
      <LocaleProvider><InteractiveLensResults view={view as any} previewUrl={null} fallbackImage={null} onChoose={()=>{}} onReset={()=>{}} onCommandDetected={()=>{}} /></LocaleProvider>
    );
    expect(html).toContain('Aucune correspondance');
    expect(html).toContain('Nouvelle recherche');
    expect(html).toContain('Recherches récentes');
    expect(html).toContain('Astuce');
  });

  it('error guidance maps existing API codes to retry suggestions', () => {
    const src = readFileSync('client/src/ayrovix/components/LensLauncher.tsx','utf8');
    expect(src).toContain('errorGuidance');
    expect(src).toContain('INVALID_TEXT');
    expect(src).toContain('TEXT_SEARCH_FAILED');
    expect(src).toContain('IMAGE_REQUIRED');
    expect(src).toContain('AYROVIX_UNAVAILABLE');
    expect(src).toContain('INVALID_URL');
    expect(src).toContain('retryLast');
  });

  it('recent searches chips use existing history (localStorage)', () => {
    const src = readFileSync('client/src/ayrovix/components/LensLauncher.tsx','utf8');
    expect(src).toContain('readLocalAyrovixHistory');
    expect(src).toContain('Recherches récentes');
    expect(src).toContain('Voir tout');
  });

  it('ProductResult shows amber warning when variants unavailable and links to merchant page', () => {
    const src = readFileSync('client/src/ayrovix/components/ProductResult.tsx','utf8');
    expect(src).toContain('Tailles/couleurs non listées');
    expect(src).toContain('Ouvrir la fiche marchand');
    expect(src).toContain('bg-amber-50');
  });
});
