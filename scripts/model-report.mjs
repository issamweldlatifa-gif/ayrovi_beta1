#!/usr/bin/env node
/**
 * « Voir » un modèle sans yeux — rapport MESURÉ d'une image.
 *
 * ── Le problème que ça résout ──────────────────────────────────────────────
 * L'environnement n'a PAS de vision : une image, même présente sur le disque,
 * n'est pas lisible. Les fichiers joints n'atteignent pas non plus l'espace de
 * travail. Ce script ne prétend donc pas « regarder » l'image : il la MESURE et
 * en sort un RAPPORT TEXTUEL — dimensions, couleurs, découpage en bandes,
 * position et nombre des éléments, carte de luminance. C'est ce rapport qui est
 * lu, et il ne contient que des chiffres sortis de l'image.
 *
 * ── Faire venir les images ─────────────────────────────────────────────────
 * Les pièces jointes n'arrivent pas ici. En revanche `git` atteint GitHub :
 * déposer les images dans un dossier `models/` sur une branche, puis
 *   node scripts/model-report.mjs --branch models
 * le script va les chercher (fetch + extraction) et les analyse.
 *
 * ── Lecture ─────────────────────────────────────────────────────────────────
 * Chaque section du rapport est un relevé. `variance` distingue une bande PLATE
 * (interface : barre, bouton, fond uni) d'une bande PHOTOGRAPHIQUE (image,
 * visuel) — c'est ce qui permet de savoir où sont les visuels. Les « amas »
 * comptent les éléments d'une bande et donnent leur position en %.
 *
 * Usage :
 *   node scripts/model-report.mjs chemin/vers/modele.png [autre.png …]
 *   node scripts/model-report.mjs --branch models        (récupère puis analyse)
 *   node scripts/model-report.mjs --branch models --dir modeles
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const CACHE = '.models';

/* ── ImageMagick ──────────────────────────────────────────────────────────── */

function im(args) {
  try {
    return execFileSync('convert', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`ImageMagick a échoué : ${String(error?.stderr || error?.message).slice(0, 200)}`);
  }
}
function identify(args) {
  return execFileSync('identify', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

function dimensions(file) {
  const out = identify(['-format', '%w %h', file]).trim();
  const [w, h] = out.split(/\s+/).map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error(`Dimensions illisibles pour ${file} (« ${out} »)`);
  return { w, h };
}

/** Couleurs dominantes : quantifiées puis comptées, avec leur part réelle. */
function palette(file, count = 8) {
  const out = im([file, '-resize', '400x400', '-colors', String(count), '-format', '%c', 'histogram:info:-']);
  const rows = out.split('\n').map((line) => line.trim()).filter(Boolean);
  const parsed = rows.map((line) => {
    const m = line.match(/^\s*(\d+):\s*\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*\)\s*(#[0-9A-Fa-f]{6})/);
    return m ? { count: Number(m[1]), hex: m[2].toUpperCase() } : null;
  }).filter(Boolean);
  const total = parsed.reduce((sum, p) => sum + p.count, 0) || 1;
  return parsed
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ hex: p.hex, share: p.count / total }));
}

/** Profil de luminance ligne par ligne : la colonne vertébrale du découpage. */
function rowProfile(file, height) {
  const out = im([file, '-colorspace', 'Gray', '-resize', `1x${height}!`, 'txt:-']);
  const values = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*\d+,\d+:\s*\(\s*(\d+)/);
    if (m) values.push(Number(m[1]));
  }
  return values;
}

/** Carte de luminance en texte : la seule façon de « voir » la mise en page. */
function asciiMap(file, cols = 64, rows = 40) {
  const out = im([
    file, '-colorspace', 'Gray', '-resize', `${cols}x${rows}!`, '-depth', '8', 'txt:-',
  ]);
  const pixels = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+),(\d+):\s*\(\s*(\d+)/);
    if (m) pixels.push({ x: Number(m[1]), y: Number(m[2]), v: Number(m[3]) });
  }
  const ramp = '@%#*+=-:. '; // du plus sombre au plus clair
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(' '));
  for (const p of pixels) {
    if (p.y < rows && p.x < cols) {
      const idx = Math.min(ramp.length - 1, Math.floor((p.v / 256) * ramp.length));
      grid[p.y][p.x] = ramp[idx];
    }
  }
  return grid.map((row) => row.join('')).join('\n');
}

