#!/usr/bin/env node
/*
 * Vérification du déplacement des primitives (P3/T2).
 *
 * Le risque d'un déplacement de code est la retouche involontaire. Ce script rejoue le découpage
 * sur la version *commitée* de client/src/admin/components.tsx et exige que chaque bloc de
 * déclaration se retrouve mot pour mot dans client/src/design/admin/ (seules les lignes blanches
 * sont normalisées, car les en-têtes d'import sont recalculés par usage).
 *
 * Usage : node scripts/design-primitives-verify.cjs [--rev <sha>]   (défaut : HEAD)
 * Un test qui tourne après le commit doit passer --rev explicitement, sinon il se compare à lui-même.
 */
const { execSync } = require('child_process');
const fs = require('fs');

// le backtick est écrit par code pour garder ce fichier lisible
const backtick = String.fromCharCode(96);
const args = process.argv.slice(2);
const revAt = args.indexOf('--rev');
const rev = revAt === -1 ? 'HEAD' : args[revAt + 1];

function blocksOf(text) {
  const lines = text.split('\n');
  const out = [];
  let cur = null;
  let depth = 0;
  let inComment = false;
  let started = false;
  for (const line of lines) {
    const atTop = depth === 0 && !inComment;
    if (atTop && /^(export |const |interface |type |\/\*\*)/.test(line)) { cur = []; out.push(cur); started = true; }
    if (cur) cur.push(line);
    let inString = null;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      const p = i ? line[i - 1] : '';
      if (inComment) { if (c === '/' && p === '*') inComment = false; continue; }
      if (inString) { if (c === inString && p !== '\\') inString = null; continue; }
      if (c === '*' && p === '/') { inComment = true; continue; }
      if (c === "'" || c === '"' || c === backtick) { inString = c; continue; }
      if ('{(['.includes(c)) depth += 1;
      else if ('})]'.includes(c)) depth -= 1;
    }
  }
  if (depth !== 0) throw new Error('profondeur finale non nulle : fichier source non équilibré');
  return out.map((block) => block.join('\n').replace(/\s+$/, ''));
}

const src = execSync(`git show ${rev}:client/src/admin/components.tsx`, { encoding: 'utf8' });
const decls = [];
let pending = [];
for (const block of blocksOf(src)) {
  const first = block.split('\n').find((line) => line.trim()) || '';
  if (!/^(export |const |interface |type )/.test(first)) { pending.push(block); continue; }
  decls.push(pending.concat([block]).join('\n\n'));
  pending = [];
}
if (pending.length) throw new Error('commentaire final sans déclaration dans la référence');

const declarations = decls.filter((d) => /^export (const|function|interface|type)/m.test(d.trimStart()) || d.split('\n').some((line) => /^(export (const|function|interface|type)|const |interface |type )/.test(line)));
if (!declarations.length) {
  console.log(`référence ${rev} : client/src/admin/components.tsx n'y contient déjà plus aucune définition —`);
  console.log('ce script ne sert que pour le commit qui a fait le déplacement (il compare un fichier source à sa nouvelle maison).');
  process.exit(0);
}

const squash = (value) => value.replace(/\n{2,}/g, '\n').trim();
const dir = 'client/src/design/admin';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'));
const haystack = squash(files.map((f) => fs.readFileSync(`${dir}/${f}`, 'utf8')).join('\n\n'));

let found = 0;
const missing = [];
for (const decl of decls) {
  const needle = squash(decl);
  if (haystack.includes(needle)) found += 1;
  else missing.push(needle.slice(0, 110));
}
console.log(`référence ${rev} : ${decls.length} blocs de déclaration`);
console.log(`design/admin : ${files.length} fichiers`);
console.log(`blocs retrouvés mot pour mot : ${found}`);
if (missing.length) {
  console.log('INTRouvés :');
  for (const m of missing) console.log(`  --- ${m}`);
  process.exit(1);
}
console.log('OK — le déplacement n’a modifié aucun octet de logique.');
