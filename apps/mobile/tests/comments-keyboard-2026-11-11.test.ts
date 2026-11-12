/**
 * Commentaires & clavier — 2e retour du 11/11/2026 (captures Reels + Facebook).
 *  • Reels : la feuille ne grandit plus à chaque message (hauteur fixe), la
 *    liste rétrécit, le champ reste visible ; son propre commentaire en tête.
 *  (La galerie Publication et sa feuille de commentaires ont été retirées avec
 *   l'ancien fil le 13/11/2026 : la page Publication n'a plus de commentaires.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { anchoredSheetHeight } from '../src/design/keyboardLogic';

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');
const sheet = read('src/design/sheet/AppSheet.tsx');
const reel = read('src/features/social/ReelCommentsModal.tsx');

describe('commentaires : le champ de saisie reste toujours visible', () => {
  it('AppSheet : liste rétrécissable + hauteur fixe optionnelle bornée par le clavier', () => {
    expect(sheet).toContain('scrollWrapBottom: { flexGrow: 0, flexShrink: 1, minHeight: 0 }');
    expect(sheet).toContain('bottomScroll: { flexGrow: 0, flexShrink: 1 }');
    expect(sheet).toContain('anchoredSheetHeight(restFixed, keyboardLift, TYPING_MIN_SHEET,');
  });

  it('Reels : hauteur fixe, son commentaire en tête, « Répondre » ouvre le clavier', () => {
    expect(reel).toContain('export const REEL_COMMENTS_HEIGHT = 0.7;');
    expect(reel).toContain('heightRatio={REEL_COMMENTS_HEIGHT}');
    expect(reel).toContain('setMine((prev) => [id, ...prev.filter((row) => row !== id)]);');
    expect(reel).toContain('list.current?.scrollTo({ y: 0, animated: true })');
    expect(reel).toContain('input.current?.focus();');
  });
});

describe('anchoredSheetHeight — le haut de la feuille ne bouge pas avec le clavier', () => {
  it('sans clavier : la hauteur de repos (bornée par l’espace)', () => {
    expect(anchoredSheetHeight(590, 0, 240, 800)).toBe(590);
    expect(anchoredSheetHeight(590, 0, 240, 500)).toBe(500);
  });
  it('avec clavier : repos − recouvrement → le haut reste au même endroit', () => {
    const rest = 590;
    const height = anchoredSheetHeight(rest, 300, 240, 844 - 300 - 32);
    expect(height).toBe(290);
    // haut = bas du clavier − hauteur = (844 − 300) − 290 = 254 = 844 − 590
    expect(844 - 300 - height).toBe(844 - rest);
  });
  it('clavier très grand : la feuille garde un minimum lisible (seul cas où le haut monte)', () => {
    expect(anchoredSheetHeight(400, 300, 240, 500)).toBe(240);
    // …mais jamais plus que l’espace visible au-dessus du clavier.
    expect(anchoredSheetHeight(400, 700, 240, 120)).toBe(120);
  });
  it('valeurs dégénérées : jamais négatif', () => {
    expect(anchoredSheetHeight(-5, 0, 240, 100)).toBe(0);
    expect(anchoredSheetHeight(100, 50, 240, -10)).toBe(0);
  });
});

describe('clavier : repli sans mesure (12/11)', () => {
  it('suppose la vue posée en bas de la fenêtre quand elle ne peut pas être mesurée', async () => {
    const { fallbackKeyboardOverlap, measuredViewIsUsable } = await import('../src/design/keyboardLogic');
    expect(fallbackKeyboardOverlap(800, 500)).toBe(300);
    expect(fallbackKeyboardOverlap(800, 900)).toBe(0);
    expect(fallbackKeyboardOverlap(800, null)).toBe(0);
    expect(fallbackKeyboardOverlap(0, 400)).toBe(0);
    expect(fallbackKeyboardOverlap(800, -100)).toBe(800);
    expect(measuredViewIsUsable(10, 200)).toBe(true);
    expect(measuredViewIsUsable(10, 0)).toBe(false);
    expect(measuredViewIsUsable(Number.NaN, 200)).toBe(false);
  });
});
