/*
 * LIGNE DESCRIPTIVE — un appel PAYANT, donc encadré (25/09/2026).
 *
 * Google Lens ne rend aucune description : la seule façon honnête d'en avoir une
 * est de la demander. Ces tests vérifient que la dépense est bornée, mise en
 * cache, jamais bloquante, et qu'aucun texte n'est posé sur le mauvais produit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enrichCandidateDescriptions, titleOverlap, normalizeTitle } from '../src/ayrovix/services/lensEnrichment';
import type { AyrovixCandidate } from '../src/ayrovix/types';

const candidate = (over: Partial<AyrovixCandidate>): AyrovixCandidate => ({
  id: 'c', kind: 'external', title: 'Champion Sportswear Open Hem Pants', brand: null, model: null,
  colors: [], sizes: [], source: 'Boutique', sourceUrl: 'https://x.tn/p', image: '',
  price: 35.95, currency: 'EUR', priceTnd: null, match: 90, ...over,
} as AyrovixCandidate);

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-enrich-'));
  process.env.AYROVI_LENS_ENRICH_CACHE_DIR = dir;
  process.env.SERPAPI_KEY = 'test-key';
  delete process.env.AYROVI_LENS_ENRICH;
  delete process.env.AYROVI_LENS_ENRICH_BUDGET;
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe('enrichissement — la dépense est bornée', () => {
  it('n’enrichit que les premiers résultats, pas toute la liste', async () => {
    process.env.AYROVI_LENS_ENRICH_BUDGET = '2';
    const fetcher = vi.fn(async (title: string) => ({ title, description: 'Texte marchand' }));
    const list = Array.from({ length: 8 }, (_, index) => candidate({ id: `c${index}` }));
    const out = await enrichCandidateDescriptions(list, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(out.filter((item) => item.description).length).toBe(2);
  });

  it('ne paie jamais pour un résultat qui a DÉJÀ une description', async () => {
    const fetcher = vi.fn(async (title: string) => ({ title, description: 'Texte' }));
    await enrichCandidateDescriptions([candidate({ description: 'Déjà décrit' })], { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('la deuxième recherche du même produit ne repaie pas', async () => {
    const fetcher = vi.fn(async (title: string) => ({ title, description: 'Texte marchand' }));
    await enrichCandidateDescriptions([candidate({})], { fetcher });
    const out = await enrichCandidateDescriptions([candidate({})], { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(out[0].description).toBe('Texte marchand');
  });

  it('se coupe entièrement sans redéploiement', async () => {
    process.env.AYROVI_LENS_ENRICH = 'false';
    const fetcher = vi.fn();
    const out = await enrichCandidateDescriptions([candidate({})], { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(out[0].description).toBeUndefined();
  });
});

describe('enrichissement — la preuve avant le texte', () => {
  it('refuse une description qui parle d’un AUTRE produit', async () => {
    const fetcher = vi.fn(async () => ({ title: 'Cafetière italienne inox 6 tasses', description: 'Café serré' }));
    const out = await enrichCandidateDescriptions([candidate({})], { fetcher });
    expect(out[0].description).toBeUndefined();
  });

  it('accepte une fiche qui décrit bien le même produit', async () => {
    const fetcher = vi.fn(async () => ({
      title: 'Champion Sportswear Open Hem Pants Homme',
      description: 'Molleton coton, coupe droite, bas ouvert',
    }));
    const out = await enrichCandidateDescriptions([candidate({})], { fetcher });
    expect(out[0].description).toBe('Molleton coton, coupe droite, bas ouvert');
  });

  it('le recouvrement ignore casse, accents et ponctuation', () => {
    expect(normalizeTitle('Crème  ÉCLAT, 50ml')).toBe('creme eclat 50ml');
    expect(titleOverlap('Nike Air Max 270', 'nike air max 270 homme')).toBe(1);
    expect(titleOverlap('Nike Air Max 270', 'Cafetière inox')).toBe(0);
  });
});

describe('enrichissement — jamais bloquant', () => {
  it('rend la liste telle quelle si la recherche traîne', async () => {
    process.env.AYROVI_LENS_ENRICH_DEADLINE_MS = '500';
    const fetcher = vi.fn(() => new Promise<never>(() => {}));
    const started = Date.now();
    const out = await enrichCandidateDescriptions([candidate({})], { fetcher });
    expect(Date.now() - started).toBeLessThan(2500);
    expect(out[0].description).toBeUndefined();
    delete process.env.AYROVI_LENS_ENRICH_DEADLINE_MS;
  });

  it('un échec réseau n’est pas mémorisé : la fois suivante réessaie', async () => {
    const failing = vi.fn(async () => { throw new Error('HTTP_500'); });
    await enrichCandidateDescriptions([candidate({})], { fetcher: failing });
    await enrichCandidateDescriptions([candidate({})], { fetcher: failing });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('une absence de résultat est mémorisée : on ne repaie pas pour du vide', async () => {
    const empty = vi.fn(async () => null);
    await enrichCandidateDescriptions([candidate({})], { fetcher: empty });
    await enrichCandidateDescriptions([candidate({})], { fetcher: empty });
    expect(empty).toHaveBeenCalledTimes(1);
  });
});
