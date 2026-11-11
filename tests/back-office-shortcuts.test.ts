/** Raccourcis clavier de la console (11/11) — logique pure. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GO_SEQUENCE_MS, GO_SHORTCUTS, availableGoShortcuts, isTypingTarget, resolveShortcut } from '../client/src/admin/back-office/shortcuts';

const all = new Set(GO_SHORTCUTS.map((entry) => entry.section));

describe('raccourcis de la console', () => {
  it('g puis une lettre ouvre l’écran, dans la fenêtre de temps', () => {
    const armed = resolveShortcut({ key: 'g' }, null, 1000, all);
    expect(armed.action).toEqual({ type: 'arm' });
    expect(resolveShortcut({ key: 'o' }, armed.armedAt, 1500, all).action).toEqual({ type: 'go', section: 'orders' });
    expect(resolveShortcut({ key: 'o' }, armed.armedAt, 1000 + GO_SEQUENCE_MS + 1, all).action).toBeNull();
  });
  it('un écran non permis n’est jamais joignable par raccourci', () => {
    const only = new Set(['dashboard']);
    expect(resolveShortcut({ key: 'u' }, 0, 10, only).action).toBeNull();
    expect(availableGoShortcuts(only).map((entry) => entry.section)).toEqual(['dashboard']);
  });
  it('/ recherche, ? aide, Échap ferme', () => {
    expect(resolveShortcut({ key: '/' }, null, 0, all).action).toEqual({ type: 'search' });
    expect(resolveShortcut({ key: '?' }, null, 0, all).action).toEqual({ type: 'help' });
    expect(resolveShortcut({ key: 'Escape' }, 5, 6, all)).toEqual({ action: { type: 'close' }, armedAt: null });
  });
  it('jamais pendant une saisie ni avec un modificateur', () => {
    expect(isTypingTarget({ tagName: 'input' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(resolveShortcut({ key: 'g', target: { tagName: 'TEXTAREA' } }, null, 0, all).action).toBeNull();
    expect(resolveShortcut({ key: '/', ctrlKey: true }, null, 0, all).action).toBeNull();
  });
  it('chaque lettre est unique et chaque écran existe dans le registre serveur', () => {
    expect(new Set(GO_SHORTCUTS.map((entry) => entry.key)).size).toBe(GO_SHORTCUTS.length);
    const registry = readFileSync('src/back-office/resources.ts', 'utf8');
    for (const entry of GO_SHORTCUTS) expect(registry).toContain(`section: '${entry.section}'`);
  });
  it('la coquille branche les raccourcis et la carte d’aide', () => {
    const shell = readFileSync('client/src/admin/back-office/BackOfficeShell.tsx', 'utf8');
    expect(shell).toContain('resolveShortcut(');
    expect(shell).toContain('aria-label="Raccourcis clavier"');
  });
});
