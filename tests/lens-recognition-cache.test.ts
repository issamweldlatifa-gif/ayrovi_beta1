/*
 * CACHE DE RECONNAISSANCE LENS — la moitié « photo » et la moitié « marché »
 * n'ont pas la même durée de vie, et un prix ne sort jamais d'un cache périmé.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lensImageKey, readLensCache, writeLensCache } from '../src/ayrovix/services/lensRecognitionCache';

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-cache-'));
  process.env.AYROVI_LENS_CACHE_DIR = dir;
  delete process.env.AYROVI_LENS_CACHE;
  delete process.env.AYROVI_LENS_RECOGNITION_TTL_MS;
  delete process.env.AYROVI_LENS_MATCHES_TTL_MS;
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const ident = { brand: 'Champion', model: 'Open Hem' };
const matches = [{ id: 'm1', price: 35.95 }];

describe('cache de reconnaissance Lens', () => {
  it('la même image donne la même clé, une autre image une clé différente', () => {
    expect(lensImageKey(Buffer.from('a'))).toBe(lensImageKey(Buffer.from('a')));
    expect(lensImageKey(Buffer.from('a'))).not.toBe(lensImageKey(Buffer.from('b')));
  });

  it('sert les deux moitiés quand elles sont fraîches', () => {
    const key = lensImageKey(Buffer.from('photo'));
    writeLensCache(key, { identification: ident, matches });
    const read = readLensCache<typeof ident, (typeof matches)[number]>(key);
    expect(read.hit).toBe('both');
    expect(read.identification).toEqual(ident);
    expect(read.matches).toEqual(matches);
  });

  it('les PRIX du marché expirent vite, la reconnaissance de la photo reste', () => {
    const key = lensImageKey(Buffer.from('photo'));
    const t0 = 1_000_000;
    writeLensCache(key, { identification: ident, matches }, t0);
    // 45 minutes plus tard : le marché a expiré (30 min), pas la photo (24 h).
    const later = readLensCache<typeof ident, (typeof matches)[number]>(key, t0 + 45 * 60 * 1000);
    expect(later.hit).toBe('identification');
    expect(later.matches).toBeNull();
    expect(later.identification).toEqual(ident);
  });

  it('une liste vide n’est pas mémorisée — un incident passager ne se sert pas 30 minutes', () => {
    const key = lensImageKey(Buffer.from('photo'));
    writeLensCache(key, { identification: ident, matches: [] });
    expect(readLensCache(key).matches).toBeNull();
  });

  it('rafraîchir une moitié n’efface pas l’autre', () => {
    const key = lensImageKey(Buffer.from('photo'));
    const t0 = 2_000_000;
    writeLensCache(key, { identification: ident, matches }, t0);
    writeLensCache(key, { matches: [{ id: 'm2', price: 30 }] }, t0 + 60_000);
    const read = readLensCache<typeof ident, { id: string; price: number }>(key, t0 + 61_000);
    expect(read.identification).toEqual(ident);
    expect(read.matches?.[0].id).toBe('m2');
  });

  it('une entrée corrompue est traitée comme absente, jamais comme une erreur', () => {
    const key = lensImageKey(Buffer.from('photo'));
    writeLensCache(key, { identification: ident, matches });
    for (const file of fs.readdirSync(dir)) fs.writeFileSync(path.join(dir, file), '{ pas du json');
    expect(() => readLensCache(key)).not.toThrow();
    expect(readLensCache(key).hit).toBe('none');
  });

  it('le cache est désactivable en production sans redéploiement', () => {
    const key = lensImageKey(Buffer.from('photo'));
    writeLensCache(key, { identification: ident, matches });
    process.env.AYROVI_LENS_CACHE = 'false';
    expect(readLensCache(key).hit).toBe('none');
  });
});

describe('route Lens — usage du cache et mesure', () => {
  const routes = fs.readFileSync('src/ayrovix/routes.ts', 'utf8');

  it('chaque moteur est mesuré séparément — plus deux fois la même durée', () => {
    expect(routes).not.toContain("mark(trace, 'serpApiTotalMs', Date.now() - tParallel as any)");
    expect(routes).toContain("mark(trace, 'anthropicVisionMs', visionMs as any)");
    expect(routes).toContain("mark(trace, 'serpApiTotalMs', serpMs as any)");
  });

  it('un résultat en cache évite réellement l’appel payant', () => {
    expect(routes).toContain('cached.identification\n          ? Promise.resolve(cached.identification)');
    expect(routes).toContain('cached.matches\n          ? Promise.resolve(cached.matches)');
  });

  it('le prix reste recalculé à chaque requête : il ne sort jamais du cache', () => {
    const block = routes.split("router.post('/analyze-image'")[1].split("router.post('/analyze-url'")[0];
    expect(block).toContain('getCachedPricingRules(db)');
    expect(block).not.toMatch(/writeLensCache\([^)]*priceTnd/);
  });
});
