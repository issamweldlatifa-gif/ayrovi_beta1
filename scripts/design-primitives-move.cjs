#!/usr/bin/env node
/*
 * P3/T2 (a) — `client/src/design/` devient la couche des primitives ; le moteur les réexporte.
 *
 * Ce qui était fait : les primitives d'interface du back office vivaient dans
 * `client/src/admin/components.tsx` (335 lignes, 16 exports) — le « moteur » définissait donc ses
 * propres composants, exactement ce que le plan interdit (un composant = une implémentation). Ce
 * script les **déplace** dans `client/src/design/admin/`, un fichier par primitive, et remplace
 * `components.tsx` par une façade qui les réexporte : les 20 écrans et le moteur continuent
 * d'importer `../components`, donc aucun appel ne change.
 *
 * Le découpage est mécanique : le fichier source est découpé au niveau 0 d'accolades, chaque bloc
 * est écrit tel quel dans son fichier, et les en-têtes d'import sont recalculés par usage réel.
 * Aucune ligne n'est retapée, donc rien ne peut dériver du markup d'origine.
 *
 * Usage : node scripts/design-primitives-move.cjs [--check]
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const source = path.join(root, 'client/src/admin/components.tsx');
const targetDir = path.join(root, 'client/src/design/admin');
const check = process.argv.includes('--check');

/* nom de primitive -> fichier + dépendances internes */
const OWNERS = {
  Button: 'Button', statusLabels: 'StatusBadge', StatusBadge: 'StatusBadge',
  Search: 'Search', Filters: 'Filters', Pagination: 'Pagination',
  DataColumn: 'DataTable', TableRowAction: 'DataTable', TableBulkAction: 'DataTable', DataTable: 'DataTable',
  Modal: 'Modal', ConfirmDialog: 'ConfirmDialog', Field: 'Field', Form: 'Form',
  DatePicker: 'DatePicker', Select: 'Select', ImageUploader: 'ImageUploader',
  PageHeader: 'PageHeader', EmptyState: 'EmptyState', Toast: 'Toast',
};
/* icônes : le nom exporté par QatafoIcons -> l'alias sous lequel le fichier source les importe */
const ICONS = { AlertCircle: 'AlertCircle', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Calendar: 'Calendar',
  Check: 'Check', ChevronDown: 'ChevronDown', Image: 'Image', Loader2: 'Loader2', Plus: 'Plus', RefreshCw: 'RefreshCw',
  SearchIcon: 'Search', Trash2: 'Trash2', X: 'X' };
const HOOKS = ['useEffect', 'useMemo', 'useRef', 'useState'];
const PRIMITIVES = Object.keys(OWNERS);

/* -------------------------------------------------- découpage en blocs de haut niveau */
const text = fs.readFileSync(source, 'utf8');
const lines = text.split('\n');
const blocks = [];
let current = null;
let started = false;
let depth = 0;
let inBlock = false; // commentaire /* … */
for (let i = 0; i < lines.length; i += 1) {
  let line = lines[i];
  const isTop = depth === 0 && !inBlock;
  const starts = isTop && /^(export |const |interface |type |\/\*\*)/.test(line);
  if (starts) { current = { start: i, lines: [] }; blocks.push(current); started = true; }
  // tout ce qui précède la première déclaration est l'en-tête (imports) : il est recalculé par fichier
  if (current) current.lines.push(line);
  else if (!started) continue;
  // mise à jour de la profondeur, en ignorant accolades/parenthèses des commentaires et des chaînes
  let inString = null;
  for (let j = 0; j < line.length; j += 1) {
    const c = line[j], p = j > 0 ? line[j - 1] : '';
    if (inBlock) { if (c === '/' && p === '*') inBlock = false; continue; }
    if (inString) { if (c === inString && p !== '\\') inString = null; continue; }
    if (c === '*' && p === '/') { inBlock = true; continue; }
    if (c === "'" || c === '"' || c === '`') { inString = c; continue; }
    if (c === '{' || c === '(' || c === '[') depth += 1;
    else if (c === '}' || c === ')' || c === ']') depth -= 1;
  }
  if (depth < 0) throw new Error(`accolade déséquilibrée ligne ${i + 1}`);
}
if (depth !== 0) throw new Error('profondeur finale non nulle : découpage refusé');

