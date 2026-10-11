import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductGrid } from '../client/src/shop/ProductGrid';
import { catalogProductToView } from '../client/src/shop/adapter';
import type { ProductView } from '../client/src/shop/types';

const tr = (fr: string) => fr;
const money = (tnd: number) => `${tnd.toFixed(2)} DT`;

const view = (over: Partial<ProductView> = {}): ProductView => ({
  id: 'r1', brand: 'Atelier', title: 'Veste noire', description: null,
  media: [{ src: '/a.png', fallbacks: [], alt: 'a' }],
  price: { current: { tnd: 598, source: { amount: 84, currency: 'EUR' } }, reference: null, discountPercent: null, verifiedAtSource: false },
  sizes: [], sizeScaleLabel: null, sizeKind: 'none', optionLabel: null, capacity: null,
  availability: 'unknown', availabilitySource: 'Boutique', availabilityCheckedAt: null, availabilityExpiresAt: null,
  colors: [], flags: [], merchant: { name: 'Boutique', url: 'https://example.com/p/1' }, ...over,
});

describe('carte boutique partagée — vérifier le stock (Lens uniquement)', () => {
  it('ne montre le bouton que si la grille reçoit un gestionnaire ET un lien marchand public', () => {
    const withHandler = renderToStaticMarkup(<ProductGrid products={[view()]} tr={tr} formatMoney={money} onOpen={() => {}} onVerifyStock={() => {}} />);
    expect(withHandler).toContain('s-card__stock');
    expect(withHandler).toContain('Vérifier le stock : Veste noire');

    const withoutHandler = renderToStaticMarkup(<ProductGrid products={[view()]} tr={tr} formatMoney={money} onOpen={() => {}} />);
    expect(withoutHandler).not.toContain('s-card__stock');
  });

  it('n’invente jamais un bouton pour un produit sans lien public', () => {
    const html = renderToStaticMarkup(
      <ProductGrid products={[view({ merchant: { name: 'X', url: 'javascript:alert(1)' } }), view({ id: 'r2', merchant: null })]} tr={tr} formatMoney={money} onOpen={() => {}} onVerifyStock={() => {}} />,
    );
    expect(html).not.toContain('s-card__stock');
  });

  it('affiche le résultat frais avec son heure, ou « Stock non confirmé » en cas d’échec', () => {
    const checked = renderToStaticMarkup(
      <ProductGrid products={[view()]} tr={tr} formatMoney={money} onOpen={() => {}} onVerifyStock={() => {}}
        stockChecks={{ r1: { status: 'done', availability: 'in_stock', checkedAt: '2026-10-11T10:32:00.000Z' } }} />,
    );
    expect(checked).toContain('En stock');
    expect(checked).toContain('Vérifié à');

    const failed = renderToStaticMarkup(
      <ProductGrid products={[view()]} tr={tr} formatMoney={money} onOpen={() => {}} onVerifyStock={() => {}} stockChecks={{ r1: { status: 'failed' } }} />,
    );
    expect(failed).toContain('Stock non confirmé');
    expect(failed).not.toContain('En stock');
  });

  it('pendant la lecture, le bouton est occupé et désactivé', () => {
    const html = renderToStaticMarkup(
      <ProductGrid products={[view()]} tr={tr} formatMoney={money} onOpen={() => {}} onVerifyStock={() => {}} stockChecks={{ r1: { status: 'checking' } }} />,
    );
    expect(html).toContain('Vérification…');
    expect(html).toMatch(/s-card__stock"[^>]*disabled/);
  });
});

describe('grille d’accueil — produits du catalogue dans la carte boutique', () => {
  const base = { id: 'c1', name: 'Sac cuir', brandName: 'Maison', sourcePlatform: 'AMAZON', sourceUrl: 'https://amazon.example/x', currency: 'EUR', originalPrice: 40, finalPrice: 120, stockStatus: 'IN_STOCK', image: 'https://img.example/a.jpg', additionalImages: [] };

  it('mappe le prix final, la marque et le lien marchand', () => {
    const v = catalogProductToView(base, tr);
    expect(v.title).toBe('Sac cuir');
    expect(v.brand).toBe('Maison');
    expect(v.price?.current.tnd).toBe(120);
    expect(v.merchant).toEqual({ name: 'AMAZON', url: 'https://amazon.example/x' });
    expect(v.flags).toEqual([]);
  });

  it('un produit épuisé porte un repère « Épuisé » et ne revendique aucun stock', () => {
    const v = catalogProductToView({ ...base, stockStatus: 'OUT_OF_STOCK' }, tr);
    expect(v.availability).toBe('unavailable');
    expect(v.flags).toEqual([{ kind: 'info', label: 'Épuisé' }]);
  });

  it('sans prix final valable, la carte dit « Prix à confirmer » au lieu d’afficher 0', () => {
    const v = catalogProductToView({ ...base, finalPrice: 0 }, tr);
    expect(v.price).toBeNull();
  });
});
