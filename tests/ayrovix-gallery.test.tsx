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
  it('renders every source photo as an integrated swipe slide with a matching progress segment', () => {
    const markup = renderGallery();
    expect(markup).toContain('class="s-media"');
    expect(markup).toContain('s-gallery-progress');
    const progress = markup.split('class="s-gallery-progress"')[1]?.split('</nav>')[0] ?? '';
    expect(progress.match(/aria-label="Afficher la photo/g)).toHaveLength(images.length);
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('s-media__slide');
    expect(markup).not.toContain('s-thumbnails');
    expect(markup).not.toContain('ayrovix-thumbnail-image');
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

  it('fills the first mobile view with a sticky full-width gallery and layers the sheet above it', () => {
    const css = readFileSync('client/src/shop/shop.css', 'utf8');
    expect(css).toMatch(/\.s-media\s*\{[^}]*position: sticky/);
    expect(css).toMatch(/\.s-media\s*\{[^}]*height: calc\(100dvh - var\(--s-appbar-height\)/);
    expect(css).toMatch(/\.s-media__slide\s*\{[^}]*height: 100%/);
    expect(css).toMatch(/\.s-media__slide img\s*\{[^}]*object-fit: contain/);
    const launcher = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');
    expect(launcher).toContain('px-0 sm:px-4 py-0 sm:py-3 pb-8');
    expect(css).toMatch(/\.s-sheet\s*\{[^}]*z-index: 4/);
    expect(css).toContain('box-shadow: 0 -12px 30px');
    expect(css).not.toContain('.ayrovix-thumbnail-strip');
    expect(css).not.toContain('object-fit: cover');
  });
});
