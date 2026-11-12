/**
 * Racine des caches régénérables (audit d'architecture 12/11/2026) : le disque
 * persistant ne doit porter que ce qui ne se recrée pas.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REGENERABLE_CACHES, regenerableCacheDir } from '../src/services/cacheRoot';

describe('regenerableCacheDir', () => {
  it('sans variable : comportement historique, sous data/', () => {
    expect(regenerableCacheDir('media-proxy', {})).toBe(path.resolve(process.cwd(), 'data', 'media-proxy'));
  });
  it('avec AYROVI_CACHE_ROOT : hors du disque persistant', () => {
    expect(regenerableCacheDir('media-isolated', { AYROVI_CACHE_ROOT: '/srv/cache' })).toBe('/srv/cache/media-isolated');
  });
  it('refuse un cache coûteux à reconstruire (reconnaissance Lens = appels IA facturés)', () => {
    expect(() => regenerableCacheDir('lens-recognition' as never, { AYROVI_CACHE_ROOT: '/srv/cache' })).toThrow('CACHE_NOT_REGENERABLE');
    expect(REGENERABLE_CACHES).not.toContain('lens-recognition');
  });
});

it('chaque cache régénérable passe réellement par la racine (aucun chemin data/ codé en dur)', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        const source = fs.readFileSync(full, 'utf8');
        for (const name of REGENERABLE_CACHES) {
          if (source.includes(`'data', '${name}'`) || source.includes(`data/${name}`)) offenders.push(`${path.relative(process.cwd(), full)} → ${name}`);
        }
      }
    }
  };
  walk(path.resolve(process.cwd(), 'src'));
  expect(offenders.filter((line) => !line.startsWith('src/services/cacheRoot.ts'))).toEqual([]);
});

it('render.yaml envoie les caches hors du point de montage persistant', () => {
  const blueprint = fs.readFileSync(path.resolve(process.cwd(), 'render.yaml'), 'utf8');
  const mount = /mountPath:\s*(\S+)/.exec(blueprint)?.[1];
  const root = /key: AYROVI_CACHE_ROOT\s+value:\s*(\S+)/.exec(blueprint)?.[1];
  expect(mount).toBeTruthy();
  expect(root).toBeTruthy();
  expect(root!.startsWith(`${mount}/`) || root === mount).toBe(false);
});