/** Écart-type : une bande plate (interface) a une faible variance. */
function deviation(file, box) {
  const args = [file];
  if (box) args.push('-crop', `${box.w}x${box.h}+${box.x}+${box.y}`, '+repage');
  args.push('-colorspace', 'Gray', '-format', '%[fx:standard_deviation]', 'info:-');
  const raw = im(args).trim().split(/[\s,]+/)[0];
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Couleur dominante d'une zone, en 6 chiffres hexadécimaux.
 * On force `-depth 8` : sur un PNG 16 bits, lire le pixel brut rendait
 * « 101011111212 » (12 chiffres) — un rapport faux, donc pire qu'absent.
 */
function dominantColor(file, box) {
  const args = [file];
  if (box) args.push('-crop', `${box.w}x${box.h}+${box.x}+${box.y}`, '+repage');
  args.push('-depth', '8', '-resize', '40x40', '-colors', '1', '-format', '%c', 'histogram:info:-');
  const out = im(args);
  const m = out.match(/(#[0-9A-Fa-f]{6})/);
  return m ? m[1].toUpperCase() : '?';
}

/**
 * Amas horizontaux d'une bande : combien d'éléments, et où.
 * On réduit la bande à 200 px de large, on seuille, puis on regroupe les
 * colonnes qui portent de l'« encre ».
 */
function clusters(file, box) {
  const W = 200;
  const out = im([
    file,
    '-crop', `${box.w}x${box.h}+${box.x}+${box.y}`, '+repage',
    '-colorspace', 'Gray',
    '-resize', `${W}x1!`,
    '-threshold', '70%',
    'txt:-',
  ]);
  const ink = new Array(W).fill(false);
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+),\d+:\s*\(\s*(\d+)/);
    if (m && Number(m[2]) < 128) ink[Number(m[1])] = true;
  }
  const groups = [];
  let start = -1;
  for (let i = 0; i <= W; i += 1) {
    if (ink[i] && start < 0) start = i;
    if (!ink[i] && start >= 0) {
      groups.push([start, i - 1]);
      start = -1;
    }
  }
  return groups.map(([a, b]) => ({
    from: Math.round((a / W) * 100),
    to: Math.round((b / W) * 100),
    width: Math.round(((b - a + 1) / W) * 100),
  }));
}

/* ── Découpage en bandes ──────────────────────────────────────────────────── */

/**
 * Découpage en bandes.
 *
 * Pourquoi lisser d'abord : un DÉGRADÉ fait varier chaque ligne d'un poil, et
 * un seuil ligne à ligne le hachait en dizaines de tranches de 48 px — on
 * croyait voir dix sections là où il y en avait une. En comparant des MOYENNES
 * glissantes, la pente douce d'un dégradé passe sous le seuil, tandis qu'une
 * vraie rupture (barre sombre → visuel clair) reste franche.
 */
function smooth(values, window) {
  const half = Math.max(1, Math.floor(window / 2));
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = i - half; k <= i + half; k += 1) {
      if (k >= 0 && k < values.length) { sum += values[k]; n += 1; }
    }
    return n ? sum / n : values[i];
  });
}

function bands(file, height, sensitivity = 12) {
  const raw = rowProfile(file, height);
  if (raw.length < 4) return [];
  const profile = smooth(raw, Math.max(3, Math.round(height * 0.02)));
  const cuts = [0];
  for (let i = 1; i < profile.length; i += 1) {
    if (Math.abs(profile[i] - profile[i - 1]) >= sensitivity) cuts.push(i);
  }
  cuts.push(profile.length - 1);

  // Fusionner les bandes trop fines : moins de 2 % de hauteur, ce n'est pas une
  // section, c'est un liseré (bordure, séparateur, ombre).
  const minHeight = Math.max(2, Math.round(profile.length * 0.02));
  const merged = [];
  for (const cut of cuts) {
    if (merged.length && cut - merged[merged.length - 1] < minHeight) continue;
    merged.push(cut);
  }
  if (merged[merged.length - 1] !== profile.length - 1) merged.push(profile.length - 1);

  const out = [];
  for (let i = 0; i < merged.length - 1; i += 1) {
    const y0 = merged[i];
    const y1 = merged[i + 1];
    if (y1 - y0 < minHeight) continue;
    out.push({ y0, y1, height: y1 - y0 });
  }
  return out;
}

/* ── Rapport ──────────────────────────────────────────────────────────────── */

