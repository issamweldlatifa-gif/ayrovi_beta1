/**
 * Carrousel Hero — logique pure : géométrie centrée, index, arrêt sur la dernière carte.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_GAP, CARD_MAX_WIDTH, CARD_MIN_WIDTH, carouselGeometry, indexForOffset,
  isStillAfterDrag, nextIndex, shouldAutoplayAdvance,
} from '../src/features/home/heroCarouselLogic';

describe('carouselGeometry — dimensions selon l’écran', () => {
  it.each([360, 390, 412, 430])('téléphone %i px : carte = 76 %, centrée', (screen) => {
    const g = carouselGeometry(screen);
    expect(g.cardWidth).toBe(Math.round(screen * 0.76));
    // Le retrait symétrique centre la carte active : deux voisines visibles.
    expect(g.sideInset * 2 + g.cardWidth).toBe(screen);
    expect(g.stride).toBe(g.cardWidth + CARD_GAP);
  });

  it('tablette : la carte est plafonnée', () => {
    const g = carouselGeometry(1024);
    expect(g.cardWidth).toBe(CARD_MAX_WIDTH);
    expect(g.sideInset).toBeCloseTo((1024 - CARD_MAX_WIDTH) / 2);
  });

  it('très petit écran : la carte ne dépasse jamais l’écran', () => {
    const g = carouselGeometry(200);
    expect(g.cardWidth).toBeLessThanOrEqual(200);
    expect(g.cardWidth).toBeGreaterThanOrEqual(0);
    expect(g.sideInset).toBeGreaterThanOrEqual(0);
    expect(CARD_MIN_WIDTH).toBeGreaterThan(200); // le plancher seul ne suffirait pas ici
  });

  it('largeur de carte toujours entière (pas de flou de pixel)', () => {
    expect(Number.isInteger(carouselGeometry(390).cardWidth)).toBe(true);
  });
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

describe('voisines — même largeur de peek des deux côtés', () => {
  it.each([320, 360, 390, 412, 430, 768])('écran %i px : bords visibles identiques', (screen) => {
    const { cardWidth, sideInset } = carouselGeometry(screen);
    // Positions réelles (repère de la liste, retrait inclus) :
    const activeLeft = sideInset;
    const activeRight = sideInset + cardWidth;
    const leftNeighbourRight = activeLeft - CARD_GAP;
    const rightNeighbourLeft = activeRight + CARD_GAP;
    // Ce qui dépasse de chaque voisine dans l'écran :
    const leftPeek = leftNeighbourRight;
    const rightPeek = screen - rightNeighbourLeft;
    expect(leftPeek).toBeGreaterThan(0);
    expect(rightPeek).toBe(leftPeek);
  });
});
