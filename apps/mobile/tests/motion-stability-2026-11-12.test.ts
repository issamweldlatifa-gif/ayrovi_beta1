/**
 * Mouvements stables (12/11/2026) : la barre d'onglets qui se replie sans
 * clignoter, et le fond du Hero qui suit le doigt.
 */
import { describe, expect, it } from 'vitest';
import { CHROME_TOP_ZONE, CHROME_TRAVEL, nextChromeTravel, type ChromeTravelState } from '../src/design/chromeLogic';
import { backdropProgressRange, carouselGeometry, scrollOffsetForIndex } from '../src/features/home/heroCarouselLogic';

const run = (ys: number[], options?: { maxY?: number }, start: ChromeTravelState = { hidden: false, anchor: 0 }) =>
  ys.reduce<ChromeTravelState[]>((states, y) => [...states, nextChromeTravel(states[states.length - 1] ?? start, y, options)], []);

describe('barre d’onglets — course cumulée (hystérésis)', () => {
  it('un défilement LENT (3 pt par événement) finit par replier la barre', () => {
    // L'ancien test par écart (8 pt entre deux événements) ne repliait jamais.
    const ys = Array.from({ length: 30 }, (_, index) => 100 + index * 3);
    expect(run(ys).at(-1)?.hidden).toBe(true);
  });

  it('un doigt qui hésite (±10 pt) ne fait jamais clignoter la barre', () => {
    const ys = [200, 210, 200, 212, 202, 214, 204, 216, 206];
    const states = run(ys, undefined, { hidden: false, anchor: 200 });
    expect(states.every((state) => !state.hidden)).toBe(true);
    const hiddenStates = run(ys.map((y) => y + 100), undefined, { hidden: true, anchor: 316 });
    expect(hiddenStates.every((state) => state.hidden)).toBe(true);
  });

  it('il faut remonter de plus de CHROME_TRAVEL depuis le point le plus bas pour la faire revenir', () => {
    let state: ChromeTravelState = { hidden: true, anchor: 500 };
    state = nextChromeTravel(state, 600); // descend encore : l'ancre suit
    expect(state).toEqual({ hidden: true, anchor: 600 });
    state = nextChromeTravel(state, 600 - CHROME_TRAVEL);
    expect(state.hidden).toBe(true);
    state = nextChromeTravel(state, 600 - CHROME_TRAVEL - 1);
    expect(state.hidden).toBe(false);
  });

  it('en haut de page (et pendant le rebond au-dessus de 0) : toujours visible', () => {
    expect(nextChromeTravel({ hidden: true, anchor: 900 }, CHROME_TOP_ZONE).hidden).toBe(false);
    expect(nextChromeTravel({ hidden: true, anchor: 900 }, -30)).toEqual({ hidden: false, anchor: 0 });
  });

  it('rebond du BAS : le retour élastique n’est pas lu comme une remontée', () => {
    const maxY = 1000;
    const states = run([980, 1000, 1040, 1060, 1020, 1000], { maxY }, { hidden: true, anchor: 980 });
    expect(states.every((state) => state.hidden)).toBe(true);
  });

  it('valeur invalide : état inchangé', () => {
    const state = { hidden: true, anchor: 300 };
    expect(nextChromeTravel(state, Number.NaN)).toBe(state);
  });
});

describe('Hero — avancement « en cartes » lu sur le défilement', () => {
  const { stride, centeringOffset, maxScroll } = carouselGeometry(390, 4);

  it('chaque arrêt du carrousel correspond exactement à l’index de sa carte', () => {
    const range = backdropProgressRange(4, stride, centeringOffset, maxScroll)!;
    for (let index = 0; index < 4; index += 1) {
      const offset = scrollOffsetForIndex(index, stride, false, centeringOffset, maxScroll);
      const at = range.inputRange.lastIndexOf(offset);
      expect(range.outputRange[at]).toBe(index);
    }
  });

  it('plage croissante et MIROIR (offset négatif d’une liste inversée ⇒ mêmes index)', () => {
    const range = backdropProgressRange(4, stride, centeringOffset, maxScroll)!;
    for (let index = 1; index < range.inputRange.length; index += 1) {
      expect(range.inputRange[index]).toBeGreaterThan(range.inputRange[index - 1]);
    }
    const middle = range.inputRange.indexOf(0);
    expect(range.outputRange[middle]).toBe(0);
    expect(range.outputRange.slice(0, middle).reverse()).toEqual(range.outputRange.slice(middle + 1));
  });

  it('fin bornée par maxScroll : si deux arrêts se confondent, la dernière carte l’emporte', () => {
    const range = backdropProgressRange(3, 100, 0, 150)!;
    expect(range.inputRange).toEqual([-150, -100, 0, 100, 150]);
    expect(range.outputRange).toEqual([2, 1, 0, 1, 2]);
    const clamped = backdropProgressRange(3, 100, 0, 100)!;
    expect(clamped.outputRange.at(-1)).toBe(2);
  });

  it('moins de deux cartes ou pas de pas : rien à animer (null, jamais une plage à un point)', () => {
    expect(backdropProgressRange(1, stride, centeringOffset, maxScroll)).toBeNull();
    expect(backdropProgressRange(4, 0)).toBeNull();
    expect(backdropProgressRange(3, 100, 0, 0)).toBeNull();
  });
});
