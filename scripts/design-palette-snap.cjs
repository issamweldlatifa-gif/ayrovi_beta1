#!/usr/bin/env node
/*
 * AYROVI — P3/T1-bis e : absorption de la longue traîne des tons verbatims.
 *
 * T1 avait déplacé 449 littéraux sans y toucher, en créant 231 « tons » portant la valeur exacte.
 * Ce script fait le pas que T1 refusait de faire sans accord : rapprocher une teinte d'un token
 * voisin. Il est réglé par un seul curseur, `--max-delta` (écart MAXIMAL par canal RVB, sur 255) :
 *   - 0 : aucun changement visuel, uniquement les doublons stricts ;
 *   - 1 : ~0,4 % de distance — imperceptible, et c'est le réglage retenu pour la passe 1 ;
 *   - 2 : encore invisible sur les aplats de l'admin, retenu pour la passe 2.
 * Au-delà, on commence à décider à la place du design : le script s'arrête et le rapport le dit.
 *
 * Une teinte n'est absorbée QUE vers un token déjà nommé de la couche admin (un nom sémantique en
 * priorité, sinon un ton plus fréquent), jamais vers une valeur inventée. La table complète des
 * absorptions est écrite dans `explorations/P3_T1BIS_PALETTE_SNAP.md` : aucune valeur n'est perdue,
 * tout est rejouable et annulable.
 *
 * Usage : node scripts/design-palette-snap.cjs --max-delta 2 [--check]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOKENS = 'client/src/design/tokens.css';
const SHEET = 'client/src/admin/admin.css';
const LOG = 'explorations/P3_T1BIS_PALETTE_SNAP.md';

const argv = process.argv.slice(2);
const num = (name, dflt) => (argv.includes(name) ? Number(argv[argv.indexOf(name) + 1]) : dflt);
const MAX_DELTA = num('--max-delta', 1);
const check = argv.includes('--check');
if (MAX_DELTA > 2) throw new Error(`--max-delta ${MAX_DELTA} : au-delà de 2, ce n'est plus de la consolidation mais du re-design — refuser`);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const dist = (a, b) => {
  const A = rgb(a), B = rgb(b);
  const channels = A.map((x, i) => Math.abs(x - B[i]));
  return { max: Math.max(...channels), sum: channels.reduce((s, x) => s + x, 0) };
};

/* ---------------------------------------------------------------- lecture */
const tokensText = read(TOKENS);
const sheetText = read(SHEET);
const body = tokensText.replace(/\/\*[\s\S]*?\*\//g, '');
const defs = [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6});/g)]
  .map((m) => ({ name: m[1], value: m[2].toLowerCase() }))
  .filter((d) => d.name.startsWith('--admin-'));
const usage = {};
for (const m of sheetText.matchAll(/var\((--admin-[a-z0-9-]+)\)/g)) usage[m[1]] = (usage[m[1]] || 0) + 1;
const isTone = (name) => name.startsWith('--admin-tone-');

/** Les noms non-ton (canoniques + sémantiques) sont les cibles préférées : ils ne sont jamais absorbés. */
const anchors = defs.filter((d) => !isTone(d.name)).sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0));
const tones = defs.filter((d) => isTone(d.name)).sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0));

/* ---------------------------------------------------------------- clustering */
const survivors = anchors.map((a) => ({ ...a, absorbed: [] }));
const absorbedByName = new Map();
for (const tone of tones) {
  let best = null;
  for (const cand of survivors) {
    const d = dist(tone.value, cand.value);
    if (d.max > MAX_DELTA) continue;
    if (!best || d.max < best.d.max || (d.max === best.d.max && d.sum < best.d.sum)) best = { cand, d };
  }
  if (best) {
    best.cand.absorbed.push({ name: tone.name, value: tone.value, uses: usage[tone.name] || 0, ...best.d });
    absorbedByName.set(tone.name, best.cand);
  } else {
    survivors.push({ ...tone, absorbed: [] });
  }
}

