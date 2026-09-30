import { Router } from 'express';
import multer from 'multer';
import type { Request, Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import { calculatePrice } from '../services/pricing';
import { InvalidImageError, normalizeUploadedImage } from '../services/imageValidation';
import { extractOcerexPrice } from './extraction';
import { enhanceForOcr } from '../ayrovix/services/imagePrep';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });

export function createOcerexRouter(db: QatafoDatabase): Router {
  const router = Router();
  router.post('/analyze', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file?.buffer?.length) return res.status(400).json({ success: false, code: 'INVALID_IMAGE', error: 'صورة غير صالحة.' });
      const normalized = await normalizeUploadedImage(req.file.buffer, req.file.mimetype);
      const prepared = await enhanceForOcr(normalized.buffer).catch(() => normalized.buffer);
      const extraction = await extractOcerexPrice(prepared);
      if (!extraction.referencePrice || !extraction.currency || extraction.confidence < 0.72) {
        return res.json({ success: true, data: { ...extraction, calculation: null } });
      }
      const calculation = calculatePrice(db.getPricingRules(), extraction.referencePrice, extraction.currency, {
        title: extraction.productName || (extraction.type === 'CART' ? 'Panier boutique internationale' : ''),
      });
      if (!calculation) {
        return res.json({ success: true, data: { ...extraction, referencePrice: null, currency: null, priceContext: null, calculation: null, errorCode: 'LOW_CONFIDENCE' } });
      }
      return res.json({ success: true, data: { ...extraction, calculation } });
    } catch (error) {
      if (error instanceof InvalidImageError) return res.status(400).json({ success: false, code: 'INVALID_IMAGE', error: error.message });
      if (error instanceof multer.MulterError) return res.status(400).json({ success: false, code: 'INVALID_IMAGE', error: 'الصورة كبيرة جدًا أو غير صالحة.' });
      console.warn('[OCEREX] analysis failed:', error instanceof Error ? error.message : 'unknown');
      return res.status(500).json({ success: false, code: 'PROCESSING_ERROR', error: 'حدث خطأ أثناء تحليل الصورة.' });
    }
  });

  // Display-only quote endpoint. Order creation must always use the normal server-side checkout quote.
  router.post('/calculate', (req: Request, res: Response) => {
    const price = Number(req.body?.referencePrice);
    const currency = String(req.body?.currency || '').trim().toUpperCase();
    const type = String(req.body?.type || '');
    const confidence = Number(req.body?.confidence);
    if (!(price > 0 && price <= 1_000_000) || !/^[A-Z]{3}$/.test(currency)
      || !['PRODUCT', 'CART'].includes(type) || !Number.isFinite(confidence) || confidence < 0.72) {
      return res.status(400).json({ success: false, code: 'INVALID_EXTRACTION', error: 'Extraction invalide.' });
    }
    const calculation = calculatePrice(db.getPricingRules(), price, currency, {
      title: typeof req.body?.productName === 'string' ? req.body.productName.slice(0, 120) : (type === 'CART' ? 'Panier boutique internationale' : ''),
    });
    if (!calculation) return res.status(400).json({ success: false, code: 'UNSUPPORTED_CURRENCY', error: 'Devise non prise en charge.' });
    return res.json({ success: true, data: calculation });
  });
  return router;
}
