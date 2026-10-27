#!/usr/bin/env node
/**
 * Build du laboratoire AYWEBs — d'un fichier SOURCE à un fichier AUTONOME.
 *
 *     node explorations/aywebs-mockup/build.js
 *
 * Entrée  : explorations/aywebs-mockup/lab.source.html  (chemins relatifs)
 * Sortie  : explorations/AYWEBS_HOME_LAB.html           (fichier unique)
 *
 * Pourquoi ce build existe — deux raisons, toutes deux constatées :
 *
 *   1. **Le fichier doit s'ouvrir SEUL.** Une maquette qu'on envoie à
 *      quelqu'un ne doit dépendre ni d'un serveur, ni de l'arborescence du
 *      dépôt. Photos, wordmark et polices sont encodés en `data:` : un seul
 *      fichier, aucune requête, aucun 404 silencieux.
 *
 *   2. **Elle doit se voir SANS JavaScript.** Les trois téléphones étaient
 *      construits à l'exécution : dans un visualiseur qui n'exécute pas les
 *      scripts, la page apparaissait VIDE. Le rendu initial (FR, avec
 *      dernière visite) est donc imprimé dans le HTML ; le script ne sert
 *      plus qu'à changer de langue et à sélectionner une catégorie.
 *
 * Le wordmark fourni ici est la version PALETTE (PNG-8, 13 Ko) du PNG de
 * l'app : identique à l'œil (RMSE 1,3 %), dix fois plus léger. Les six photos
 * de catégorie, elles, sont embarquées telles quelles — ce sont les fichiers
 * que le build mobile livre, autant juger sur l'original.
 *
 * Les polices sont SOUS-ENSEMBLÉES (latin + arabe) avant encodage : cinq TTF
 * complets pèsent 730 Ko, dont une poignée de glyphes est utilisée.
 * `fontTools` doit être disponible (`pip install fonttools`).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Deux laboratoires, même chaîne :
 *
 *   node build.js                                    → AYWEBS_HOME_LAB.html   (A/B/C/D)
 *   node build.js --source officiel.source.html \
 *                 --out ../AYWEBS_OFFICIEL_LAB.html  → laboratoire « officiel »
 *
 * `--source` est résolu depuis le dossier des maquettes, `--out` depuis la
 * racine du dépôt : les deux laboratoires vivent côte à côte dans
 * `explorations/`, les sources restent regroupées ici.
 */
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const SOURCE = path.resolve(__dirname, argValue('--source', 'lab.source.html'));
const OUTPUT = path.resolve(ROOT, argValue('--out', 'explorations/AYWEBS_HOME_LAB.html'));
const HERE = path.dirname(SOURCE);
const TEMP = path.join(HERE, '.build-tmp');

const PHOTO_DIR = '../../apps/mobile/assets/aywebs/';
const WORDMARK = 'aywebs-wordmark-trim.png';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };

/** Latin de base, latin étendu (accents FR), ponctuation, arabe. */
const UNICODES = 'U+0020-007E,U+00A0-00FF,U+2000-206F,U+0600-06FF,U+FEFF';

const read = (rel) => fs.readFileSync(path.resolve(HERE, rel));
const dataUri = (buffer, mimetype) => `data:${mimetype};base64,${buffer.toString('base64')}`;

