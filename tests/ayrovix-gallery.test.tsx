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
  it('renders one unchanged source image in the integrated stage, not small boxes underneath', () => {
    const markup = renderGallery();
    expect(markup.match(/src="\/fixtures\/square-1x1\.jpg"/g)).toHaveLength(1);
    // The first four source images are navigable in the stage; later images are
    // retained in the product record, but not offered in this four-photo view.
    expect(markup).not.toContain(`src="${images[1]}"`);
    expect(markup).not.toContain(`src="${images[4]}"`);
    expect(markup).toContain('1 / 4');
    expect(markup).toContain('ayrovix-product-gallery-image');
    expect(markup).not.toContain('ayrovix-thumbnail-image');
    expect(markup).toContain('Photo suivante');
  });

  it('does not introduce a second cropped thumbnail stage in other product surfaces', () => {
    const component = readFileSync('client/src/ayrovix/components/ProductResult.tsx', 'utf8');
    const candidates = readFileSync('client/src/ayrovix/components/ProductCandidates.tsx', 'utf8');
    const history = readFileSync('client/src/ayrovix/components/LensHistory.tsx', 'utf8');
    expect(component).not.toContain('ayrovix-thumbnail-strip');
    expect(candidates).not.toContain('object-cover');
    expect(history).not.toContain('object-cover');
  });

  it('reserves a responsive integrated stage and keeps both source and isolated photos uncut', () => {
    const css = readFileSync('client/src/index.css', 'utf8');
    expect(css).toMatch(/\.ayrovix-product-gallery-stage\s*\{[\s\S]*?aspect-ratio:\s*9\s*\/\s*13/);
    expect(css).toMatch(/\.ayrovix-product-gallery-image\s*\{[\s\S]*?object-fit:\s*contain/);
    expect(css).toMatch(/\.ayrovix-product-gallery-image\[data-isolated="true"\],[\s\S]*?object-fit:\s*contain/);
    expect(css).not.toContain('.ayrovix-thumbnail-strip');
    expect(css).toContain('max-width: 100%');
  });
});
