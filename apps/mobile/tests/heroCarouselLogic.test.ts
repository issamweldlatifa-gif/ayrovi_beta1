/**
 * Carrousel Hero — logique pure : gouttière égale aux bords, carte centrée,
 * index, arrêt sur la dernière carte.
 */
import { describe, expect, it } from 'vitest';
import {
  carouselSnapOffsets, backdropLayerRange, CARD_ASPECT, CARD_GAP, CARD_MAX_WIDTH, CARD_MIN_WIDTH, EDGE_GUTTER, carouselGeometry, indexForOffset,
  isStillAfterDrag, nextIndex, scrollOffsetForIndex, shouldAutoplayAdvance,
} from '../src/features/home/heroCarouselLogic';

describe('carouselGeometry — dimensions selon l’écran', () => {
  it('utilise un ratio vertical proche de la carte Amazon de référence (5:8)', () => {
    expect(CARD_ASPECT).toBe(5 / 8);
    expect(1 / CARD_ASPECT).toBe(1.6);
  });

  it('la gouttière d’écran VAUT l’espace entre cartes', () => {
    expect(EDGE_GUTTER).toBe(CARD_GAP);
  });

  it.each([360, 390, 412, 430])('téléphone %i px : carte = 76 %, gouttière = espace inter-cartes', (screen) => {
    const g = carouselGeometry(screen, 13);
    expect(g.cardWidth).toBe(Math.round(screen * 0.76));
    expect(g.startInset).toBe(CARD_GAP);
    expect(g.endInset).toBe(CARD_GAP);
    expect(g.centerInset).toBe((screen - g.cardWidth) / 2);
    expect(g.centeringOffset).toBe(g.centerInset - CARD_GAP);
    expect(g.stride).toBe(g.cardWidth + CARD_GAP);
    // Sur les flancs d'une carte centrée, la voisine reste visible.
    expect(g.centeringOffset).toBeGreaterThan(0);
  });

  it('tablette : la carte est plafonnée', () => {
    const g = carouselGeometry(1024, 13);
    expect(g.cardWidth).toBe(CARD_MAX_WIDTH);
    expect(g.centerInset).toBe((1024 - g.cardWidth) / 2);
    expect(g.startInset).toBe(CARD_GAP);
  });

  it('très petit écran : la carte tient entre les deux gouttières, sans dépasser le centrage', () => {
    const g = carouselGeometry(200, 3);
    expect(g.cardWidth).toBeLessThanOrEqual(200 - 2 * EDGE_GUTTER);
    expect(g.startInset).toBeLessThanOrEqual(g.centerInset);
    expect(g.centeringOffset).toBeGreaterThanOrEqual(0);
    // Le plancher seul dépasserait cet écran : c'est la gouttière qui borne.
    expect(CARD_MIN_WIDTH).toBeGreaterThan(200);
  });

  it('largeur de carte toujours entière (pas de flou de pixel)', () => {
    expect(Number.isInteger(carouselGeometry(390, 13).cardWidth)).toBe(true);
  });

  it('une seule carte : rien à faire défiler', () => {
    const g = carouselGeometry(390);
    expect(g.maxScroll).toBe(0);
    expect(carouselSnapOffsets(1, g.stride, g.centeringOffset, g.maxScroll)).toEqual([0]);
  });
});

