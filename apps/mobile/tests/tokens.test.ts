import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BRAND, BRAND_SHARE, COLORS, FONTS, GEOMETRY, IDENTITY, NEUTRALS, TYPE_SCALE,
} from '../src/design/tokens.generated';

/** Structure (espaces, typo, géométrie) : partagée avec le site. */
const IDENTITY_PATH = new URL('../../../client/src/design/editorial/identity.json', import.meta.url);
const raw = readFileSync(IDENTITY_PATH, 'utf8');
const identity = JSON.parse(raw);

/** Couleurs : identité couleur officielle de l'application (15/10/2026). */
const BRAND_PATH = new URL('../src/design/brand.json', import.meta.url);
const brandRaw = readFileSync(BRAND_PATH, 'utf8');
const brand = JSON.parse(brandRaw);

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

describe('jetons générés', () => {
  it('proviennent des deux sources déclarées et sont à jour', () => {
    // Les sha256 scellés dans le fichier généré prouvent que les jetons de
    // l'application sont bien ceux des sources — pas une copie qui a dérivé.
    expect(IDENTITY.sha256).toBe(sha(brandRaw));
    expect(IDENTITY.version).toBe(brand.version);
    expect(IDENTITY.source).toBe('apps/mobile/src/design/brand.json');
    expect(IDENTITY.structure.sha256).toBe(sha(raw));
    expect(IDENTITY.structure.version).toBe(identity.version);
  });

  it('portent la palette claire et sombre de l’application à l’identique', () => {
    expect(COLORS.light).toEqual(brand.colors);
    expect(COLORS.dark).toEqual(brand.darkColors);
    expect(BRAND).toEqual(brand.brand);
    expect(BRAND_SHARE).toEqual(brand.share);
    expect(NEUTRALS).toEqual(brand.neutrals);
  });

  it('partagent la palette officielle du site (même violet, même violet clair)', () => {
    // Depuis le 15/10/2026 le site applique la même palette officielle que l'application ;
    // les deux sources restent distinctes (brand.json / identity.json) mais doivent concorder.
    for (const role of ['accent', 'action', 'onAction', 'accentSoft', 'onAccentSoft', 'canvas', 'ink', 'surface'] as const) {
      expect(COLORS.light[role], role).toBe(identity.colors[role]);
    }
    expect(COLORS.dark.accentSoft).toBe(identity.darkColors.accentSoft);
  });

  it('portent la géométrie et l’échelle typographique', () => {
    expect(GEOMETRY).toEqual(identity.geometry);
    expect(TYPE_SCALE).toEqual(identity.type);
  });

  it('nomment les familles réellement embarquées', () => {
    // Ces noms sont les clés passées à expo-font : une faute de frappe ici
    // donne un texte en police système, sans erreur visible.
    const families = [...new Set(Object.values(FONTS).flatMap((set) => [set.regular, set.semibold, set.bold]))].sort();
    expect(families).toEqual([
      'NotoSansArabic-Bold', 'NotoSansArabic-Regular',
      'ZalandoSans-Bold', 'ZalandoSans-Regular', 'ZalandoSans-SemiBold',
    ].sort());
    for (const family of families) {
      expect(() => readFileSync(new URL(`../assets/fonts/${family}.ttf`, import.meta.url))).not.toThrow();
    }
  });
});
