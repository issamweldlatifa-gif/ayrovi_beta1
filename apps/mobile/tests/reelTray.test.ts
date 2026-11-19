/** Product decoding and inline tray defaults; fullscreen geometry is covered in reelRail.test. */
import { describe, expect, it } from 'vitest';

import { reelTrayDefaultOpen, reelTrayIsAvailable, reelTrayLabelKey, reelTrayProducts } from '../src/features/reels/reelTray';

const product = (id: string) => ({ id, name: id });

describe('reelTray — quels articles ?', () => {
  it('réponse ancienne (products absent) : on retombe sur product', () => {
    expect(reelTrayProducts({ product: product('a') }).map((p) => p.id)).toEqual(['a']);
  });

  it('products fourni : c’est lui qui décide, dans l’ordre du serveur', () => {
    const list = reelTrayProducts({ product: product('a'), products: [product('b'), product('c')] });
    expect(list.map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('products vide ⇒ aucun article, même si product traîne encore', () => {
    // Le serveur a dit « aucun article » : on ne le contredit pas avec un reste.
    expect(reelTrayProducts({ product: product('a'), products: [] })).toEqual([]);
  });

  it('déduplique par identifiant (product + products peuvent porter le même)', () => {
    const list = reelTrayProducts({ product: product('a'), products: [product('a'), product('b'), product('a')] });
    expect(list.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('entrées sans identifiant : écartées (jamais de carte sans clé)', () => {
    expect(reelTrayProducts({ products: [{ id: '' }, { id: 'ok' }] }).map((p) => p.id)).toEqual(['ok']);
    expect(reelTrayProducts({ product: null, products: null })).toEqual([]);
  });
});

describe('reelTray — le bouton', () => {
  it('aucun article ⇒ aucun bouton, et le tiroir n’est pas « ouvert »', () => {
    expect(reelTrayIsAvailable({ product: null })).toBe(false);
    expect(reelTrayDefaultOpen({ product: null })).toBe(false);
  });

  it('au moins un article ⇒ bouton présent, tiroir ouvert par défaut', () => {
    expect(reelTrayIsAvailable({ product: product('a') })).toBe(true);
    expect(reelTrayDefaultOpen({ product: product('a') })).toBe(true);
  });

  it('deux états, deux libellés — rien d’autre', () => {
    expect(reelTrayLabelKey(true)).toBe('reel.hideItems');
    expect(reelTrayLabelKey(false)).toBe('reel.viewItems');
  });
});
