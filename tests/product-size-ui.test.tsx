// GARDE-FOU UI (demande client 24/09/2026 — «أين المقاسات ودليل المقاسات؟») :
// la refonte produit ne doit JAMAIS casser l'univers taille : sélecteur (tiroir),
// libellé Pointure/Taille, guide des tailles (pointures + tableau), recommandation
// de taille (vêtements) — et le CTA commande reste dépendant du choix si requis.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { ProductResult } from '../client/src/ayrovix/components/ProductResult';
import type { AyrovixProduct } from '../client/src/ayrovix/types';

const shoes: AyrovixProduct = {
  title: 'AIR ZOOM — Chaussures de running', brand: 'Nike Performance', model: null,
  description: 'Chaussure de compétition.', image: '/shoe.jpg', images: ['/shoe.jpg'],
  source: 'Example', sourceUrl: 'https://shop.example/shoe',
  price: 309.95, currency: 'EUR', priceTnd: 1068.75, exchangeRate: 3.37,
  colors: [], sizes: ['43', '40.5', '42'], variantOptions: [], availability: 'unknown',
};
const clothing: AyrovixProduct = {
  ...shoes,
  title: 'Survêtement — Pantalon de jogging', brand: 'Denim Factory',
  description: 'Pantalon de survêtement coupe droite.',
  sizes: ['S', 'M', 'L', 'XL'],
};
const beauty: AyrovixProduct = {
  ...shoes,
  title: 'Glow Serum — Soin des yeux', brand: 'AXIS-Y',
  description: 'Sérum contour des yeux au collagène. 10 ml',
  sizes: [],
};

function render(product: AyrovixProduct): string {
  return renderToStaticMarkup(<LocaleProvider><ProductResult product={product} ordering={false} priceVerified={false} onOrder={vi.fn()} /></LocaleProvider>);
}

describe('l’univers TAILLE survit à toute refonte de la fiche produit', () => {
  it('chaussures : libellé Pointure + sélecteur (tiroir) + guide des pointures', () => {
    const html = render(shoes);
    // Libellé adapté + sélecteur qui OUVRE le tiroir (placeholder « Votre taille »)
    expect(html).toContain('Pointure');
    expect(html).toContain('Votre taille');
    // Guide des pointures (bloc dédié chaussures)
    expect(html).toContain('Consulter le guide des pointures');
    // Les tailles du marchand sont dans le DOM (sélecteur) et TRIÉES
    expect(html.indexOf('>40.5<')).toBeLessThan(html.indexOf('>42<'));
    expect(html.indexOf('>42<')).toBeLessThan(html.indexOf('>43<'));
    // Le code du tiroir et du guide reste câblé (ouvertures + contenus)
    const src = read('client/src/ayrovix/components/ProductResult.tsx');
    expect(src).toContain('setSizeDrawerOpen(true)');
    expect(src).toContain('Choisir votre taille');
    expect(src).toContain('Il en reste 2');
    expect(src).toContain('Guide des tailles');
    expect(src).toContain('Fermer le guide');
  });

  it('vêtements : libellé Taille + « Guide des tailles » + recommandation de taille', () => {
    const html = render(clothing);
    expect(html).toContain('Guide des tailles');
    expect(html).toContain('recommandation de taille');
  });

  it('beauté : AUCUN guide de pointures, et le prix/100ml du bloc beauté reste affiché', () => {
    const html = render(beauty);
    expect(html).not.toContain('Consulter le guide des pointures');
    expect(html).toContain('/ 100 ml'); // bloc beauté (prix au litre) — voulu, testé ailleurs
  });
});

function read(rel: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node:fs').readFileSync(rel, 'utf8');
}
