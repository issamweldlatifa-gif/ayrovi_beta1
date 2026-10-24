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
  reelTrayPillBottom,
  reelTrayProducts,
  reelTrayRailBottom,
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

  it('la carte ne touche ni le bord ni le bas : 12 de marge, 16 sous elle', () => {
    expect(REEL_TRAY.padding).toBe(12);
    expect(REEL_TRAY.cardBottom).toBe(16);
    expect(REEL_TRAY.cardGap).toBe(12);
    // Course fermée = hauteur de carte + le vide sous elle (elle sort de l'écran).
    expect(REEL_TRAY.height).toBe(137 + REEL_TRAY.cardBottom);
  });

  it('le rail est accroché à la pastille : il descend avec elle', () => {
    const inset = 16;
    // L'icône du bas (commentaire) est centrée sur la pastille ouverte.
    const pillOpen = reelTrayPillBottom(true, inset);
    const railOpen = reelTrayRailBottom(true, 0, inset);
    expect(railOpen + REEL_TRAY.railHit / 2).toBeCloseTo(pillOpen + REEL_TRAY.pillHeight / 2, 5);
    // Les icônes montent de 56 px l'une après l'autre.
    expect(reelTrayRailBottom(true, 1, inset) - railOpen).toBe(REEL_TRAY.railGap);
    expect(reelTrayRailBottom(true, 2, inset) - railOpen).toBe(2 * REEL_TRAY.railGap);
    // Fermé : pastille et rail descendent ensemble, du même écart.
    const railClosed = reelTrayRailBottom(false, 0, inset);
    expect(railClosed).toBeLessThan(railOpen);
    expect(railOpen - railClosed).toBeCloseTo(pillOpen - reelTrayPillBottom(false, inset), 5);
  });
});
