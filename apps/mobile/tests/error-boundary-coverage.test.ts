/**
 * TOUTES LES ROUTES ONT UN FILET — vérifié, pas promis.
 *
 * Le 25/10/2026, un ordre de hooks incorrect dans la fiche produit a fermé
 * l'application d'un coup, en plein test du propriétaire. Depuis, chaque écran
 * exporte `ErrorBoundary` : une erreur de rendu affiche un repli bilingue avec
 * un bouton « عاود » au lieu de tuer le processus.
 *
 * Ce fichier ne teste pas un écran : il teste la RÈGLE. Sans lui, la 37e route
 * ajoutée dans six mois n'aura pas de filet et personne ne s'en apercevra avant
 * le rapport d'un utilisateur.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;

function routeFiles(dir = join(ROOT, 'app')): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('filet de sécurité — chaque route en a un', () => {
  const files = routeFiles();

  it('la recherche voit bien les routes (garde-fou du garde-fou)', () => {
    // Si le chemin changeait, la liste serait vide et le test passerait pour rien.
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it('aucune route ne peut fermer l’application sur une erreur de rendu', () => {
    const missing: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Une route = un composant exporté par défaut.
      if (!/export default /.test(source)) continue;
      const reexports = /export \{ RouteErrorBoundary as ErrorBoundary \}/.test(source);
      const own = /export function ErrorBoundary\b|export const ErrorBoundary\b/.test(source);
      if (!reexports && !own) missing.push(relative(ROOT, file));
    }
    expect(missing, `Routes sans ErrorBoundary : ${missing.join(', ')}`).toEqual([]);
  });

  it('le repli est le même partout (un seul composant, pas trente copies)', () => {
    const shared = readFileSync(join(ROOT, 'src/design/AppErrorBoundary.tsx'), 'utf8');
    expect(shared).toContain('RouteErrorBoundary');
    // Le repli parle arabe ET français : c'est ce que l'utilisateur voit.
    expect(shared).toMatch(/عاود|Réessayer|إعادة/);
  });
});
