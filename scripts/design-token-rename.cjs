#!/usr/bin/env node
/*
 * AYROVI — P3/T1-bis b : noms canoniques de la couche back-office.
 *
 * Huit des neuf variables héritées d'`admin.css` portent un nom qui ment sur leur valeur
 * (`--admin-purple` = #111318 est un noir, `--admin-yellow` = #ffb070 est un pêche,
 * `--admin-bg`/`--admin-card` sont des rôles mais pas des familles). Ce script :
 *   1. déclare dans `tokens.css` les noms canoniques, à la VALEUR EXACTE (aucun réétalonnage) ;
 *   2. réécrit toutes les références de la couche admin vers ces noms ;
 *   3. conserve les anciens noms en alias `var(--canonique)` — rien n'est supprimé, un chunk
 *      périmé ou une feuille tierce continue de résoudre la même valeur.
 * Aucun rendu ne change : `scripts/design-token-equivalence.py` le prouve après coup.
 *
 * Usage : node scripts/design-token-rename.cjs [--check]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOKENS = 'client/src/design/tokens.css';

/** ancien nom -> { canonique, valeur (inchangée), raison } */
const RENAME = {
  '--admin-purple': { to: '--admin-ink-strong', value: '#111318', why: "c'est un noir, pas un violet" },
  '--admin-purple-dark': { to: '--admin-ink-black', value: '#050505', why: 'noir profond du rail et des dégradés' },
  '--admin-yellow': { to: '--admin-warm-accent', value: '#ffb070', why: 'pêche : « yellow » induisait en erreur' },
  '--admin-muted': { to: '--admin-ink-muted', value: '#71717f', why: 'encre atténuée, pas une couleur « muette »' },
  '--admin-bg': { to: '--admin-surface-page', value: '#f6f6f9', why: 'surface de page' },
  '--admin-card': { to: '--admin-surface-card', value: '#fff', why: 'surface de carte' },
  '--admin-sidebar': { to: '--admin-rail', value: '#17151f', why: 'le rail latéral (même encre que le texte)' },
};

/** Cibles de la réécriture : tout ce qui vit sous `client/src` et référence un ancien nom. */
function adminLayerFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(css|tsx|ts)$/.test(e.name)) out.push(p);
    }
  };
  walk(path.join(ROOT, 'client/src'));
  return out;
}

const check = process.argv.includes('--check');
const tokensPath = path.join(ROOT, TOKENS);
const tokens = fs.readFileSync(tokensPath, 'utf8');

/* 1) tokens.css : bloc canonique + alias dépréciés, en remplacement des définitions littérales. */
const legacyDefs = Object.entries(RENAME).map(([legacy, spec]) => ({ legacy, ...spec }));
const canonicalBlock = [
  '',
  '  /* ─────────────────────────────────────────────────────────────────────────',
  '     Noms canoniques de la couche back-office (P3/T2). Les valeurs sont celles de',
  '     T1, caractère par caractère : seul le NOM change, parce que huit des neuf',
  '     variables héritées mentaient sur leur rôle (« purple » pour un noir,',
  '     « yellow » pour un pêche). Les alias dépréciés en bas de bloc gardent la',
  '     cascade ouverte pour tout consommateur que cette phase ne réécrit pas.',
  '     ───────────────────────────────────────────────────────────────────────── */'].join('\n');

let block = `:root {\n${canonicalBlock}\n`;
for (const { to, value, why } of legacyDefs) {
  if (tokens.includes(`${to}:`)) continue; // déjà renommé (script rejoué)
  block += `  ${to}:${value}; /* ${why} */\n`;
}
const aliasLines = legacyDefs
  .filter(({ legacy }) => !new RegExp(`\\n  ${legacy}: var\\(`).test(tokens))
  .map(({ legacy, to }) => `  ${legacy}: var(${to}); /* alias déprécié — plus aucun usage dans client/src */`);
if (aliasLines.length) block += '\n  /* — alias dépréciés, conservés pour ne rien casser — */\n' + aliasLines.join('\n') + '\n';

/* suppression des anciennes définitions littérales devenues doublons */
let next = tokens;
for (const { legacy, to } of legacyDefs) {
  const literal = new RegExp(`\\n  ${legacy}:\\s*[^;]*;[^\\n]*`, '');
  const current = next.match(literal);
  if (current && !current[0].includes(`var(${to})`)) next = next.replace(literal, '');
}
if (!check) {
  const injected = next.replace(/\n:root \{/, `\n${block}\n}\n\n:root {`);
  const bal = (s) => (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
  if (bal(injected) !== 0) throw new Error(`tokens.css déséquilibré après injection (${bal(injected)})`);
  fs.writeFileSync(tokensPath, injected);
}

/* 2) réécriture des références dans toute la couche admin */
let rewritten = 0;
const perFile = {};
for (const file of adminLayerFiles()) {
  if (file === tokensPath) continue;
  const text = fs.readFileSync(file, 'utf8');
  let out = text;
  for (const { legacy, to } of legacyDefs) {
    out = out.split(`var(${legacy})`).join(`var(${to})`);
  }
  if (out !== text) {
    const n = (text.match(/var\(--admin-(purple|purple-dark|yellow|muted|bg|card|sidebar)\)/g) || []).length;
    rewritten += n;
    perFile[path.relative(ROOT, file)] = n;
    if (!check) fs.writeFileSync(file, out);
  }
}
console.log(JSON.stringify({ canonicals: legacyDefs.length, aliases: aliasLines.length, refsRewritten: rewritten, perFile, check }, null, 2));
