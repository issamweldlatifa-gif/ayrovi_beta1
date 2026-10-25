/**
 * ZAYROVI — VERROU D'ORDRE DES HOOKS (mobile).
 *
 * ── Pourquoi ce test existe ──────────────────────────────────────────────────
 * Le 25/10/2026, l'application se FERMAIT à chaque ouverture d'une fiche
 * produit. Ce n'était ni le réseau, ni la photo, ni le serveur : dans
 * `app/product/[id].tsx`, un `useCallback` (le bouton Partager) était déclaré
 * APRÈS les retours « chargement / erreur / vide ». Premier rendu : 40 hooks.
 * Deuxième rendu (la donnée arrive) : 41. React lève « Rendered more hooks than
 * during the previous render » et, en production, il n'y a pas d'écran rouge :
 * l'application se ferme.
 *
 * La même faute dormait dans `ErrorBlock` (`src/design/states.tsx`) : elle
 * n'attendait qu'un « réessayer » qui fasse passer l'erreur de « hors ligne » à
 * « serveur » pour planter l'app.
 *
 * ── Ce que ce test vérifie, exactement ───────────────────────────────────────
 * Pour CHAQUE fonction de CHAQUE fichier `.tsx` de l'application :
 *   dès qu'une instruction du corps peut faire un `return` (à n'importe quelle
 *   profondeur, mais sans entrer dans une fonction imbriquée), il est interdit
 *   qu'une instruction SUIVANTE du même corps contienne un appel de hook.
 *
 * C'est la règle réelle de React, pas une approximation par indentation : on
 * lit l'arbre syntaxique (`@babel/parser`), on ne devine pas.
 *
 * ── Ce que ce test ne remplace pas ───────────────────────────────────────────
 * Il ne voit pas les hooks appelés dans une boucle ou un `if` sans `return`.
 * Il vise la faute qui a RÉELLEMENT cassé la version livrée, et il l'attrape
 * avant la construction de l'APK — pas après.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SCOPES = ['app', 'src'];

/** `useState`, `useTheme`, `useQuery`… mais pas `user`, `useful`. */
const HOOK_NAME = /^use[A-Z0-9_]/;

type Node = Record<string, any>;

function walk(node: Node, visit: (node: Node) => void): void {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') walk(child, visit);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

/** Un `return` atteignable depuis cette instruction, sans entrer dans une fonction imbriquée. */
function canReturnEarly(node: Node): boolean {
  if (!node || typeof node.type !== 'string') return false;
  if (node.type === 'ReturnStatement') return true;
  // Le corps d'une fonction imbriquée a son propre compteur de hooks.
  if (/Function/.test(node.type) || node.type === 'ClassBody') return false;
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string' && canReturnEarly(child)) return true;
    } else if (value && typeof value.type === 'string' && canReturnEarly(value)) return true;
  }
  return false;
}

/** L'instruction contient-elle un appel de hook ? */
function hasHookCall(node: Node): boolean {
  let found = false;
  walk(node, (child) => {
    if (found || child.type !== 'CallExpression') return;
    const callee = child.callee;
    const name = callee?.type === 'Identifier'
      ? callee.name
      : (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier' ? callee.property.name : '');
    if (typeof name === 'string' && HOOK_NAME.test(name)) found = true;
  });
  return found;
}

interface Violation {
  file: string;
  returnLine: number;
  hookLine: number;
}

function scanBody(file: string, statements: Node[], out: Violation[]): void {
  let returnLine = 0;
  for (const statement of statements) {
    if (returnLine > 0 && hasHookCall(statement)) {
      out.push({ file, returnLine, hookLine: statement.loc?.start.line ?? 0 });
      continue;
    }
    if (returnLine === 0 && canReturnEarly(statement)) {
      returnLine = statement.loc?.start.line ?? 0;
    }
  }
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const read = (dir: string): void => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) read(rel);
      else if (/\.tsx$/.test(entry.name)) out.push(rel);
    }
  };
  for (const scope of SCOPES) read(scope);
  return out.sort();
}

describe('Ordre des hooks — aucun hook après un `return`', () => {
  it('aucun fichier d’écran ou de composant n’appelle un hook après un retour anticipé', () => {
    const violations: Violation[] = [];

    for (const file of sourceFiles()) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }) as unknown as Node;
      walk(ast, (node) => {
        if (
          node.type === 'FunctionDeclaration'
          || node.type === 'FunctionExpression'
          || node.type === 'ArrowFunctionExpression'
        ) {
          if (node.body?.type === 'BlockStatement') scanBody(file, node.body.body, violations);
        }
      });
    }

    expect(
      violations.map((v) => `${v.file}:${v.hookLine} — hook appelé après un return ligne ${v.returnLine}`),
      'Un hook déclaré après un `return` change le nombre de hooks entre deux rendus : ' +
        'React lève, et en production l’application se ferme. Placer TOUS les hooks ' +
        'avant le premier `return` (voir app/product/[id].tsx).',
    ).toEqual([]);
  });

  it('le garde-fou lit bien l’arbre : il attrape un cas fabriqué', () => {
    // Un test qui ne peut pas échouer ne protège rien : on vérifie le détecteur.
    const ast = parse(
      [
        'function Écran({ prêt }: { prêt: boolean }) {',
        '  if (!prêt) return null;',
        '  const [x] = useState(0);',
        '  return x;',
        '}',
      ].join('\n'),
      { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    ) as unknown as Node;
    const violations: Violation[] = [];
    walk(ast, (node) => {
      if (/Function/.test(node.type) && node.body?.type === 'BlockStatement') {
        scanBody('cas-fabriqué.tsx', node.body.body, violations);
      }
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ returnLine: 2, hookLine: 3 });
  });
});