describe('géométrie centrée — gouttière aux bords, centrage au milieu', () => {
  it.each([[360, 2], [360, 4], [390, 3], [390, 13], [430, 6]])('écran %i, %i cartes', (screen, count) => {
    const g = carouselGeometry(screen, count);
    expect(g.maxScroll).toBe(
      g.startInset + count * g.cardWidth + (count - 1) * CARD_GAP + g.endInset - screen,
    );
    // Première carte : repos sur la gouttière de départ, offset nul.
    expect(scrollOffsetForIndex(0, g.stride, false, g.centeringOffset, g.maxScroll)).toBe(0);
    // Cartes intérieures : centrées, reste partagé également entre voisines.
    for (let index = 1; index < count - 1; index += 1) {
      const offset = scrollOffsetForIndex(index, g.stride, false, g.centeringOffset, g.maxScroll);
      const left = g.startInset + index * g.stride - offset;
      expect(left).toBeCloseTo(g.centerInset);
      expect(left - CARD_GAP).toBeCloseTo(screen - left - g.cardWidth - CARD_GAP);
    }
    // Dernière carte : repos borné par maxScroll → gouttière de fin exacte.
    const last = scrollOffsetForIndex(count - 1, g.stride, false, g.centeringOffset, g.maxScroll);
    const lastLeft = g.startInset + (count - 1) * g.stride - last;
    expect(screen - lastLeft - g.cardWidth).toBeCloseTo(CARD_GAP);
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

describe('aperçu égal des voisines à chaque centrage', () => {
  it.each([320, 360, 390, 412, 430, 768])('écran %i px : reste partagé en deux parts égales', (width) => {
    const g = carouselGeometry(width, 13);
    for (let index = 1; index < 12; index += 1) {
      const offset = scrollOffsetForIndex(index, g.stride, false, g.centeringOffset, g.maxScroll);
      const left = g.startInset + index * g.stride - offset;
      expect(left - CARD_GAP).toBeCloseTo(width - left - g.cardWidth - CARD_GAP);
      expect(indexForOffset(offset, g.stride, 13, g.centeringOffset)).toBe(index);
    }
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

  it('borné par le défilement maximal : la dernière carte reste sur sa gouttière', () => {
    expect(scrollOffsetForIndex(1, 304, false, 39, 3570)).toBe(265);
    expect(scrollOffsetForIndex(12, 304, false, 39, 3570)).toBe(3570);
    expect(scrollOffsetForIndex(12, 304, true, 39, 3570)).toBe(-3570);
  });
});

describe('gouttière égale aux bords, première et dernières cartes', () => {
  it.each([240, 320, 360, 390, 430, 1024])('écran %i : départ et fin sur la gouttière, centre au milieu', (width) => {
    const g = carouselGeometry(width, 13);
    const snaps = carouselSnapOffsets(13, g.stride, g.centeringOffset, g.maxScroll);
    expect(snaps).toHaveLength(13);
    expect(snaps[0]).toBe(0);
    expect(g.startInset).toBe(CARD_GAP);
    for (let i = 1; i < 12; i += 1) {
      const left = g.startInset + i * g.stride - snaps[i];
      expect(left).toBeCloseTo(g.centerInset);
      expect(indexForOffset(snaps[i], g.stride, 13, g.centeringOffset)).toBe(i);
      expect(scrollOffsetForIndex(i, g.stride, true, g.centeringOffset, g.maxScroll)).toBe(-snaps[i]);
    }
    // Dernière carte : gouttière de fin = espace entre cartes.
    expect(snaps[12]).toBe(g.maxScroll);
    const lastLeft = g.startInset + 12 * g.stride - snaps[12];
    expect(width - lastLeft - g.cardWidth).toBeCloseTo(CARD_GAP);
    // Frontière de décision entre deux arrêts consécutifs.
    const boundary = snaps[1] / 2;
    expect(indexForOffset(boundary - 0.1, g.stride, 13, g.centeringOffset)).toBe(0);
    expect(indexForOffset(boundary + 0.1, g.stride, 13, g.centeringOffset)).toBe(1);
  });

  it('deux cartes : gouttière au départ, gouttière à la fin, aucun centrage possible', () => {
    const g = carouselGeometry(390, 2);
    expect(carouselSnapOffsets(2, g.stride, g.centeringOffset, g.maxScroll)).toEqual([0, g.maxScroll]);
  });

  it('offsets strictement croissants même quand le bornage écrase la fin', () => {
    const g = carouselGeometry(390, 13);
    const snaps = carouselSnapOffsets(13, g.stride, g.centeringOffset, g.maxScroll);
    for (let i = 1; i < snaps.length; i += 1) expect(snaps[i]).toBeGreaterThan(snaps[i - 1]);
  });
});
