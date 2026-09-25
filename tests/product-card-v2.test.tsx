// PRODUCT CARD v2 + couche « compréhension produit » (P1/P2, décision 23-09-2026) :
//  • la page montre seulement les variantes publiées par la source ;
//  • la description de nos moteurs arrive jusqu'à la carte (elle était perdue) ;
//  • photo cliquable = plein écran (fermeture ✕, flèches, swipe) ;
//  • pas de guide, stock ou équivalence attribués sans preuve marchand ;
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { classifyProduct, extractCapacity, pricePer100, presentSizes, usesCapacity } from '../client/src/ayrovix/services/productAttributes';
import { ProductCandidates } from '../client/src/ayrovix/components/ProductCandidates';
import { ProductResult } from '../client/src/ayrovix/components/ProductResult';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import type { AyrovixCandidate, AyrovixProduct } from '../client/src/ayrovix/types';

const read = (rel: string) => readFileSync(rel, 'utf8');

describe('P1 — compréhension produit (pure)', () => {
  it('classe le produit à partir du titre et de la description', () => {
    expect(classifyProduct('AXIS-Y COLLAGEN EYE SERUM — Soin des yeux', 'Sérum vegan')).toBe('beauty');
    expect(classifyProduct('CHANCE Eau de parfum 50 ml')).toBe('perfume');
    expect(classifyProduct('AIR ZOOM ALPHAFLY NEXT 3 — Chaussures de running')).toBe('shoes');
    expect(classifyProduct('SHIKI 20,7L — Sac à dos ordinateur')).toBe('bag');
    expect(classifyProduct('Tommy Sweats à capuche light grey')).toBe('clothing');
    expect(classifyProduct('Casquette MLB dark green')).toBe('accessory');
    expect(classifyProduct('Objet quelconque sans indice')).toBe('other');
    expect(classifyProduct('Chaussures Asics GEL', 'Crème protectrice')).toBe('shoes');
    expect(classifyProduct('Smartphone Android')).toBe('electronics');
    expect(classifyProduct('Ordinateur portable laptop')).toBe('electronics');
    expect(classifyProduct('Canapé trois places')).toBe('home');
    expect(classifyProduct('Makeup lipstick')).toBe('beauty');
  });

  it('extrait la capacité nette sans jamais sommer les mentions prix/100', () => {
    expect(extractCapacity('EYE SERUM 10 ml (141,03 DT / 100 ml)')).toMatchObject({ value: 10, unit: 'ml', label: '10 ml' });
    expect(extractCapacity('FUNDAMENTAL EYE AWAKENING GEL — 35 ml')).toMatchObject({ value: 35 });
    expect(extractCapacity('Crème corps 200 g')).toMatchObject({ value: 200, unit: 'g' });
    expect(extractCapacity('Sac à dos 20,7L').label).toBe('20,7 l');
    expect(extractCapacity('Titre sans capacité')).toBeNull();
  });

  it('calcule le prix /100 comme la référence Zalando', () => {
    expect(pricePer100(26.95, { value: 35, unit: 'ml', label: '35 ml' })).toBe(77);
    expect(pricePer100(141.03, { value: 10, unit: 'ml', label: '10 ml' })).toBe(1410.3);
    expect(pricePer100(0, { value: 10, unit: 'ml', label: '10 ml' })).toBeNull();
    expect(usesCapacity('beauty')).toBe(true);
    expect(usesCapacity('perfume')).toBe(true);
    expect(usesCapacity('shoes')).toBe(false);
  });

  it('présente des tailles honnêtes : variantes marchand, jetons du titre, jamais inventées', () => {
    expect(presentSizes('shoes', 'Nike running', ['43', '40.5', '42'])).toEqual({ options: ['40.5', '42', '43'], layout: 'grid' });
    expect(presentSizes('clothing', 'Sweat', ['XL', 'S'])).toEqual({ options: ['S', 'XL'], layout: 'chips' });
    expect(presentSizes('clothing', 'Sweat taille unique', [])).toEqual({ options: ['Taille unique'], layout: 'chips' });
    expect(presentSizes('beauty', 'Sérum 10 ml', [])).toEqual({ options: [], layout: 'none' });
    expect(presentSizes('shoes', 'Chaussures 35-53', [])).toEqual({ options: [], layout: 'none' }); // une plage n'invente pas de pointures
  });
});

