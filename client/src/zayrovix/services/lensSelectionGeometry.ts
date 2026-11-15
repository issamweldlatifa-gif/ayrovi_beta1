export type LensBox = { x: number; y: number; w: number; h: number };
export type ImageRect = LensBox;
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Percent coordinates always refer to the original, uncropped image. */
export function containedImageRect(width: number, height: number, naturalWidth: number, naturalHeight: number): ImageRect | null {
  if (![width, height, naturalWidth, naturalHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const scale = Math.min(width / naturalWidth, height / naturalHeight);
  const w = naturalWidth * scale, h = naturalHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
export function pointInImage(x: number, y: number, rect: ImageRect): { x: number; y: number } | null {
  if (x < rect.x || y < rect.y || x > rect.x + rect.w || y > rect.y + rect.h) return null;
  return { x: (x - rect.x) / rect.w * 100, y: (y - rect.y) / rect.h * 100 };
}
export function detectedBox(box: number[] | null): LensBox | null {
  if (!box || box.length !== 4 || !box.every(Number.isFinite)) return null;
  const [x, y, w, h] = box;
  if (x < 0 || y < 0 || x >= 1 || y >= 1 || w <= 0 || h <= 0) return null;
  return { x: x * 100, y: y * 100, w: Math.min(w, 1 - x) * 100, h: Math.min(h, 1 - y) * 100 };
}
export function selectionForPoint(point: { x: number; y: number }, boxes: LensBox[]): LensBox {
  // Never snap a tap to an unrelated nearest product. Smallest actual hit wins.
  const hits = boxes.filter(b => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h);
  if (hits.length) return [...hits].sort((a, b) => a.w * a.h - b.w * b.h)[0];
  return { x: Math.min(70, Math.max(0, point.x - 15)), y: Math.min(70, Math.max(0, point.y - 15)), w: 30, h: 30 };
}
export function resizeSelection(box: LensBox, corner: Corner, dx: number, dy: number): LensBox {
  const min = 4;
  let { x, y, w, h } = box;
  const right = x + w, bottom = y + h;
  if (corner.includes('w')) { x = Math.max(0, Math.min(right - min, x + dx)); w = right - x; }
  else w = Math.max(min, Math.min(100 - x, w + dx));
  if (corner.includes('n')) { y = Math.max(0, Math.min(bottom - min, y + dy)); h = bottom - y; }
  else h = Math.max(min, Math.min(100 - y, h + dy));
  return { x, y, w, h };
}
