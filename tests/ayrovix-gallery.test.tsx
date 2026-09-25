import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProductResult } from '../client/src/ayrovix/components/ProductResult';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import type { AyrovixProduct } from '../client/src/ayrovix/types';
import { withIsolation } from '../client/src/ayrovix/services/mediaIsolation';

const images = [
  '/fixtures/square-1x1.jpg', '/fixtures/landscape-16x9.jpg', '/fixtures/portrait-4x5.jpg',
  '/fixtures/very-tall.jpg', '/fixtures/small-resolution.jpg', '/fixtures/transparent-product.png',
];
const product: AyrovixProduct = {
  title: 'Merchant gallery', brand: 'Merchant', model: null, description: '',
  image: images[0], images, source: 'Merchant', sourceUrl: 'https://merchant-shop.com/product',
  price: 100, currency: 'EUR', priceTnd: 360, exchangeRate: 3.6,
  colors: [], sizes: [], availability: 'unknown',
};
const render = (item = product) => renderToStaticMarkup(<LocaleProvider>
  <ProductResult product={item} ordering={false} priceVerified onOrder={vi.fn()} />
</LocaleProvider>);

describe('source-accurate responsive product gallery', () => {
  it('preserves every documented source photo and does not arbitrarily truncate a gallery', () => {
    const markup = render();
    expect(markup.match(/src="\/fixtures\/square-1x1\.jpg"/g)).toHaveLength(2);
    for (const src of images) expect(markup).toContain(`src="${src}"`);
    expect(markup).toContain('1 / 6');
    expect(markup).toContain('ay-product__thumbnails');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('href="https://merchant-shop.com/product"');
  });

  it('uses the same contain-frame for the stage and thumbnails and never cover-crops a product', () => {
    const html = render();
    expect(html).toContain('ay-product__stage');
    expect(html.match(/class="ay-studio-frame"/g)?.length).toBe(7);
    const css = readFileSync('client/src/ayrovix/components/quiet-card.css', 'utf8');
    const detailCss = readFileSync('client/src/ayrovix/components/product-detail.css', 'utf8');
    expect(css).toMatch(/\.ay-studio-frame__image\s*\{[^}]*object-fit:\s*contain/);
    expect(detailCss).toMatch(/\.ay-product__thumbnails\s*\{[^}]*overflow-x:\s*auto/);
    expect(detailCss).toContain('@media (max-width:760px)');
    expect(detailCss).toContain('.ay-product__gallery { position:static; width:100%; }');
    expect(readFileSync('client/src/ayrovix/components/ProductResult.tsx', 'utf8')).not.toContain('object-cover');
  });

  it('retains local images unchanged and tries isolation plus original for every remote source', () => {
    expect(withIsolation(images)).toEqual(images);
    const source = 'https://cdn.merchant-shop.com/photo.jpg';
    expect(withIsolation([source, `${source}?angle=side`])).toEqual([
      `/api/public/media/isolated?url=${encodeURIComponent(source)}`,
      `/api/public/media/img?u=${encodeURIComponent(source)}&w=760`, source,
      `/api/public/media/isolated?url=${encodeURIComponent(`${source}?angle=side`)}`,
      `/api/public/media/img?u=${encodeURIComponent(`${source}?angle=side`)}&w=760`, `${source}?angle=side`,
    ]);
  });

  it('has a real placeholder rather than using the uploaded photograph or another product image', () => {
    const html = render({ ...product, image: '', images: [] });
    expect(html).toContain('ay-studio-frame__placeholder');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('aria-label="Photo 1"');
  });

  it('keeps the full-screen viewer scoped to this gallery, with close and arrow navigation', () => {
    const src = readFileSync('client/src/ayrovix/components/ProductResult.tsx', 'utf8');
    expect(src).toContain('setLightbox(true)');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('ArrowRight');
    expect(src).toContain('ArrowLeft');
    expect(src).toContain('photos.length');
    expect(src).not.toContain('fallbackImage={previewUrl}');
  });
});
