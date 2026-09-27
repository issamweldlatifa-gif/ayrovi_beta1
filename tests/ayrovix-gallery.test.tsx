import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ShopProductScreen } from '../client/src/shop';
import type { AyrovixProduct } from '../client/src/ayrovix/types';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';

const images = [
  '/fixtures/square-1x1.jpg',
  '/fixtures/landscape-16x9.jpg',
  '/fixtures/portrait-4x5.jpg',
  '/fixtures/very-tall.jpg',
  '/fixtures/small-resolution.jpg',
  '/fixtures/transparent-product.png',
];

const product: AyrovixProduct = {
  title: 'Chaussure AYROVI — galerie responsive',
  brand: 'AYROVI',
  model: 'Gallery Test',
  description: '',
  image: images[0],
  images,
  source: 'Merchant',
  sourceUrl: 'https://merchant.example/product',
  price: 100,
  currency: 'EUR',
  priceTnd: 360,
  exchangeRate: 3.6,
  colors: [],
  sizes: [],
  variantOptions: [],
  availability: 'in_stock',
  rating: 4.8,
  ratingKind: 'merchant',
};

function renderGallery() {
  return renderToStaticMarkup(
    <LocaleProvider>
      <ShopProductScreen product={product} ordering={false} priceVerified onOrder={vi.fn()} />
    </LocaleProvider>,
  );
}

describe('AYROVIX product gallery rendering', () => {
  it('renders a source-backed gallery with image actions and directly linked thumbnails', () => {
    const markup = renderGallery();
    // The lead image appears in the main slide and its matching thumbnail.
    expect(markup.match(/src="\/fixtures\/square-1x1\.jpg"/g)).toHaveLength(2);
    // Every source-backed photo remains navigable, including the last two.
    for (const image of images) expect(markup).toContain(`src="${image}"`);
    expect(markup).toContain('s-media__hero');
    expect(markup).toContain('s-thumbnails');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('1 / 6');
    expect(markup).toContain('s-media__slide');
    expect(markup).not.toContain('ayrovix-thumbnail-image');
    expect(markup).toContain('Photo suivante');
  });

  it('does not introduce a second cropped thumbnail stage in other product surfaces', () => {
    const component = readFileSync('client/src/shop/ProductPage.tsx', 'utf8');
    const candidates = readFileSync('client/src/ayrovix/components/ProductCandidates.tsx', 'utf8');
    const history = readFileSync('client/src/ayrovix/components/LensHistory.tsx', 'utf8');
    expect(component).not.toContain('ayrovix-thumbnail-strip');
    expect(component).not.toContain('object-cover');
    expect(candidates).not.toContain('object-cover');
    expect(history).not.toContain('object-cover');
  });

  it('reserves a bounded portrait stage and keeps both source and isolated photos uncut', () => {
    const css = readFileSync('client/src/shop/shop.css', 'utf8');
    expect(css).toMatch(/\.s-media__slide\s*\{[\s\S]*?height:\s*min\(56dvh,\s*520px\)/);
    expect(css).toMatch(/\.s-media__slide img\s*\{[\s\S]*?object-fit:\s*contain/);
    expect(css).toContain('.s-media__hero { position: relative; }');
    expect(css).not.toContain('.ayrovix-thumbnail-strip');
    expect(css).not.toContain('object-fit: cover');
  });
});
