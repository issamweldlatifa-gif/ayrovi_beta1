import { createHash } from 'node:crypto';
import type { QatafoDatabase } from '../../db/database';
import { identifyProduct } from './ai';
import { analyzeOcrText, type OcrPriceReport } from './ocrPrices';
import { prepareImageForAnalysis } from './imagePrep';
import { scanCodeFromImage, type AyrovixScannedCode } from './codeScanner';
import { serpApiVisualSearch } from './visualSearch';
import { ocrRecognize } from '../../services/vision';
import type { AyrovixCandidate, AyrovixIdentification } from '../types';
import { getAyroviAiCore } from '../../ai-core/core';

/**
 * AYROVI Lens pipeline — SEE → READ → UNDERSTAND → EXTRACT → VERIFY.
 * Orchestre Vision via AI Core + OCR (Tesseract, image entière/améliorée/segments)
 * + codes (ZXing) + correspondances visuelles (Google Lens), puis fusionne en
 * un résultat standard avec confiance et avertissements. Aucune valeur inventée.
 */

export interface LensPricing {
  sale_price: number | null;
  original_price: number | null;
  shipping_price: number | null;
  total_price: number | null;
  currency: string | null;
  discount_percent: number | null;
}

export interface LensStandardResult {
  image_id: string;
  products: Array<{ name: string; brand: string | null; category: string; price: number | null; currency: string | null }>;
  pricing: LensPricing;
  seller: string | null;
  url: string | null;
  confidence: number;
  verified: boolean;
  warnings: string[];
  cache_hit: boolean;
  identification: AyrovixIdentification | null;
  visual_matches: AyrovixCandidate[];
  sources: {
    vision: { confidence: number; identified: boolean };
    ocr: { text_chars: number; confidence: number; segments: number };
    code: { kind: string; value: string } | null;
    visual_matches: number;
  };
}

const CACHE_TTL_MS = 24 * 3600_000;

export function hashImage(image: Buffer): string {
  return createHash('sha256').update(image).digest('hex');
}

function close(a: number | null, b: number | null, tolerance = 0.015): boolean {
  if (a == null || b == null) return false;
  const base = Math.max(Math.abs(a), Math.abs(b), 0.01);
  return Math.abs(a - b) / base <= tolerance;
}

/** Fusion Vision + OCR selon les règles de confiance (jamais de valeur inventée). */
export function mergeVisionOcr(
  vision: AyrovixIdentification | null,
  ocr: OcrPriceReport | null,
  segmentReports: OcrPriceReport[],
): { pricing: LensPricing; confidence: number; verified: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const v = vision?.pricing;
  const pricing: LensPricing = {
    sale_price: v?.sale_price ?? null,
    original_price: v?.original_price ?? null,
    shipping_price: v?.shipping_price ?? null,
    total_price: v?.total_price ?? null,
    currency: v?.currency ?? null,
    discount_percent: v?.discount_percent ?? null,
  };

  // L'OCR complète ce que la Vision n'a pas lu (livraison, total, ancien prix…).
  if (ocr) {
    pricing.shipping_price = pricing.shipping_price ?? ocr.shippingPrice;
    pricing.total_price = pricing.total_price ?? ocr.totalPrice;
    pricing.original_price = pricing.original_price ?? ocr.originalPrice;
    pricing.discount_percent = pricing.discount_percent ?? ocr.discountPercent;
    pricing.currency = pricing.currency ?? ocr.currency;
    if (pricing.sale_price == null && ocr.salePrice != null) pricing.sale_price = ocr.salePrice;
  }

  // Cohérence vente/ancien : un prix promo supérieur à l'ancien prix est suspect.
  if (pricing.sale_price != null && pricing.original_price != null && pricing.sale_price > pricing.original_price) {
    warnings.push('SALE_ABOVE_ORIGINAL');
    [pricing.sale_price, pricing.original_price] = [pricing.original_price, pricing.sale_price];
  }

  let visionConf = 0;
  if (vision) {
    visionConf = vision.detected_price.amount > 0
      ? Math.max(0.35, vision.detected_price.confidence)
      : vision.confidence * 0.6;
  }
  const ocrConf = ocr && (ocr.salePrice != null || ocr.totalPrice != null) ? ocr.confidence : 0;

  let confidence = Math.max(visionConf, ocrConf);
  let verified = false;

  // Deuxième opinion : accord Vision ↔ OCR.
  if (visionConf > 0 && ocrConf > 0) {
    const agreement = close(pricing.sale_price, ocr.salePrice);
    if (agreement) {
      confidence = Math.min(0.99, confidence + 0.08);
      verified = confidence >= 0.9;
    } else {
      warnings.push('PRICE_MISMATCH_VISION_OCR');
      confidence = Math.max(0.3, Math.min(confidence, 0.68));
      // Tie-breaker : segments OCR (captures longues) comme troisième lecture.
      const segmentSale = segmentReports.map((report) => report.salePrice).find((value) => value != null);
      if (segmentSale != null) {
        if (close(segmentSale, ocr.salePrice)) { pricing.sale_price = ocr.salePrice; confidence = Math.min(0.9, confidence + 0.15); }
        else if (close(segmentSale, v?.sale_price ?? null)) { pricing.sale_price = v?.sale_price ?? null; confidence = Math.min(0.9, confidence + 0.15); }
        else warnings.push('SEGMENT_TIE_BREAK_INCONCLUSIVE');
      }
    }
  }

  // Règles §14 : LOW → signaler la vérification Web ou une photo plus nette.
  if ((pricing.sale_price != null || pricing.total_price != null) && confidence < 0.7) {
    warnings.push('LOW_CONFIDENCE_VERIFY_NEEDED');
  }
  if (!pricing.sale_price && !pricing.total_price && vision && vision.confidence < 0.35) {
    warnings.push('NO_PRICE_READABLE');
  }

  return { pricing, confidence: Math.round(confidence * 100) / 100, verified, warnings };
}

