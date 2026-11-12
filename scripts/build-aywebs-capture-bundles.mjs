#!/usr/bin/env node
/**
 * AYWEBs — LOTS DE CAPTURE SPÉCIALISÉS PAR BOUTIQUE (12/11/2026).
 *
 * Problème : le cœur partagé (`AYWEBS_CAPTURE_SCRIPT`, ~6 900 lignes) contient
 * dans la MÊME fermeture le code de SHEIN, TEMU, AliExpress et Amazon à côté du
 * code commun. Toute retouche « SHEIN » était servie aussi à Sephora, Primark et
 * aux boutiques génériques — et pouvait les casser.
 *
 * Solution : chaque boutique reçoit un LOT tiré du cœur, où les drapeaux des
 * AUTRES boutiques sont des constantes `false` — leur code devient mort et il est
 * retiré mécaniquement :
 *
 *   1. drapeaux de boutique (`IS_SHEIN`, `IS_TEMU`…) remplacés par `false`
 *      (déclaration unique et jamais réaffectée, sinon le générateur refuse) ;
 *   2. pliage des constantes par esbuild (`minifySyntax`, cible ES5, AUCUN
 *      renommage) : `if (false) {…}`, `false && x`, `x || false`… disparaissent ;
 *   3. les booléens littéraux devenus constants (`AMAZON_STRICT = false`) sont
 *      repliés à leur tour, jusqu'au point fixe ;
 *   4. suppression des déclarations de premier niveau qui ne sont PLUS
 *      référencées NULLE PART (fonctions, `var` à initialisation pure) —
 *      jusqu'au point fixe. Une référence restante, même dans une branche morte,
 *      garde la déclaration : on ne peut pas créer de ReferenceError.
 *
 * Le cœur complet reste servi tel quel aux appels sans boutique (compatibilité).
 *
 *   node scripts/build-aywebs-capture-bundles.mjs          → régénère
 *   node scripts/build-aywebs-capture-bundles.mjs --check  → échoue si périmé
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GENERATED_PATH = path.join(ROOT, 'src/aywebs/captureBundles.generated.ts');

/**
 * Drapeaux de boutique du cœur. Un lot = la liste des drapeaux FIXÉS à `false`.
 * `IS_SHOPIFY` : détection de plateforme à l'exécution ; inutile (et retirée)
 * dans les lots des places de marché qui ne tournent pas sur Shopify.
 */
const STORE_FLAGS = ['IS_AMAZON', 'IS_SHEIN', 'IS_TEMU', 'IS_ALIEXPRESS', 'IS_ZALANDO'];
export const AYWEBS_CAPTURE_BUNDLE_FLAGS = {
  kernel: [...STORE_FLAGS],
  shein: STORE_FLAGS.filter((flag) => flag !== 'IS_SHEIN').concat('IS_SHOPIFY'),
  temu: STORE_FLAGS.filter((flag) => flag !== 'IS_TEMU').concat('IS_SHOPIFY'),
  aliexpress: STORE_FLAGS.filter((flag) => flag !== 'IS_ALIEXPRESS').concat('IS_SHOPIFY'),
};

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Lit le cœur depuis la source TypeScript, sans dépendre du fichier généré. */
export async function loadAyWebsCaptureCore() {
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/aywebs/captureScript.ts')],
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    plugins: [{
      name: 'stub-generated-bundles',
      setup(build) {
        build.onResolve({ filter: /captureBundles\.generated$/ }, () => ({ path: 'generated', namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export const AYWEBS_CAPTURE_BUNDLES = {}; export const AYWEBS_CAPTURE_BUNDLE_SOURCE_SHA256 = "";',
          loader: 'js',
        }));
      },
    }],
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  if (typeof mod.AYWEBS_CAPTURE_SCRIPT !== 'string' || !mod.AYWEBS_CAPTURE_SCRIPT) throw new Error('AYWEBS_CAPTURE_SCRIPT introuvable');
  return mod.AYWEBS_CAPTURE_SCRIPT;
}

function parse(code) {
  return ts.createSourceFile('capture.js', code, ts.ScriptTarget.ES5, true, ts.ScriptKind.JS);
}

function iifeBody(sf) {
  const first = sf.statements[0];
  if (!first || !ts.isExpressionStatement(first)) throw new Error('Le cœur doit être une IIFE');
  let call = first.expression;
  while (ts.isParenthesizedExpression(call)) call = call.expression;
  if (!ts.isCallExpression(call)) throw new Error('Le cœur doit être une IIFE');
  let callee = call.expression;
  while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
  if (!ts.isFunctionExpression(callee)) throw new Error('Le cœur doit être une IIFE');
  return callee.body.statements;
}

