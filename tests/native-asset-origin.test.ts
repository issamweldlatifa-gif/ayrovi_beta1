import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AY-26 — origine des médias dans la coque native (audit Android 04/10/2026).
 *
 * Le pont `nativeApiOrigin` réécrit `fetch`/`XMLHttpRequest`… et rien d'autre.
 * Or le navigateur résout LUI-MÊME `src`, `srcSet` et `poster` : dans le paquet
 * embarqué (origine `https://localhost`), `/uploads/…` y désigne un fichier de
 * la coque qui n'existe pas. Ce test verrouille les deux faces du correctif :
 *
 *   1. le COMPORTEMENT (coque simulée via Capacitor mocké, web réel) ;
 *   2. la PRÉSENCE du branchement natif dans le code, commentaires exclus —
 *      sinon un retour à l'identité (une fonction qui ne fait « rien ») passerait
 *      les tests de comportement web et ne serait détecté par PERSONNE.
 *      Même leçon que `tests/android-shell` : on vérifie le CODE, pas la prose.
 */

const mocks = vi.hoisted(() => ({ native: false }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native },
  registerPlugin: () => ({ open: async () => ({ opened: false }) }),
}));

import { AYROVI_API_ORIGIN } from '../client/src/services/apiOrigin';
import { nativeAssetUrl } from '../client/src/services/assetOrigin';
import { composedMediaUrl, isComposedUrl, isolatedMediaUrl, proxiedMediaUrl } from '../client/src/ayrovix/services/mediaIsolation';

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const src = (path: string) => stripComments(readFileSync(path, 'utf8'));

const MERCHANT = 'https://cdn.marche.tn/p/1234.jpg';

describe('nativeAssetUrl — comportement, coque native', () => {
  beforeEach(() => { mocks.native = true; });

  it('absolutise les chemins SERVIS PAR LE SERVEUR (/uploads, /api)', () => {
    expect(nativeAssetUrl('/uploads/hero/a.webp')).toBe(`${AYROVI_API_ORIGIN}/uploads/hero/a.webp`);
    expect(nativeAssetUrl('/api/public/media/img?u=https%3A%2F%2Fcdn.marche.tn%2Fi.jpg&w=760'))
      .toBe(`${AYROVI_API_ORIGIN}/api/public/media/img?u=https%3A%2F%2Fcdn.marche.tn%2Fi.jpg&w=760`);
  });

  it('NE TOUCHE PAS aux fichiers du paquet — /media, /assets (aucune route serveur)', () => {
    expect(nativeAssetUrl('/media/hero-default.jpg')).toBe('/media/hero-default.jpg');
    expect(nativeAssetUrl('/media/brands/nike.svg')).toBe('/media/brands/nike.svg');
    expect(nativeAssetUrl('/assets/logo-abc123.svg')).toBe('/assets/logo-abc123.svg');
    expect(nativeAssetUrl('/favicon.ico')).toBe('/favicon.ico');
  });

  it('laisse intacts les URL marchandes absolues, protocol-relative, data: et blob:', () => {
    for (const value of [MERCHANT, '//cdn.marche.tn/p/1.jpg', 'http://cdn.marche.tn/p/1.jpg',
      'data:image/webp;base64,UklGRg==', 'blob:https://localhost/8ab4-4c1']) {
      expect(nativeAssetUrl(value)).toBe(value);
    }
  });

  it('vide / null / undefined → chaîne vide, jamais « undefined » dans le DOM', () => {
    for (const value of ['', '   ', null, undefined]) {
      expect(nativeAssetUrl(value as string | null | undefined)).toBe('');
    }
  });

  it('honore l’origine injectée, barre finale comprise, et retombe sur la production si invalide', () => {
    expect(nativeAssetUrl('/uploads/a.jpg', 'https://preprod.ayrovi.tn/')).toBe('https://preprod.ayrovi.tn/uploads/a.jpg');
    expect(nativeAssetUrl('/uploads/a.jpg', 'file:///etc/passwd')).toBe(`${AYROVI_API_ORIGIN}/uploads/a.jpg`);
  });
});

describe('nativeAssetUrl — ZÉRO régression web (§2)', () => {
  beforeEach(() => { mocks.native = false; });

  it('est l’IDENTITÉ STRICTE hors coque — le web garde son same-origin', () => {
    for (const value of ['/uploads/hero/a.webp', '/api/public/media/img?u=x&w=1', '/media/hero-default.jpg', MERCHANT, '', 'blob:x']) {
      expect(nativeAssetUrl(value)).toBe(value);
    }
  });

  it('n’écrit aucun jeton et ne lit aucun stockage : pure fonction d’URL', () => {
    expect(() => nativeAssetUrl('/uploads/a.jpg')).not.toThrow();
  });
});

