#!/usr/bin/env node
/*
 * AYROVI — P3/T1 design-token sweep (back-office only).
 *
 * Removes every literal colour from the back-office *system* stylesheets and points them at
 * tokens declared in client/src/design/tokens.css, with ZERO visual change:
 *   1. a literal takes an EXISTING token only when the value is character-for-character equal
 *      to that token's value (case/shortform normalised) — never a "close" value;
 *   2. otherwise a verbatim token `--admin-tone-<value>` is created carrying the same value.
 *      These tones are measured debt, the input for T2's palette consolidation.
 *   3. inside `var(--x, <literal>)` the fallback literal is tokenised too; when `--x` is defined
 *      nowhere the whole dead indirection collapses to the token of its fallback.
 *
 * Usage: node scripts/design-token-sweep.cjs [--check]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOKENS = 'client/src/design/tokens.css';
const SYSTEM_FILES = [
  'client/src/admin/admin.css',
  'client/src/admin/back-office/back-office.css',
  'client/src/admin/interface-studio.css',
];

const HEX = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_])';
const FN = '(?:rgba?|hsla?)\\([^()]*\\)';
const LITERAL = new RegExp(`${HEX}|${FN}`);

/** Values that earn a *semantic* name (role evident + frequent). value -> [token, role note]. */
const SEMANTIC = {
  '#faf9fc': ['--admin-surface-sunken', 'surface en creux des panneaux'],
  '#faf8ff': ['--admin-surface-tint', 'surface teintée (fonds de groupe)'],
  '#fbfbfe': ['--admin-surface-soft', 'surface adoucie (encadrés, listes)'],
  '#e5e7eb': ['--admin-line-soft', 'filet clair (listes, encadrés)'],
  '#f0eef7': ['--admin-line-firm', 'filet renforcé (champs, séparateurs)'],
  '#77727f': ['--admin-text-soft', 'texte tertiaire'],
  '#ffffff': ['--admin-on-dark', 'encre pleine sur fond sombre'],
  '#c9362b': ['--admin-danger-strong', 'danger soutenu (bandeaux, badges)'],
  '#b42318': ['--admin-danger-text', 'texte en erreur'],
  '#b6251c': ['--admin-danger-ink', 'erreur profonde (barre latérale)'],
  '#673de6': ['--admin-violet', 'accent produit (Lens, IA)'],
};

/** The nine vars admin.css used to declare itself — moved, never renamed, never retuned. */
const MOVED_ADMIN_DEFS = [
  ['--admin-purple', '#111318'],
  ['--admin-purple-dark', '#050505'],
  ['--admin-yellow', '#ffb070'],
  ['--admin-ink', '#17151f'],
  ['--admin-muted', '#71717f'],
  ['--admin-line', '#e7e5eb'],
  ['--admin-bg', '#f6f6f9'],
  ['--admin-card', '#fff'],
  ['--admin-sidebar', '#17151f'],
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text);
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

