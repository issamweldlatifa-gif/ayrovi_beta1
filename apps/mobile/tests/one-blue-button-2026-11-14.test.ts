import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Refonte des interactions (14/11/2026) — règle « UN SEUL bouton plein bleu
 * par écran ». Le Bleu Z (`action`, #0A63F5) est la couleur du CTA principal :
 * ajouter au panier, valider la commande, payer, se connecter. S'il apparaît
 * deux fois, il ne désigne plus rien : ce test l'empêche.
 *
 * Statique et volontairement simple : chaque fichier d'écran ou de composant
 * compte ses `<Button tone="main">` (commentaires retirés). Un fichier ne peut
 * en porter qu'un, sauf exception DOCUMENTÉE ci-dessous où les boutons vivent
 * dans des étapes mutuellement exclusives (un seul visible à la fois).
 */

const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Retire les commentaires `/* … *\/`, `{/* … *\/}` et `// …` (assez pour compter des attributs JSX). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const sources = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))];
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

/**
 * Étapes exclusives : `app/sign-in.tsx` montre UNE étape à la fois (e-mail →
 * mot de passe | inscription | code). Chaque étape a son propre CTA bleu, mais
 * l'écran n'en affiche jamais deux.
 */
const EXCLUSIVE_STEPS: Record<string, number> = {
  'app/sign-in.tsx': 4,
};

describe('un seul bouton plein bleu par écran (14/11)', () => {
  it('chaque fichier porte au plus un <Button tone="main"> (hors étapes exclusives documentées)', () => {
    const offenders: string[] = [];
    let total = 0;
    for (const file of sources) {
      const count = (stripComments(fs.readFileSync(file, 'utf8')).match(/tone=["{]['"]?main['"]?}?/g) ?? []).length;
      total += count;
      const max = EXCLUSIVE_STEPS[rel(file)] ?? 1;
      if (count > max) offenders.push(`${rel(file)} → ${count} boutons bleus (max ${max})`);
    }
    expect(offenders).toEqual([]);
    // Garde-fou : la règle mesure bien quelque chose.
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it('les étapes exclusives de la connexion sont bien conditionnelles', () => {
    const signIn = stripComments(fs.readFileSync(path.join(ROOT, 'app/sign-in.tsx'), 'utf8'));
    // Les étapes sont rendues sous des branches `cond ? (…) : null`.
    expect((signIn.match(/\?\s*\(\s*\n\s*<>/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('les CTA principaux approuvés sont BLEUS (tone="main")', () => {
    const fiche = stripComments(fs.readFileSync(path.join(ROOT, 'src/features/product/ProductFiche.tsx'), 'utf8'));
    const cart = stripComments(fs.readFileSync(path.join(ROOT, 'src/features/shopping/OfficialCartView.tsx'), 'utf8'));
    const checkout = stripComments(fs.readFileSync(path.join(ROOT, 'app/checkout.tsx'), 'utf8'));
    expect(fiche).toMatch(/label=\{label\}\s*tone="main"/);
    expect(cart).toMatch(/label=\{checkoutLabel\}\s*tone="main"/);
    expect(checkout).toMatch(/tone="main"/);
  });

  it('aucun autre élément ne se peint en bleu plein comme un bouton (fond `action` réservé au Button)', () => {
    // Exception : la case « conditions » cochée du paiement (petite coche, pas un bouton).
    const allowed = new Set(['src/design/ui.tsx', 'app/checkout.tsx']);
    const offenders = sources
      .filter((file) => !allowed.has(rel(file)))
      .filter((file) => /backgroundColor:[^,\n]*theme\.colors\.action\b(?!Hover|Soft|Text)/.test(stripComments(fs.readFileSync(file, 'utf8'))))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('les actions destructrices sont ROUGES (tone="danger")', () => {
    const read = (p: string) => stripComments(fs.readFileSync(path.join(ROOT, p), 'utf8'));
    expect(read('app/(tabs)/account.tsx')).toMatch(/label=\{t\('account\.signOut'\)\}\s*tone="danger"/);
    expect(read('app/account/addresses.tsx')).toMatch(/label=\{t\('common\.delete'\)\} tone="danger"/);
    expect(read('src/features/shopping/OfficialCartView.tsx')).toMatch(/label=\{t\('cart\.remove'\)\}\s*tone="danger"/);
    expect(read('src/design/ui.tsx')).toMatch(/const dangerInk = theme\.status\.danger\.fg/);
  });
});
