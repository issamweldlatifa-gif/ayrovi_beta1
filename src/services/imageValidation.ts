import sharp from 'sharp';

const MAX_INPUT_PIXELS = 25_000_000;
const MAX_OUTPUT_EDGE = 1_800;
const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class InvalidImageError extends Error {
  readonly code = 'INVALID_IMAGE';

  constructor(message = "Le fichier envoyé n'est pas une image valide.") {
    super(message);
    this.name = 'InvalidImageError';
  }
}

export interface NormalizedImage {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  originalFormat: 'jpeg' | 'png' | 'webp';
}

/**
 * Decode untrusted input with libvips, strip metadata and re-encode it to a
 * server-selected format. PNG screenshots stay lossless for visible prices;
 * product photos remain compact. Claude never receives the original bytes.
 */
export async function normalizeUploadedImage(
  input: Buffer,
  declaredMimeType?: string,
): Promise<NormalizedImage> {
  if (!Buffer.isBuffer(input) || input.length === 0) throw new InvalidImageError();
  if (declaredMimeType && !SUPPORTED_MIME_TYPES.has(declaredMimeType.toLowerCase())) {
    throw new InvalidImageError('Format non supporté — JPEG, PNG ou WebP uniquement.');
  }

  try {
    const decoder = sharp(input, {
      failOn: 'warning',
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
      animated: false,
    });
    const metadata = await decoder.metadata();
    const format = String(metadata.format || '');
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);

    if (!SUPPORTED_FORMATS.has(format) || width < 1 || height < 1) throw new InvalidImageError();
    if (Number(metadata.pages || 1) > 1) {
      throw new InvalidImageError('Les images animées ne sont pas acceptées.');
    }
    if (width * height > MAX_INPUT_PIXELS) {
      throw new InvalidImageError('Image trop grande — 25 mégapixels maximum.');
    }

    const pipeline = decoder
      .rotate()
      .resize({
        width: MAX_OUTPUT_EDGE,
        height: MAX_OUTPUT_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      });
    const output = format === 'png'
      ? pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : format === 'webp'
        ? pipeline.webp({ quality: 90, smartSubsample: true }).toBuffer({ resolveWithObject: true })
        : pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    const { data, info } = await output;

    if (!data.length || !info.width || !info.height || data.length > 5 * 1024 * 1024) {
      throw new InvalidImageError('Image normalisée trop volumineuse — réduisez sa résolution.');
    }
    const mimeType: NormalizedImage['mimeType'] = format === 'png'
      ? 'image/png'
      : format === 'webp' ? 'image/webp' : 'image/jpeg';
    return {
      buffer: data,
      mimeType,
      width: info.width,
      height: info.height,
      originalFormat: format as NormalizedImage['originalFormat'],
    };
  } catch (error) {
    if (error instanceof InvalidImageError) throw error;
    throw new InvalidImageError();
  }
}
