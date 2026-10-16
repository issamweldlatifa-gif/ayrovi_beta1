/**
 * Z Lens — géométrie du cadre de sélection (sans React, testable directement).
 *
 * Règles voulues par le client (16/10/2026), pour Live, la photo prise et la
 * photo importée :
 *  • un seul produit dans l'image → le cadre aux coins arrondis le sélectionne ;
 *  • plusieurs produits → le PLUS GRAND est sélectionné d'office ;
 *  • toucher un autre produit le sélectionne : le cadre prend sa forme
 *    (rectangle ou carré selon le produit) et la recherche se relance ;
 *  • le cadre s'agrandit par ses coins et se déplace au doigt.
 *
 * Même logique que le Lens du site (`client/src/ayrovix/services/lensSelectionGeometry.ts`) :
 * toucher = la plus PETITE boîte qui contient le doigt (un produit posé sur un
 * autre reste atteignable), sinon une zone de 30 % autour du doigt.
 *
 * Toutes les boîtes sont normalisées 0..1 sur l'image redressée.
 */
import type { LensBox, LensDetectedProduct } from '@/api/lens';

export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export const FULL_BOX: LensBox = { x: 0, y: 0, w: 1, h: 1 };
/** Plus petit cadre utile : en dessous, la recherche n'a plus de matière. */
export const MIN_SELECTION = 0.08;

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const boxArea = (box: LensBox) => box.w * box.h;