describe('mediaIsolation — le point de passage unique est bien branché (AY-26a)', () => {
  it('les trois constructeurs renvoient une URL serveur ABSOLUE en coque, relative sur le web', () => {
    mocks.native = true;
    expect(proxiedMediaUrl(MERCHANT, 760)).toBe(`${AYROVI_API_ORIGIN}/api/public/media/img?u=${encodeURIComponent(MERCHANT)}&w=760`);
    expect(composedMediaUrl(MERCHANT, 900)).toBe(`${AYROVI_API_ORIGIN}/api/public/media/card?u=${encodeURIComponent(MERCHANT)}&w=900`);
    expect(isolatedMediaUrl(MERCHANT)).toBe(`${AYROVI_API_ORIGIN}/api/public/media/isolated?url=${encodeURIComponent(MERCHANT)}`);

    mocks.native = false;
    expect(proxiedMediaUrl(MERCHANT, 760)).toBe(`/api/public/media/img?u=${encodeURIComponent(MERCHANT)}&w=760`);
    expect(composedMediaUrl(MERCHANT, 900)).toBe(`/api/public/media/card?u=${encodeURIComponent(MERCHANT)}&w=900`);
    expect(isolatedMediaUrl(MERCHANT)).toBe(`/api/public/media/isolated?url=${encodeURIComponent(MERCHANT)}`);
  });

  it('une composition reste RECONNUE comme telle une fois absolutisée (sinon cadrage perdu)', () => {
    mocks.native = true;
    expect(isComposedUrl(composedMediaUrl(MERCHANT, 900))).toBe(true);
    expect(isComposedUrl(MERCHANT)).toBe(false);
    expect(isComposedUrl('')).toBe(false);
  });

  it('les chemins locaux ne sont jamais proxyfiés (règle historique préservée)', () => {
    mocks.native = true;
    expect(isolatedMediaUrl('/uploads/local.jpg')).toBeNull();
    expect(proxiedMediaUrl('/media/hero-default.jpg')).toBeNull();
    expect(isolatedMediaUrl('')).toBeNull();
  });
});

/**
 * TESTS NÉGATIFS — si l'on remplace le corps de `nativeAssetUrl` par
 * `return value` (retour à l'identité, donc à la panne), les tests de
 * comportement WEB passent toujours : la régression ne serait visible
 * que sur un appareil. Ces assertions sur le CODE la rendent visible ici.
 */
describe('nativeAssetUrl — invariants de code (test négatif)', () => {
  const assetOrigin = src('client/src/services/assetOrigin.ts');

  it('branche réellement sur la coque native (pas une identité déguisée)', () => {
    expect(assetOrigin).toContain('isNativeApp()');
    expect(assetOrigin).toMatch(/import\s*{[^}]*isNativeApp[^}]*}\s*from\s*'\.\/nativeShell'/);
  });

  it('restreint la réécriture aux préfixes SERVEUR — jamais « tout chemin relatif »', () => {
    // Une règle du type `value.startsWith('/')` réécrirait /media : logo AYROVI
    // et replis hors-ligne cassés dans l'APK (le serveur n'a pas cette route).
    expect(assetOrigin).toMatch(/SERVER_OWNED\s*=\s*\/\^\\\/\(\?:api\|uploads\)/);
    expect(assetOrigin).not.toMatch(/value\.startsWith\('\/'\)/);
  });

  it('préfixe avec une origine NORMALISÉE (jamais une concaténation brute)', () => {
    expect(assetOrigin).toContain('normalizeApiOrigin(origin) || AYROVI_API_ORIGIN');
  });

  it('les écrans qui affichent des médias serveur passent par la fonction (pas de src brut)', () => {
    expect(src('client/src/components/EvergreenHero.tsx')).toContain('src={nativeAssetUrl(visual.imageUrl)}');
    expect(src('client/src/components/EvergreenHero.tsx')).toContain('nativeAssetUrl(entry.url)');
    expect(src('client/src/components/PartnerBrandsSlider.tsx')).toContain('src={nativeAssetUrl(coverImage)}');
    expect(src('client/src/ayrovix/components/LensHistory.tsx')).toContain('src={nativeAssetUrl(item.imageUrl)}');
    expect(src('client/src/components/account/AccountCommerce.tsx')).toContain('src={nativeAssetUrl(item.imageUrl)}');
    const header = src('client/src/design/AppHeader.tsx');
    expect(header).not.toMatch(/src=\{logoUrl\}/);
    expect(header.match(/src=\{nativeAssetUrl\(logoUrl\)\}/g)?.length).toBe(2);
  });

  it('le point de passage mediaIsolation réécrit ses trois sorties', () => {
    const isolation = src('client/src/ayrovix/services/mediaIsolation.ts');
    expect(isolation.match(/nativeAssetUrl\(/g)?.length).toBe(3);
  });
});
