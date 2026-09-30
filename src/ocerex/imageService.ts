import sharp from 'sharp';
import { enhanceForOcr } from '../ayrovix/services/imagePrep';
import { InvalidImageError, normalizeUploadedImage } from '../services/imageValidation';
import { detectStrikeInRegion } from './strikeDetection';
import type { OcerexOcrToken } from './types';

const MIN_EDGE = 40;

export interface PreparedOcerexImage {
  width: number;
  height: number;
  mimeType: string;
  /** Contrast-normalized copy used for OCR and strike detection. Never persisted. */
  analysis: Buffer;
}

/** Validate, orient and contrast-normalize a copy. The caller's original bytes are not stored. */
export async function prepareOcerexImage(input: Buffer, declaredMimeType?: string): Promise<PreparedOcerexImage> {
  const normalized = await normalizeUploadedImage(input, declaredMimeType);
  if (normalized.width < MIN_EDGE || normalized.height < MIN_EDGE) {
    throw new InvalidImageError('Image trop petite pour lire un prix.');
  }
  const analysis = await enhanceForOcr(normalized.buffer, { allowUpscale: false });
  const meta = await sharp(analysis, { limitInputPixels: 25_000_000 }).metadata();
  return {
    width: meta.width || normalized.width,
    height: meta.height || normalized.height,
    mimeType: normalized.mimeType,
    analysis,
  };
}

export async function markStruckPrices(image: Buffer, tokens: OcerexOcrToken[]): Promise<OcerexOcrToken[]> {
  if (!tokens.length) return tokens;
  try {
    const { data, info } = await sharp(image, { limitInputPixels: 25_000_000 })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return tokens.map((token) => ({
      ...token,
      struck: token.struck || detectStrikeInRegion(pixels, info.width, info.height, token),
    }));
  } catch {
    return tokens;
  }
}
