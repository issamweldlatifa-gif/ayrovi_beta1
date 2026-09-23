// QUIET CARD v2 (décision client 2026-09-23, référence Zalando) :
//  • le prix remisé est ROUGE (var(--ayrovi-promo)) et l'original reste barré gris ;
//  • le badge −X% est rouge — l'orange reste réservé aux CTA ;
//  • toute image produit vit dans le cadre studio unifié (blanc + hairline +
//    mix-blend-mode: multiply) — plus de fond marchand brut, plus de crop cover.
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StudioImageFrame, QuietPromoPrice } from '../client/src/ayrovix/components/quiet-card';
import { ProductCandidates } from '../client/src/ayrovix/components/ProductCandidates';
import { LensProductCard } from '../client/src/ayrovix/components/LensProductCard';
import { ProductResult } from '../client/src/ayrovix/components/ProductResult';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import type { AyrovixCandidate, AyrovixProduct } from '../client/src/ayrovix/types';

const read = (rel: string) => readFileSync(rel, 'utf8');

const promo = { percent: 7, label: 'Offre mercredi', priceTnd: 604.5, originalPriceTnd: 650 };

const candidate: AyrovixCandidate = {
  id: 'backpack', kind: 'external', title: 'CATERPILLAR — Sac à dos voyage', brand: 'CATERPILLAR', model: null,
  colors: [], sizes: [], source: 'Example', sourceUrl: 'https://shop.example/item', image: '/backpack.jpg',
  price: 179.95, currency: 'EUR', priceTnd: 604.5, match: 94, promo,
};

const product: AyrovixProduct = {
  title: 'Sac à dos — Voyager', brand: 'CATERPILLAR', model: 'Grand capacity', description: '',
  image: '/backpack.jpg', images: ['/backpack.jpg'], source: 'Example', sourceUrl: 'https://shop.example/item',
  price: 179.95, currency: 'EUR', priceTnd: 604.5, exchangeRate: 3.37, colors: [], sizes: [], variantOptions: [],
  availability: 'in_stock', rating: 4.6, ratingKind: 'merchant', promo,
};

describe('Quiet Card v2 — cadre studio unifié', () => {
  it('toute image produit passe par le cadre : blanc + hairline + multiply', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider><StudioImageFrame src="/a.jpg" fallbackSources={['/a.jpg', '/b.jpg']} alt="produit" ratio="3 / 4" /></LocaleProvider>,
    );
    expect(html).toContain('ay-studio-frame__image');
    const css = read('client/src/ayrovix/components/quiet-card.css');
    expect(css).toMatch(/\.ay-studio-frame\s*\{[^}]*background:\s*#fff/);
    expect(css).toMatch(/\.ay-studio-frame__image\s*\{[^}]*mix-blend-mode:\s*multiply/);
    expect(css).toMatch(/\.ay-studio-frame\s*\{[^}]*border:\s*1px solid/);
  });

  it('le placeholder studio remplace une image absente (plus de carré muet)', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider><StudioImageFrame alt="produit" placeholderLabel="Example" /></LocaleProvider>,
    );
    expect(html).toContain('ay-studio-frame__placeholder');
    expect(html).not.toContain('<img');
  });

  it('la fiche produit et la vignette panier utilisent le canvas blanc (plus de fond surface/cover)', () => {
    const result = read('client/src/ayrovix/components/ProductResult.tsx');
    expect(result).toContain('ayrovix-product-gallery-stage bg-white');
    expect(result).not.toContain('object-cover');
    const galleryCss = read('client/src/index.css');
    expect(galleryCss).toMatch(/\.ayrovix-product-gallery-image,[\s\S]*?mix-blend-mode:\s*multiply/);
    const cart = read('client/src/components/CartDrawer.tsx');
    expect(cart).toContain('StudioImageFrame');
    expect(cart).not.toContain('object-cover');
    const gridCss = read('client/src/ayrovix/components/lens-product-card.css');
    expect(gridCss).toMatch(/\.lens-card-media\s*\{[^}]*background:#fff/);
    expect(gridCss).toMatch(/\.lens-card-media>img\s*\{[^}]*mix-blend-mode:multiply/);
  });
});

describe('Quiet Card v2 — promo rouge, référence Zalando', () => {
  it('le prix partagé rend : original barré gris + remisé rouge + badge rouge', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <QuietPromoPrice priceTnd={604.5} promo={promo} format={(v) => `${v.toFixed(3)} DT`} variant="list" />
      </LocaleProvider>,
    );
    expect(html).toContain('ay-quiet-price__original');
    expect(html).toContain('650.000 DT');
    expect(html).toContain('604.500 DT');
    expect(html).toContain('ay-quiet-price__current--promo');
    expect(html).toContain('ay-quiet-price__badge');
    expect(html).toContain('−7%');
    const css = read('client/src/ayrovix/components/quiet-card.css');
    expect(css).toMatch(/\.ay-quiet-price__current--promo\s*\{[^}]*var\(--ayrovi-promo/);
    expect(css).toMatch(/\.ay-quiet-price__badge\s*\{[^}]*var\(--ayrovi-promo/);
    expect(read('client/src/design/tokens.css')).toContain('--ayrovi-promo:');
  });

  it('sans promo : un seul prix noir, aucun badge — pas de promo fantôme', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider><QuietPromoPrice priceTnd={650} format={(v) => `${v.toFixed(2)} DT`} /></LocaleProvider>,
    );
    expect(html).toContain('650.00 DT');
    expect(html).not.toContain('ay-quiet-price__badge');
    expect(html).not.toContain('line-through');
  });

  it('la ligne de résultats porte la promo rouge et le cadre studio', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider><ProductCandidates candidates={[candidate]} onChoose={() => {}} /></LocaleProvider>,
    );
    expect(html).toContain('ay-studio-frame');
    expect(html).toContain('ay-quiet-price__current--promo');
    expect(html).toContain('ay-quiet-price__original');
    expect(html).toContain('ay-quiet-price__badge');
  });

  it('la carte grille porte la même promo rouge (barré + badge), prix intact sinon', () => {
    const withPromo = renderToStaticMarkup(
      <LocaleProvider><LensProductCard candidate={candidate} onChoose={() => {}} saved={false} busy={false} onFavorite={() => {}} /></LocaleProvider>,
    );
    expect(withPromo).toContain('ay-quiet-price__current--promo');
    expect(withPromo).toContain('604.50 DT');
    expect(withPromo).toContain('650.00 DT');
    expect(withPromo).toContain('ay-quiet-price__badge');
    const without = renderToStaticMarkup(
      <LocaleProvider><LensProductCard candidate={{ ...candidate, priceTnd: 650, promo: undefined }} onChoose={() => {}} saved={false} busy={false} onFavorite={() => {}} /></LocaleProvider>,
    );
    expect(without).toContain('650.00 DT');
    expect(without).not.toContain('ay-quiet-price__badge');
  });

  it('la fiche produit : prix remisé rouge + badge rouge + original barré', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider><ProductResult product={product} ordering={false} priceVerified onOrder={vi.fn()} /></LocaleProvider>,
    );
    expect(html).toContain("color:var(--ayrovi-promo)");
    expect(html).toContain('line-through');
    expect(html).toContain('650.00');
    expect(html).toContain('604.50');
    expect(html).toContain('background:var(--ayrovi-promo)');
    expect(html).not.toContain('background:var(--ayrovi-primary)');
  });
});
