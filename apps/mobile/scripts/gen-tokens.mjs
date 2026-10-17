/**
 * Génère src/design/tokens.generated.ts depuis DEUX sources, chacune pour ce
 * qu'elle possède (décision produit du 15/10/2026 — nouvelle identité couleur
 * de l'application) :
 *
 *   • COULEURS  → apps/mobile/src/design/brand.json
 *                 Identité couleur officielle de l'APPLICATION : noir #0A0A0A,
 *                 blanc #FFFFFF, violet électrique #571EF6 (+ violet clair
 *                 #C5B2F4 depuis la v4.2.0), gris clair #F2F2F2. Le site applique
 *                 la même palette via identity.json ; les tests imposent l'accord.
 *   • STRUCTURE → client/src/design/editorial/identity.json
 *                 Espacements, échelle typographique, durées, géométrie et
 *                 graisses, partagés avec le site (aucune raison de diverger).
 *
 *   npm run tokens:build    écrit le fichier
 *   npm run tokens:check    échoue si le fichier n'est plus à jour (CI)
 *
 * Ce script LIT ces fichiers au moment du build ; l'application ne les importe
 * jamais à l'exécution (règle de frontière, PLAN.md §9.2).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const IDENTITY_PATH = new URL('../../../client/src/design/editorial/identity.json', import.meta.url);
const BRAND_PATH = new URL('../src/design/brand.json', import.meta.url);
const OUTPUT_PATH = new URL('../src/design/tokens.generated.ts', import.meta.url);
const RELATIVE_SOURCE = 'client/src/design/editorial/identity.json';
const BRAND_SOURCE = 'apps/mobile/src/design/brand.json';

const raw = fs.readFileSync(IDENTITY_PATH, 'utf8');
const identity = JSON.parse(raw);
const sha256 = crypto.createHash('sha256').update(raw).digest('hex');

const brandRaw = fs.readFileSync(BRAND_PATH, 'utf8');
const brand = JSON.parse(brandRaw);
const brandSha256 = crypto.createHash('sha256').update(brandRaw).digest('hex');

/**
 * Garde-fous : une palette incohérente doit casser la génération, pas
 * l'application sur un téléphone. Les deux modes portent EXACTEMENT les mêmes
 * clés (le type `ColorName` en dépend) et chaque valeur est un hexadécimal.
 */
const HEX = /^#[0-9A-F]{6}$/;
const problems = [];
for (const group of ['brand', 'neutrals', 'colors', 'darkColors']) {
  for (const [key, value] of Object.entries(brand[group] ?? {})) {
    if (!HEX.test(String(value))) problems.push(`${group}.${key} = ${value} (attendu : #RRGGBB en majuscules)`);
  }
}
const lightKeys = Object.keys(brand.colors ?? {}).sort().join(',');
const darkKeys = Object.keys(brand.darkColors ?? {}).sort().join(',');
if (!lightKeys || lightKeys !== darkKeys) problems.push('colors et darkColors doivent avoir les mêmes clés');
if (problems.length) {
  console.error(`Palette invalide (${BRAND_SOURCE}) :\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

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
 * Couleurs   : ${BRAND_SOURCE}
 *              ${brand.name} · version ${brand.version}
 *              sha256 : ${brandSha256}
 * Structure  : ${RELATIVE_SOURCE}
 *              ${identity.name} · version ${identity.version}
 *              sha256 : ${sha256}
 *
 * Régénérer : npm run tokens:build   ·   vérifier : npm run tokens:check
 */
${block('IDENTITY', {
  name: brand.name,
  version: brand.version,
  source: BRAND_SOURCE,
  sha256: brandSha256,
  structure: { name: identity.name, version: identity.version, source: RELATIVE_SOURCE, sha256 },
}, 'Provenance de ces jetons (couleurs de l’application + structure partagée avec le site).')}
${block('BRAND', brand.brand, 'Les quatre couleurs officielles de la marque — la seule source des valeurs dérivées.')}
${block('BRAND_SHARE', brand.share, 'Part visuelle visée par couleur (objectif d’ensemble, pas une contrainte par écran).')}
${block('NEUTRALS', brand.neutrals, 'Gris d’appui : bordure légère, texte secondaire, texte appuyé, contour de champ.')}
${block('COLORS', { light: brand.colors, dark: brand.darkColors }, 'Palette sémantique, mode clair et mode sombre.')}
${block('SPACE', identity.space, 'Échelle d’espacement (px).')}
${block('TYPE_SCALE', identity.type, 'Échelle typographique (px).')}
${block('MOTION', identity.motion, 'Durées d’animation (ms).')}
${block('GEOMETRY', identity.geometry, 'Rayons, cibles tactiles, grille d’icônes.')}
${block('TYPOGRAPHY', identity.typography, 'Graisses et interlignes ; `stack` est la pile CSS du site, non utilisable en React Native.')}
${block('FONTS', {
  // semibold = titres (plus légers que le gras). L'arabe n'a pas encore de graisse
  // intermédiaire embarquée : ses titres gardent la graisse grasse.
  latin: { regular: 'ZalandoSans-Regular', semibold: 'ZalandoSans-SemiBold', bold: 'ZalandoSans-Bold' },
  arabic: { regular: 'NotoSansArabic-Regular', semibold: 'NotoSansArabic-Bold', bold: 'NotoSansArabic-Bold' },
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
      + `  couleurs  : ${BRAND_SOURCE} (sha256 ${brandSha256.slice(0, 12)}…)\n`
      + `  structure : ${RELATIVE_SOURCE} (sha256 ${sha256.slice(0, 12)}…)\n`
      + '  corriger : npm run tokens:build',
    );
    process.exit(1);
  }
  console.log(`Jetons de conception à jour (couleurs ${brand.version} · structure ${identity.version}).`);
} else {
  fs.writeFileSync(OUTPUT_PATH, file);
  console.log(`src/design/tokens.generated.ts écrit (couleurs ${brand.version} · structure ${identity.version}).`);
}
