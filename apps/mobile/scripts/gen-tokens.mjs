/**
 * Génère src/design/tokens.generated.ts depuis LA source d'identité du produit :
 * client/src/design/editorial/identity.json (le même fichier qui produit le CSS
 * du site). Une identité, deux rendus — jamais deux palettes à garder en phase.
 *
 *   npm run tokens:build    écrit le fichier
 *   npm run tokens:check    échoue si le fichier n'est plus à jour (CI)
 *
 * Ce script LIT le fichier du site au moment du build ; l'application ne
 * l'importe jamais à l'exécution (règle de frontière, PLAN.md §9.2).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const IDENTITY_PATH = new URL('../../../client/src/design/editorial/identity.json', import.meta.url);
const OUTPUT_PATH = new URL('../src/design/tokens.generated.ts', import.meta.url);
const RELATIVE_SOURCE = 'client/src/design/editorial/identity.json';

const raw = fs.readFileSync(IDENTITY_PATH, 'utf8');
const identity = JSON.parse(raw);
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');

/** Sérialise une valeur en littéral TypeScript stable (clés triées). */
const literal = (value, indent = 0) => {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (Array.isArray(value)) {
    return `[${value.map((v) => literal(v, indent)).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value).sort().map((key) => {
      const keyLiteral = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
      return `${padIn}${keyLiteral}: ${literal(value[key], indent + 1)},`;
    });
    return `{\n${entries.join('\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
};

const block = (name, value, comment) =>
  `${comment ? `/** ${comment} */\n` : ''}export const ${name} = ${literal(value, 0)} as const;\n`;

const file = `/**
 * GÉNÉRÉ — ne pas modifier à la main.
 *
 * Source unique : ${RELATIVE_SOURCE}
 * Identité : ${identity.name} · version ${identity.version}
 * sha256 : ${sha256}
 *
 * Régénérer : npm run tokens:build   ·   vérifier : npm run tokens:check
 */
${block('IDENTITY', { version: identity.version, name: identity.name, source: RELATIVE_SOURCE, sha256 }, 'Provenance de ces jetons.')}
${block('COLORS', { light: identity.colors, dark: identity.darkColors }, 'Palette, mode clair et mode sombre.')}
${block('SPACE', identity.space, 'Échelle d’espacement (px).')}
${block('TYPE_SCALE', identity.type, 'Échelle typographique (px).')}
${block('MOTION', identity.motion, 'Durées d’animation (ms).')}
${block('GEOMETRY', identity.geometry, 'Rayons, cibles tactiles, grille d’icônes.')}
${block('TYPOGRAPHY', identity.typography, 'Graisses et interlignes ; `stack` est la pile CSS du site, non utilisable en React Native.')}
${block('FONTS', {
  latin: { regular: 'ZalandoSans-Regular', bold: 'ZalandoSans-Bold' },
  arabic: { regular: 'NotoSansArabic-Regular', bold: 'NotoSansArabic-Bold' },
}, 'Noms de familles telles que chargées par expo-font (fichiers .ttf embarqués).')}

export type ColorName = keyof typeof COLORS.light;
export type ColorSchemeName = keyof typeof COLORS;
export type FontSet = typeof FONTS.latin | typeof FONTS.arabic;
`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : null;
  if (current !== file) {
    console.error(
      'tokens.generated.ts est périmé.\n'
      + `  source : ${RELATIVE_SOURCE} (sha256 ${sha256.slice(0, 12)}…)\n`
      + '  corriger : npm run tokens:build',
    );
    process.exit(1);
  }
  console.log(`Jetons de conception à jour (identité ${identity.version}).`);
} else {
  fs.writeFileSync(OUTPUT_PATH, file);
  console.log(`src/design/tokens.generated.ts écrit depuis l'identité ${identity.version}.`);
}
