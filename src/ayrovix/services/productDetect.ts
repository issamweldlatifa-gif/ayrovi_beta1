/**
 * Détection automatique du PRODUIT dans une photo (vision classique, déterministe).
 *
 * Pourquoi pas un modèle lourd : aucun modèle ML sur l'appareil, et le bac à
 * sable ne permet pas d'entraîner/vérifier un réseau. On utilise donc une chaîne
 * de vision par ordinateur pure, sans clef ni tiers :
 *   1. sharp réduit l'image à une petite matrice RGBA (≤ 96 px, rapide) ;
 *   2. la couleur de fond est estimée à partir de la bordure (médiane robuste) ;
 *   3. un score de distance au fond est calculé par pixel, puis seuillé par Otsu ;
 *   4. les composantes connexes du masque donnent les objets ; la plus grande,
 *      quand elle est nettement dominante, définit le rectangle du produit ;
 *   5. le rectangle est rembourré puis normalisé 0..1 en bornes d'image.
 *
 * La fonction centrale travaille sur une matrice brute SANS dépendance : elle est
 * donc testable de façon déterministe. En cas d'incertitude (fond uni sans contraste,
 * plusieurs objets comparables), on renvoie `box = null` et l'application garde le
 * cadre manuel — jamais de rectangle deviné à tort.
 */
import sharp from 'sharp';

export interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ProductDetectReason = 'single_object' | 'multi_object' | 'no_foreground' | 'low_contrast';

export interface ProductDetection {
  /** Rectangle normalisé 0..1, ou null quand la détection n'est pas fiable. */
  box: NormalizedBox | null;
  /** 0..1 — confiance dans le caractère « produit unique » du rectangle. */
  confidence: number;
  /** Part de pixels de premier plan dans l'image (0..1). */
  coverage: number;
  reason: ProductDetectReason;
}

interface Component {
  pixels: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Seuil d'Otsu sur une distribution de scores (bornés à `maxValue`). */
export function otsuThreshold(values: ArrayLike<number>, maxValue: number): number {
  const histogram = new Array(maxValue + 1).fill(0);
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    const bin = Math.max(0, Math.min(maxValue, Math.round(values[i])));
    histogram[bin] += 1;
    total += 1;
  }
  let sum = 0;
  for (let t = 0; t <= maxValue; t += 1) sum += t * histogram[t];
  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let bestThreshold = 0;
  for (let t = 0; t <= maxValue; t += 1) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > bestVariance) {
      bestVariance = between;
      bestThreshold = t;
    }
  }
  return bestThreshold;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Couleur de fond estimée depuis la bordure de l'image (médiane par canal). */
function borderReference(rgba: Uint8Array | Buffer, width: number, height: number): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    rs.push(rgba[i]);
    gs.push(rgba[i + 1]);
    bs.push(rgba[i + 2]);
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  return [median(rs), median(gs), median(bs)];
}

/** Composantes connexes 4-voisines d'un masque booléen, avec leur rectangle englobant. */
function connectedComponents(mask: Uint8Array, width: number, height: number, minPixels: number): Component[] {
  const labels = new Int32Array(width * height).fill(-1);
  const components: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== -1) continue;
    const label = components.length;
    labels[start] = label;
    const component: Component = {
      pixels: 0,
      minX: start % width,
      minY: Math.floor(start / width),
      maxX: start % width,
      maxY: Math.floor(start / width),
    };
    stack.length = 0;
    stack.push(start);
    while (stack.length) {
      const index = stack.pop() as number;
      if (labels[index] !== label) continue;
      component.pixels += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < component.minX) component.minX = x;
      if (x > component.maxX) component.maxX = x;
      if (y < component.minY) component.minY = y;
      if (y > component.maxY) component.maxY = y;
      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= mask.length || labels[neighbor] !== -1 || !mask[neighbor]) continue;
        // Empêche la traversée d'une ligne à l'autre par les voisins horizontaux.
        const nx = neighbor % width;
        if ((neighbor === index - 1 || neighbor === index + 1) && Math.abs(nx - x) !== 1) continue;
        labels[neighbor] = label;
        stack.push(neighbor);
      }
    }
    if (component.pixels >= minPixels) components.push(component);
  }
  return components;
}

/**
 * Cœur déterministe : matrice RGBA brute → détection. Aucune entrée/sortie,
 * aucune dépendance — c'est cette fonction qui est testée directement.
 */
