/**
 * Z Lens — appliquer une détection automatique à la séance photo (logique pure).
 *
 * Le serveur (`/detect-box`, vision classique déterministe) renvoie un rectangle
 * normalisé quand un unique produit se dégage. Cette fonction décide, sans React
 * et sans réseau, comment mettre à jour la photo :
 *   • détection fiable (produit unique, confiance suffisante, boîte dans l'image)
 *     → le cadre épouse le produit et un produit est sélectionné (index 0) ;
 *   • dans tout les autres cas (multi-objet, faible contraste, échec, boîte hors
 *     bornes) → cadre manuel sur l'image entière, aucun produit présélectionné.
 *
 * Aucun rectangle n'est deviné : une détection non fiable retombe sur FULL_BOX,
 * exactement comme avant l'introduction de la détection automatique.
 */
import type { LensBox, LensDetectedProduct } from '@/api/lens';
import { FULL_BOX } from './lensSelection';

export interface AutoSelectionPatch {
  selection: LensBox;
  products: LensDetectedProduct[];
  selected: number;
  /** Vrai uniquement quand le cadre vient d'une détection automatique fiable. */
  auto: boolean;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Seuil serveur faisant foi, rappelé côté client pour ne pas accepter une boîte faible. */
export const AUTO_BOX_MIN_CONFIDENCE = 0.6;
const MIN_SIDE = 0.03;
const MAX_SIDE = 1;

export interface BoxDetectionInput {
  box: LensBox | null;
  confidence: number;
  reason: string;
}

export function selectionFromBoxDetection(detection: BoxDetectionInput | null | undefined): AutoSelectionPatch {
  const manual: AutoSelectionPatch = { selection: FULL_BOX, products: [], selected: -1, auto: false };
  if (!detection || !detection.box) return manual;
  const { box } = detection;
  const inBounds = box.x >= 0 && box.y >= 0
    && box.w >= MIN_SIDE && box.h >= MIN_SIDE
    && box.w <= MAX_SIDE && box.h <= MAX_SIDE
    && box.x + box.w <= 1.0001 && box.y + box.h <= 1.0001;
  const reliable = detection.reason === 'single_object'
    && Number.isFinite(detection.confidence)
    && detection.confidence >= AUTO_BOX_MIN_CONFIDENCE;
  if (!inBounds || !reliable) return manual;

  const normalized: LensBox = {
    x: clamp01(box.x),
    y: clamp01(box.y),
    w: clamp01(box.w),
    h: clamp01(box.h),
  };
  return {
    selection: normalized,
    products: [{ name: '', category: '', box: normalized }],
    selected: 0,
    auto: true,
  };
}
