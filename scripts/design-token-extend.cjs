#!/usr/bin/env node
/*
 * AYROVI — P3/T2c : étendre la couche de tokens à une feuille restée en littéraux.
 *
 * Même contrat que `design-token-sweep.cjs` (T1) : une valeur n'est remplacée que par un token
 * dont la valeur est STRICTEMENT égale (à la casse et à la forme courte près), sinon un ton
 * verbatim `--admin-tone-<valeur>` est créé. Aucun réétalonnage, aucun regroupement par
 * ressemblance — le rendu est prouvé identique par `scripts/design-token-equivalence.py`.
 *
 * Différence avec T1 : ce script peut tourner sur un dépôt déjà balayé. Il ne réécrit pas le bloc
 * de tokens existant, il n'y ajoute que les tons manquants, et il préfère un token existant de la
 * couche admin (`--admin-*`) au token public (`--ayrovi-*`) quand les deux portent la même valeur.
 *
 * Usage : node scripts/design-token-extend.cjs --files client/src/admin/arrival-ingestion.css [--check]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOKENS = 'client/src/design/tokens.css';
const HEX = String.raw`#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_])`;
const FN = String.raw`(?:rgba?|hsla?)\([^()]*\)`;
const LITERAL = new RegExp(`${HEX}|${FN}`, 'g');

const argv = process.argv.slice(2);
const flag = (name) => argv[argv.indexOf(name) + 1];
const files = (flag('--files') || '').split(',').filter(Boolean);
if (!files.length) throw new Error('--files <a.css,b.css> est requis');
const check = argv.includes('--check');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const canon = (lit) => {
  let v = lit.toLowerCase().replace(/\s+/g, ' ').replace(/,\s*/g, ',').trim();
  v = v.replace(/^#([0-9a-f]{3})$/, (m, h) => `#${h.split('').map((c) => c + c).join('')}`);
  v = v.replace(/^#([0-9a-f]{4})$/, (m, h) => `#${h.split('').map((c) => c + c).join('')}`);
  return v;
};
/* Même algorithme de nom que T1 (design-token-sweep.cjs) : une valeur déjà tonifiée retrouve
   exactement le même nom, donc aucun doublon n'est créé entre les deux passes. */
const slug = (value) =>
  value.startsWith('#')
    ? value.slice(1)
    : value
        .replace(/^([a-z]+)\((.*)\)$/, (m, fn, args) => `${fn}-${args.replace(/[^0-9a-z]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`);

function withoutComments(text) {
  const mask = new Array(text.length).fill(false);
  let i = 0;
  while (i < text.length) {
    if (text[i] === '/' && text[i + 1] === '*') {
      const j = text.indexOf('*/', i + 2);
      const end = j === -1 ? text.length : j + 2;
      for (let k = i; k < end; k += 1) mask[k] = true;
      i = end;
    } else i += 1;
  }
  return mask;
}

/* ---------------------------------------------------------------- tables */
const tokensText = read(TOKENS);
const adminTokens = new Map(); // valeur -> nom canonique de la couche admin
const publicTokens = new Map(); //  valeur -> nom public (--ayrovi-*)
const toneTokens = new Map(); //   valeur -> nom de ton déjà créé
for (const m of tokensText.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  const value = m[2].trim();
  if (!new RegExp(`^(?:${HEX}|${FN})$`).test(value)) continue;
  const key = canon(value);
  if (m[1].startsWith('--admin-tone-')) { if (!toneTokens.has(key)) toneTokens.set(key, m[1]); continue; }
  if (m[1].startsWith('--admin-')) { if (!adminTokens.has(key)) adminTokens.set(key, m[1]); continue; }
  if (m[1].startsWith('--ayrovi-')) { if (!publicTokens.has(key)) publicTokens.set(key, m[1]); }
}
const newTones = new Map();
const report = { files: {}, replaced: 0, toExisting: 0, toTone: 0, newTones: 0 };

for (const rel of files) {
  const text = read(rel);
  const mask = withoutComments(text);
  const spans = [];
  for (const m of text.matchAll(LITERAL)) {
    if (mask[m.index]) continue;
    let start = m.index;
    while (start > 0 && !';{}'.includes(text[start - 1])) start -= 1;
    const decl = text.slice(start, m.index).trim();
    if (/^--[a-z0-9-]+\s*:/.test(decl)) continue; // définition locale : hors objet de ce script
    const value = canon(m[0]);
    let token = adminTokens.get(value) ?? publicTokens.get(value) ?? toneTokens.get(value);
    if (token) {
      report.toExisting += 1;
      if (toneTokens.get(value) === token) report.toTone += 1;
    } else {
      const name = `--admin-tone-${slug(value)}`;
      token = name;
      if (!newTones.has(name)) newTones.set(name, { value, raw: m[0] });
      report.newTones = newTones.size;
    }
    spans.push({ start: m.index, end: m.index + m[0].length, text: `var(${token})` });
  }
  spans.sort((a, b) => b.start - a.start);
  let out = text;
  let cursor = text.length;
  let n = 0;
  for (const s of spans) {
    if (s.end > cursor) continue;
    out = out.slice(0, s.start) + s.text + out.slice(s.end);
    cursor = s.start;
    n += 1;
  }
  report.files[rel] = n;
  report.replaced += n;
  if (!check && n) fs.writeFileSync(path.join(ROOT, rel), out);
}

/* ---------------------------------------------------------------- tokens.css */
if (newTones.size) {
  const added = [...newTones.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, spec]) => `  ${name}:${spec.value};`)
    .join('\n');
  const last = tokensText.lastIndexOf('}');
  const updated = `${tokensText.slice(0, last).replace(/\s*$/, '')}\n\n  /* — ajout T2c (${newTones.size} tons portés par arrival-ingestion.css) — */\n${added}\n${tokensText.slice(last)}`;
  if (!check) fs.writeFileSync(path.join(ROOT, TOKENS), updated);
}
const balance = (s) => (s.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g) || []).length
  - (s.replace(/\/\*[\s\S]*?\*\//g, '').match(/\}/g) || []).length;
if (!check) {
  for (const rel of [TOKENS, ...files]) if (balance(read(rel)) !== 0) throw new Error(`${rel}: accolades déséquilibrées`);
}
console.log(JSON.stringify({ ...report, mode: check ? 'check' : 'appliqué', aliases: [...adminTokens.entries()].length }, null, 2));
