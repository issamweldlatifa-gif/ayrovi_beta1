/**
 * Contraste des couleurs — la garantie devient mesurable.
 *
 * L'audit du 2026-10-01 a mesuré un écart réel : les bordures de champs valaient 1,41:1
 * (`--admin-line` = #D9D9D9 sur blanc) alors que WCAG 1.4.11 demande 3:1 pour identifier un
 * composant. Le défaut ne venait pas d'une couleur « trop claire » mais d'un RÔLE CONFONDU :
 * un seul token servait à la fois de filet décoratif (séparateurs, cartes — où le contraste
 * n'est pas exigé) et de frontière de contrôle (champs, boutons radio — où il l'est).
 *
 * La réparation est un token de rôle, `lineControl`, dérivé de l'identité générée. Ce fichier
 * verrouille les deux moitiés du contrat, pour qu'aucune des deux ne puisse dériver seule :
 *
 *   A. les valeurs de l'identité satisfont les seuils — calculés, pas déclarés ;
 *   B. les feuilles qui dessinent un CONTRÔLE utilisent bien le token de contrôle, et celles
 *      qui dessinent un SÉPARATEUR ne l'utilisent pas (sinon le rôle se re-confond).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
const identity = JSON.parse(read('client/src/design/editorial/identity.json'));

/** Luminance relative WCAG 2.x. */
const luminance = (hex: string): number => {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(value.substr(i, 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (foreground: string, background: string): number => {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

const plain = (value: unknown): string => String(value).toUpperCase();

/** Le corps d'une règle CSS, sur plusieurs lignes : `selector {` … `}`. */
const ruleBody = (sheet: string, selectorLine: string): string => {
  const start = sheet.indexOf(selectorLine);
  if (start < 0) return '';
  const open = sheet.indexOf('{', start);
  const close = sheet.indexOf('}', open);
  return open < 0 || close < 0 ? '' : sheet.slice(open, close);
};

describe('contraste — les valeurs de l\'identité tiennent les seuils', () => {
  const light = identity.colors;
  const dark = identity.darkColors;

  const TEXT_PAIRS: Array<[string, string, string, string]> = [
    ['clair : encre sur toile', light.ink, light.canvas, 'AAA'],
    ['clair : atténué sur toile', light.muted, light.canvas, 'AA'],
    ['clair : atténué sur surface', light.muted, light.surface, 'AA'],
    ['clair : texte d\'accent sur toile', light.accentText, light.canvas, 'AA'],
    ['clair : sur-action sur action', light.onAction, light.action, 'AA'],
    ['clair : succès sur toile', light.success, light.canvas, 'AA'],
    ['clair : danger sur toile', light.danger, light.canvas, 'AA'],
    ['sombre : encre sur toile', dark.ink, dark.canvas, 'AA'],
    ['sombre : atténué sur toile', dark.muted, dark.canvas, 'AA'],
    ['sombre : texte d\'accent sur toile', dark.accentText, dark.canvas, 'AA'],
    ['sombre : succès sur toile', dark.success, dark.canvas, 'AA'],
    ['sombre : danger sur toile', dark.danger, dark.canvas, 'AA'],
  ];

  test.each(TEXT_PAIRS)('%s ≥ 4.5:1', (_label, foreground, background) => {
    expect(contrast(plain(foreground), plain(background))).toBeGreaterThanOrEqual(4.5);
  });

  test('le rôle « ligne » et le rôle « contrôle » sont deux valeurs distinctes, et seule la seconde est mesurée', () => {
    // La distinction est le cœur de la réparation : si les deux valeurs redevenaient égales,
    // c'est que le rôle aurait été re-fusionné et le défaut reviendrait.
    expect(plain(light.lineControl)).not.toBe(plain(light.line));
    expect(plain(dark.lineControl)).not.toBe(plain(dark.line));
    // Et la valeur décorative reste sous le seuil — c'est admis, et c'est même le point :
    // un séparateur n'identifie aucun composant.
    expect(contrast(plain(light.line), '#FFFFFF')).toBeLessThan(3);
  });

  test('la frontière de contrôle atteint 3:1 sur les deux surfaces, dans les deux thèmes (WCAG 1.4.11)', () => {
    const surfaces: Array<[string, string, string]> = [
      ['contrôle clair sur toile', light.lineControl, light.canvas],
      ['contrôle clair sur surface', light.lineControl, light.surface],
      ['contrôle sombre sur toile', dark.lineControl, dark.canvas],
      ['contrôle sombre sur surface', dark.lineControl, dark.surface],
    ];
    for (const [label, line, surface] of surfaces) {
      const ratio = contrast(plain(line), plain(surface));
      expect(ratio, `${label} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  test('l\'accent ne porte pas de texte sur fond clair — le système a un token dédié pour cela', () => {
    // `accent` est un aplat d'identité (2,63:1 sur blanc) : il ne doit jamais servir de couleur
    // de texte sur clair. `accentText` existe exactement pour ce rôle et dépasse 4,5:1.
    expect(contrast(plain(light.accent), '#FFFFFF')).toBeLessThan(3);
    expect(contrast(plain(light.accentText), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contraste — les feuilles respectent le rôle de chaque token', () => {
  const CONTROL_SHEETS: Array<[string, string[]]> = [
    ['client/src/admin/admin.css', ['--admin-line-control']],
    ['client/src/shop/shop.css', ['--s-line-control']],
    ['client/src/ayrovix/components/lens-camera.css', ['--ay-e-line-control']],
  ];

  test.each(CONTROL_SHEETS)('%s : les contrôles utilisent bien le token de contrôle', (file, tokens) => {
    const source = read(file);
    for (const token of tokens) expect(source, `${file} → ${token}`).toContain(`var(${token})`);
  });

  test('aucun contrôle de la console n\'est resté sur le filet décoratif', () => {
    // Les sélecteurs qui dessinent la frontière d'un champ ne doivent plus référencer `--admin-line`.
    // Les cartes et panneaux, eux, la gardent : ce test ne vise que les contrôles nommés.
    const admin = read('client/src/admin/admin.css');
    const controlSelectors = [
      '.admin-field input:not([type=\'checkbox\']), .admin-field textarea, .admin-field select',
      '.admin-cell-input',
      '.arrival-inline-fields input',
      '.admin-switch',
      '.bo-search {',
    ];
    for (const selector of controlSelectors) {
      const body = ruleBody(admin, selector);
      expect(body, selector).toBeTruthy();
      expect(body, selector).toContain('--admin-line-control');
      expect(body, selector).not.toMatch(/border[^;]*var\(--admin-line\)/);
    }
  });

  test('le composant d\'entrée de la bibliothèque atteignait déjà le seuil — il n\'a pas été touché', () => {
    // `.ay-e-input` s'appuie sur `--ay-e-muted` (7:1) depuis l'origine : le défaut ne venait pas
    // de la bibliothèque mais des règles écrites à la main. Le figer évite qu'une « simplification »
    // future ne l'aligne sur la valeur décorative.
    const primitives = read('client/src/design/editorial/primitives.css');
    const body = ruleBody(primitives, '.ay-e-input {');
    expect(body).toContain('var(--ay-e-muted)');
    expect(contrast(plain(identity.colors.muted), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
