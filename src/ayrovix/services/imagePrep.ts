import sharp from 'sharp';

/**
 * Prétraitement image de la Lens pipeline.
 * L'original est toujours conservé ; ces copies servent uniquement à l'analyse
 * (OCR petit texte, segments de captures longues). Tout reste en mémoire.
 */

export interface PreparedImage {
  enhanced: Buffer;
  segments: Buffer[];
  isLongScreenshot: boolean;
  width: number;
  height: number;
}

const LONG_RATIO = 2.2;
const MAX_SEGMENTS = 3;

/** Copie optimisée pour l'OCR : niveaux normalisés, contraste, netteté, upscale si petit. */
export async function enhanceForOcr(image: Buffer): Promise<Buffer> {
  const pipeline = sharp(image, { failOn: 'warning', sequentialRead: true, limitInputPixels: 40_000_000 })
    .rotate()
    .greyscale()
    .normalize()
    .linear(1.15, -(0.05 * 255))
    .sharpen({ sigma: 1.2 });
  const meta = await sharp(image, { limitInputPixels: 40_000_000 }).metadata();
  const shortEdge = Math.min(meta.width || 0, meta.height || 0);
  if (shortEdge > 0 && shortEdge < 900) {
    pipeline.resize({ width: (meta.width || 0) * 2, height: (meta.height || 0) * 2, fit: 'inside' });
  }
  return pipeline.png({ compressionLevel: 6 }).toBuffer();
}

/** Découpe une capture longue en segments verticaux chevauchants (analyse puis fusion). */
export async function segmentLongImage(image: Buffer, ratio: number): Promise<Buffer[]> {
  const meta = await sharp(image, { limitInputPixels: 40_000_000 }).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) return [];
  const count = Math.min(MAX_SEGMENTS, Math.max(2, Math.round(ratio / 1.6)));
  const overlap = Math.round(height * 0.06);
  const step = Math.floor(height / count);
  const segments: Buffer[] = [];
  for (let index = 0; index < count; index += 1) {
    const top = Math.max(0, index * step - (index > 0 ? overlap : 0));
    const segmentHeight = Math.min(height - top, step + overlap * 2);
    if (segmentHeight <= 0) break;
    const buffer = await sharp(image, { failOn: 'warning', sequentialRead: true, limitInputPixels: 40_000_000 })
      .extract({ left: 0, top, width, height: segmentHeight })
      .png({ compressionLevel: 6 })
      .toBuffer();
    segments.push(buffer);
  }
  return segments;
}

/** Prépare enhanced + segments en une passe (jamais bloquant : toute erreur = copie vide). */
export async function prepareImageForAnalysis(image: Buffer): Promise<PreparedImage> {
  try {
    const meta = await sharp(image, { limitInputPixels: 40_000_000 }).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    const ratio = width > 0 ? height / width : 0;
    const isLongScreenshot = ratio >= LONG_RATIO && height > 1600;
    const [enhanced, segments] = await Promise.all([
      enhanceForOcr(image).catch(() => Buffer.alloc(0)),
      isLongScreenshot ? segmentLongImage(image, ratio).catch(() => []) : Promise.resolve([] as Buffer[]),
    ]);
    return { enhanced, segments, isLongScreenshot, width, height };
  } catch {
    return { enhanced: Buffer.alloc(0), segments: [], isLongScreenshot: false, width: 0, height: 0 };
  }
}
