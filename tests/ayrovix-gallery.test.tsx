import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProductResult } from '../client/src/ayrovix/components/ProductResult';
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
      <ProductResult product={product} ordering={false} priceVerified onOrder={vi.fn()} />
    </LocaleProvider>,
  );
}

describe('AYROVIX product gallery rendering', () => {
  it('uses the unchanged original source for both the main image and selected thumbnail', () => {
    const markup = renderGallery();
    expect(markup.match(/src="\/fixtures\/square-1x1\.jpg"/g)).toHaveLength(2);
    for (const src of images) expect(markup).toContain(`src="${src}"`);
    expect(markup).toContain('ayrovix-product-gallery-image');
    expect(markup).toContain('ayrovix-thumbnail-image');
    expect(markup).toContain('aria-current="true"');
  });

  it('never applies a cover crop to the main image or thumbnails', () => {
    const component = readFileSync('client/src/ayrovix/components/ProductResult.tsx', 'utf8');
    const candidates = readFileSync('client/src/ayrovix/components/ProductCandidates.tsx', 'utf8');
    const history = readFileSync('client/src/ayrovix/components/LensHistory.tsx', 'utf8');
    expect(component).not.toContain('object-cover');
    expect(candidates).not.toContain('object-cover');
    expect(history).not.toContain('object-cover');
  });

  it('reserves responsive space, centers contain media and hides the touch scrollbar', () => {
    const css = readFileSync('client/src/index.css', 'utf8');
    expect(css).toMatch(/\.ayrovix-product-gallery-stage\s*\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*1/);
    expect(css).toMatch(/\.ayrovix-product-gallery-image,[\s\S]*?object-fit:\s*contain/);
    expect(css).toMatch(/\.ayrovix-thumbnail-image[\s\S]*?object-position:\s*center/);
    expect(css).toMatch(/\.ayrovix-thumbnail-strip\s*\{[\s\S]*?scroll-snap-type:\s*x proximity/);
    expect(css).toMatch(/\.ayrovix-thumbnail-strip::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);
    expect(css).toContain('max-width: 100%');
  });
});