function report(file) {
  const { w, h } = dimensions(file);
  const lines = [];
  lines.push(`\n${'═'.repeat(72)}`);
  lines.push(`MODÈLE : ${basename(file)}`);
  lines.push('═'.repeat(72));
  lines.push(`Dimensions : ${w} × ${h} px  (ratio ${(w / h).toFixed(2)})`);
  const ratio = w / h;
  if (ratio < 0.75) lines.push(`Allure     : PORTRAIT — capture d'écran de téléphone (${(1 / ratio).toFixed(2)}:1)`);
  else if (ratio > 1.6) lines.push('Allure     : PAYSAGE — bannière, maquette large');
  else lines.push('Allure     : carré / intermédiaire');

  lines.push('\n── COULEURS DOMINANTES ──');
  for (const c of palette(file)) {
    const bar = '█'.repeat(Math.max(1, Math.round(c.share * 28)));
    lines.push(`  ${c.hex}  ${(c.share * 100).toFixed(1).padStart(5)}%  ${bar}`);
  }

  lines.push('\n── CARTE (luminance ; @ = sombre, espace = clair) ──');
  lines.push(asciiMap(file));

  lines.push('\n── STRUCTURE VERTICALE (bandes) ──');
  lines.push('   #   de      à       haut.    part   écart-type  couleur     lecture');
  const list = bands(file, h);
  const detailed = [];
  list.forEach((band, index) => {
    const box = { x: 0, y: band.y0, w, h: band.height };
    const sd = deviation(file, box);
    const color = dominantColor(file, box);
    const kind = sd < 0.04 ? 'PLAT (interface)' : sd < 0.14 ? 'mixte' : 'VISUEL (photo/graphisme)';
    const share = band.height / h;
    lines.push(
      `  ${String(index + 1).padStart(2)}  ${String(band.y0).padStart(5)}  ${String(band.y1).padStart(5)}  `
      + `${String(band.height).padStart(6)}  ${(share * 100).toFixed(1).padStart(5)}%  `
      + `${sd.toFixed(3).padStart(9)}  ${color.padEnd(9)}  ${kind}`,
    );
    detailed.push({ index: index + 1, band, sd, color, kind });
  });

  lines.push('\n── ÉLÉMENTS PAR BANDE (amas horizontaux, position en % de la largeur) ──');
  for (const d of detailed) {
    const box = { x: 0, y: d.band.y0, w, h: d.band.height };
    const groups = clusters(file, box);
    if (!groups.length) {
      lines.push(`  bande ${String(d.index).padStart(2)} : aucun élément détecté (bande uniforme)`);
      continue;
    }
    const desc = groups.map((g) => `${g.from}→${g.to}%`).join('  ');
    lines.push(`  bande ${String(d.index).padStart(2)} : ${groups.length} amas — ${desc}`);
  }

  lines.push('\n⚠️ Limite connue : le découpage en bandes FRAGMENTE les dégradés (un dégradé
varie à chaque ligne, même après lissage). Les sections plates, elles, sont
trouvées au pixel près. Lire la CARTE et les COULEURS en priorité ; ne pas
prendre le nombre de bandes pour le nombre de sections.

Rappel : ce rapport est MESURÉ, pas interprété. Les libellés, le texte et le');
  lines.push('sens des icônes ne sont PAS lisibles ici — ils viennent du descriptif écrit.');
  lines.push('');
  return lines.join('\n');
}

/* ── Récupération depuis une branche ──────────────────────────────────────── */

function fetchFromBranch(branch, dir) {
  execFileSync('git', ['fetch', 'origin', branch, '--depth=1'], { encoding: 'utf8' });
  const listing = execFileSync('git', ['ls-tree', '-r', '--name-only', `origin/${branch}`], { encoding: 'utf8' });
  const wanted = listing.split('\n').filter((p) => p.startsWith(`${dir}/`) && IMAGE_EXT.has(extname(p).toLowerCase()));
  if (!wanted.length) {
    throw new Error(`Aucune image dans « ${dir}/ » sur la branche « ${branch} ».`);
  }
  mkdirSync(CACHE, { recursive: true });
  const local = [];
  for (const path of wanted) {
    const target = join(CACHE, basename(path));
    writeFileSync(target, execFileSync('git', ['show', `origin/${branch}:${path}`], { maxBuffer: 256 * 1024 * 1024 }));
    local.push(target);
    process.stdout.write(`  ↳ récupéré ${basename(path)}\n`);
  }
  return local;
}

/* ── Point d'entrée ───────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
if (!args.length || args[0] === '--help') {
  process.stdout.write(`
model-report.mjs — rapport MESURÉ d'une image de modèle (pas de vision : on chiffre)

  node scripts/model-report.mjs <image> [image…]        analyse des fichiers locaux
  node scripts/model-report.mjs --branch models         va les chercher sur GitHub
  node scripts/model-report.mjs --branch models --dir modeles

Les pièces jointes n'arrivent pas dans cet environnement et l'image n'y est pas
« visible ». Le script la MESURE et sort un rapport : dimensions, couleurs,
découpage en bandes, nombre et position des éléments, carte de luminance.
`);
  process.exit(0);
}

let files = [];
const branchIndex = args.indexOf('--branch');
const dirIndex = args.indexOf('--dir');

if (branchIndex >= 0) {
  const branch = args[branchIndex + 1];
  const dir = dirIndex >= 0 ? args[dirIndex + 1] : 'models';
  if (!branch || branch.startsWith('--')) {
    process.stderr.write('✗ --branch demande un nom de branche.\n');
    process.exit(2);
  }
  process.stdout.write(`\nRécupération depuis origin/${branch} (dossier ${dir}/)…\n`);
  files = fetchFromBranch(branch, dir);
} else {
  files = args.filter((a) => !a.startsWith('--'));
  for (const f of files) {
    if (!existsSync(f)) {
      process.stderr.write(`✗ introuvable : ${f}\n`);
      process.exit(2);
    }
  }
}

let failed = 0;
for (const f of files) {
  try {
    process.stdout.write(report(f));
  } catch (error) {
    failed += 1;
    process.stderr.write(`✗ ${basename(f)} : ${error.message}\n`);
  }
}
process.exit(failed ? 1 : 0);
