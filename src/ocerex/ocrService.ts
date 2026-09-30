import { ocrRecognizeDetailed, type OcrWordBox } from '../services/vision';
import type { OcerexOcrToken } from './types';

export interface OcerexOcrRead {
  text: string;
  words: OcrWordBox[];
}

export type OcerexOcrReader = (image: Buffer) => Promise<OcerexOcrRead>;

export const ocerexOCRService: OcerexOcrReader = (image) => ocrRecognizeDetailed(image);

export function tokensFromWords(words: OcrWordBox[]): OcerexOcrToken[] {
  return words
    .filter((word) => word.text.trim())
    .map((word) => ({
      text: word.text.trim(),
      confidence: word.confidence,
      x: word.x,
      y: word.y,
      width: word.width,
      height: word.height,
      struck: false,
    }));
}
