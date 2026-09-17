import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InteractiveLensResults } from '../client/src/ayrovix/components/InteractiveLensResults';
import type { AyrovixCandidate } from '../client/src/ayrovix/types';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';

/** صفحة نتائج Lens تُعرض ببيانات حقيقية الشكل (نفس عقود الـ API) — لا Demo في التطبيق. */

const candidate = (over: Partial<AyrovixCandidate>): AyrovixCandidate => ({
  id: over.id || 'c',
  kind: 'external',
  title: 'Nike Dunk Low',
  brand: 'Nike',
  model: 'Dunk Low',
  colors: ['Blanc'],
  sizes: [],
  source: 'Zalando',
  sourceUrl: 'https://zalando.example/p',
  image: '/media/lens-sneakers.jpg',
  price: 84,
  currency: 'EUR',
  priceTnd: 598,
  match: 90,
  rating: 4.3,
  ratingCount: 184,
  ratingKind: 'merchant',
  priceVerificationStatus: 'PENDING_MANUAL',
  ...over,
});

const view = {
  queryLabel: 'Nike Dunk LV8',
  list: [
    candidate({ id: 'a', match: 94, source: 'Zalando' }),
    candidate({ id: 'b', match: 87, source: 'Courir' }),
    candidate({ id: 'c', match: 91, source: 'ASOS' }),
  ],
  eventId: 'ev1',
  detectedPrice: null,
};

const render = () => renderToStaticMarkup(
  <LocaleProvider><InteractiveLensResults view={view as any} previewUrl={'/preview.jpg'} fallbackImage={null} onChoose={() => {}} onReset={() => {}} onCommandDetected={() => {}} /></LocaleProvider>,
);

describe('AYROVIX LENS results screen (post-analysis, real-data shape)', () => {
  it('renders the reference composition: summary, best, others, trust, new search', () => {
    const html = render();
    expect(html).toContain('Résultats Lens');
    // Interactive keeps the same guarantees as legacy: price labels, trust, no invention
    expect(html).toContain('Prix vérifiés et marchands fiables');
    expect(html).toContain('Nouvelle recherche');
    expect(html).toContain('Prix final estimé');
    expect(html).toContain('Voir le produit');
    // ROI / interactive controls keep image visible
    expect(html).toContain('Sélectionner');
  });

  it('sorts by match and shows the best first with its % badge', () => {
    const html = render();
    const firstMatch = html.indexOf('94%');
    expect(firstMatch).toBeGreaterThan(-1);
    // الـ94% يظهر قبل 91% و87% (ترتيب تنازلي)
    expect(html.indexOf('94%')).toBeLessThan(html.indexOf('91%'));
    expect(html.indexOf('91%')).toBeLessThan(html.indexOf('87%'));
  });

  it('shows price in DT + original currency and merchant link per result', () => {
    const html = render();
    expect(html).toContain('598.00 DT');
    expect(html).toContain('Prix boutique');
    expect(html).toContain('EUR');
    expect(html).toContain('Voir le produit');
  });

  it('the analyzing stage uses Google Lens style (image stays visible + sheet loading, no separate dots page)', () => {
    const source = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');
    expect(source).not.toContain('lens-frame__dots');
    // Google Lens: no separate analyzing page — image stays visible + bottom sheet shows Analyse en cours
    expect(source).toContain('isAnalyzing');
    expect(source).toContain('InteractiveLensResults');
    expect(source).toContain('isLoading');
  });

  it('keeps the results view in the correct flow stage (candidates), not the first page', () => {
    const source = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');
    const camera = readFileSync('client/src/ayrovix/components/LensCamera.tsx', 'utf8');
    const upload = readFileSync('client/src/ayrovix/components/LensUpload.tsx', 'utf8');
    expect(source).toContain("{stage === 'candidates' && candidatesView && (");
    expect(source).toContain('<InteractiveLensResults');
    // Legacy model must be gone — single Google Lens-style results UI
    expect(source).not.toContain('<LensResults');
    // الصفحة الأولى ما تزال واجهة الدخول (Prendre une photo / Importer une image)
    expect(source).toContain('lens-home');
    expect(camera).toContain('Prendre une photo');
    expect(upload).toContain('Importer une image');
  });
});