/** `#FFF` / `#fff` / `rgba( 0 , 0 , 0, .1 )` → comparable canonical form. */
const canon = (lit) => {
  let v = lit.toLowerCase().replace(/\s+/g, ' ').replace(/,\s*/g, ',').trim();
  v = v.replace(/^#([0-9a-f]{3})$/, (m, h) => `#${h.split('').map((c) => c + c).join('')}`);
  v = v.replace(/^#([0-9a-f]{4})$/, (m, h) => `#${h.split('').map((c) => c + c).join('')}`);
  return v;
};
const toneName = (value) =>
  value.startsWith('#')
    ? `--admin-tone-${value.slice(1)}`
    : `--admin-tone-${value.replace(/^([a-z]+)\((.*)\)$/, (m, fn, args) => `${fn}-${args.replace(/[^0-9a-z]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`)}`;

/* Un nom de custom property ne peut pas contenir de `.` ; et deux valeurs différentes ne peuvent
   pas partager un nom — sinon la consolidation silencieuse d'un nom casserait un rendu. */
const toneNames = new Map();
function toneFor(value) {
  let base = toneName(value);
  let name = base;
  let n = 2;
  while (toneNames.has(name) && toneNames.get(name) !== value) { name = `${base}-${n}`; n += 1; }
  toneNames.set(name, value);
  return name;
}

/** strip /* … *\/ so a literal inside a comment is never rewritten */
function commentMask(text) {
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

/** The declaration a position sits in — enough to tell `color:#fff` from `background:#fff`. */
function declarationOf(text, index) {
  let start = index;
  while (start > 0 && !';{}'.includes(text[start - 1])) start -= 1;
  let end = index;
  while (end < text.length && !';}'.includes(text[end])) end += 1;
  return text.slice(start, end).trim();
}

/** Enclosing `var(...)` around a position, or null. */
function enclosingVar(text, index) {
  let depth = 0;
  let open = -1;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (text[i] === ')') depth += 1;
    else if (text[i] === '(') {
      if (depth === 0) { open = i; break; }
      depth -= 1;
    }
  }
  if (open === -1) return null;
  let k = open;
  while (k > 0 && /[a-zA-Z0-9_-]/.test(text[k - 1])) k -= 1;
  if (text.slice(k, open) !== 'var') return null;
  let d2 = 0;
  let close = -1;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') d2 += 1;
    else if (text[i] === ')') {
      d2 -= 1;
      if (d2 === 0) { close = i; break; }
    }
  }
  if (close === -1) return null;
  const inner = text.slice(open + 1, close);
  const name = inner.split(',')[0].trim();
  const fallback = inner.includes(',') ? inner.slice(inner.indexOf(',') + 1).trim() : null;
  return { start: k, end: close + 1, name, fallback };
}

/* --------------------------------------------------------------- inputs */
const tokensText = read(TOKENS);

/** All custom properties defined anywhere in the client bundle, plus those set from JS. */
const definedVars = new Set();
for (const file of walk(path.join(ROOT, 'client/src'))) {
  if (!/\.(css|tsx|ts)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/g)) definedVars.add(m[1]);
  for (const m of text.matchAll(/setProperty\(\s*['"](--[a-z0-9-]+)['"]/g)) definedVars.add(m[1]);
}

/** value -> token, from tokens.css plus the nine definitions about to be moved there. */
const existing = new Map();
for (const m of tokensText.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  const value = m[2].trim();
  if (!new RegExp(`^(?:${HEX}|${FN})$`).test(value)) continue;
  const key = canon(value);
  if (!existing.has(key)) existing.set(key, m[1]);
}
for (const [name, value] of MOVED_ADMIN_DEFS) {
  if (!existing.has(canon(value))) existing.set(canon(value), name);
}

/* --------------------------------------------------------------- pre-edits
   Les définitions locales quittent les feuilles de styles vers tokens.css ; la longue traîne des
   usages est balayée ensuite. Idempotent : si le bloc est déjà parti, on ne fait rien. */
function preEdit(rel, pairs) {
  let text = read(rel);
  let changed = 0;
  for (const [from, to] of pairs) {
    if (text.includes(from)) { text = text.replace(from, to); changed += 1; }
  }
  if (changed) write(rel, text);
  return changed;
}

preEdit('client/src/admin/admin.css', [
  [`:root {\n${MOVED_ADMIN_DEFS.map(([n, v]) => `  ${n}: ${v};`).join('\n')}\n}\n`,
   '/* P3/T1 — les neuf variables `--admin-*` ne sont plus déclarées ici : les valeurs littérales\n' +
   '   vivent uniquement dans `client/src/design/tokens.css`. Noms et valeurs inchangés (même\n' +
   '   `#fff` court, même noir `#111318`) — `arrival-ingestion.css`, feuille gelée depuis P2.0, et\n' +
   '   `AdminApp.tsx` continuent de les référencer. Le renommage en noms sémantiques est en T2. */\n'],
  ['.mag-agent { --mag-ink:#111318; --mag-purple:#111318; --mag-deep:#050505; --mag-yellow:#ff6900; color:var(--mag-ink); }',
   '/* P3/T1 : la fiche agent prend les tokens du back-office — valeurs identiques, aucun littéral. */\n' +
   '.mag-agent { --mag-ink: var(--admin-purple); --mag-purple: var(--admin-purple); --mag-deep: var(--admin-purple-dark); --mag-yellow: var(--ayrovi-cta); color: var(--mag-ink); }'],
]);
preEdit('client/src/admin/back-office/back-office.css', [
  ['.bo-shell { --bo-accent: #ff6900; }',
   '.bo-shell { --bo-accent: var(--ayrovi-cta); /* accent partagé avec la vitrine (valeur unique) */ }'],
]);

/* --------------------------------------------------------------- sweep */
const toneDefs = new Map();

function tokenFor(literal, declText) {
  const value = canon(literal);
  if (value === '#ffffff') {
    const surface = /^\s*(background|background-color|fill)\s*:/i.test(declText) && !/shadow/i.test(declText);
    if (surface) return ['--admin-card', 'surface'];
    return [SEMANTIC[value][0], 'encre'];
  }
  if (SEMANTIC[value]) return [SEMANTIC[value][0], 'sémantique'];
  if (existing.has(value)) return [existing.get(value), 'token existant'];
  const name = toneFor(value);
  if (!toneDefs.has(name)) toneDefs.set(name, value);
  return [name, 'ton verbatim'];
}

const report = { literalsReplaced: 0, perFile: {}, byKind: {}, tonesCreated: 0, deadIndirectionsCollapsed: 0 };
const outputs = new Map();

for (const rel of SYSTEM_FILES) {
  const text = read(rel);
  const mask = commentMask(text);
  const spans = [];
  for (const m of text.matchAll(new RegExp(LITERAL.source, 'g'))) {
    if (mask[m.index]) continue;
    const decl = declarationOf(text, m.index);
    // Skip the `:root` self-definitions being moved out of this file (handled by hand below).
    if (/^--[a-z0-9-]+\s*:/.test(decl)) continue;
    const [token, kind] = tokenFor(m[0], decl);
    const enclosing = enclosingVar(text, m.index);
    if (enclosing && enclosing.fallback && !definedVars.has(enclosing.name)) {
      spans.push({ start: enclosing.start, end: enclosing.end, text: `var(${token})`, kind: 'indirection morte', literal: m[0] });
      report.deadIndirectionsCollapsed += 1;
    } else {
      spans.push({ start: m.index, end: m.index + m[0].length, text: `var(${token})`, kind, literal: m[0] });
    }
  }
  // Apply right-to-left so offsets stay valid; drop spans swallowed by a wider one.
  spans.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  let cursor = text.length;
  for (const s of spans) {
    if (s.end > cursor) continue;
    out = out.slice(0, s.start) + s.text + out.slice(s.end);
    cursor = s.start;
    report.literalsReplaced += 1;
    report.perFile[rel] = (report.perFile[rel] || 0) + 1;
    report.byKind[s.kind] = (report.byKind[s.kind] || 0) + 1;
  }
  outputs.set(rel, out);
}
report.tonesCreated = toneDefs.size;

if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ ...report, mode: 'check — aucun fichier écrit' }, null, 2));
  process.exit(0);
}

for (const [rel, text] of outputs) write(rel, text);

/* --------------------------------------------------------------- tokens.css */
const lines = [':root {',
  '  /* ─────────────────────────────────────────────────────────────────────────',
  '     Couche back-office (P3/T1). Les valeurs ci-dessous sont les littéraux exacts',
  '     que portaient `admin.css`, `back-office.css` et `interface-studio.css`. Elles',
  '     sont déplacées ici caractère par caractère : aucun rendu ne change. Les neuf',
  '     `--admin-*` gardent leurs noms actuels — `arrival-ingestion.css` (feuille gelée',
  '     depuis P2.0) et `AdminApp.tsx` y font référence ; les renommer en noms sémantiques',
  '     se fera en T2, quand cette feuille rejoindra les primitives.',
  '',
  '     Les `--admin-tone-*` sont une dette MESURÉE, pas une palette : chacune porte la',
  '     valeur littérale qu\u2019elle remplace, pour que T2 consolide la longue traîne des',
  '     teintes en mesurant l\u2019écart. `tests/design-tokens.test.ts` interdit tout',
  '     littéral dans les feuilles du back-office et fait baisser leur nombre de refs.',
  '     ───────────────────────────────────────────────────────────────────────── */'];
for (const [name, value] of MOVED_ADMIN_DEFS) lines.push(`  ${name}:${value}; /* déplacé depuis admin.css — jamais renommé ni retouché */`);
for (const [value, [name, note]] of Object.entries(SEMANTIC)) {
  lines.push(`  ${name}:${value}; /* ${note} */`);
}
const tones = [...toneDefs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
if (tones.length) {
  lines.push('');
  lines.push(`  /* — tons verbatims : ${tones.length} valeurs longue traîne (à absorber en T2) — */`);
  for (const [name, value] of tones) lines.push(`  ${name}:${value};`);
}
/* Tout `@theme inline` est déjà fermé : le bloc back-office est ajouté en fin de fichier, hors
   `@theme`, pour que les tons verbatims ne deviennent pas des utilitaires Tailwind. */
const block = `\n${lines.join('\n')}\n}\n`;
if (!tokensText.trimEnd().endsWith('}')) throw new Error('structure de tokens.css inattendue');
write(TOKENS, `${tokensText.trimEnd()}\n${block}`);
/* Validation : un fichier déséquilibré casse le build Tailwind — on le refuse ici, pas au build. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
for (const rel of [TOKENS, ...SYSTEM_FILES]) {
  const body = strip(read(rel));
  const open = (body.match(/\{/g) || []).length;
  const close = (body.match(/\}/g) || []).length;
  if (open !== close) throw new Error(`${rel}: ${open} « { » contre ${close} « } » — équilibre invalidé, fichiers non livrables`);
}
console.log(JSON.stringify(report, null, 2));