/* un bloc sans déclaration (JSDoc isolé) se rattache au bloc qu'il précède */
const raw = blocks.map((block) => {
  const body = block.lines.join('\n');
  const declared = [...body.matchAll(/^(?:export (?:const|interface|function) |export type |const |interface |type )([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
  return { lines: block.lines, declared };
});
const chunks = [];
let pending = [];
for (const block of raw) {
  const meaningful = block.lines.filter((line) => line.trim());
  if (!block.declared.length) {
    if (!meaningful.length) continue;
    pending = pending.concat(block.lines, ['']); // un JSDoc précède sa déclaration
    continue;
  }
  chunks.push({ lines: pending.concat(block.lines), declared: block.declared });
  pending = [];
}
if (pending.length) throw new Error(`commentaire final sans déclaration : ${pending[0].slice(0, 60)}`);

/* rattachement : premier nom connu du bloc ; un bloc sans nom connu (commentaire seul) suit le précédent */
const assigned = new Map(); // fichier -> [{lines, names}]
const unassigned = [];
for (const chunk of chunks) {
  const body = chunk.lines.join('\n');
  const declared = [...body.matchAll(/^(?:export (?:const|interface|function) |export type |const |interface |type )([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
  const file = declared.map((d) => OWNERS[d]).find(Boolean) || null;
  if (!file) { if (body.trim()) unassigned.push(declared.join(',') || body.slice(0, 40)); continue; }
  const list = assigned.get(file) || [];
  list.push({ lines: chunk.lines, declared, body });
  assigned.set(file, list);
}

/* -------------------------------------------------- rapports */
const totalBlocks = chunks.length;
const kept = [...assigned.values()].reduce((a, list) => a + list.length, 0);
console.log(`blocs de haut niveau : ${totalBlocks} — rattachés ${kept} — non rattachés ${unassigned.length}`);
if (unassigned.length) { console.log('NON RATTACHÉS :', unassigned); throw new Error('découpage incomplet'); }
const allNames = [...assigned.values()].flatMap((list) => list.flatMap((chunk) => chunk.declared));
const expected = PRIMITIVES.map((p) => OWNERS[p]);
for (const f of expected) if (!allNames.some((n) => OWNERS[n] === f)) throw new Error(`primitive sans déclaration : ${f}`);
for (const n of allNames) if (!OWNERS[n]) throw new Error(`déclaration inconnue du plan : ${n}`);
console.log(`fichiers visés : ${assigned.size} — déclarations : ${allNames.length}`);
if (check) {
  for (const [file, list] of [...assigned].sort()) console.log(`  design/admin/${file}.tsx ← ${list.map((c) => c.declared.join('+')).join(', ')}`);
  console.log('MODE VÉRIFICATION — rien n’est écrit.');
  process.exit(0);
}

/* -------------------------------------------------- écriture */
fs.mkdirSync(targetDir, { recursive: true });
const banner = (what) => [
  '/**',
  ` * ${what}`,
  ' *',
  " * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx",
  ' * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche',
  " * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche",
  ' * d\'application unique sans aucun littéral de couleur.',
  ' */',
].join('\n');

for (const [file, list] of [...assigned].sort()) {
  const body = list.map((chunk) => chunk.lines.join('\n')).join('\n\n').replace(/\n+$/, '');
  const usedIcons = Object.keys(ICONS).filter((n) => new RegExp(`\\b${n}\\b`).test(body));
  const usedHooks = HOOKS.filter((n) => new RegExp(`\\b${n}\\b`).test(body));
  const needsReact = /\bReact\./.test(body) || /React\.FC/.test(body);
  const usesApi = /\badminApi\b/.test(body);
  const internal = PRIMITIVES.filter((p) => OWNERS[p] !== file && new RegExp(`\\b${p}\\b`).test(body));
  const byFile = new Map();
  for (const p of internal) byFile.set(OWNERS[p], (byFile.get(OWNERS[p]) || []).concat(p));
  const head = [];
  head.push(banner(`${file} — primitive du design system AYROVI.`));
  if (needsReact || usedHooks.length) head.push(`import React${usedHooks.length ? `, { ${usedHooks.join(', ')} }` : ''} from 'react';`);
  else if (/=>|: React/.test(body)) head.push(`import React from 'react';`);
  if (usesApi) head.push(`import { adminApi } from '../../admin/api';`);
  if (usedIcons.length) head.push(`import { ${usedIcons.map((n) => (ICONS[n] === n ? n : `${ICONS[n]} as ${n}`)).join(', ')} } from '../../components/QatafoIcons';`);
  for (const [dep, names] of [...byFile].sort()) head.push(`import { ${names.join(', ')} } from './${dep}';`);
  const out = head.join('\n') + '\n\n' + body + '\n';
  if (/^\s*import React from 'react';\nimport React,/.test(out)) throw new Error('double import React');
  fs.writeFileSync(path.join(targetDir, `${file}.tsx`), out);
  console.log(`  écrit client/src/design/admin/${file}.tsx (${out.split('\n').length} lignes)`);
}

/* la façade : mêmes noms, mêmes types, imports des écrans inchangés */
const facade = `/**
 * Les primitives du back office vivent désormais dans \`client/src/design/admin/\` — une primitive,
 * un fichier, une implémentation (P3/T2). Ce fichier reste **la façade publique** demandée par le
 * plan : les 20 écrans et le moteur back office continuent d'importer \`../components\`, et rien
 * dans leurs appels n'a changé. Aucune définition ici : uniquement des réexports.
 *
 * Le style des primitives n'est pas ici : il vit dans \`client/src/admin/admin.css\`, la couche
 * d'application unique (P3/T1-c/T1-d), qui ne contient aucun littéral de couleur (P3/T1-a/T2-C5).
 */
${[...assigned.keys()].sort().map((file) => `export * from '../design/admin/${file}';`).join('\n')}
`;
fs.writeFileSync(source, facade);
console.log(`façade écrite : client/src/admin/components.tsx (${facade.split('\n').length} lignes, 0 définition)`);
console.log('OK');
