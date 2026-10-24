/**
 * Tiroir « articles » d'un Reel — règles pures (24/10/2026).
 *
 * Ce que ces tests protègent :
 *  • un Reel sans article n'affiche AUCUN bouton (pas de porte qui n'ouvre rien) ;
 *  • `products` gagne sur `product` — une liste reste une liste, dédupliquée ;
 *  • une réponse ancienne (`products` absent) retombe sur `product` : aucune
 *    régression pour les contenus déjà en ligne ;
 *  • le bouton a deux états et deux seulement, et la géométrie ne saute pas.
 */
import { describe, expect, it } from 'vitest';

import {
  REEL_TRAY,
  reelTrayContentBottom,
  reelTrayDefaultOpen,
  reelTrayIsAvailable,
  reelTrayLabelKey,
  reelTrayOffset,
  reelTrayProducts,
} from '../src/features/reels/reelTray';

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

describe('reelTray — géométrie', () => {
  it('fermé : le tiroir est entièrement sous l’écran ; ouvert : à sa place', () => {
    expect(reelTrayOffset(true)).toBe(0);
    expect(reelTrayOffset(false)).toBe(REEL_TRAY.height);
    // Avec une zone sûre (encoche gestuelle), le tiroir fermé descend d'autant.
    expect(reelTrayOffset(false, REEL_TRAY.height, 24)).toBe(REEL_TRAY.height + 24);
  });

  it('le bouton et la légende montent quand le tiroir sort, sans se chevaucher', () => {
    const inset = 20;
    const pillOpen = reelTrayContentBottom(true, 'pill', REEL_TRAY.height, inset);
    const pillClosed = reelTrayContentBottom(false, 'pill', REEL_TRAY.height, inset);
    expect(pillOpen).toBeGreaterThan(pillClosed);
    // Le bouton est au-dessus du bord haut du tiroir ouvert.
    expect(pillOpen).toBeGreaterThan(REEL_TRAY.height + inset);

    const captionOpen = reelTrayContentBottom(true, 'caption', REEL_TRAY.height, inset);
    const captionClosed = reelTrayContentBottom(false, 'caption', REEL_TRAY.height, inset);
    expect(captionOpen).toBeGreaterThan(captionClosed);
    // La légende ne passe jamais sous le bouton.
    expect(captionOpen).toBeGreaterThan(pillOpen);
  });

  it('les cotes du tiroir tiennent dans les 844 px de référence (≤ 30 %)', () => {
    expect(REEL_TRAY.height).toBeLessThanOrEqual(Math.round(844 * 0.3));
    expect(REEL_TRAY.pillHeight).toBeGreaterThanOrEqual(44); // cible tactile
  });
});
