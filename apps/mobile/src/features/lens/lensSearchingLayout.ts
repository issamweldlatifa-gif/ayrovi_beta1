/** Géométrie pure de l'écran d'attente Z Lens (19/11) — séparée du composant pour être testée sans React Native. */
import type { LensBox } from '@/api/lens';
import { isFullFrame } from './lensSelection';

/** Géométrie de la carte centrale (en dp). */
export const LENS_SEARCHING = {
  /** Part de la largeur de l'écran, plafonnée. */
  widthShare: 0.72,
  maxWidth: 340,
  /** Part maximale de la hauteur de l'écran. */
  maxHeightShare: 0.46,
  /** Rapport largeur / hauteur toléré pour la carte. */
  minAspect: 0.7,
  maxAspect: 1.4,
  /** Marge ajoutée autour de la zone repérée (part de sa taille) pour ne pas coller au produit. */
  cropPadding: 0.08,
  radius: 28,
  blur: 40,
} as const;

export interface LensCardLayout {
  width: number;
  height: number;
  /** Image placée dans la carte (recadrage) ; absent → photo entière en « cover ». */
  image?: { width: number; height: number; left: number; top: number };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Calcul pur (testé) : taille de la carte et recadrage de la photo sur la zone cherchée. */
export function lensSearchingCard(
  screen: { width: number; height: number },
  photo: { width: number; height: number } | null,
  selection: LensBox | null,
): LensCardLayout {
  const maxWidth = Math.min(screen.width * LENS_SEARCHING.widthShare, LENS_SEARCHING.maxWidth);
  const maxHeight = screen.height * LENS_SEARCHING.maxHeightShare;
  const known = photo && photo.width > 0 && photo.height > 0 ? photo : null;
  const pad = LENS_SEARCHING.cropPadding;
  const box = known && selection && !isFullFrame(selection)
    ? (() => {
      const x = clamp(selection.x - selection.w * pad, 0, 1);
      const y = clamp(selection.y - selection.h * pad, 0, 1);
      return { x, y, w: clamp(selection.w * (1 + 2 * pad), 0, 1 - x), h: clamp(selection.h * (1 + 2 * pad), 0, 1 - y) };
    })()
    : { x: 0, y: 0, w: 1, h: 1 };
  const cropW = known ? box.w * known.width : 1;
  const cropH = known ? box.h * known.height : 1;
  const aspect = clamp(cropW / cropH, LENS_SEARCHING.minAspect, LENS_SEARCHING.maxAspect);
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) { height = maxHeight; width = height * aspect; }
  width = Math.round(width);
  height = Math.round(height);
  if (!known) return { width, height };
  // « cover » sur la zone : elle remplit la carte, centrée.
  const scale = Math.max(width / cropW, height / cropH);
  const imageWidth = known.width * scale;
  const imageHeight = known.height * scale;
  const left = clamp(-box.x * imageWidth + (width - cropW * scale) / 2, width - imageWidth, 0);
  const top = clamp(-box.y * imageHeight + (height - cropH * scale) / 2, height - imageHeight, 0);
  return { width, height, image: { width: imageWidth, height: imageHeight, left, top } };
}

