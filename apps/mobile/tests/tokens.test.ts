import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLORS, FONTS, GEOMETRY, IDENTITY, TYPE_SCALE } from '../src/design/tokens.generated';

const IDENTITY_PATH = new URL('../../../client/src/design/editorial/identity.json', import.meta.url);
const raw = readFileSync(IDENTITY_PATH, 'utf8');
const identity = JSON.parse(raw);

describe('jetons générés', () => {
  it('proviennent de l’identité produit et sont à jour', () => {
    const sha256 = createHash('sha256').update(raw).digest('hex');
    // Le sha256 scellé dans le fichier généré est la preuve que la palette de
    // l'application est bien celle du site — pas une copie qui a dérivé.
    expect(IDENTITY.sha256).toBe(sha256);
    expect(IDENTITY.version).toBe(identity.version);
  });

  it('portent la palette claire et sombre à l’identique', () => {
    expect(COLORS.light).toEqual(identity.colors);
    expect(COLORS.dark).toEqual(identity.darkColors);
  });

  it('portent la géométrie et l’échelle typographique', () => {
    expect(GEOMETRY).toEqual(identity.geometry);
    expect(TYPE_SCALE).toEqual(identity.type);
  });

  it('nomment les familles réellement embarquées', () => {
    // Ces noms sont les clés passées à expo-font : une faute de frappe ici
    // donne un texte en police système, sans erreur visible.
    const families = Object.values(FONTS).flatMap((set) => [set.regular, set.bold]).sort();
    expect(families).toEqual([
      'NotoSansArabic-Bold', 'NotoSansArabic-Regular',
      'ZalandoSans-Bold', 'ZalandoSans-Regular',
    ].sort());
    for (const family of families) {
      expect(() => readFileSync(new URL(`../assets/fonts/${family}.ttf`, import.meta.url))).not.toThrow();
    }
  });
});