/** Identifiant en position de RÉFÉRENCE (pas un nom de propriété ni de clé). */
function isReference(node) {
  const parent = node.parent;
  if (!parent) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return false;
  if (ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) return false;
  return true;
}

function visit(node, fn) { fn(node); ts.forEachChild(node, (child) => visit(child, fn)); }

/** Remplace les références à des constantes booléennes par leur littéral. */
function inlineConstants(code, constants) {
  const sf = parse(code);
  const edits = [];
  const declarations = new Map();
  visit(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && constants.has(node.name.text)) {
      const name = node.name.text;
      declarations.set(name, (declarations.get(name) || 0) + 1);
      if (node.initializer) edits.push({ start: node.initializer.getStart(sf), end: node.initializer.end, text: String(constants.get(name)) });
      else edits.push({ start: node.name.end, end: node.name.end, text: ` = ${constants.get(name)}` });
      return;
    }
    if (!ts.isIdentifier(node) || !constants.has(node.text) || !isReference(node)) return;
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && parent.name === node) return;
    if (ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      throw new Error(`Drapeau réaffecté : ${node.text} — impossible de le fixer sans changer le comportement`);
    }
    if (isIncrement(parent)) {
      throw new Error(`Drapeau modifié : ${node.text}`);
    }
    edits.push({ start: node.getStart(sf), end: node.end, text: `(${constants.get(node.text)})` });
  });
  for (const [name, count] of declarations) if (count !== 1) throw new Error(`Drapeau déclaré ${count} fois : ${name}`);
  edits.sort((a, b) => b.start - a.start);
  let out = code;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}

function fold(code) {
  return esbuild.transformSync(code, {
    loader: 'js', target: 'es5', minifySyntax: true, minifyWhitespace: false, minifyIdentifiers: false,
    legalComments: 'none', charset: 'ascii',
  }).code;
}

const isIncrement = (node) => (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
  && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken);

/**
 * `var NAME = true|false|null|""|void 0` (ou sans initialiseur) déclaré UNE fois
 * et jamais réaffecté → constante à replier. Ce sont les restes typiques d'une
 * boutique retirée (`SHEIN_STATE = null` n'était rempli que par le code SHEIN).
 */
function literalBooleanVars(code) {
  const sf = parse(code);
  const declared = new Map();
  const assigned = new Set();
  visit(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      const value = constantLiteral(node);
      declared.set(name, declared.has(name) ? undefined : value);
    }
    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) assigned.add(node.left.text);
    if (isIncrement(node) && ts.isIdentifier(node.operand)) assigned.add(node.operand.text);
    // for (var k in o) : affectation implicite.
    if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && ts.isVariableDeclarationList(node.initializer)) {
      for (const d of node.initializer.declarations) if (ts.isIdentifier(d.name)) assigned.add(d.name.text);
    }
    if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && ts.isIdentifier(node.initializer)) assigned.add(node.initializer.text);
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) declared.set(node.name.text, undefined);
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) declared.set(node.name.text, undefined);
    if (ts.isCatchClause(node) && node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)) declared.set(node.variableDeclaration.name.text, undefined);
  });
  const constants = new Map();
  for (const [name, value] of declared) if (value !== undefined && !assigned.has(name)) constants.set(name, value);
  return constants;
}

/** Texte JS de la constante d'une déclaration, ou `undefined` si ce n'en est pas une. */
function constantLiteral(declaration) {
  const init = declaration.initializer;
  if (!init) return 'void 0';
  const bool = booleanLiteral(init);
  if (bool !== undefined) return String(bool);
  if (init.kind === ts.SyntaxKind.NullKeyword) return 'null';
  if (ts.isStringLiteral(init) && init.text === '') return '""';
  if (ts.isVoidExpression(init) && ts.isNumericLiteral(init.expression)) return 'void 0';
  return undefined;
}

/** Condition littéralement fausse telle qu'imprimée par esbuild. */
function isFalsyLiteral(node) {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  if (ts.isNumericLiteral(node)) return Number(node.text) === 0;
  if (node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isStringLiteral(node)) return node.text === '';
  if (ts.isVoidExpression(node)) return true;
  return booleanLiteral(node) === false;
}

/**
 * esbuild garde le corps des `if (0) {…}` pour préserver le hissage des `var`
 * qu'il déclare. On remplace le bloc mort par ces seules déclarations
 * (`var a, b;`) : hissage identique, zéro code mort. Un bloc mort qui contient
 * une déclaration de FONCTION est laissé tel quel (sémantique de bloc ambiguë).
 */
