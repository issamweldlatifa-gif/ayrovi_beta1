/**
 * Page Publication refondue (13/11/2026) — lecture des blocs du CRM, cotes
 * relevées sur les planches Zalando, couleurs dérivées du fond choisi au CRM.
 */
import { describe, expect, it } from 'vitest';
import { parsePublicationBlock, parsePublicationBlocks } from '../src/api/publicationBlocks';
import { blockInks, hasTintedBackground } from '../src/features/publications/templates/blockColors';
import {
  publicationTemplateMetrics,
  PUBLICATION_TEMPLATE as T,
} from '../src/features/publications/templates/templateMetrics';
import { contrastRatio } from '../../../shared/publicationBlocks';
import { CARD_SYSTEM as C, cardRailMaxOffset, cardRailMetrics, cardsPerView, cardWidthFor } from '../src/design/cardSystem';
import fs from 'node:fs';
import path from 'node:path';

/** Jetons Publication lus dans la source (le module importe `react-native`, illisible ici). */
const tokenSource = fs.readFileSync(path.join(__dirname, '../src/features/publications/publicationTokens.ts'), 'utf8');
const token = (name: string) => {
  const match = tokenSource.match(new RegExp(`\\b${name}:\\s*(\\d+)`));
  if (!match) throw new Error(`jeton absent : ${name}`);
  return Number(match[1]);
};

const product = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `Produit ${id}`, brand: 'Marque', image: `/media/${id}.jpg`, price: 120, currency: 'TND',
  stockStatus: 'AVAILABLE', available: true, ...extra,
});

const block = (extra: Record<string, unknown> = {}) => ({
  id: 'b1', kind: 'media', title: 'Titre', subtitle: 'Sous-titre', bgColor: '#ffffff', panelColor: '',
  sponsored: false, media: { type: 'video', url: '/media/v.mp4', poster: '/media/v.jpg' },
  products: [product('p1'), product('p2')], publisher: { name: 'zayrovi team' }, ...extra,
});

