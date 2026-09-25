import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogProductToScraped } from '../client/src/commerce/catalogProduct';

/**
 * ESPACE 01 ACHETER — gardes de structure.
 *
 * Le parcours qui mène au panier est mesuré, pas supposé : ces tests figent les trois corrections du
 * 2026-09-22 pour qu'elles ne puissent pas régresser en silence.
 *
 *   1. « Tous les produits » (menu) ouvre une page réelle — la page doit être DÉCLARÉE, sinon le clic
 *      ne faisait rien (défaut constaté : le contenu existait, la route n'existait pas) ;
 *   2. l'en-tête porte une entrée panier nommée — les props `onOpenCart`/`cartCount` étaient
 *      transmises puis ignorées : un magasin sans entrée panier casse le parcours ;
 *   3. le menu parle la langue du visiteur — les onglets publics s'affichaient en français en arabe ;
 *   4. la carte du catalogue mène au tiroir de commande, avec la conversion testée ci-dessous.
 */
const cms = readFileSync('client/src/components/PublicCmsSections.tsx', 'utf8');
const navbar = readFileSync('client/src/components/Navbar.tsx', 'utf8');
const menu = readFileSync('client/src/components/MenuDrawer.tsx', 'utf8');
const app = readFileSync('client/src/App.tsx', 'utf8');

describe('espace 01 — acheter', () => {
  it('déclare la page catalogue qui reçoit l’entrée « Tous les produits »', () => {
    expect(cms).toContain("(['products', 'arrivals', 'promotions', 'stories', 'news'] as const)");
    expect(cms).toContain("products: { label: 'Tous les produits', labelAr: 'كل المنتجات' }");
    expect(cms).toContain("if (page === 'products')");
    // Le contenu de la page ne peut pas exister sans déclaration : c'était exactement le défaut.
    const declared = cms.indexOf("(page === 'products')");
    expect(declared).toBeGreaterThan(-1);
  });

  it('garde le libellé local déclaré AVANT l’initialisation qui l’utilise', () => {
    // Un `const` lu par un initialiseur situé au-dessus fait planter tout le bundle (TDZ).
    expect(cms.indexOf('const localPageLabels')).toBeLessThan(cms.indexOf('const pageDefinitions'));
  });

  it('rend l’entrée panier de l’en-tête nommée, avec le compteur', () => {
    expect(navbar).toContain('onOpenCart');
    expect(navbar).toContain('cartCount = 0');
    expect(navbar).toContain("tr('Ouvrir mon panier', 'فتح سلّتي')");
    expect(navbar).toContain('aria-label={cartCount > 0');
    // Les props ne sont plus mortes : la preuve est qu'elles sont lues dans le rendu.
    expect(navbar).toMatch(/\{cartCount > 0 &&/);
  });

  it('sert les onglets publics dans la langue du visiteur', () => {
    expect(menu).toContain("{locale === 'ar' ? page.labelAr : page.label}");
  });

  it('branche la carte du catalogue sur le tiroir de commande', () => {
    expect(app).toContain('const openCatalogProduct = (product: ScrapedProduct) =>');
    expect(app).toContain('onOpenProduct={openCatalogProduct}');
    expect(cms).toContain("tr('Voir le produit', 'عرض المنتج')");
  });

  it('convertit un produit du catalogue sans recalculer les prix du serveur', () => {
    const scraped = catalogProductToScraped({
      id: 'product_demo_01', name: 'Ensemble tendance AYROVI', description: 'Produit de démonstration.',
      image: '/media/hero-femme.jpg', additionalImages: [], brandName: 'SHEIN', sourcePlatform: 'SHEIN',
      sourceUrl: 'https://www.shein.com/', originalPrice: 21.99, currency: 'EUR',
      convertedPrice: 90.599, shippingFee: 14.5, serviceFee: 9.06, finalPrice: 177.273,
      stockStatus: 'AVAILABLE',
    });
    expect(scraped.id).toBe('catalog:product_demo_01');
    expect(scraped.store).toBe('shein');
    expect(scraped.title).toBe('Ensemble tendance AYROVI');
    expect(scraped.totalPriceTND).toBe(177.273);
    expect(scraped.convertedPriceTND).toBe(90.599);
    expect(scraped.estimatedShippingTND).toBe(14.5);
    expect(scraped.availability).toBe('in_stock');
    expect(scraped.images).toEqual(['/media/hero-femme.jpg']);
    expect(scraped.externalId).toBe('product_demo_01');
  });

  it('reste honnête sur une plateforme inconnue et sur un produit épuisé', () => {
    const unknown = catalogProductToScraped({ id: 'x', name: 'Article', sourcePlatform: '', originalPrice: 10, currency: 'EUR', finalPrice: 42, stockStatus: 'OUT_OF_STOCK' });
    expect(unknown.store).toBe('generic');
    expect(unknown.storeName).toBe(''); // No merchant was supplied.
    expect(unknown.availability).toBe('out_of_stock');
    expect(unknown.variants).toEqual({});
    // Aucun prix inventé : un champ absent vaut 0, jamais NaN ni un montant deviné.
    expect(catalogProductToScraped({ id: 'y', name: 'Article' }).totalPriceTND).toBe(0);
  });
});