const beautyProduct: AyrovixProduct = {
  title: 'AXIS-Y COLLAGEN EYE SERUM — Soin des yeux 10 ml',
  brand: 'AXIS-Y', model: null,
  description: 'Sérum contour des yeux au collagène végétal et à la niacinamide — réduit les cernes et les poches.',
  image: '/serum.jpg', images: ['/serum.jpg'], source: 'Example', sourceUrl: 'https://shop.example/serum',
  price: 20, currency: 'EUR', priceTnd: 141.03, exchangeRate: 3.37, colors: [], sizes: [], variantOptions: [],
  availability: 'unknown', rating: 4.7, ratingCount: 5017, ratingKind: 'merchant',
};

const shoesProduct: AyrovixProduct = {
  title: 'AIR ZOOM ALPHAFLY NEXT 3 — Chaussures de running',
  brand: 'Nike Performance', model: null,
  description: 'Chaussure de compétition avec mousse ZoomX et plaque carbone.',
  image: '/shoe.jpg', images: ['/shoe.jpg', '/shoe-2.jpg'], source: 'Example', sourceUrl: 'https://shop.example/shoe',
  price: 309.95, currency: 'EUR', priceTnd: 1068.75, exchangeRate: 3.37, colors: ['racer blue'], sizes: ['43', '40.5', '42'], variantOptions: [],
  availability: 'unknown',
};

