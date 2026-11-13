/**
 * Page Publication refondue (13/11/2026) — lecture des blocs du CRM, cotes
 * relevées sur les planches Zalando, couleurs dérivées du fond choisi au CRM.
 */
import { describe, expect, it } from 'vitest';
import { parsePublicationBlock, parsePublicationBlocks } from '../src/api/publicationBlocks';
import { blockInks, hasTintedBackground } from '../src/features/publications/templates/blockColors';
import {
  pairTileMetrics,
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

  it('13/11 : chaque ligne de la carte a son propre niveau de texte', () => {
    const levels = ['bandTitleSize', 'cardPriceSize', 'cardBrandSize', 'cardNameSize', 'captionSize'].map(token);
    // Titre > prix > marque > nom > « Sponsorisé » : strictement décroissant, aucun doublon.
    for (let i = 1; i < levels.length; i += 1) expect(levels[i]).toBeLessThan(levels[i - 1] as number);
    // Pilule « + Suivre » : cible tactile ≥ 48 dp (planche : 95 px).
    expect(token('followHeight')).toBeGreaterThanOrEqual(token('touch'));
  });

  const m = publicationTemplateMetrics(360);

  it('modèle media : retrait 12, photo ≈ 2:1, vidéo carrée, ~3 photos produit visibles', () => {
    expect(m.media.width).toBe(336);
    expect(m.media.imageHeight).toBe(Math.round(336 / T.imageAspect));
    expect(Math.abs(m.media.imageHeight - 162)).toBeLessThanOrEqual(1); // 323 px relevés
    expect(m.media.videoHeight).toBe(336);
    expect(m.media.tileWidth).toBeGreaterThan(98);
    expect(m.media.tileWidth).toBeLessThan(106); // 102 dp relevés
    expect(Math.abs(m.media.tileHeight - 148)).toBeLessThanOrEqual(3);
  });

  it('modèle container : deux cartes entières + une amorce, photo 1,45', () => {
    expect(m.container.cardWidth).toBeGreaterThan(140);
    expect(m.container.cardWidth).toBeLessThan(156); // 151 dp relevés
    expect(m.container.cardImageHeight).toBe(Math.round(m.container.cardWidth * 1.45));
    const twoCards = T.bandInset + m.container.cardWidth * 2 + T.cardSpacing * 2;
    expect(twoCards).toBeLessThan(360); // l'amorce de la 3e carte reste visible
  });

  it('modèle sponsored_pair : deux tuiles de MÊME taille, 160 dp chacune', () => {
    expect(m.pair.tileWidth).toBe(160);
    const tile = pairTileMetrics(m.pair.tileWidth);
    expect(tile.cardWidth).toBe(160);
    expect(tile.height).toBe(tile.mediaHeight + tile.textHeight);
    expect(T.pairInset * 2 + tile.cardWidth * 2 + T.pairSpacing).toBe(360);
  });

  it('tablette : colonne plafonnée, plus de cartes visibles, tuiles du duo toujours égales', () => {
    const wide = publicationTemplateMetrics(1024);
    expect(wide.width).toBe(T.maxContentWidth);
    expect(wide.media.tileWidth).toBeLessThan(m.media.tileWidth * 1.3);
    expect(pairTileMetrics(wide.pair.tileWidth).columns).toBe(2);
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