const absorbed = [...absorbedByName.entries()];
const report = {
  maxDelta: MAX_DELTA,
  adminHexTokens: defs.length,
  tonesAvant: tones.length,
  apresAbsorption: tones.length - absorbed.length,
  absorbes: absorbed.length,
  usagesReecrits: absorbed.reduce((s, [name]) => s + (usage[name] || 0), 0),
  doublonsStrictsWithDelta0: tones.filter((t) => anchors.some((a) => dist(a.value, t.value).max === 0)).length,
};

/* ---------------------------------------------------------------- écriture */
const table = [
  `# Absorption de la longue traîne — P3/T2e`,
  ``,
  `Généré par \`scripts/design-palette-snap.cjs --max-delta ${MAX_DELTA}\`.`,
  ``,
  `- Avant : **${tones.length}** tons verbatims dans \`tokens.css\` (valeur exacte de chaque littéral déplacé en T1).`,
  `- Après : **${report.apresAbsorption}** — ${absorbed.length} teintes absorbées par un token voisin, à un écart maximal de **${MAX_DELTA}/255 par canal** (et Σ des trois canaux indiqué par ligne).`,
  `- Un token absorbé n'existe plus : sa valeur est remplacée partout par la cible. Cette table reste le seul endroit qui relate la valeur d'avant.`,
  ``,
  `| ton absorbé | valeur d'avant | → cible | valeur de la cible | écart max/canal | Σ canaux | usages réécrits |`,
  `|---|---|---|---|---:|---:|---:|`,
];
for (const [name, cand] of absorbed.sort((a, b) => a[0].localeCompare(b[0]))) {
  const info = cand.absorbed.find((x) => x.name === name);
  table.push(`| \`${name}\` | \`${info.value}\` | \`${cand.name}\` | \`${cand.value}\` | ${info.max} | ${info.sum} | ${info.uses} |`);
}
table.push('', `## Cibles les plus sollicitées`, '');
for (const s of survivors.filter((x) => x.absorbed.length).sort((a, b) => b.absorbed.length - a.absorbed.length).slice(0, 12)) {
  table.push(`- \`${s.name}\` \`${s.value}\` absorbe ${s.absorbed.length} teinte(s) : ${s.absorbed.map((a) => a.value).join(', ')}`);
}

if (check) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

let sheet = sheetText;
for (const [name, cand] of absorbed) {
  sheet = sheet.split(`var(${name})`).join(`var(${cand.name})`);
}
fs.writeFileSync(path.join(ROOT, SHEET), sheet);

let tokens = tokensText;
for (const [name] of absorbed) {
  tokens = tokens.replace(new RegExp(`\\n\\s*${name.replace(/-/g, '\\-')}:\\s*#[0-9a-fA-F]+;`, ''), '');
}
tokens = tokens.replace(/tons verbatims : \d+ valeurs longue traîne/, `tons verbatims : ${report.apresAbsorption} valeurs longue traîne`);
fs.writeFileSync(path.join(ROOT, TOKENS), tokens);
fs.writeFileSync(path.join(ROOT, LOG), table.join('\n') + '\n');

const leftover = [...sheet.matchAll(/var\((--admin-tone-[a-z0-9-]+)\)/g)].map((m) => m[1]);
const undefinedTones = [...new Set(leftover)].filter((n) => !new RegExp(`\\n\\s*${n}:`).test(tokens));
if (undefinedTones.length) throw new Error(`tons référencés mais non définis : ${undefinedTones.join(', ')}`);
const bal = (s) => (s.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g) || []).length - (s.replace(/\/\*[\s\S]*?\*\//g, '').match(/\}/g) || []).length;
if (bal(tokens) !== 0 || bal(sheet) !== 0) throw new Error('accolades déséquilibrées après absorption');
console.log(JSON.stringify(report, null, 2));
