/*
 * GALERIE ET TAILLES (27/09/2026) — le client l'a montré capture à l'appui :
 * quatre photos et un sélecteur de taille chez Zalando, une seule photo et
 * aucune taille chez nous. Google Lens ne rend ni l'un ni l'autre : il faut les
 * demander. Ces tests gardent les quatre garde-fous qui rendent la dépense
 * acceptable — preuve, cache, échéance, et stock jamais supposé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { enrichProduct, readImages, readSizes } from '../src/ayrovix/services/productEnrichment';

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-enrich-'));
  process.env.AYROVI_PRODUCT_ENRICH_CACHE_DIR = dir;
  process.env.SERPAPI_KEY = 'test-key';
  delete process.env.AYROVI_PRODUCT_ENRICH;
  delete process.env.AYROVI_PRODUCT_ENRICH_DEADLINE_MS;
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

const TITLE = 'Tommy Hilfiger ADAN Belt black';
const found = { title: 'Tommy Hilfiger ADAN Belt black homme', productId: 'pid-1' };
const product = {
  description: 'Ceinture en cuir avec boucle métal',
  media: [
    { type: 'image', link: 'https://m.tn/1.jpg' },
    { type: 'image', link: 'https://m.tn/2.jpg' },
    { type: 'video', link: 'https://m.tn/clip.mp4' },
    { type: 'image', link: 'https://m.tn/1.jpg' },
  ],
  variations: {
    Taille: [
      { name: '85', available: true },
      { name: '90', available: false },
      { name: '95' },
    ],
  },
};

describe('lecture de la fiche source', () => {
  it('ne garde que des images, dédoublonnées', () => {
    expect(readImages(product)).toEqual(['https://m.tn/1.jpg', 'https://m.tn/2.jpg']);
  });

  it('un stock non déclaré reste « unknown » — jamais « disponible »', () => {
    expect(readSizes(product)).toEqual([
      { value: '85', label: null, availability: 'available' },
      { value: '90', label: null, availability: 'unavailable' },
      { value: '95', label: null, availability: 'unknown' },
    ]);
  });

  it('lit aussi la forme en tableau de groupes', () => {
    const sizes = readSizes({ variants: [{ title: 'Size', items: [{ name: 'M', available: true }] }] });
    expect(sizes).toEqual([{ value: 'M', label: null, availability: 'available' }]);
  });

  it('la forme héritée n’a aucune disponibilité : tout y est « unknown »', () => {
    expect(readSizes({ sizes: { S: {}, M: {} } })).toEqual([
      { value: 'S', label: null, availability: 'unknown' },
      { value: 'M', label: null, availability: 'unknown' },
    ]);
  });

  it('ignore les groupes qui ne parlent pas de taille', () => {
    expect(readSizes({ variations: { Couleur: [{ name: 'noir', available: true }] } })).toEqual([]);
  });
});

describe('enrichissement d’une fiche', () => {
  const fetchers = () => ({
    findProduct: vi.fn(async () => found),
    loadProduct: vi.fn(async () => product),
  });

  it('rend la galerie, les tailles et la description', async () => {
    const out = await enrichProduct(TITLE, { fetchers: fetchers() });
    expect(out.images).toHaveLength(2);
    expect(out.sizes).toHaveLength(3);
    expect(out.description).toContain('cuir');
  });

  it('refuse une fiche qui décrit un AUTRE produit', async () => {
    const f = { findProduct: vi.fn(async () => ({ title: 'Cafetière inox 6 tasses', productId: 'x' })), loadProduct: vi.fn(async () => product) };
    const out = await enrichProduct(TITLE, { fetchers: f });
    expect(out.images).toEqual([]);
    expect(f.loadProduct).not.toHaveBeenCalled();
  });

  it('la deuxième ouverture ne repaie pas', async () => {
    const f = fetchers();
    await enrichProduct(TITLE, { fetchers: f });
    const out = await enrichProduct(TITLE, { fetchers: f });
    expect(f.findProduct).toHaveBeenCalledTimes(1);
    expect(out.images).toHaveLength(2);
  });

  it('une réponse vide n’est pas mémorisée : on réessaiera', async () => {
    const f = { findProduct: vi.fn(async () => null), loadProduct: vi.fn(async () => null) };
    await enrichProduct(TITLE, { fetchers: f });
    await enrichProduct(TITLE, { fetchers: f });
    expect(f.findProduct).toHaveBeenCalledTimes(2);
  });

  it('ne retarde jamais la fiche : à l’échéance, on rend ce qu’on a', async () => {
    process.env.AYROVI_PRODUCT_ENRICH_DEADLINE_MS = '500';
    const f = { findProduct: vi.fn(() => new Promise<never>(() => {})), loadProduct: vi.fn() };
    const started = Date.now();
    const out = await enrichProduct(TITLE, { fetchers: f as any });
    expect(Date.now() - started).toBeLessThan(2500);
    expect(out.images).toEqual([]);
  });

  it('se coupe sans redéploiement', async () => {
    process.env.AYROVI_PRODUCT_ENRICH = 'false';
    const f = fetchers();
    await enrichProduct(TITLE, { fetchers: f });
    expect(f.findProduct).not.toHaveBeenCalled();
  });

  it('un échec réseau ne casse pas l’ouverture de la fiche', async () => {
    const f = { findProduct: vi.fn(async () => { throw new Error('HTTP_500'); }), loadProduct: vi.fn() };
    await expect(enrichProduct(TITLE, { fetchers: f as any })).resolves.toEqual({ images: [], sizes: [], description: null });
  });
});

describe('câblage sur l’ouverture de la fiche', () => {
  const source = readFileSync('src/ayrovix/services/product.ts', 'utf8');

  it('n’enrichit que la fiche OUVERTE, et seulement si elle est pauvre', () => {
    expect(source).toContain('product.images.length < 4 || product.sizes.length === 0');
    expect(source).toContain('await enrichProduct(product.title)');
  });

  it('COMPLÈTE sans jamais écraser ce que le marchand a publié', () => {
    expect(source).toContain('[...new Set([...product.images, ...extra.images])]');
    expect(source).toContain('if (!product.sizes.length && extra.sizes.length)');
    expect(source).toContain('if (!product.description && extra.description)');
  });

  it('ne recopie aucun prix sur les variantes ajoutées', () => {
    // Le bloc qui construit les variantes ajoutées (le second `extra.sizes.map`).
    const block = source.split('...extra.sizes.map(')[1].split('];')[0];
    expect(block).toContain('price: null');
    expect(block).toContain('priceTnd: null');
    expect(block).toContain('availability: size.availability');
  });
});
