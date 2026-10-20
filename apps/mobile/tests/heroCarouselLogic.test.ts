/**
 * Carrousel Hero — logique pure : géométrie centrée, index, arrêt sur la dernière carte.
 */
import { describe, expect, it } from 'vitest';
import {
  backdropLayerRange, CARD_GAP, CARD_MAX_WIDTH, CARD_MIN_WIDTH, carouselGeometry, indexForOffset,
  isStillAfterDrag, nextIndex, scrollOffsetForIndex, shouldAutoplayAdvance,
} from '../src/features/home/heroCarouselLogic';

describe('carouselGeometry — dimensions selon l’écran', () => {
  it.each([360, 390, 412, 430])('téléphone %i px : carte = 76 %, alignée sur la marge', (screen) => {
    const g = carouselGeometry(screen, 16);
    expect(g.cardWidth).toBe(Math.round(screen * 0.76));
    expect(g.sideInset).toBe(16);
    expect(g.stride).toBe(g.cardWidth + CARD_GAP);
    // La voisine de droite reste visible.
    expect(screen - g.sideInset - g.cardWidth).toBeGreaterThan(0);
  });

  it('tablette : la carte est plafonnée', () => {
    const g = carouselGeometry(1024, 24);
    expect(g.cardWidth).toBe(CARD_MAX_WIDTH);
    expect(g.sideInset).toBe(24);
  });

  it('très petit écran : la carte tient entre les deux marges', () => {
    const g = carouselGeometry(200, 16);
    expect(g.cardWidth).toBeLessThanOrEqual(200 - 2 * 16);
    expect(g.cardWidth).toBeGreaterThanOrEqual(0);
    expect(CARD_MIN_WIDTH).toBeGreaterThan(200); // le plancher seul ne suffirait pas ici
  });

  it('largeur de carte toujours entière (pas de flou de pixel)', () => {
    expect(Number.isInteger(carouselGeometry(390, 16).cardWidth)).toBe(true);
  });

  it('sans marge fournie : départ à 0', () => {
    expect(carouselGeometry(390).sideInset).toBe(0);
  });
});

describe('alignement sur les bords — début ET fin', () => {
  // Décalage maximal du défilement = contenu − écran. Le contenu = marge + cartes + espaces + marge.
  const contentWidth = (count: number, g: ReturnType<typeof carouselGeometry>) =>
    2 * g.sideInset + count * g.cardWidth + (count - 1) * CARD_GAP;

  it.each([[360, 2], [360, 4], [390, 3], [430, 6]])(
    'écran %i, %i cartes : la 1re commence à la marge, la dernière finit à la marge droite',
    (screen, count) => {
      const inset = 16;
      const g = carouselGeometry(screen, inset);
      const maxScroll = contentWidth(count, g) - screen;
      expect(maxScroll).toBeGreaterThan(0);
      // Début : à défilement 0, la 1re carte commence à la marge.
      expect(g.sideInset).toBe(inset);
      // Fin : au défilement maximal, la dernière carte finit à screen − marge.
      const lastLeftInContent = g.sideInset + (count - 1) * g.stride;
      const lastRightOnScreen = lastLeftInContent + g.cardWidth - maxScroll;
      expect(lastRightOnScreen).toBe(screen - inset);
    },
  );
});

describe('indexForOffset — la carte centrée donne l’index', () => {
  const stride = 300;

  it('chaque offset multiple du pas désigne sa carte', () => {
    expect(indexForOffset(0, stride, 4)).toBe(0);
    expect(indexForOffset(300, stride, 4)).toBe(1);
    expect(indexForOffset(900, stride, 4)).toBe(3);
  });

  it('un défilement partiel s’arrondit vers la carte la plus proche', () => {
    expect(indexForOffset(140, stride, 4)).toBe(0);
    expect(indexForOffset(160, stride, 4)).toBe(1);
  });

  it('bornée à la plage des cartes', () => {
    expect(indexForOffset(-50, stride, 4)).toBe(0);
    expect(indexForOffset(5000, stride, 4)).toBe(3);
  });

  it('RTL (offset négatif) : la valeur absolue donne le même index', () => {
    expect(indexForOffset(-600, stride, 4)).toBe(2);
  });

  it('liste vide ou pas invalide : index 0', () => {
    expect(indexForOffset(100, stride, 0)).toBe(0);
    expect(indexForOffset(100, 0, 4)).toBe(0);
  });
});