export function detectBoxFromRgba(
  rgba: Uint8Array | Buffer,
  width: number,
  height: number,
): ProductDetection {
  const pixelCount = width * height;
  if (pixelCount === 0 || rgba.length < pixelCount * 4) {
    return { box: null, confidence: 0, coverage: 0, reason: 'no_foreground' };
  }

  const [bgR, bgG, bgB] = borderReference(rgba, width, height);
  const distances = new Array<number>(pixelCount);
  let distanceSum = 0;
  for (let p = 0; p < pixelCount; p += 1) {
    const i = p * 4;
    const dr = rgba[i] - bgR;
    const dg = rgba[i + 1] - bgG;
    const db = rgba[i + 2] - bgB;
    // Distance euclidienne (0..≈441), seuillée ensuite par Otsu.
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    distances[p] = distance;
    distanceSum += distance;
  }

  const meanDistance = distanceSum / pixelCount;
  // Une image quasi uniforme n'a pas de produit à isoler : on ne fabrique pas de rectangle.
  if (meanDistance < 6) {
    return { box: null, confidence: 0, coverage: 0, reason: 'low_contrast' };
  }

  const threshold = Math.max(24, otsuThreshold(distances, 64));
  const mask = new Uint8Array(pixelCount);
  let foreground = 0;
  for (let p = 0; p < pixelCount; p += 1) {
    if (distances[p] >= threshold) {
      mask[p] = 1;
      foreground += 1;
    }
  }
  const coverage = foreground / pixelCount;
  if (foreground === 0 || coverage < 0.02) {
    return { box: null, confidence: 0, coverage, reason: 'no_foreground' };
  }

  // Le bruit (< 0,4 % de l'image) ne compte pas comme un objet.
  const minPixels = Math.max(8, Math.round(pixelCount * 0.004));
  const components = connectedComponents(mask, width, height, minPixels)
    .sort((a, b) => b.pixels - a.pixels);
  if (components.length === 0) {
    return { box: null, confidence: 0, coverage, reason: 'no_foreground' };
  }

  const largest = components[0];
  const largestShare = largest.pixels / foreground;
  const secondShare = components.length > 1 ? components[1].pixels / foreground : 0;
  const objectCoverage = largest.pixels / pixelCount;

  // Un objet unique = la composante dominante couvre l'essentiel du premier plan,
  // sans seconde composante comparable, et sans occuter quasiment toute l'image.
  const single = largestShare >= 0.62 && secondShare <= 0.28 && objectCoverage <= 0.96;
  if (!single) {
    return { box: null, confidence: 0.4, coverage, reason: 'multi_object' };
  }

  // Petit rembourrage (4 %) pour ne pas couper les bords du produit, borné à l'image.
  const padX = Math.round(width * 0.04);
  const padY = Math.round(height * 0.04);
  const minX = Math.max(0, largest.minX - padX);
  const minY = Math.max(0, largest.minY - padY);
  const maxX = Math.min(width - 1, largest.maxX + padX);
  const maxY = Math.min(height - 1, largest.maxY + padY);

  const box: NormalizedBox = {
    x: clamp01(minX / width),
    y: clamp01(minY / height),
    w: clamp01((maxX - minX + 1) / width),
    h: clamp01((maxY - minY + 1) / height),
  };
  // Plus la séparation est nette et la couverture raisonnable, plus la confiance monte.
  const separation = Math.min(1, Math.max(0, (meanDistance - 6) / 30));
  const confidence = clamp01(0.6 + 0.3 * separation + 0.05 * largestShare);

  return { box, confidence, coverage, reason: 'single_object' };
}

/** Le produit est-il sélectionnable automatiquement en toute confiance ? */
export function isReliableAutoBox(detection: ProductDetection): detection is ProductDetection & { box: NormalizedBox } {
  if (detection.reason !== 'single_object' || !detection.box) return false;
  const area = detection.box.w * detection.box.h;
  return detection.confidence >= 0.6 && area >= 0.03 && area <= 0.97;
}

const DETECT_EDGE = 96;

/** Entrée production : tampon d'image → petite matrice sharp → détection. */
export async function detectProductInImage(buffer: Buffer): Promise<ProductDetection> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: DETECT_EDGE, height: DETECT_EDGE, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return detectBoxFromRgba(data, info.width, info.height);
}
