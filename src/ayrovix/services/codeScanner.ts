import sharp from 'sharp';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

export interface AyrovixScannedCode {
  kind: 'url' | 'barcode' | 'text';
  value: string;
  format: string;
}

const FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];

function classify(raw: string, format: string): AyrovixScannedCode | null {
  const value = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500);
  if (!value) return null;
  const url = value.match(/https?:\/\/[^\s"'<>]+/i)?.[0]?.replace(/[).,;]+$/, '');
  if (url) return { kind: 'url', value: url, format };
  const digits = value.replace(/[\s-]/g, '');
  if (/^\d{6,14}$/.test(digits)) return { kind: 'barcode', value: digits, format };
  return { kind: 'text', value: value.slice(0, 200), format };
}

/** Decode QR and common retail barcodes from an uploaded image in memory. */
export async function scanCodeFromImage(image: Buffer): Promise<AyrovixScannedCode | null> {
  if (!image.length) return null;
  try {
    const { data, info } = await sharp(image, { failOn: 'warning', sequentialRead: true, limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height || info.channels !== 1) return null;

    const reader = new MultiFormatReader();
    const hints = new Map<DecodeHintType, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);
    try {
      const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
      const source = new RGBLuminanceSource(pixels, info.width, info.height);
      const result = reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(source)));
      return classify(result.getText() || '', BarcodeFormat[result.getBarcodeFormat()] || String(result.getBarcodeFormat()));
    } finally {
      reader.reset();
    }
  } catch {
    return null;
  }
}