describe('lecture des blocs Publication', () => {
  it('normalise un bloc valide (couleur, média, produits, éditeur)', () => {
    const parsed = parsePublicationBlock(block());
    expect(parsed).toMatchObject({
      id: 'b1', kind: 'media', bgColor: '#FFFFFF', panelColor: '#FFFFFF',
      media: { type: 'video', url: '/media/v.mp4', poster: '/media/v.jpg' },
      publisher: { name: 'zayrovi team' },
    });
    expect(parsed?.products.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('éditeur absent : « zayrovi team » (consigne du propriétaire), suivi via l’éditeur officiel', () => {
    const parsed = parsePublicationBlock(block({ publisher: undefined }));
    expect(parsed?.publisher).toEqual({ id: 'pub_ayrovi', name: 'zayrovi team' });
    expect(parsePublicationBlock(block({ publisher: { id: 'pub_x', name: 'Autre' } }))?.publisher).toEqual({ id: 'pub_x', name: 'Autre' });
  });

  it('écarte un bloc mal formé sans faire tomber la page', () => {
    const rows = parsePublicationBlocks([
      block({ id: 'ok' }),
      block({ id: 'kind', kind: 'carousel' }),
      block({ id: 'color', bgColor: 'rouge' }),
      block({ id: 'title', title: ' ' }),
      block({ id: 'ok' }), // doublon
      null,
    ]);
    expect(rows.map((row) => row.id)).toEqual(['ok']);
  });

  it('un produit incomplet disparaît ; un bloc sans produit n’est pas montré', () => {
    const parsed = parsePublicationBlock(block({ products: [product('p1', { price: 0 }), product('p2')] }));
    expect(parsed?.products.map((p) => p.id)).toEqual(['p2']);
    expect(parsePublicationBlock(block({ products: [product('p1', { price: 0 })] }))).toBeNull();
    expect(parsePublicationBlock(block({ kind: 'sponsored_pair', media: null }))).toBeNull();
    expect(parsePublicationBlock(block({ kind: 'container', media: null, panelColor: '#811725' }))?.panelColor).toBe('#811725');
  });

  it('refuse une réponse qui n’est pas une liste', () => {
    expect(() => parsePublicationBlocks({ items: [] })).toThrow();
  });
});

describe('cotes des modèles (planches Zalando, 360 dp)', () => {
  it('14/11 (système de rythme) : la barre colle à SON bloc, le blanc sépare les blocs', () => {
    // Remplace « blocs rapprochés (16 dp) » du 13/11 : chaque bloc porte
    // maintenant sa barre d'interaction ; Publication était jugée chargée.
    expect(T.blockSpacing).toBe(32);
    expect(T.barTop).toBeLessThan(T.blockSpacing);
    expect(T.bandPaddingTop).toBe(24);
    expect(T.bandPaddingBottom).toBe(24);
  });

  it('14/11 (GBox) : titre du bandeau > texte de carte (16, la graisse distingue la marque) > « Sponsorisé »', () => {
    expect(token('bandTitleSize')).toBeGreaterThan(token('cardBrandSize'));
    for (const name of ['cardBrandSize', 'cardNameSize', 'cardPriceSize']) expect(token(name)).toBe(16);
    expect(token('cardSponsoredSize')).toBe(14);
    expect(token('cardSponsoredSize')).toBeLessThan(token('cardNameSize'));
    // 13/11 : plus de rond blanc sur la photo — le cœur nu vient du système de cartes.
    expect(tokenSource).not.toMatch(/\bheart(Small)?:/);
    expect(token('cardReferenceLine')).toBe(18);
    expect(tokenSource).toContain("'AyroviExtracted-Heading'");
    // Pilule « + Suivre » : cible tactile ≥ 48 dp (planche : 95 px).
    expect(token('followHeight')).toBeGreaterThanOrEqual(token('touch'));
  });

  const m = publicationTemplateMetrics(360);

  it('13/11 — SYSTÈME DE CARTES : les trois modèles partagent la même carte, 2 entières à parts égales', () => {
    // 12 · 164 · 8 · 164 · 12 = 360 : aucune amorce coupée, même marge des deux côtés.
    expect(C.gutter).toBe(12);
    expect(C.gap).toBe(8);
    expect(m.container.cardWidth).toBe(164);
    expect(m.media.tileWidth).toBe(164);
    expect(m.pair.tileWidth).toBe(164);
    expect(C.gutter * 2 + m.container.cardWidth * 2 + C.gap).toBe(360);
    for (const height of [m.container.cardImageHeight, m.media.tileHeight, m.pair.cardImageHeight]) expect(height).toBe(236);
    expect(m.container.snap).toBe(172);
    // Une seule marge : titre, cartes, média, « Suivre ».
    expect(T.bandInset).toBe(C.gutter);
    expect(T.mediaInset).toBe(C.gutter);
    expect(T.pairInset).toBe(C.gutter);
    expect(T.cardSpacing).toBe(C.gap);
    expect(T.pairSpacing).toBe(C.gap);
    expect(T.cardRadius).toBe(C.radius);
    expect(T.panelPaddingTop).toBe(56);
    expect(T).not.toHaveProperty('cardsVisible');
    expect(T).not.toHaveProperty('rowTilesVisible');
  });

  it('13/11 — la rangée s’arrête toujours sur la marge (début ET fin), quel que soit le nombre de cartes', () => {
    for (const width of [320, 360, 393, 412, 600, 1024]) {
      const rail = cardRailMetrics(Math.min(width, T.maxContentWidth));
      const column = Math.min(width, T.maxContentWidth);
      for (const count of [2, 3, 5, 8]) {
        const content = C.gutter * 2 + count * rail.cardWidth + (count - 1) * C.gap;
        const max = Math.max(0, content - column);
        // le décalage maximal est un multiple exact du pas d'aimantation
        expect(Math.abs(max - cardRailMaxOffset(count, rail))).toBeLessThan(1e-6);
        expect(Math.abs((max / rail.snap) - Math.round(max / rail.snap))).toBeLessThan(1e-6);
      }
      // cartes entières : n cartes + marges + écarts = la colonne
      expect(Math.abs(C.gutter * 2 + rail.perView * rail.cardWidth + (rail.perView - 1) * C.gap - column)).toBeLessThan(1e-6);
    }
    expect(cardsPerView(360)).toBe(2);
    expect(cardsPerView(640)).toBe(4);
    expect(cardWidthFor(Number.NaN)).toBe(164);
  });

  it('modèle media : média sur la marge commune, image ≈ 2:1, vidéo carrée', () => {
    expect(m.media.width).toBe(336);
    expect(m.media.imageHeight).toBe(Math.round(336 / T.imageAspect));
    expect(m.media.videoHeight).toBe(336);
  });

  it('modèle sponsored_pair : image qui déborde depuis la marge, puis les deux cartes du système', () => {
    expect(m.pair.mediaWidth).toBe(348);
    expect(m.pair.mediaHeight).toBe(Math.round(348 / T.pairMediaAspect));
    expect(T.pairCardsTop).toBe(56);
  });

  it('tablette : colonne plafonnée, plus de cartes visibles, tuiles du duo toujours égales', () => {
    const wide = publicationTemplateMetrics(1024);
    expect(wide.width).toBe(T.maxContentWidth);
    // tablette : 4 cartes entières dans la colonne de 640 ; le duo reste deux cartes égales
    expect(wide.container.cardWidth).toBe(cardWidthFor(640, 4));
    expect(wide.pair.tileWidth).toBe(cardWidthFor(640, 2));
    expect(wide.pair.cardImageHeight).toBe(Math.round(wide.pair.tileWidth * T.pairCardRatio));
    expect(publicationTemplateMetrics(Number.NaN).width).toBe(360);
  });
});

describe('couleurs : le fond vient du CRM, le texte reste lisible', () => {
  const ink = '#101010';
  const paper = '#FFFFFF';
  it.each(['#F2AD11', '#D7263D', '#4262AD', '#F4F4F4', '#111111', '#FFFFFF', '#811725', '#F7CE70'])('fond %s', (bg) => {
    const inks = blockInks(bg, ink, paper);
    expect(contrastRatio(bg, inks.ink)).toBeGreaterThanOrEqual(4.5);
    expect(inks.muted).not.toBe(inks.ink);
  });
  it('fond blanc : pas de marge colorée ; fond teinté : bloc encadré', () => {
    expect(hasTintedBackground('#FFFFFF')).toBe(false);
    expect(hasTintedBackground('#E9E4DC')).toBe(true);
  });
});

describe('13/11 — système de cartes dans les composants (captures 073653 → 073818)', () => {
  const src = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  it('le cœur est nu (aucun rond blanc sur la photo) et partagé avec la grille du catalogue', () => {
    const card = src('src/features/publications/templates/BlockProductCard.tsx');
    const heart = card.match(/ {2}heart: \{[^}]*\}/)?.[0] ?? '';
    expect(heart).toContain('C.heartTarget');
    expect(heart).not.toContain('backgroundColor');
    expect(card).not.toContain('borderRadius: size / 2');
    expect(card).toContain('size={C.heartIcon}');
    const tile = src('src/design/ProductTile.tsx');
    expect(tile).toContain('size={CARD_SYSTEM.heartIcon}');
    expect(tile).toContain('width: CARD_SYSTEM.heartTarget');
  });

  it('l’ancien prix a SA ligne (il ne colle plus au prix ni n’est coupé) et la ligne est réservée pour les voisines', () => {
    const card = src('src/features/publications/templates/BlockProductCard.tsx');
    expect(card).not.toContain('{`  ${reference}`}');
    expect(card).toContain('-reference`');
    expect(card).toContain('-reference-slot`');
    for (const file of ['ContainerTemplate', 'MediaTemplate', 'SponsoredPairTemplate']) {
      expect(src(`src/features/publications/templates/${file}.tsx`), file).toContain('reserveReference={reserveReference}');
    }
  });

  it('les rangées s’aimantent d’une carte, sans élan qui saute une carte ; le modèle media utilise LA carte commune', () => {
    for (const file of ['ContainerTemplate', 'MediaTemplate']) {
      const code = src(`src/features/publications/templates/${file}.tsx`);
      expect(code, file).toContain('snapToInterval={metrics.container.snap}');
      expect(code, file).toContain('disableIntervalMomentum');
      expect(code, file).toContain('<BlockProductCard');
    }
    expect(fs.existsSync(path.join(__dirname, '../src/features/publications/templates/RowProductTile.tsx'))).toBe(false);
  });

  it('Reels : l’écart du système (8) et plus de double blanc après le filet', () => {
    const reels = src('src/features/home/ReelsShopSection.tsx');
    expect(reels).toContain('gap: CARD_SYSTEM.gap');
    expect(reels).toContain('snapToInterval={tileWidth + CARD_SYSTEM.gap}');
    expect(reels).toContain('section: { paddingTop: 12 }');
    expect(reels).not.toContain('paddingBottom: theme.space[4]');
  });
});
