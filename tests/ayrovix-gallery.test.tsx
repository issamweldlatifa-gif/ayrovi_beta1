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
  it('renders one unchanged source image in the integrated stage, not small boxes underneath', () => {
    const markup = renderGallery();
    expect(markup.match(/src="\/fixtures\/square-1x1\.jpg"/g)).toHaveLength(1);
    // Quatre photos au plus sont navigables ; les suivantes restent dans la fiche
    // produit sans être proposées ici.
    expect(markup).not.toContain(`src="${images[4]}"`);
    expect(markup).not.toContain(`src="${images[5]}"`);
    // Et seules la photo visible et sa voisine sont TÉLÉCHARGÉES : le client ne
    // paie pas sur son forfait trois photos qu'il ne regardera peut-être jamais.
    expect(markup.match(/<img/g)).toHaveLength(2);
    expect(markup).toContain('s-media__placeholder');
    expect(markup).toContain('1 / 4');
    // Une seule scène intégrée, jamais de bandeau de vignettes rognées.
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

  it('reserves a responsive integrated stage and keeps both source and isolated photos uncut', () => {
    const css = readFileSync('client/src/shop/shop.css', 'utf8');
    // La scène garde le format portrait de la maquette et ne rogne jamais le produit.
    expect(css).toMatch(/\.s-media__slide\s*\{[\s\S]*?aspect-ratio:\s*9\s*\/\s*13/);
    expect(css).toMatch(/\.s-media__slide img\s*\{[\s\S]*?object-fit:\s*contain/);
    expect(css).not.toContain('.ayrovix-thumbnail-strip');
    expect(css).not.toContain('object-fit: cover');
  });
});