function removeDeadHoists(code) {
  const sf = parse(code);
  const edits = [];
  visit(sf, (node) => {
    if (!ts.isIfStatement(node) || node.elseStatement || !isFalsyLiteral(node.expression)) return;
    if (edits.some((e) => node.getStart(sf) >= e.start && node.end <= e.end)) return;
    const names = [];
    let hasFunctionDeclaration = false;
    const walk = (inner) => {
      if (ts.isFunctionDeclaration(inner)) { hasFunctionDeclaration = true; return; }
      if (ts.isFunctionExpression(inner)) return; // portée propre : ses var ne remontent pas
      if (ts.isVariableDeclaration(inner) && ts.isIdentifier(inner.name) && !names.includes(inner.name.text)) names.push(inner.name.text);
      ts.forEachChild(inner, walk);
    };
    walk(node.thenStatement);
    if (hasFunctionDeclaration) return;
    const replacement = names.length ? `var ${names.join(', ')};` : (ts.isBlock(node.parent) || ts.isSourceFile(node.parent) || ts.isCaseClause(node.parent) || ts.isDefaultClause(node.parent) ? '' : ';');
    if (node.getText(sf) === replacement) return;
    edits.push({ start: node.getStart(sf), end: node.end, text: replacement });
  });
  if (!edits.length) return { code, removed: 0 };
  let out = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return { code: out, removed: edits.length };
}

/** `true` / `false` / `!0` / `!1` (forme imprimée par esbuild) → booléen, sinon `undefined`. */
function booleanLiteral(node) {
  if (!node) return undefined;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken && ts.isNumericLiteral(node.operand)) {
    if (node.operand.text === '0') return true;
    if (node.operand.text === '1') return false;
  }
  return undefined;
}

/** Initialiseur sans effet de bord : le retirer ne change rien d'observable. */
function isPure(node) {
  if (!node) return true;
  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral: case ts.SyntaxKind.NumericLiteral: case ts.SyntaxKind.RegularExpressionLiteral:
    case ts.SyntaxKind.TrueKeyword: case ts.SyntaxKind.FalseKeyword: case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral: case ts.SyntaxKind.FunctionExpression:
      return true;
    case ts.SyntaxKind.Identifier: return node.text === 'undefined';
    case ts.SyntaxKind.VoidExpression: return isPure(node.expression);
    case ts.SyntaxKind.ParenthesizedExpression: return isPure(node.expression);
    case ts.SyntaxKind.PrefixUnaryExpression: return !isIncrement(node) && isPure(node.operand);
    case ts.SyntaxKind.BinaryExpression:
      return (node.operatorToken.kind < ts.SyntaxKind.FirstAssignment || node.operatorToken.kind > ts.SyntaxKind.LastAssignment)
        && isPure(node.left) && isPure(node.right);
    case ts.SyntaxKind.ArrayLiteralExpression: return node.elements.every(isPure);
    case ts.SyntaxKind.ObjectLiteralExpression:
      return node.properties.every((p) => ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name) && isPure(p.initializer));
    case ts.SyntaxKind.NewExpression:
      return ts.isIdentifier(node.expression) && node.expression.text === 'RegExp' && (node.arguments || []).every((a) => ts.isStringLiteral(a));
    default: return false;
  }
}

/**
 * Retire les déclarations de premier niveau que plus RIEN ne référence (le
 * comptage est par nom sur tout le lot : un homonyme local garde la
 * déclaration — prudence, jamais de ReferenceError).
 */
function removeUnreferenced(code) {
  const sf = parse(code);
  const counts = new Map();
  visit(sf, (node) => {
    if (!ts.isIdentifier(node) || !isReference(node)) return;
    const parent = node.parent;
    if ((ts.isFunctionDeclaration(parent) || ts.isVariableDeclaration(parent)) && parent.name === node) return;
    counts.set(node.text, (counts.get(node.text) || 0) + 1);
  });
  const edits = [];
  let removed = 0;
  for (const statement of iifeBody(sf)) {
    if (ts.isFunctionDeclaration(statement) && statement.name && !counts.get(statement.name.text)) {
      edits.push({ start: statement.getFullStart(), end: statement.end, text: '' });
      removed++;
    } else if (ts.isVariableStatement(statement)) {
      const all = statement.declarationList.declarations;
      const kept = all.filter((d) => !(ts.isIdentifier(d.name) && !counts.get(d.name.text) && isPure(d.initializer)));
      if (kept.length === all.length) continue;
      removed += all.length - kept.length;
      // Les initialiseurs gardés restent dans l'ordre d'origine : aucun effet déplacé.
      const text = kept.length ? `var ${kept.map((d) => d.getText(sf)).join(', ')};` : '';
      edits.push({ start: statement.getStart(sf), end: statement.end, text });
    }
  }
  if (!removed) return { code, removed: 0 };
  let out = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return { code: out, removed };
}