export function iou(a: LensBox, b: LensBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = boxArea(a) + boxArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

/** Règle du client : 1 produit → lui ; plusieurs → le plus grand ; aucun → -1. */
export function biggestProductIndex(products: readonly LensDetectedProduct[]): number {
  let best = -1;
  products.forEach((product, index) => {
    if (best < 0 || boxArea(product.box) > boxArea(products[best].box)) best = index;
  });
  return best;
}

const contains = (box: LensBox, point: Point) =>
  point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;

/** Produit sous le doigt : la plus petite boîte qui le contient, sinon -1. */
export function productIndexAt(products: readonly LensDetectedProduct[], point: Point): number {
  let best = -1;
  products.forEach((product, index) => {
    if (!contains(product.box, point)) return;
    if (best < 0 || boxArea(product.box) < boxArea(products[best].box)) best = index;
  });
  return best;
}

/** Toucher hors de tout produit : une zone carrée de 30 % centrée sur le doigt. */
export function zoneAround(point: Point, size = 0.3): LensBox {
  return {
    x: clamp(point.x - size / 2, 0, 1 - size),
    y: clamp(point.y - size / 2, 0, 1 - size),
    w: size,
    h: size,
  };
}

/** Le cadre posé sur un produit déborde un peu pour ne pas couper ses bords. */
export function padBox(box: LensBox, pad = 0.015): LensBox {
  const x = clamp(box.x - pad, 0, 1);
  const y = clamp(box.y - pad, 0, 1);
  return { x, y, w: clamp(box.w + pad * 2, 0, 1 - x), h: clamp(box.h + pad * 2, 0, 1 - y) };
}

/** Coin tiré au doigt : le coin opposé reste fixe, jamais sous la taille minimale. */
export function resizeSelection(box: LensBox, corner: Corner, dx: number, dy: number, min = MIN_SELECTION): LensBox {
  let { x, y, w, h } = box;
  const right = x + w;
  const bottom = y + h;
  if (corner === 'nw' || corner === 'sw') {
    x = clamp(x + dx, 0, right - min);
    w = right - x;
  } else {
    w = clamp(w + dx, min, 1 - x);
  }
  if (corner === 'nw' || corner === 'ne') {
    y = clamp(y + dy, 0, bottom - min);
    h = bottom - y;
  } else {
    h = clamp(h + dy, min, 1 - y);
  }
  return { x, y, w, h };
}

/** Cadre déplacé au doigt, sans jamais sortir de l'image. */
export function moveSelection(box: LensBox, dx: number, dy: number): LensBox {
  return { ...box, x: clamp(box.x + dx, 0, 1 - box.w), y: clamp(box.y + dy, 0, 1 - box.h) };
}

/** Cadre qui couvre pratiquement toute l'image : on cherche alors sur l'image entière. */
export function isFullFrame(box: LensBox): boolean {
  return box.w >= 0.94 && box.h >= 0.94;
}

/** `roi` de `/analyze-image` : pourcentages 0..100 ; rien pour l'image entière. */
export function toRoi(box: LensBox): { x: number; y: number; w: number; h: number } | undefined {
  if (isFullFrame(box)) return undefined;
  const round = (value: number) => Math.round(value * 1000) / 10;
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}

/** Clé de cache d'une sélection : revenir sur un produit déjà vu ne relance pas la recherche. */
export function selectionKey(photoKey: string, box: LensBox): string {
  const roi = toRoi(box);
  return roi ? `${photoKey}|${roi.x},${roi.y},${roi.w},${roi.h}` : `${photoKey}|full`;
}

/** Image affichée entière dans une zone (`contain`). */
export function containRect(areaW: number, areaH: number, imageW: number, imageH: number): Rect {
  if (areaW <= 0 || areaH <= 0 || imageW <= 0 || imageH <= 0) return { x: 0, y: 0, w: Math.max(0, areaW), h: Math.max(0, areaH) };
  const scale = Math.min(areaW / imageW, areaH / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return { x: (areaW - w) / 2, y: (areaH - h) / 2, w, h };
}

/** Image qui remplit la zone en débordant (`cover`) — l'aperçu caméra plein écran. */
export function coverRect(areaW: number, areaH: number, imageW: number, imageH: number): Rect {
  if (areaW <= 0 || areaH <= 0 || imageW <= 0 || imageH <= 0) return { x: 0, y: 0, w: Math.max(0, areaW), h: Math.max(0, areaH) };
  const scale = Math.max(areaW / imageW, areaH / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return { x: (areaW - w) / 2, y: (areaH - h) / 2, w, h };
}

/** Boîte normalisée → rectangle en points dans l'image affichée. */
export function boxToRect(box: LensBox, image: Rect): Rect {
  return { x: image.x + box.x * image.w, y: image.y + box.y * image.h, w: box.w * image.w, h: box.h * image.h };
}

/** Point en points (relatif à la zone) → point normalisé dans l'image. */
export function pointInImage(px: number, py: number, image: Rect): Point {
  return {
    x: image.w > 0 ? clamp((px - image.x) / image.w, 0, 1) : 0,
    y: image.h > 0 ? clamp((py - image.y) / image.h, 0, 1) : 0,
  };
}

/** Coin du cadre sous le doigt (zone de prise large, pensée pour le pouce). */
export function cornerAt(rect: Rect, px: number, py: number, radius = 30): Corner | null {
  const corners: Array<[Corner, number, number]> = [
    ['nw', rect.x, rect.y],
    ['ne', rect.x + rect.w, rect.y],
    ['sw', rect.x, rect.y + rect.h],
    ['se', rect.x + rect.w, rect.y + rect.h],
  ];
  let best: Corner | null = null;
  let bestDistance = radius;
  for (const [corner, cx, cy] of corners) {
    const distance = Math.hypot(px - cx, py - cy);
    if (distance <= bestDistance) {
      best = corner;
      bestDistance = distance;
    }
  }
  return best;
}

export function rectContains(rect: Rect, px: number, py: number): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/**
 * Live : entre deux détections, le produit choisi par le client reste choisi
 * s'il est toujours là (même nom, ou boîte qui se recouvre) ; sinon on revient
 * à la règle du plus grand.
 */
export function keepSelection(previous: LensDetectedProduct | null, next: readonly LensDetectedProduct[]): number {
  if (previous && next.length) {
    let best = -1;
    let bestScore = 0.3;
    next.forEach((product, index) => {
      const score = iou(previous.box, product.box) + (product.name === previous.name ? 0.5 : 0);
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
    });
    if (best >= 0) return best;
  }
  return biggestProductIndex(next);
}

/** Cadre de Live borné à la partie visible de l'écran (sous l'en-tête, au-dessus du panneau). */
export function clampRectToArea(
  rect: Rect,
  area: { left: number; top: number; right: number; bottom: number },
  min = 40,
): Rect {
  const x1 = clamp(rect.x, area.left, Math.max(area.left, area.right - min));
  const y1 = clamp(rect.y, area.top, Math.max(area.top, area.bottom - min));
  const x2 = clamp(rect.x + rect.w, x1 + min, Math.max(x1 + min, area.right));
  const y2 = clamp(rect.y + rect.h, y1 + min, Math.max(y1 + min, area.bottom));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