describe('P2 — la page produit comprend ce qu’elle vend', () => {
  it('beauty shows documented capacity but no computed unit price based on an unrelated estimate', () => {
    const html = renderToStaticMarkup(<LocaleProvider><ProductResult product={beautyProduct} ordering={false} priceVerified={false} onOrder={vi.fn()} /></LocaleProvider>);
    expect(html).toContain('10 ml');
    expect(html).not.toContain('/ 100 ml');
    expect(html).not.toContain('Guide des tailles');
    expect(html).toContain('Sérum contour des yeux au collagène');
    expect(html).toContain('Prix à confirmer');
  });

  it('shoes offer one source-backed pointure sheet with no fabricated stock', () => {
    const html = renderToStaticMarkup(<LocaleProvider><ProductResult product={shoesProduct} ordering={false} priceVerified={false} onOrder={vi.fn()} /></LocaleProvider>);
    expect(html).toContain('Pointure');
    expect(html).toContain('Votre taille');
    expect(html).not.toContain('Il en reste 2');
    const src = read('client/src/ayrovix/components/ProductResult.tsx');
    expect(src).toContain('setSizeDrawerOpen(true)');
    expect(src).toContain('Pointures disponibles');
    expect(src).not.toContain('FOOT_MEASUREMENTS');
    expect(src).not.toContain('frToBrandShoes');
  });

  it('link, quantity and note live in one details section, no duplicate variant controls', () => {
    const html = renderToStaticMarkup(<LocaleProvider><ProductResult product={beautyProduct} ordering={false} priceVerified={false} onOrder={vi.fn()} /></LocaleProvider>);
    expect(html).toContain('<details');
    expect(html).toContain('Lien, quantité et note');
    expect(html).toContain('Lien exact du produit');
    expect(html).toContain('aria-invalid=');
    expect(html).not.toContain('Tailles/couleurs non listées par le marchand');
    expect(html).not.toContain('recommandation de taille');
  });

  it('typographie dictée par le client : description GRISE et fine, barré gris fin, remisé le plus fort', () => {
    const html = renderToStaticMarkup(<LocaleProvider><ProductResult product={beautyProduct} ordering={false} priceVerified={false} onOrder={vi.fn()} /></LocaleProvider>);
    // Description : corps gris (text-ink/80) — jamais du noir pur, retours à la ligne respectés.
    expect(html).toMatch(/<p class="break-words text-sm font-normal leading-relaxed text-ink\/80 whitespace-pre-line">[^<]*Sérum contour des yeux/);
    // Barré : fin (font-normal) et gris — le remisé porte seul le poids de l'offre.
    const src = read('client/src/ayrovix/components/ProductResult.tsx');
    expect(src).toContain('text-sm font-normal leading-none text-muted line-through');
    const shared = read('client/src/ayrovix/components/quiet-card.css');
    expect(shared).toMatch(/\.ay-quiet-price__original\s*\{[^}]*font-weight:\s*500/);
    const grid = read('client/src/ayrovix/components/lens-product-card.css');
    expect(grid).toMatch(/\.lens-product-card \.lens-card-description\{[^}]*color:#595959/);
  });

  it('isolation d’arrière-plan : TOUTE la galerie est proxyfiée, jamais les images locales', () => {
    const src = read('client/src/ayrovix/components/ProductResult.tsx');
    // One large media stage; all source photos are reached through arrows/swipe, not thumbnail boxes.
    expect(src).toContain('withIsolated(activeImage)');
    expect(src).not.toContain('ayrovix-thumbnail-strip');
    const helper = read('client/src/ayrovix/services/mediaIsolation.ts');
    // withIsolation isole CHAQUE url (avant : seulement la première).
    expect(helper).toMatch(/for \(const url of urls\)/);
    expect(read('client/src/ayrovix/components/quiet-card.tsx')).toContain('withIsolation(');
    expect(read('client/src/ayrovix/components/LensProductCard.tsx')).toContain('withIsolation(');
    // Les chemins locaux restent intacts (fixtures, uploads).
    expect(helper).toContain('/api/public/media/isolated?url=');
  });

  it('photo cliquable plein écran : ✕, flèches, swipe — et trust line honnête', () => {
    const src = read('client/src/ayrovix/components/ProductResult.tsx');
    expect(src).toContain('setLightboxOpen(true)');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('Fermer la photo');
    expect(src).toContain('Photo précédente');
    expect(src).toContain('onTouchEnd');
    expect(src).toContain('Agrandir la photo du produit');
    // Trust line honnête (v2) : le choix n'affirme jamais le stock marchand.
    expect(src).toContain('Le choix d’une taille ou couleur ne confirme pas son stock.');
    expect(src).not.toContain('FOOT_MEASUREMENTS');
    expect(src).not.toContain('Il en reste 2');
  });

  it('l’en-tête Lens : retour ‹ + catégorie du produit + panier (2ᵉ calcul conservé)', () => {
    const src = read('client/src/ayrovix/components/LensLauncher.tsx');
    expect(src).toContain('productClassLabel(classifyProduct(product.title');
    expect(src).toContain('onClick={onOpenCart}');
    expect(src).toContain('actions={(');
    // Le recalcul vit désormais dans la page produit (« Calculer un autre article »),
    // l'en-tête Lens propose « Nouvelle recherche ».
    expect(src).toContain('Nouvelle recherche');
    expect(read('client/src/ayrovix/components/ProductResult.tsx')).toContain('Calculer un autre article');
  });
});

describe('P1 — la description atteint enfin les cartes', () => {
  it('candidateToProduct (Lens + Sonim) biche la description au lieu de la jeter', () => {
    const lens = read('client/src/ayrovix/components/LensLauncher.tsx');
    const sonim = read('client/src/components/assistant/AiAssistantDrawer.tsx');
    expect(lens).toContain("description: candidate.description || candidate.model || ''");
    expect(sonim).toContain("description: candidate.description || candidate.model || ''");
  });

  it('la carte liste : titre encre + description grise dessous + prix même style', () => {
    const candidate: AyrovixCandidate = {
      id: 'serum', kind: 'external', title: 'AXIS-Y COLLAGEN EYE SERUM', brand: 'AXIS-Y', model: null,
      description: 'Sérum contour des yeux au collagène — 10 ml.',
      colors: [], sizes: [], source: 'Example', sourceUrl: 'https://shop.example/serum', image: '/serum.jpg',
      price: 20, currency: 'EUR', priceTnd: 141.03, match: 90, promo: { percent: 9, label: 'Offre', priceTnd: 141.03, originalPriceTnd: 155.3 },
    };
    const html = renderToStaticMarkup(<LocaleProvider><ProductCandidates candidates={[candidate]} onChoose={() => {}} /></LocaleProvider>);
    expect(html).toContain('AXIS-Y COLLAGEN EYE SERUM');
    expect(html).toContain('Sérum contour des yeux au collagène — 10 ml.');
    expect(html).toMatch(/Sérum contour des yeux au collagène[^<]*<\/p><[^>]*text-muted|text-muted[^"]*"[^>]*>[^<]*Sérum contour/);
    expect(html).toContain('ay-quiet-price__current--promo');
  });
});
