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
import { editorialFeedRail, editorialHeroHeight, EDITORIAL_FEED as E } from '../../../shared/publicationEditorial';
import fs from 'node:fs';
import path from 'node:path';

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
    expect(parsed?.publisher).toEqual({ id: 'pub_zayrovi', name: 'zayrovi team' });
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

describe('compact publication layouts', () => {
  it('keeps quiet spacing between blocks and reduces empty campaign padding', () => {
    expect(T.barTop).toBeLessThan(T.blockSpacing);
    expect(T.blockSpacing).toBe(24);
    expect(T.bandPaddingTop).toBe(12);
    expect(T.panelPaddingTop).toBe(16);
  });
  it.each([320, 360, 390, 600, 640])('shows full thumbnails and a fourth (or fifth) hint at %i', width => {
    const columns = width >= 600 ? 4 : 3;
    const rail = editorialFeedRail(width, columns + 1);
    expect(width - 2 * E.gutter - columns * rail.snap).toBeCloseTo(16);
    expect(rail.imageHeight).toBe(Math.round(rail.cardWidth * E.ratio));
    expect(rail.scroll).toBe(true);
    expect(editorialFeedRail(width, 1)).toMatchObject({ cardWidth: rail.cardWidth, scroll: false });
  });
  it('at 360dp, campaign photos are 152×219 and all video and campaign heroes are shorter', () => {
    const m = publicationTemplateMetrics(360);
    expect(m.media).toMatchObject({ width: 336, imageHeight: 162, videoHeight: 269, tileHeight: 148 });
    expect(editorialHeroHeight(m.media.width, 'image', 'cover')).toBe(290);
    expect(m.container).toEqual({ cardWidth: 152, cardImageHeight: 219, mediaHeight: 128, snap: 168 });
    expect(m.pair).toEqual({ tileWidth: 152, cardImageHeight: 219, mediaWidth: 320, mediaHeight: 128 });
    expect(m.cinema.videoHeight).toBe(320);
  });
  it('caps tablet content and the card size of a sponsored duo', () => {
    const wide = publicationTemplateMetrics(1024);
    expect(wide.width).toBe(640);
    expect(wide.pair.tileWidth).toBeLessThan(175);
    expect(publicationTemplateMetrics(Number.NaN).width).toBe(360);
  });
});

describe('couleurs : le fond vient du CRM, le texte reste lisible', () => {
  const ink = '#101010';
  const paper = '#FFFFFF';
  it.each(['#F2AD11', '#D7263D', '#4262AD', '#F4F4F4', '#111111', '#FFFFFF', '#811725', '#F7CE70'])('fond %s', (bg) => {
    const inks = blockInks(bg, ink, paper);
    expect(contrastRatio(bg, inks.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(bg, inks.muted)).toBeGreaterThanOrEqual(4.5);
  });
  it('fond blanc : pas de marge colorée ; fond teinté : bloc encadré', () => {
    expect(hasTintedBackground('#FFFFFF')).toBe(false);
    expect(hasTintedBackground('#E9E4DC')).toBe(true);
  });
});

describe('13/11 — système de cartes dans les composants (captures 073653 → 073818)', () => {
  const src = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  it('15/11 (capture 004641) : le cœur est UN rond blanc partagé — cible 44 dp, aucun second rond', () => {
    const card = src('src/features/publications/templates/BlockProductCard.tsx');
    const heart = card.match(/ {2}heart: \{[^}]*\}/)?.[0] ?? '';
    expect(heart).toContain('C.heartTarget');
    // La zone de toucher ne peint rien : le rond blanc vient du glyphe partagé.
    expect(heart).not.toContain('backgroundColor');
    expect(card).toContain('<FavoriteDiscGlyph active={active} />');
    const tile = src('src/design/ProductTile.tsx');
    expect(tile).toContain('<FavoriteDiscGlyph active={favorite.active} />');
    expect(tile).toContain('width: CARD_SYSTEM.heartTarget');
    const disc = src('src/design/FavoriteDisc.tsx');
    expect(disc).toContain('size = CARD_SYSTEM.heartIcon, disc = CARD_SYSTEM.heartDisc');
    expect(disc).toContain('backgroundColor: FAVORITE_DISC.surface');
  });

  it('l’ancien prix a SA ligne (il ne colle plus au prix ni n’est coupé) et la ligne est réservée pour les voisines', () => {
    const card = src('src/features/publications/templates/BlockProductCard.tsx');
    expect(card).not.toContain('{`  ${reference}`}');
    expect(card).toContain('-reference`');
    expect(card).toContain('-reference-slot`');
    for (const file of ['ContainerTemplate', 'CinemaTemplate', 'SponsoredPairTemplate']) {
      expect(src(`src/features/publications/templates/${file}.tsx`), file).toContain('reserveReference={reserveReference}');
    }
  });

  it('les rangées s’aimantent d’une carte, sans élan qui saute une carte ; le modèle media utilise LA carte commune', () => {
    for (const file of ['ContainerTemplate', 'MediaTemplate']) {
      const code = src(`src/features/publications/templates/${file}.tsx`);
      expect(code, file).toContain(file === 'MediaTemplate'
        ? 'snapToInterval={rail.snap}'
        : 'snapToInterval={metrics.container.snap}');
      expect(code, file).toContain('disableIntervalMomentum');
      expect(code, file).toContain('<BlockProductCard');
    }
    expect(fs.existsSync(path.join(__dirname, '../src/features/publications/templates/RowProductTile.tsx'))).toBe(false);
  });

  it('Reels : l’écart du système (8) et plus de double blanc (15/11 : sans filet, l’espace de section suffit)', () => {
    const reels = src('src/features/home/ReelsShopSection.tsx');
    expect(reels).toContain('gap: CARD_SYSTEM.gap');
    expect(reels).toContain('snapToInterval={tileWidth + CARD_SYSTEM.gap}');
    expect(reels).toContain('section: { paddingTop: 0 }');
    expect(reels).not.toContain('paddingBottom: theme.space[4]');
  });
});
