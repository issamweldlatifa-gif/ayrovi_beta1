import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ProductGrid, ProductPage, SizeDrape, BagPage, PaymentPage, LoadingView } from '../client/src/shop';
import { productToView, candidateToView } from '../client/src/shop/adapter';
import { hasBrandScale, isOrderable, refusalReason, type ProductView, type SizeOption } from '../client/src/shop/types';
import type { AyrovixProduct, AyrovixCandidate } from '../client/src/ayrovix/types';

const tr = (fr: string) => fr;
const money = (tnd: number) => `${tnd.toFixed(2)} DT`;

const size = (over: Partial<SizeOption>): SizeOption =>
  ({ value: 'M', brandValue: null, state: 'available', remaining: null, ...over });

const view = (over: Partial<ProductView> = {}): ProductView => ({
  id: 'p1', brand: 'Champion', title: 'Open Hem Pants', description: 'Molleton coton',
  media: [{ src: '/a.png', fallbacks: [], alt: 'a' }],
  price: { current: { tnd: 118.9, source: { amount: 35.95, currency: 'EUR' } }, reference: { tnd: 132.1 }, discountPercent: 10, verifiedAtSource: true },
  sizes: [size({ value: 'S', state: 'unknown' }), size({ value: 'M', remaining: 2 }), size({ value: 'XL', state: 'unavailable' })],
  sizeScaleLabel: 'EU', colors: [], flags: [{ kind: 'deal', label: 'Promo' }],
  merchant: { name: 'Champion', url: 'https://x.tn/p' }, ...over,
});

describe('boutique v2 — contrat', () => {
  it('une taille non confirmée n’est JAMAIS commandable', () => {
    expect(isOrderable(size({ state: 'available' }))).toBe(true);
    expect(isOrderable(size({ state: 'unknown' }))).toBe(false);
    expect(isOrderable(size({ state: 'unavailable' }))).toBe(false);
    expect(isOrderable(null)).toBe(false);
  });

  it('le refus dit LAQUELLE des deux raisons, jamais un message vague', () => {
    expect(refusalReason(size({ state: 'unavailable' }))).toBe('unavailable');
    expect(refusalReason(size({ state: 'unknown' }))).toBe('unknown');
    expect(refusalReason(size({ state: 'available' }))).toBeNull();
  });

  it('l’échelle marque exige au moins deux correspondances réelles', () => {
    expect(hasBrandScale([size({ brandValue: '52/54' })])).toBe(false);
    expect(hasBrandScale([size({ value: 'M', brandValue: '52/54' }), size({ value: 'L', brandValue: '56/58' })])).toBe(true);
    expect(hasBrandScale([size({ value: 'M', brandValue: 'M' }), size({ value: 'L', brandValue: 'L' })])).toBe(false);
  });
});

describe('boutique v2 — adaptateur', () => {
  const product: AyrovixProduct = {
    title: 'Open Hem Pants', brand: 'Champion', model: null, description: 'Molleton',
    image: 'https://m.tn/a.jpg', images: [], source: 'Champion', sourceUrl: 'https://m.tn/p',
    price: 35.95, currency: 'EUR', priceTnd: 118.9, exchangeRate: 3.31,
    colors: [], sizes: ['S', 'M'], availability: 'in_stock',
    variantOptions: [
      { id: null, label: '52/54', size: 'M', color: null, available: true, availability: 'available', price: null } as any,
      { id: null, label: 'S', size: 'S', color: null, available: true, availability: 'unknown', price: null } as any,
    ],
  } as AyrovixProduct;

  it('reporte les trois états du moteur sans en promouvoir aucun', () => {
    const sizes = productToView(product).sizes;
    expect(sizes.find((s) => s.value === 'M')?.state).toBe('available');
    expect(sizes.find((s) => s.value === 'S')?.state).toBe('unknown');
  });

  it('ne publie JAMAIS une quantité : aucune source ne l’expose', () => {
    expect(productToView(product).sizes.every((s) => s.remaining === null)).toBe(true);
  });

  it('n’invente pas de marque ni de description absentes', () => {
    const bare = candidateToView({ id: 'c', title: 'Un titre', brand: null, description: null, image: '', images: [], source: 'S', sourceUrl: 'https://x.tn', price: null, currency: null, priceTnd: null, match: 10 } as unknown as AyrovixCandidate);
    expect(bare.brand).toBeNull();
    expect(bare.description).toBeNull();
    expect(bare.price).toBeNull();
  });

  it('l’image passe par la composition AYROVI en premier', () => {
    expect(productToView(product).media[0].src).toContain('/api/public/media/card');
  });
});

