// HYGIÈNE DE DESCRIPTION (signalement client 24/09/2026 — captures
// princessetamtam «Pantalon TERRY») : la fiche affichait du code JS
// (gaDataLayer/GTM), des libellés d'interface marchand (Ajouter au panier,
// Guide des tailles ×N, Qté, livraison, cookies), des URL brutes et un prix
// en euros. La description livrée aux clients doit être une copie marchande
// PROPRE — et l'extrait court sous le titre n'en est qu'un sous-ensemble.
import { describe, expect, it } from 'vitest';
import { cleanDescription, parseProductPageHtml } from '../src/scraper/productPageParser';

const DIRTY = [
  'Pantalon TERRY light chine coupe droite.',
  '(() => { const gaDataLayer = window.GTM.dataLayerPush; })();',
  'Ajouter au panier',
  'Guide des tailles Quelle est ma taille / correspondance',
  'Guide des tailles Quelle est ma taille / correspondance',
  'Guide des tailles Quelle est ma taille / correspondance',
  'https://www.princessetamtam.com/products/pantalon-terry?utm_source=x',
  '25,00 €',
  'Qté : 1',
  'Livraison à domicile dès le 29.09',
  'Réserver en boutique',
  "Enregistrer ma taille et mes préférences cookie",
  'Réf. 5WLP227',
  'Maille éponge légère, taille élastiquée et cordon de serrage.',
].join('\n');

describe('cleanDescription — la fiche ne montre que de la copie marchande', () => {
  it('retire scripts, UI marchand, URLs, prix et répétitions', () => {
    const cleaned = cleanDescription(DIRTY);
    expect(cleaned).toContain('Pantalon TERRY light chine coupe droite');
    expect(cleaned).toContain('Maille éponge légère');
    expect(cleaned).not.toMatch(/gaDataLayer|dataLayerPush|=>/);
    expect(cleaned).not.toMatch(/panier|Qté|Livraison|Réserver|cookie/i);
    expect(cleaned).not.toMatch(/Quelle est ma taille/i);
    expect(cleaned).not.toMatch(/https?:\/\//);
    expect(cleaned).not.toMatch(/€/);
    // La phrase répétée 3× ne doit apparaître qu'une fois.
    expect(cleaned.match(/Guide des tailles/gi) ?? []).toHaveLength(0);
  });

  it('ne retourne jamais une chaîne vide-bruit (garde has_description honnête)', () => {
    expect(cleanDescription('Ajouter au panier\nQté : 1\nhttps://x.fr')).toBe('');
  });
});

describe('parseProductPageHtml — purge du DOM avant extraction', () => {
  it('une description sale reste propre après passage dans le parseur', () => {
    const product = { title: 'Pantalon TERRY', options: ['Taille'], variants: [{ id: 1, option1: 'M', price: 169.08 }] };
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: product.title, description: DIRTY, offers: { price: 169.08, priceCurrency: 'TND' } })}</script>
    </head><body>
      <script>window.GTM = { dataLayerPush: () => {} };</script>
      <style>.add-to-cart { color: red; }</style>
      <h1>Pantalon TERRY</h1>
      <button>Ajouter au panier</button>
      <div>Guide des tailles Quelle est ma taille / correspondance</div>
    </body></html>`;
    const parsed = parseProductPageHtml(html, 'https://example.org/p', 'generic');
    expect(parsed.description).not.toMatch(/gaDataLayer|dataLayerPush/);
    expect(parsed.description).not.toMatch(/Quelle est ma taille|panier/i);
    expect(parsed.description).toContain('Pantalon TERRY light chine');
  });

  it('le titre n\'hérite plus du contenu des scripts purgés', () => {
    const html = `<html><head><title>Fiche</title></head><body>
      <script>const x = "PANTALON TERRY PROMO FLASH";</script>
      <h1>Pantalon TERRY light chine</h1>
    </body></html>`;
    const parsed = parseProductPageHtml(html, 'https://example.org/p', 'generic');
    expect(parsed.title).toBe('Pantalon TERRY light chine');
  });
});