describe('autoplay — pas de boucle', () => {
  it('avance tant qu’il reste une carte', () => {
    expect(nextIndex(0, 4)).toBe(1);
    expect(shouldAutoplayAdvance(0, 4)).toBe(true);
    expect(shouldAutoplayAdvance(2, 4)).toBe(true);
  });

  it('s’arrête à la dernière carte, sans retour au début', () => {
    expect(nextIndex(3, 4)).toBe(3);
    expect(shouldAutoplayAdvance(3, 4)).toBe(false);
  });

  it('une seule carte : rien à faire', () => {
    expect(shouldAutoplayAdvance(0, 1)).toBe(false);
    expect(nextIndex(0, 1)).toBe(0);
  });

  it('aucune carte : pas de crash', () => {
    expect(nextIndex(0, 0)).toBe(0);
    expect(shouldAutoplayAdvance(0, 0)).toBe(false);
  });
});

describe('isStillAfterDrag — libérer la pause sans élan', () => {
  it('vitesse nulle ou faible : pas d’élan, pause libérée', () => {
    expect(isStillAfterDrag(0)).toBe(true);
    expect(isStillAfterDrag(0.01)).toBe(true);
    expect(isStillAfterDrag(undefined)).toBe(true);
  });

  it('vitesse franche : un élan suit, c’est onMomentumScrollEnd qui libère', () => {
    expect(isStillAfterDrag(1.2)).toBe(false);
    expect(isStillAfterDrag(-0.8)).toBe(false);
  });
});

describe('voisine — aperçu de la carte suivante à droite (plus de symétrie)', () => {
  it.each([320, 360, 390, 412, 430, 768])('écran %i px : la carte suivante dépasse à droite', (screen) => {
    const { cardWidth, sideInset } = carouselGeometry(screen, 16);
    const activeRight = sideInset + cardWidth;
    const rightNeighbourLeft = activeRight + CARD_GAP;
    // Ce qui dépasse de la voisine de droite dans l'écran :
    expect(screen - rightNeighbourLeft).toBeGreaterThan(0);
  });
});

describe('backdropLayerRange — fondu enchaîné des fonds, jamais une plage à un seul point', () => {
  it('la première couche est toujours opaque : aucune interpolation', () => {
    expect(backdropLayerRange(0)).toBeNull();
    expect(backdropLayerRange(-1)).toBeNull();
    expect(backdropLayerRange(1.5)).toBeNull();
  });

  it('la couche i apparaît entre la carte i − 1 et la carte i (deux points)', () => {
    expect(backdropLayerRange(1)).toEqual({ inputRange: [0, 1], outputRange: [0, 1] });
    expect(backdropLayerRange(3)).toEqual({ inputRange: [2, 3], outputRange: [0, 1] });
  });
});

describe('scrollOffsetForIndex — défilement automatique', () => {
  it('LTR : un pas par carte, positif', () => {
    expect(scrollOffsetForIndex(0, 300, false)).toBe(0);
    expect(scrollOffsetForIndex(2, 300, false)).toBe(600);
  });

  it('RTL (liste inversée) : décalage négatif, relu correctement par indexForOffset', () => {
    const offset = scrollOffsetForIndex(2, 300, true);
    expect(offset).toBe(-600);
    expect(indexForOffset(offset, 300, 4)).toBe(2);
  });
});

