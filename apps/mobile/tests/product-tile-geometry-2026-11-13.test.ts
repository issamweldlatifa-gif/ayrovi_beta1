/**
 * Carte produit de grille — 13/11/2026.
 *
 * Demande du propriétaire : reprendre les cartes de la vidéo Drive
 * `SVID_20261112_221547_1.mp4` (576 × 1280 px, écran de 360 dp ⇒ 1,6 px/dp) :
 * des lignes alignées, la navigation entre les photos dans la carte, et un
 * affichage grandes / petites photos. Ce fichier verrouille les cotes relevées
 * au pixel et les règles qui en découlent.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PRODUCT_TILE,
  isProductDensity,
  nextProductDensity,
  productTileColumns,
  productTileDotWindow,
  productTileFontScale,
  productTileImages,
  productTileInitialRows,
  productTileMetrics,
  productTilePageAt,
  productTileArrivalPhoto,
} from '@/design/productTile';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const PX_PER_DP = 576 / 360;
const dp = (px: number) => px / PX_PER_DP;

describe('cotes relevées sur la vidéo (px ÷ 1,6)', () => {
  it('photo 2:3 bord à bord, filet de 4 entre colonnes, rangées jointives', () => {
    // image gauche x 0 → 285, droite 291 → 576 ; hauteur 203 → 634
    expect(285 / 431).toBeCloseTo(PRODUCT_TILE.mediaRatio, 1);
    expect(Math.abs(dp(291 - 285) - PRODUCT_TILE.columnGap)).toBeLessThan(0.5);
    expect(PRODUCT_TILE.gridPadding).toBe(0);
    expect(PRODUCT_TILE.rowGap).toBe(0);
  });

  it('points de 6 au pas de 12, sous la photo, au retrait du texte', () => {
    expect(Math.abs(dp(10) - PRODUCT_TILE.dot)).toBeLessThan(0.5);        // 10 px
    expect(Math.abs(dp(19) - PRODUCT_TILE.dotPitch)).toBeLessThan(0.5);   // 19 px
    expect(Math.abs(dp(650 - 634) - PRODUCT_TILE.dotsTop)).toBeLessThan(0.5);
    expect(Math.abs(dp(20) - PRODUCT_TILE.textInset)).toBeLessThan(1);    // 20 px
    expect(PRODUCT_TILE.dotsMax).toBe(6);
  });

  it('le bloc texte fait la hauteur mesurée (204 px = 127,5 dp)', () => {
    const metrics = productTileMetrics({ width: 360, density: 'grid' });
    expect(Math.abs(metrics.textHeight - dp(838 - 634))).toBeLessThan(1);
    // Carte entière : 203 → 838 = 635 px ≈ 397 dp (2 dp d'arrondi sur la photo).
    expect(Math.abs(metrics.height - dp(838 - 203))).toBeLessThan(3);
  });

  it('marque gras 15, nom 13, info 13, prix gras 17 — chacun sur sa ligne fixe', () => {
    expect(PRODUCT_TILE).toMatchObject({
      brandSize: 15, brandLine: 18,
      nameSize: 13, nameLine: 18,
      metaSize: 13, metaLine: 20,
      priceSize: 17, priceLine: 24,
    });
    // Les centres de ligne tombent sur ceux de la vidéo (± 1,5 dp).
    const top = PRODUCT_TILE.dotsTop + PRODUCT_TILE.dot + PRODUCT_TILE.dotsBottom;
    const centers = [
      top + PRODUCT_TILE.brandLine / 2,
      top + PRODUCT_TILE.brandLine + PRODUCT_TILE.nameLine / 2,
      top + PRODUCT_TILE.brandLine + PRODUCT_TILE.nameLine + PRODUCT_TILE.metaLine / 2,
      top + PRODUCT_TILE.brandLine + PRODUCT_TILE.nameLine + PRODUCT_TILE.metaLine + PRODUCT_TILE.priceLine / 2,
    ];
    const measured = [(678 + 698) / 2, (708 + 721) / 2, (735 + 756) / 2, (769 + 794) / 2].map((y) => dp(y - 634));
    centers.forEach((center, index) => expect(Math.abs(center - measured[index])).toBeLessThan(1.5));
  });
});

describe('une seule mesure pour toute la grille', () => {
  it('360 dp, petites photos : 2 cartes de 178 × 395', () => {
    expect(productTileMetrics({ width: 360, density: 'grid' })).toMatchObject({
      columns: 2, cardWidth: 178, mediaHeight: 267, textHeight: 128, height: 395, inset: 12,
    });
  });

  it('les colonnes plus les filets retombent exactement sur la largeur', () => {
    for (const width of [320, 360, 390, 412, 430, 600, 750, 1024]) {
      for (const density of ['grid', 'large'] as const) {
        const m = productTileMetrics({ width, density });
        expect(m.cardWidth * m.columns + PRODUCT_TILE.columnGap * (m.columns - 1)).toBeCloseTo(width, 6);
        expect(m.height).toBe(m.mediaHeight + m.textHeight);
        expect(m.mediaHeight).toBe(Math.round(m.cardWidth / PRODUCT_TILE.mediaRatio));
      }
    }
  });

  it('grandes photos : une colonne sur téléphone, mêmes lignes, marge 16', () => {
    const small = productTileMetrics({ width: 390, density: 'grid' });
    const large = productTileMetrics({ width: 390, density: 'large' });
    expect(large.columns).toBe(1);
    expect(large.cardWidth).toBe(390);
    expect(large.mediaHeight).toBe(585);
    expect(large.textHeight).toBe(small.textHeight);
    expect(large.lines).toEqual(small.lines);
    expect(large.inset).toBe(PRODUCT_TILE.textInsetLarge);
  });

  it('colonnes selon la largeur et l’affichage', () => {
    expect([320, 599, 600, 899, 900].map((w) => productTileColumns(w, 'grid'))).toEqual([2, 2, 3, 3, 4]);
    expect([320, 599, 600, 1200].map((w) => productTileColumns(w, 'large'))).toEqual([1, 1, 2, 2]);
  });

  it('le grossissement système agrandit TOUTES les lignes ensemble, plafonné à ×1,2', () => {
    expect(productTileFontScale(undefined)).toBe(1);
    expect(productTileFontScale(0.85)).toBe(1);
    expect(productTileFontScale(1.1)).toBe(1.1);
    expect(productTileFontScale(2)).toBe(1.2);
    const big = productTileMetrics({ width: 360, density: 'grid', fontScale: 2 });
    expect(big.lines).toEqual({ brand: 22, name: 22, meta: 24, price: 29 });
    expect(big.textHeight).toBe(10 + 6 + 8 + 22 + 22 + 24 + 29 + 24);
  });

  it('une largeur absurde ne casse pas la carte', () => {
    const m = productTileMetrics({ width: 0, density: 'grid' });
    expect(m.cardWidth).toBeGreaterThan(0);
    expect(m.mediaHeight).toBeGreaterThan(0);
    expect(productTileMetrics({ width: Number.NaN, density: 'grid' }).columns).toBe(2);
  });
});

describe('navigation dans la carte', () => {
  it('au plus 6 points ; au-delà la fenêtre suit la photo active', () => {
    expect(productTileDotWindow(0, 1)).toEqual({ first: 0, length: 1 });
    expect(productTileDotWindow(0, 6)).toEqual({ first: 0, length: 6 });
    expect(productTileDotWindow(5, 6)).toEqual({ first: 0, length: 6 });
    expect(productTileDotWindow(0, 12)).toEqual({ first: 0, length: 6 });
    expect(productTileDotWindow(6, 12)).toEqual({ first: 4, length: 6 });
    expect(productTileDotWindow(11, 12)).toEqual({ first: 6, length: 6 });
    expect(productTileDotWindow(99, 12)).toEqual({ first: 6, length: 6 });
    expect(productTileDotWindow(0, 0)).toEqual({ first: 0, length: 0 });
    for (let page = 0; page < 12; page += 1) {
      const { first, length } = productTileDotWindow(page, 12);
      expect(page).toBeGreaterThanOrEqual(first);
      expect(page).toBeLessThan(first + length);
    }
  });

  it('page affichée = page la plus visible, bornée', () => {
    expect(productTilePageAt(0, 178, 6)).toBe(0);
    expect(productTilePageAt(88, 178, 6)).toBe(0);
    expect(productTilePageAt(90, 178, 6)).toBe(1);
    expect(productTilePageAt(178 * 5, 178, 6)).toBe(5);
    expect(productTilePageAt(178 * 9, 178, 6)).toBe(5);
    expect(productTilePageAt(-40, 178, 6)).toBe(0);
    expect(productTilePageAt(100, 0, 6)).toBe(0);
  });

  it('photos : sans vide, sans doublon, dans l’ordre du CRM', () => {
    expect(productTileImages('/a.jpg', ['/b.jpg', '', '/a.jpg', null, ' /c.jpg '])).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
    expect(productTileImages('', [])).toEqual([]);
  });

  it('montage initial : ~6 cartes en grille, 2 grandes cartes', () => {
    expect(productTileInitialRows(1)).toBe(2);
    expect(productTileInitialRows(2)).toBe(3);
    expect(productTileInitialRows(3)).toBe(2);
    expect(productTileInitialRows(4)).toBe(2);
  });

  it('photo d’arrivée sur la fiche : un entier ≥ 0, quoi qu’il arrive dans l’URL', () => {
    expect(productTileArrivalPhoto(undefined)).toBe(0);
    expect(productTileArrivalPhoto('')).toBe(0);
    expect(productTileArrivalPhoto('2')).toBe(2);
    expect(productTileArrivalPhoto(['3', '1'])).toBe(3);
    expect(productTileArrivalPhoto('-4')).toBe(0);
    expect(productTileArrivalPhoto('1.7')).toBe(1);
    expect(productTileArrivalPhoto('abc')).toBe(0);
    expect(productTileArrivalPhoto('Infinity')).toBe(0);
  });

  it('bascule grandes / petites photos', () => {
    expect(nextProductDensity('grid')).toBe('large');
    expect(nextProductDensity('large')).toBe('grid');
    expect(isProductDensity('grid')).toBe(true);
    expect(isProductDensity('list')).toBe(false);
    expect(isProductDensity(undefined)).toBe(false);
  });
});

describe('branchements', () => {
  const card = read('../src/features/catalog/ProductCard.tsx');
  const catalog = read('../app/catalog.tsx');
  const product = read('../app/product/[id].tsx');
  const prefs = read('../src/state/prefs.tsx');
  const tile = read('../src/design/ProductTile.tsx');

  it('la carte boutique est la carte partagée, sans cadre ni hauteur propre', () => {
    expect(card).toContain('<ProductTile');
    expect(card).not.toContain("width: '48%'");
    expect(card).not.toContain('borderWidth: 1');
    // Prix serveur ; un stock qui mérite d'être dit l'est encore (limité, épuisé, non confirmé).
    expect(card).toContain('formatMoney(product.finalPrice)');
    expect(card).toContain("t('catalog.stock.unknown')");
    // 14/11 (planche Privé 023638) : plus de bouton panier ni de « En stock » vert ; prix
    // conseillé barré seulement depuis le CRM ; photo entière sur le gris des photos.
    expect(card).not.toContain('product-card-cart-');
    expect(card).not.toContain("t('catalog.stock.in_stock')");
    expect(card).toContain('product.compareAtPrice != null && product.compareAtPrice > product.finalPrice');
    expect(tile).toContain('contentFit="contain"');
    expect(tile).toContain('media: ficheColorsFor(theme.mode).photo');
    expect(card).toContain('product.additionalImages');
  });

  it('chaque ligne de la carte tient sur UNE ligne, dans une boîte de hauteur fixe', () => {
    expect(tile).not.toMatch(/numberOfLines=\{[2-9]\}/);
    expect(tile.match(/numberOfLines=\{1\}/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    for (const line of ['lines.brand', 'lines.name', 'lines.meta', 'lines.price']) {
      expect(tile).toContain(`height: ${line}`);
    }
  });

  it('la grille boutique calcule une seule mesure et suit la bascule', () => {
    expect(catalog).toContain('productTileMetrics(');
    expect(catalog).toContain('numColumns={metrics.columns}');
    expect(catalog).toContain('key={`catalog-grid-${metrics.columns}`}');
    expect(catalog).toContain('<ProductGridBar');
    expect(catalog).toContain('marginHorizontal: -gutter');
    expect(catalog).toContain("photo: String(photo)");
  });

  it('la fiche s’ouvre sur la photo regardée dans la carte', () => {
    expect(product).toContain('photo: photoParam');
    expect(product).toContain('useState(startPhoto)');
    expect(product).toContain('index={shownPhoto}');
  });

  it('le choix grandes / petites photos est un réglage persistant', () => {
    expect(prefs).toContain("productDensity: 'grid'");
    expect(prefs).toContain('isProductDensity(parsed.productDensity)');
    expect(prefs).toContain('setProductDensity');
  });
});
