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
  it('13/11 : blocs rapprochés (16 dp) et bandeau resserré', () => {
    expect(T.blockSpacing).toBe(16);
    expect(T.bandPaddingBottom).toBe(16);
  });

  it('14/11 (GBox) : titre du bandeau > texte de carte (16, la graisse distingue la marque) > « Sponsorisé »', () => {
    expect(token('bandTitleSize')).toBeGreaterThan(token('cardBrandSize'));
    for (const name of ['cardBrandSize', 'cardNameSize', 'cardPriceSize']) expect(token(name)).toBe(16);
    expect(token('cardSponsoredSize')).toBe(14);
    expect(token('cardSponsoredSize')).toBeLessThan(token('cardNameSize'));
    // Cœur : rond blanc de 40 dp (grandes cartes) et 32 dp (rangée), à 8 dp du coin.
    expect(token('heart')).toBe(40);
    expect(token('heartSmall')).toBe(32);
    expect(token('heartInset')).toBe(8);
    expect(tokenSource).toContain("'AyroviExtracted-Heading'");
    // Pilule « + Suivre » : cible tactile ≥ 48 dp (planche : 95 px).
    expect(token('followHeight')).toBeGreaterThanOrEqual(token('touch'));
  });

  const m = publicationTemplateMetrics(360);

  it('modèle media : retrait 12, photo ≈ 2:1, vidéo carrée, ~3 photos produit visibles', () => {
    expect(m.media.width).toBe(336);
    expect(m.media.imageHeight).toBe(Math.round(336 / T.imageAspect));
    expect(Math.abs(m.media.imageHeight - 162)).toBeLessThanOrEqual(1); // 323 px relevés
    expect(m.media.videoHeight).toBe(336);
    expect(Math.abs(m.media.tileWidth - 103)).toBeLessThanOrEqual(0.5); // 206 px relevés (GBox)
    expect(Math.abs(m.media.tileHeight - 148)).toBeLessThanOrEqual(1);
    // trois photos entières, trois filets, et une amorce de ~15 dp
    const peek = m.media.width - 3 * m.media.tileWidth - 3 * T.rowSpacing;
    expect(peek).toBeGreaterThan(12);
    expect(peek).toBeLessThan(20);
  });

  it('modèle container (GBox Vans) : cartes 152 dp, écart 16, photo 218 dp, 56 dp sous le bandeau', () => {
    expect(m.container.cardWidth).toBe(152);
    expect(m.container.cardImageHeight).toBe(219);
    expect(T.cardSpacing).toBe(16);
    expect(T.panelPaddingTop).toBe(56);
    expect(T.cardRadius).toBe(12);
  });

  it('modèle sponsored_pair (GBox WE Fashion) : image 336 × 161 qui déborde, puis deux cartes de 160 dp', () => {
    expect(m.pair.mediaWidth).toBe(336);
    expect(m.pair.mediaHeight).toBe(161);
    expect(m.pair.tileWidth).toBe(160);
    expect(m.pair.cardImageHeight).toBe(230);
    expect(T.pairInset * 2 + m.pair.tileWidth * 2 + T.pairSpacing).toBe(360);
    expect(T.pairCardsTop).toBe(56);
  });

  it('tablette : colonne plafonnée, plus de cartes visibles, tuiles du duo toujours égales', () => {
    const wide = publicationTemplateMetrics(1024);
    expect(wide.width).toBe(T.maxContentWidth);
    expect(wide.media.tileWidth).toBeLessThan(m.media.tileWidth * 1.3);
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
