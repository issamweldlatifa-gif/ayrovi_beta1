/**
 * Z Lens — « تخدم اما سعات تتوقف وتعطي خطا » (11/11/2026) : le repérage
 * serveur (`/localize`) échouait par intermittence.
 *  • Cause n° 1 : il partageait le compteur des recherches (12 / 10 min) —
 *    chaque photo en consommait deux → 429 après ~6 photos.
 *  • Fragilités : réponse du modèle entourée de texte, file pleine refusée
 *    tout de suite, aucune reprise après une erreur passagère.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import express from 'express';

const provider = vi.hoisted(() => ({ isConfigured: vi.fn(), complete: vi.fn() }));
vi.mock('../src/ai-core/core', () => ({ getAyroviAiCore: () => ({ responses: () => provider }) }));

import { extractLocalizationJson, localizeProducts, LocalizationError } from '../src/ayrovix/services/productLocalization';
import { createAyrovixRouter } from '../src/ayrovix/routes';

const bag = { name: 'Sac', category: 'bag', confidence: 0.9, box: [0.4, 0.4, 0.2, 0.25] };
const app = express();
app.use('/api/ayrovix', createAyrovixRouter({} as any, {} as any));
let shade = 0;
const photo = () => sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: shade++ % 255, b: 90 } } }).png().toBuffer();
const ok = () => ({ textBlocks: [JSON.stringify({ products: [bag] })] });

beforeEach(() => {
  vi.clearAllMocks();
  provider.isConfigured.mockReturnValue(true);
  provider.complete.mockResolvedValue(ok());
});

describe('compteur propre au repérage', () => {
  const server = fs.readFileSync(path.resolve(__dirname, '../src/server.ts'), 'utf8');
  it('/localize ne consomme plus le quota des recherches', () => {
    expect(server).not.toMatch(/costlyAyrovixPaths = new Set\(\[[^\]]*'\/localize'/);
    expect(server).toContain("rateLimit('ayrovix-localize'");
    expect(server).toContain("rateLimit('ayrovix-localize-daily'");
    expect(server).toContain("req.path === '/localize'");
    expect(server).toContain('AYROVIX_LOCALIZE_DAILY_LIMIT');
  });
});

describe('réponse du modèle lue avec tolérance', () => {
  it('JSON pur, entre balises ```json, ou entouré de texte', () => {
    expect(extractLocalizationJson('{"products":[]}')).toEqual({ products: [] });
    expect(extractLocalizationJson('```json\n{"products":[]}\n```')).toEqual({ products: [] });
    expect(extractLocalizationJson('Voici les produits : {"products":[1]} — fin.')).toEqual({ products: [1] });
  });
  it('rien de lisible → INVALID_OUTPUT (jamais de cadre deviné)', () => {
    expect(() => extractLocalizationJson('désolé, je ne peux pas')).toThrow(LocalizationError);
    try { extractLocalizationJson('{"products": [tronqué'); } catch (error) {
      expect((error as LocalizationError).reason).toBe('INVALID_OUTPUT');
    }
  });
  it('le service accepte une réponse bavarde', async () => {
    provider.complete.mockResolvedValueOnce({ textBlocks: ['Sure! ', JSON.stringify({ products: [bag] }), ' Hope it helps.'] });
    const products = await localizeProducts(await photo(), 'image/png');
    expect(products.map((p) => p.name)).toEqual(['Sac']);
  });
});

describe('erreur passagère : un seul nouvel essai', () => {
  it('fournisseur surchargé une fois → 2e essai réussi', async () => {
    provider.complete.mockRejectedValueOnce(new Error('overloaded')).mockResolvedValueOnce(ok());
    const products = await localizeProducts(await photo(), 'image/png');
    expect(products).toHaveLength(1);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });
  it('deux échecs → raison claire, pas de 3e appel', async () => {
    provider.complete.mockResolvedValue({ textBlocks: ['pas de JSON'] });
    await expect(localizeProducts(await photo(), 'image/png')).rejects.toMatchObject({ reason: 'INVALID_OUTPUT' });
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });
  it('fournisseur non configuré → NOT_CONFIGURED, sans appel', async () => {
    provider.isConfigured.mockReturnValue(false);
    await expect(localizeProducts(await photo(), 'image/png')).rejects.toMatchObject({ reason: 'NOT_CONFIGURED' });
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe('affluence : on attend une place au lieu de refuser', () => {
  it('8 repérages simultanés aboutissent tous (avant : refus dès le 5e)', async () => {
    provider.complete.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(ok()), 40)));
    const images = await Promise.all(Array.from({ length: 8 }, () => photo()));
    const results = await Promise.all(images.map((image) => localizeProducts(image, 'image/png')));
    expect(results.every((rows) => rows.length === 1)).toBe(true);
  });
});

describe('route : la raison accompagne le 503', () => {
  it('rend `reason` (diagnostic) avec le message client habituel', async () => {
    provider.complete.mockResolvedValue({ textBlocks: ['pas de JSON'] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(app).post('/api/ayrovix/localize').attach('image', await photo(), 'scene.png');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('LOCALIZATION_UNAVAILABLE');
    expect(res.body.reason).toBe('INVALID_OUTPUT');
    expect(warn).toHaveBeenCalledWith('[lens] localize failed: INVALID_OUTPUT');
    warn.mockRestore();
  });
});