function subsetFont(rel) {
  fs.mkdirSync(TEMP, { recursive: true });
  const input = path.resolve(HERE, rel);
  const output = path.join(TEMP, `${path.basename(rel, '.ttf')}.subset.ttf`);
  execFileSync('python3', [
    '-m', 'fontTools.subset', input,
    `--unicodes=${UNICODES}`,
    // Les features OpenType gardent les formes arabes (initiale, médiane, finale).
    '--layout-features=*',
    '--no-hinting',
    '--desubroutinize',
    '--drop-tables+=DSIG',
    `--output-file=${output}`,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return fs.readFileSync(output);
}

/** Photos citées par la maquette (`photo: 'category-x.jpg'`). */
function photoNames(html) {
  return [...new Set([...html.matchAll(/photo:\s*'([A-Za-z0-9._-]+\.jpg)'/g)].map((m) => m[1]))].sort();
}

/** Polices citées par les `@font-face`. */
function fontPaths(html) {
  return [...new Set([...html.matchAll(/url\('(\.\.[^']+\.ttf)'\)/g)].map((m) => m[1]))].sort();
}

/** Rend le script de la maquette dans un DOM factice pour obtenir le HTML initial. */
function staticScreens(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!scripts.length) throw new Error('Aucun script dans la source');
  const code = scripts[scripts.length - 1][1];

  const anchors = [...html.matchAll(/<!--SCREEN:([A-Z0-9]+)-->/g)].map((match) => match[1]);
  if (!anchors.length) throw new Error('Aucune ancre <!--SCREEN:*--> dans la source');
  const nodes = anchors.map((name) => ({ dataset: { screen: name }, innerHTML: '' }));
  const document = {
    documentElement: { dataset: {}, lang: 'fr', dir: 'ltr' },
    querySelectorAll: (selector) => (selector === '.screen' ? nodes : []),
    addEventListener: () => {},
  };
  vm.runInNewContext(code, { document, console, Object, Array, String, Number, Boolean, Math, JSON });

  const filled = nodes.filter((node) => node.innerHTML.trim().length > 0);
  if (filled.length !== nodes.length) {
    throw new Error(`Rendu statique incomplet : ${filled.length}/${nodes.length} écrans`);
  }
  return Object.fromEntries(nodes.map((node) => [node.dataset.screen, node.innerHTML]));
}

function main() {
  let built = fs.readFileSync(SOURCE, 'utf8');
  if (!/<!--SCREEN:[A-Z0-9]+-->/.test(built)) throw new Error('Ancres <!--SCREEN:*--> absentes de la source');
  if (!built.includes('/* @@PHOTOS@@ */')) throw new Error('Marqueur /* @@PHOTOS@@ */ absent de la source');

  let encoded = 0;

  // 1. Photos → une règle CSS par catégorie (une seule copie de chaque
  //    visuel dans le fichier, quel que soit le nombre d'écrans qui l'utilise).
  const cats = [...built.matchAll(/\{ id: '([a-z]+)',[^}]*photo: '([A-Za-z0-9._-]+\.jpg)'/g)];
  const rules = [];
  for (const [, id, name] of cats) {
    const buffer = read(PHOTO_DIR + name);
    encoded += buffer.length;
    rules.push(`.ph-${id}{background-image:url("${dataUri(buffer, MIME['.jpg'])}")}`);
  }
  if (rules.length !== photoNames(built).length) {
    throw new Error(`Catégories photographiées : ${rules.length} règles pour ${photoNames(built).length} fichiers`);
  }
  built = built.replace('/* @@PHOTOS@@ */', rules.join('\n'));

  // 2. Wordmark → data: (remplacement littéral, il sert aussi dans le HTML).
  const wordmarkBuffer = read(WORDMARK);
  encoded += wordmarkBuffer.length;
  built = built.split(WORDMARK).join(dataUri(wordmarkBuffer, MIME['.png']));

  // 3. Polices → sous-ensemble puis data:.
  for (const rel of fontPaths(built)) {
    const buffer = subsetFont(rel);
    encoded += buffer.length;
    built = built.split(rel).join(dataUri(buffer, MIME['.ttf']));
  }

  // 4. Rendu statique AVANT injection : les <img> sortent déjà en data:.
  const screens = staticScreens(built);
  for (const [name, markup] of Object.entries(screens)) {
    built = built.split(`<!--SCREEN:${name}-->`).join(markup);
  }

  // 5. Repli explicite si le script ne tourne pas (visualiseur, impression).
  built = built.replace(
    '<body>',
    `<body>
<noscript><p style="margin:0;padding:10px 22px;background:#FFF4CE;color:#0A0A0A;font:600 12.5px system-ui">
  JavaScript est désactivé : les trois écrans ci-dessous s'affichent quand même (rendu statique).
  Seuls les boutons FR/AR et la sélection de catégorie ont besoin du script.
</p></noscript>`,
  );

  fs.writeFileSync(OUTPUT, built);
  const size = fs.statSync(OUTPUT).size;
  console.log(`✓ ${path.relative(ROOT, OUTPUT)}`);
  console.log(`  ${(size / 1024).toFixed(0)} Ko — ressources encodées ${(encoded / 1024).toFixed(0)} Ko `
    + `(${rules.length} photos, ${fontPaths(built).length || 5} polices sous-ensemblées)`);
  fs.rmSync(TEMP, { recursive: true, force: true });
}

main();
