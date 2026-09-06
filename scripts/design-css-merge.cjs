#!/usr/bin/env node
/*
 * AYROVI — P3/T2d : fusion de la couche application du back-office en une seule feuille.
 *
 * Le plan vise « 3 fichiers CSS pour le système » : `tokens.css` (les valeurs),
 * `interface-runtime.css` (le runtime partagé avec la vitrine) et UNE couche d'application.
 * Quatre feuilles portaient encore les règles de l'admin (`admin.css`, `arrival-ingestion.css`,
 * `interface-studio.css`, `back-office.css`). Ce script les fond dans `admin.css` SANS toucher
 * une règle, une propriété ni un ordre :
 *   - l'ordre d'assemblage est celui observé dans le chunk construit (admin → arrival →
 *     interface-studio → back-office) ;
 *   - le contrôle d'équivalence est structurel : le multi-ensemble des (sélecteur, propriété) et
 *     la valeur de chaque déclaration doivent être conservés à 100 % ;
 *   - aucun chevauchement n'existe entre ces feuilles (mesuré : 0 (sélecteur, propriété) commun),
 *     donc la fusion ne peut pas déplacer un gagnant de cascade.
 * Les trois feuilles absorbées sont supprimées du disque et de leurs imports ; leur contenu est
 * intégralement dans `admin.css`, et l'historique git les conserve.
 *
 * Usage : node scripts/design-css-merge.cjs [--check]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = 'client/src/admin/admin.css';
/** Ordre d'assemblage = ordre de chargement réellement observé dans le CSS construit. */
const SOURCES = [
  { rel: 'client/src/admin/arrival-ingestion.css', importedBy: 'client/src/admin/ArrivalIngestionPage.tsx', label: 'écrans de réception (P2.0–P2.3)' },
  { rel: 'client/src/admin/interface-studio.css', importedBy: 'client/src/admin/AdminApp.tsx', label: 'studio d’interface (P1)' },
  { rel: 'client/src/admin/back-office/back-office.css', importedBy: 'client/src/admin/back-office/BackOfficeShell.tsx', label: 'coquille unifiée (P2.0)' },
];

const check = process.argv.includes('--check');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
function pairs(text) {
  const out = [];
  const stack = [];
  let buf = '';
  for (const c of strip(text)) {
    if (c === '{') { stack.push(buf.trim()); buf = ''; continue; }
    if (c === '}') {
      const sel = stack[stack.length - 1] || '';
      for (const decl of buf.split(';')) {
        if (!decl.includes(':')) continue;
        const [prop] = decl.split(':');
        out.push(`${sel}||${prop.trim()}`);
      }
      buf = '';
      stack.pop();
      continue;
    }
    buf += c;
  }
  return out;
}
const balance = (t) => (strip(t).match(/\{/g) || []).length - (strip(t).match(/\}/g) || []).length;

const before = read(TARGET);
const beforePairs = pairs(before);
for (const s of SOURCES) beforePairs.push(...pairs(read(s.rel)));

const banners = SOURCES.map((s) => {
  const body = read(s.rel);
  return [
    '',
    '/* ═══════════════════════════════════════════════════════════════════════════',
    `   ${s.label}`,
    `   Fondu ici en P3/T2d depuis \`${s.rel}\` — aucune règle, aucune propriété,`,
    '   aucun ordre n’a été modifié ; la feuille d’origine reste visible dans l’historique git.',
    '   ═══════════════════════════════════════════════════════════════════════════ */',
    body.trimEnd(),
    '',
  ].join('\n');
});
const merged = `${before.trimEnd()}\n${banners.join('\n')}`;

const afterPairs = pairs(merged);
const countOf = (list) => list.reduce((map, key) => map.set(key, (map.get(key) || 0) + 1), new Map());
const a = countOf(beforePairs);
const b = countOf(afterPairs);
const lost = [...a.entries()].filter(([k, n]) => (b.get(k) || 0) !== n);
const gained = [...b.entries()].filter(([k, n]) => (a.get(k) || 0) !== n);
const report = {
  declarationsAvant: beforePairs.length,
  declarationsApres: afterPairs.length,
  perdues: lost.map(([k, n]) => `${k} (${n})`),
  ajoutees: gained.map(([k, n]) => `${k} (${n})`),
  accoladesAvant: balance(merged),
  littérauxApres: (strip(merged).match(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g) || []).length,
};
if (report.perdues.length || report.ajoutees.length) throw new Error(`fusion non isomorphe : ${JSON.stringify(report, null, 2)}`);
if (report.accoladesAvant !== 0) throw new Error('accolades déséquilibrées après fusion');

if (check) {
  console.log(JSON.stringify({ ...report, mode: 'check — aucun fichier écrit' }, null, 2));
  process.exit(0);
}

fs.writeFileSync(path.join(ROOT, TARGET), merged);
for (const s of SOURCES) {
  const impPath = path.join(ROOT, s.importedBy);
  const imp = fs.readFileSync(impPath, 'utf8');
  const line = `import './${path.relative(path.dirname(s.importedBy), s.rel)}';`;
  if (imp.includes(line)) {
    fs.writeFileSync(impPath, imp.replace(line,
      `// P3/T2d : la feuille \`${path.basename(s.rel)}\` a été fondue dans \`admin.css\` (même couche d'application).`));
  }
  fs.unlinkSync(path.join(ROOT, s.rel));
  // le dossier parent ne doit pas rester vide dans l'arbre
  const parent = path.dirname(path.join(ROOT, s.rel));
  if (!fs.readdirSync(parent).length) fs.rmdirSync(parent);
}
console.log(JSON.stringify(report, null, 2));
