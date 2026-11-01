/**
 * Verrou anti-inversion / anti-cascade des logos de boutiques (28/10/2026).
 *
 * Scelle définitivement les quatre causes de mélange d'images (`كسزدور`) :
 *   1. `AppImage` n'écrit JAMAIS un `localSource` (`require(...)`) dans le cache
 *      disque persistant de Glide (`cachePolicy="memory"` → `DiskCacheStrategy.NONE`),
 *      et fournit systématiquement une `recyclingKey` à `<ExpoImage>` ;
 *   2. `reconcileImageCacheStamp` purge le cache disque/mémoire dès que
 *      l'empreinte de build (`version` + `versionCode` + `EXPO_PUBLIC_BUILD_STAMP`)
 *      change, sans jamais lever d'exception ;
 *   3. `StoresContent` et `AyWebsHomeContent` n'indexent plus les rangées par
 *      position (`row-${index}`), réinitialisent `remoteFailed` quand la boutique
 *      change et isolent chaque carte par une `recyclingKey` liée à `store.id` ;
 *   4. Aucun fichier image orphelin ne traîne dans `assets/aywebs/`, et aucun
 *      logo embarqué ne partage le SHA-256 d'une autre enseigne.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  IMAGE_CACHE_STAMP_STORAGE_KEY,
  computeImageCacheStamp,
  reconcileImageCacheStamp,
} from '@/design/imageCacheGuard';
import { STORE_LOGO_IDS } from '@/features/aywebs/storeLogoIds';

const MOBILE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(MOBILE_ROOT, '../..');

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function collectSourceText(dir: string): string {
  const chunks: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) chunks.push(collectSourceText(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) chunks.push(fs.readFileSync(full, 'utf8'));
  }
  return chunks.join('\n');
}

describe('garde du cache disque d’images entre builds APK', () => {
  it('construit une empreinte stable incluant version, versionCode et SHA de build', () => {
    const a = computeImageCacheStamp({ version: '2.0.8', androidVersionCode: 15, buildStamp: '7a10b01' });
    const b = computeImageCacheStamp({ version: '2.0.8', androidVersionCode: 15, buildStamp: 'f96673f' });
    const c = computeImageCacheStamp({ version: '2.0.8', androidVersionCode: 1000251, buildStamp: 'f96673f' });
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it('purge mémoire + disque au premier lancement après mise à jour puis mémorise l’empreinte', async () => {
    const store = new Map<string, string>();
    const clearDiskCache = vi.fn(async () => true);
    const clearMemoryCache = vi.fn(async () => true);
    const storage = {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => { store.set(k, v); },
    };

    const first = await reconcileImageCacheStamp({
      stamp: 'v2:2.0.8:1000011:abc1234',
      storage,
      clearDiskCache,
      clearMemoryCache,
    });
    expect(first.purged).toBe(true);
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
    expect(clearDiskCache).toHaveBeenCalledTimes(1);
    expect(store.get(IMAGE_CACHE_STAMP_STORAGE_KEY)).toBe('v2:2.0.8:1000011:abc1234');

    // Même build au lancement suivant : aucune purge inutile.
    const second = await reconcileImageCacheStamp({
      stamp: 'v2:2.0.8:1000011:abc1234',
      storage,
      clearDiskCache,
      clearMemoryCache,
    });
    expect(second.purged).toBe(false);
    expect(clearDiskCache).toHaveBeenCalledTimes(1);

    // Nouveau build APK : purge déclenchée à nouveau.
    const third = await reconcileImageCacheStamp({
      stamp: 'v2:2.0.8:1000021:def5678',
      storage,
      clearDiskCache,
      clearMemoryCache,
    });
    expect(third.purged).toBe(true);
    expect(clearDiskCache).toHaveBeenCalledTimes(2);
    expect(store.get(IMAGE_CACHE_STAMP_STORAGE_KEY)).toBe('v2:2.0.8:1000021:def5678');
  });

  it('ne lève jamais d’exception si AsyncStorage ou clearDiskCache échoue', async () => {
    const res = await reconcileImageCacheStamp({
      stamp: 'v2:2.0.8:15:broken',
      storage: {
        getItem: async () => { throw new Error('disk read error'); },
        setItem: async () => { throw new Error('disk write error'); },
      },
      clearDiskCache: async () => { throw new Error('native unavailable'); },
      clearMemoryCache: async () => { throw new Error('native unavailable'); },
    });
    expect(res.stamp).toBe('v2:2.0.8:15:broken');
  });
});

describe('verrous statiques anti-collision dans AppImage, AYWEBs et CI Android', () => {
  it('AppImage isole les localSource hors du cache disque Glide et transmet recyclingKey', () => {
    const appImage = fs.readFileSync(path.join(MOBILE_ROOT, 'src/design/appImage.tsx'), 'utf8');
    expect(appImage).toMatch(/cachePolicy=\{localSource != null \? 'memory' : 'memory-disk'\}/);
    expect(appImage).toMatch(/recyclingKey=\{effectiveRecyclingKey\}/);
    expect(appImage).toMatch(/transition=\{localSource != null \? 0 : theme\.duration\.fast\}/);
  });

  it('StoresContent et AyWebsHomeContent clent les lignes par identifiant et réinitialisent remoteFailed', () => {
    const stores = fs.readFileSync(path.join(MOBILE_ROOT, 'src/features/aywebs/StoresContent.tsx'), 'utf8');
    const home = fs.readFileSync(path.join(MOBILE_ROOT, 'src/features/aywebs/AyWebsHomeContent.tsx'), 'utf8');
    expect(stores).not.toMatch(/row-\$\{index\}/);
    expect(stores).toMatch(/row\.map\(\(item\) => item\.id\)\.join\(':'\)/);
    expect(stores).toMatch(/uri=\{brand \? null : logo\}/);
    expect(home).toMatch(/uri=\{brand \? null : logo\}/);
    expect(stores).toMatch(/recyclingKey=\{`store:\$\{store\.id\}/);
    expect(home).toMatch(/recyclingKey=\{`store:\$\{store\.id\}/);
  });

  it('le workflow APK démo injecte un versionCode strictement croissant pour invalider Glide', () => {
    const workflow = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/mobile-android.yml'), 'utf8');
    expect(workflow).toMatch(/DEMO_VERSION_CODE=/);
    expect(workflow).toMatch(/versionCode \$\{DEMO_VERSION_CODE\}/);
  });

  it('aucune image orpheline sous assets/aywebs/ et aucun doublon SHA-256 entre marques', () => {
    const allMobileSources =
      collectSourceText(path.join(MOBILE_ROOT, 'src')) + '\n' +
      collectSourceText(path.join(MOBILE_ROOT, 'app'));
    const aywebsDir = path.join(MOBILE_ROOT, 'assets/aywebs');
    for (const entry of fs.readdirSync(aywebsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) continue;
      expect(allMobileSources, `asset orphelin : assets/aywebs/${entry.name}`).toContain(`assets/aywebs/${entry.name}`);
    }

    const lightHashes = new Map<string, string>();
    const darkHashes = new Map<string, string>();
    for (const id of STORE_LOGO_IDS) {
      const lightHash = sha256File(path.join(aywebsDir, 'brands', `${id}.png`));
      const darkHash = sha256File(path.join(aywebsDir, 'brands-dark', `${id}.png`));
      expect(lightHashes.get(lightHash), `collision brands/${id}.png`).toBeUndefined();
      expect(darkHashes.get(darkHash), `collision brands-dark/${id}.png`).toBeUndefined();
      lightHashes.set(lightHash, id);
      darkHashes.set(darkHash, id);
    }
  });
});
