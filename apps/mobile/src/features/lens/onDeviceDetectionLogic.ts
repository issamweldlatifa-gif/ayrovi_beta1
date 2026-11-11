/**
 * Z Lens — conversion des objets ML Kit en produits encadrés (PUR, testable
 * sans React Native). Voir `onDeviceDetection.ts` pour le pourquoi.
 *
 * ML Kit (détecteur par défaut, mode image unique, objets multiples) rend au
 * plus 5 objets avec un cadre en PIXELS de l'image décodée et, s'il les
 * reconnaît, une catégorie grossière : « Fashion good », « Home good »,
 * « Food », « Place », « Plant ». Ici on :
 *   1. normalise chaque cadre en 0..1 (le format du cadre de sélection) ;
 *   2. écarte ce qui n'est pas un produit (« Place » : un lieu, un décor) ;
 *   3. écarte les miettes (trop petites pour qu'une recherche ait de la matière) ;
 *   4. fusionne les doublons (deux cadres presque superposés → le plus grand) ;
 *   5. garde au plus 5 produits, du plus grand au plus petit.
 */
import type { LensBox, LensDetectedProduct } from '@/api/lens';
import { MIN_SELECTION, boxArea, clamp, iou } from './lensSelection';

/** Forme rendue par le module natif (`RNMLKitObjectDetectionObject`). */
export interface MlKitObject {
  frame?: { origin?: { x?: number; y?: number }; size?: { x?: number; y?: number } } | null;
  labels?: Array<{ text?: string; confidence?: number }> | null;
}

/** Catégories ML Kit → catégorie Lens. `null` = pas un produit. */
const CATEGORY: Record<string, string | null> = {
  'fashion good': 'fashion',
  'home good': 'home',
  food: 'food',
  plant: 'plant',
  place: null,
};

/** Surface minimale d'un produit retenu (2 % de l'image). */
export const MIN_PRODUCT_AREA = 0.02;
/** Au-delà, deux cadres désignent le même produit. */
export const DUPLICATE_IOU = 0.7;
export const MAX_PRODUCTS = 5;

function bestLabel(object: MlKitObject): string {
  let best = '';
  let score = -1;
  for (const label of object.labels ?? []) {
    const text = String(label?.text ?? '').trim();
    const confidence = Number(label?.confidence ?? 0);
    if (text && confidence > score) { best = text; score = confidence; }
  }
  return best;
}

/** Cadre en pixels → boîte 0..1 bornée à l'image ; `null` si inexploitable. */
export function normalizeFrame(object: MlKitObject, width: number, height: number): LensBox | null {
  if (!(width > 0) || !(height > 0)) return null;
  const x = Number(object.frame?.origin?.x);
  const y = Number(object.frame?.origin?.y);
  const w = Number(object.frame?.size?.x);
  const h = Number(object.frame?.size?.y);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const left = clamp(x / width, 0, 1);
  const top = clamp(y / height, 0, 1);
  const right = clamp((x + w) / width, 0, 1);
  const bottom = clamp((y + h) / height, 0, 1);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function toDetectedProducts(
  objects: readonly MlKitObject[] | null | undefined,
  width: number,
  height: number,
): LensDetectedProduct[] {
  const candidates: LensDetectedProduct[] = [];
  for (const object of objects ?? []) {
    const box = normalizeFrame(object, width, height);
    if (!box) continue;
    if (boxArea(box) < MIN_PRODUCT_AREA || box.w < MIN_SELECTION || box.h < MIN_SELECTION) continue;
    const label = bestLabel(object);
    const key = label.toLowerCase();
    const category = key in CATEGORY ? CATEGORY[key] : 'product';
    if (category === null) continue;
    candidates.push({ name: label, category, box, source: 'device' });
  }
  candidates.sort((a, b) => boxArea(b.box) - boxArea(a.box));
  const kept: LensDetectedProduct[] = [];
  for (const candidate of candidates) {
    if (kept.some((product) => iou(product.box, candidate.box) >= DUPLICATE_IOU)) continue;
    kept.push(candidate);
    if (kept.length >= MAX_PRODUCTS) break;
  }
  return kept;
}

/** Le module natif lit l'image par URL : un chemin nu reçoit `file://`. */
export function toFileUrl(uri: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) return uri;
  return `file://${uri.startsWith('/') ? '' : '/'}${uri}`;
}