/** Lot spécialisé : drapeaux fixés, code mort plié puis retiré. Déterministe. */
export function specializeAyWebsCaptureCore(core, falseFlags) {
  let code = inlineConstants(core, new Map(falseFlags.map((flag) => [flag, false])));
  code = fold(code);
  for (let round = 0; round < 40; round++) {
    const constants = literalBooleanVars(code);
    let changed = false;
    if (constants.size) {
      const next = fold(inlineConstants(code, constants));
      if (next !== code) { code = next; changed = true; }
    }
    const dead = removeDeadHoists(code);
    if (dead.removed) { code = fold(dead.code); changed = true; }
    const pruned = removeUnreferenced(code);
    if (pruned.removed) { code = fold(pruned.code); changed = true; }
    if (!changed) break;
  }
  code = code.trim().replace(/;+$/, '');
  if (code.includes('`')) throw new Error('Le lot contient un accent grave : contrat ES5 du pont rompu');
  const check = parse(code);
  if (check.parseDiagnostics?.length) throw new Error(`Lot invalide : ${check.parseDiagnostics[0].messageText}`);
  return code;
}

export async function buildAyWebsCaptureBundles() {
  const core = await loadAyWebsCaptureCore();
  const bundles = {};
  for (const [id, flags] of Object.entries(AYWEBS_CAPTURE_BUNDLE_FLAGS)) {
    const text = specializeAyWebsCaptureCore(core, flags);
    bundles[id] = { sha256: sha256(text), bytes: Buffer.byteLength(text), falseFlags: flags, text };
  }
  return { sourceSha256: sha256(core), esbuild: esbuild.version, coreBytes: Buffer.byteLength(core), bundles };
}

export function renderGeneratedModule(result) {
  const lines = [
    '/* eslint-disable */',
    '// GÉNÉRÉ par scripts/build-aywebs-capture-bundles.mjs — NE PAS MODIFIER À LA MAIN.',
    '// Régénérer : npm run aywebs:bundles (vérifié en CI : npm run aywebs:bundles:check).',
    `// Cœur : ${result.coreBytes} octets · esbuild ${result.esbuild}`,
    '',
    'export type AyWebsCaptureBundleId = ' + Object.keys(result.bundles).map((id) => `'${id}'`).join(' | ') + ';',
    '',
    'export interface AyWebsCaptureBundle { readonly sha256: string; readonly bytes: number; readonly falseFlags: readonly string[]; readonly text: string }',
    '',
    `export const AYWEBS_CAPTURE_BUNDLE_SOURCE_SHA256 = ${JSON.stringify(result.sourceSha256)};`,
    '',
    'export const AYWEBS_CAPTURE_BUNDLES: Readonly<Record<AyWebsCaptureBundleId, AyWebsCaptureBundle>> = {',
  ];
  for (const [id, bundle] of Object.entries(result.bundles)) {
    lines.push(`  ${id}: {`);
    lines.push(`    sha256: ${JSON.stringify(bundle.sha256)},`);
    lines.push(`    bytes: ${bundle.bytes},`);
    lines.push(`    falseFlags: ${JSON.stringify(bundle.falseFlags)},`);
    lines.push(`    text: ${JSON.stringify(bundle.text)},`);
    lines.push('  },');
  }
  lines.push('};', '');
  return lines.join('\n');
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const result = await buildAyWebsCaptureBundles();
  const rendered = renderGeneratedModule(result);
  const summary = Object.entries(result.bundles).map(([id, b]) => `${id} ${Math.round(b.bytes / 1024)} Ko`).join(' · ');
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(GENERATED_PATH) ? fs.readFileSync(GENERATED_PATH, 'utf8') : '';
    if (current !== rendered) {
      console.error('Lots de capture AYWEBs périmés : lancez npm run aywebs:bundles');
      process.exit(1);
    }
    console.log(`Lots de capture AYWEBs à jour (cœur ${Math.round(result.coreBytes / 1024)} Ko → ${summary}).`);
  } else {
    fs.writeFileSync(GENERATED_PATH, rendered);
    console.log(`Lots de capture AYWEBs générés (cœur ${Math.round(result.coreBytes / 1024)} Ko → ${summary}).`);
  }
}
