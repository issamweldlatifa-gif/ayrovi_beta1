import { InvalidImageError } from '../services/imageValidation';
import { getExchangeRate, type PricingRules } from '../services/pricing';
import { markStruckPrices, prepareOcerexImage } from './imageService';
import { tokensFromWords, type OcerexOcrReader } from './ocrService';
import { resolveOcerexPrices } from './priceResolver';
import type { OcerexDecision } from './types';

export async function analyzeOcerexImage(
  input: Buffer,
  declaredMimeType: string | undefined,
  reader: OcerexOcrReader,
  rules?: PricingRules,
): Promise<{ decision: OcerexDecision; width: number; height: number }> {
  const prepared = await prepareOcerexImage(input, declaredMimeType);
  const read = await reader(prepared.analysis);
  const tokens = await markStruckPrices(prepared.analysis, tokensFromWords(read.words));
  const decision = resolveOcerexPrices(tokens, {
    currencySupported: (code) => !rules || getExchangeRate(rules, code) != null,
  });
  return { decision, width: prepared.width, height: prepared.height };
}

export function ocerexFailureCode(error: unknown): 'INVALID_IMAGE' | 'PROCESSING_ERROR' {
  if (error instanceof InvalidImageError || (error as { code?: string })?.code === 'INVALID_IMAGE') return 'INVALID_IMAGE';
  return 'PROCESSING_ERROR';
}