export async function runLensPipeline(
  db: QatafoDatabase,
  image: Buffer,
  mime: string,
): Promise<LensStandardResult> {
  const imageHash = hashImage(image);

  const cached = db.get<any>('SELECT result_json, created_at FROM lens_analysis_cache WHERE image_hash=?', imageHash);
  if (cached && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
    try {
      const parsed = JSON.parse(cached.result_json) as LensStandardResult;
      return { ...parsed, visual_matches: parsed.visual_matches || [], cache_hit: true };
    } catch { /* recompute */ }
  }

  const started = Date.now();
  const prepared = await prepareImageForAnalysis(image);

  const [vision, code, visualCandidates] = await Promise.all([
    identifyProduct(image, mime).catch(() => null),
    scanCodeFromImage(image).catch(() => null),
    serpApiVisualSearch(image, 8).catch(() => [] as AyrovixCandidate[]),
  ]);

  // OCR : image entière + copie améliorée (petit texte) + segments (captures longues).
  const ocrTasks: Array<Promise<string>> = [ocrRecognize(image).catch(() => '')];
  if (prepared.enhanced.length) ocrTasks.push(ocrRecognize(prepared.enhanced).catch(() => ''));
  for (const segment of prepared.segments.slice(0, 3)) ocrTasks.push(ocrRecognize(segment).catch(() => ''));
  const ocrTexts = await Promise.all(ocrTasks);
  const wholeText = [ocrTexts[0], ocrTexts[1]].filter(Boolean).join('\n');
  const segmentTexts = ocrTexts.slice(2).filter(Boolean);
  const ocrReport = wholeText ? analyzeOcrText(wholeText) : null;
  const segmentReports = segmentTexts.map((text) => analyzeOcrText(text));

  const merged = mergeVisionOcr(vision, ocrReport, segmentReports);

  const products = (vision?.products?.length ? vision.products : [])
    .map((product) => ({ ...product, price: product.price ?? (merged.pricing.sale_price ?? null) }));
  if (!products.length && vision && (vision.brand || vision.model)) {
    products.push({
      name: [vision.brand, vision.model].filter(Boolean).join(' ') || vision.description.slice(0, 120),
      brand: vision.brand,
      category: vision.category,
      price: merged.pricing.sale_price,
      currency: merged.pricing.currency,
    });
  }

  const result: LensStandardResult = {
    image_id: `lens_${imageHash.slice(0, 16)}`,
    products,
    pricing: merged.pricing,
    seller: vision?.seller ?? null,
    url: vision?.url ?? (code?.kind === 'url' ? code.value : null),
    confidence: merged.confidence,
    verified: merged.verified,
    warnings: merged.warnings,
    cache_hit: false,
    identification: vision,
    visual_matches: visualCandidates,
    sources: {
      vision: { confidence: vision?.confidence ?? 0, identified: Boolean(vision && vision.confidence >= 0.35) },
      ocr: { text_chars: wholeText.length, confidence: ocrReport?.confidence ?? 0, segments: segmentTexts.length },
      code: code ? { kind: code.kind, value: code.value } : null,
      visual_matches: visualCandidates.length,
    },
  };

  try {
    const visionModel = getAyroviAiCore().responses().resolveModel('vision', 'fast');
    db.run('INSERT OR REPLACE INTO lens_analysis_cache (image_hash,result_json,model,created_at) VALUES (?,?,?,?)',
      imageHash, JSON.stringify(result), visionModel, new Date(started).toISOString());
    db.run('DELETE FROM lens_analysis_cache WHERE created_at < ?', new Date(Date.now() - CACHE_TTL_MS).toISOString());
  } catch (error: any) {
    console.warn('[Lens pipeline cache]', error?.message || 'write failed');
  }
  return result;
}