describe('boutique v2 — rendu', () => {
  it('la carte montre le descriptif et le prix barré, et rien d’inventé', () => {
    const html = renderToStaticMarkup(<ProductGrid products={[view()]} tr={tr} formatMoney={money} onOpen={() => {}} />);
    expect(html).toContain('Molleton coton');
    expect(html).toContain('118.90 DT');
    expect(html).toContain('132.10 DT');
    expect(html).toContain('−10%');
  });

  it('la carte sans prix annonce une confirmation au lieu d’un zéro', () => {
    const html = renderToStaticMarkup(<ProductGrid products={[view({ price: null })]} tr={tr} formatMoney={money} onOpen={() => {}} />);
    expect(html).toContain('Prix à confirmer');
    expect(html).not.toContain('0.00 DT');
  });

  it('la fiche porte le voile, la barre d’achat et les trois états', () => {
    const html = renderToStaticMarkup(<ProductPage product={view()} tr={tr} formatMoney={money} />);
    expect(html).toContain('s-scrim');
    expect(html).toContain('s-buybar');
    expect(html).toContain('stock non confirmé');
    expect(html).toContain('rupture constatée');
  });

  it('le drap affiche la quantité seulement quand la source la donne', () => {
    const html = renderToStaticMarkup(
      <SizeDrape open sizes={view().sizes} selected={null} scaleLabel="EU" tr={tr} onClose={() => {}} onSelect={() => {}} />,
    );
    expect(html).toContain('2 disponibles');
    expect(html).toContain('Stock non confirmé');
    // Sans service d'alerte fourni, aucun bouton « Prévenez-moi » n'est promis.
    expect(html).not.toContain('Prévenez-moi');
  });

  it('le panier bloque la commande tant qu’une ligne n’est pas confirmée', () => {
    const html = renderToStaticMarkup(
      <BagPage
        lines={[{ id: 'l1', title: 'Pants', brand: 'Champion', variant: 'M', quantity: 1, media: null, lineTotalTnd: 118.9, referenceTotalTnd: null, stock: 'unknown' }]}
        subtotalTnd={118.9} deliveryTnd={0} totalTnd={118.9} tr={tr} formatMoney={money} onCheckout={() => {}}
      />,
    );
    expect(html).toContain('disabled');
    expect(html).toContain('Stock non confirmé par la source.');
  });

  it('le paiement dit POURQUOI un moyen est bloqué', () => {
    const html = renderToStaticMarkup(
      <PaymentPage
        methods={[{ id: 'FLOUCI', label: 'Flouci', hint: 'Mobile', blocked: 'En attente d’une passerelle réelle', available: false, mark: { kind: 'word', text: 'F' } }]}
        selected={null} totalTnd={118.9} tr={tr} formatMoney={money} onSelect={() => {}}
      />,
    );
    expect(html).toContain('En attente d’une passerelle réelle');
    expect(html).not.toContain('>Indisponible<');
  });

  it('le chargement n’invente pas de message', () => {
    const html = renderToStaticMarkup(<LoadingView title="Chargement…" />);
    expect(html).toContain('Chargement…');
    expect(html).toContain('data-editorial-icon="Loader"');
  });
});

describe('boutique v2 — indépendance', () => {
  const files = [
    'client/src/shop/ProductPage.tsx', 'client/src/shop/ProductGrid.tsx', 'client/src/shop/SizeDrape.tsx',
    'client/src/shop/BagPage.tsx', 'client/src/shop/AddressPage.tsx', 'client/src/shop/PaymentPage.tsx',
  ].map((path) => readFileSync(path, 'utf8'));

  it('aucun écran v2 n’importe un composant ancien', () => {
    for (const source of files) {
      expect(source).not.toMatch(/from '\.\.\/components\//);
      expect(source).not.toMatch(/from '\.\.\/ayrovix\/components\//);
    }
  });

  it('la feuille v2 n’utilise que ses propres classes et aucun orange', () => {
    const raw = readFileSync('client/src/shop/shop.css', 'utf8');
    // On juge les RÈGLES, pas les commentaires : « aucun orange » y est écrit en toutes lettres.
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#ff6900|#FF7900|orange/i);
    const selectors = css.match(/^\.[a-z-]+/gm) || [];
    expect(selectors.every((selector) => selector.startsWith('.s-'))).toBe(true);
  });
});
