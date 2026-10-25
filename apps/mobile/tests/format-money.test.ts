/**
 * ZAYROVI — VERROU DE FORMAT DES MONTANTS.
 *
 * Audit du 25/10/2026 : 44 `toFixed(2)` dans 18 fichiers et DEUX devises à
 * l'écran (`TND` dans la fiche/le panier/le paiement, `DT` dans les commandes
 * et les favoris). Un même montant s'écrivait donc de deux façons selon
 * l'écran. Ce test fixe le format et interdit le retour des variantes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURRENCY, formatAmount, formatMoney } from '../src/format/money';

const ROOT = path.resolve(__dirname, '..');

describe('formatMoney — un montant, une écriture', () => {
  it('écrit deux décimales et la devise unique', () => {
    expect(CURRENCY).toBe('TND');
    expect(formatAmount(89)).toBe('89.00');
    expect(formatAmount(89.5)).toBe('89.50');
    expect(formatAmount(0)).toBe('0.00');
    expect(formatMoney(89)).toBe('89.00 TND');
    expect(formatMoney(1234.567)).toBe('1234.57 TND');
  });

  it('n’invente pas un prix quand la valeur manque', () => {
    // Afficher « 0.00 TND » pour une donnée absente serait un prix inventé.
    expect(formatMoney(null)).toBe('');
    expect(formatMoney(undefined)).toBe('');
    expect(formatMoney(Number.NaN)).toBe('');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('');
  });
});

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

describe('Aucun écran ne reformate un montant lui-même', () => {
  it('plus aucun `toFixed(2)` hors du module de format', () => {
    /**
     * Seule exception : `LoadingScreen` calcule un chemin SVG (`A rx ry …`).
     * Ce n'est pas un montant — c'est de la géométrie, et elle est justifiée ici.
     */
    const ALLOWED = new Set(['src/format/money.ts', 'src/design/LoadingScreen.tsx']);
    const offenders: string[] = [];
    for (const rel of [...sources('app'), ...sources('src')]) {
      if (ALLOWED.has(rel)) continue;
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const match of text.matchAll(/\.toFixed\(2\)/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders, 'Utiliser `formatMoney` (devise comprise) ou `formatAmount` de src/format/money.ts.').toEqual([]);
  });

  it('la devise ne s’écrit plus « DT » dans les textes traduits', () => {
    const offenders: string[] = [];
    for (const lang of ['fr', 'ar']) {
      const rel = `src/i18n/${lang}.ts`;
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const match of text.matchAll(/\((DT)\)|\bDT\b/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → ${match[0]}`);
      }
    }
    expect(offenders, 'La devise est `TND` partout (voir CURRENCY).').toEqual([]);
  });
});
