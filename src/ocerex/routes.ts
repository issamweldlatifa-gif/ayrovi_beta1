import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { extractProductFromUrl, InvalidUrlError } from '../ayrovix/services/product';
import { optionalCustomer } from '../customer/auth';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import { InvalidImageError } from '../services/imageValidation';
import { getExchangeRate } from '../services/pricing';
import { recordOcerexEvent, isOcerexEvent } from './analytics';
import { ocerexOCRService } from './ocrService';
import { analyzeOcerexImage, ocerexFailureCode } from './pipeline';
import { quoteOcerex, supportedPricingCurrencies } from './pricing';
import { getOcerexExtraction, saveOcerexExtraction, updateOcerexExtraction, type OcerexExtractionRow } from './store';
import { platformFromUrl, storeSlug, validateOcerexUrl } from './validation';

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_SIZE, files: 1 } });

function sessionId(req: Request): string {
  const raw = req.headers['x-session-id'];
  const value = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : '';
}

function requireSession(req: Request, res: Response): string | null {
  const id = sessionId(req);
  if (id) return id;
  res.status(400).json({ success: false, code: 'SESSION_REQUIRED', error: 'Session client invalide ou absente.' });
  return null;
}

function accountId(req: Request): string | null {
  return (req as { customer?: { id?: string } }).customer?.id || null;
}

function publicExtraction(row: OcerexExtractionRow, rulesCurrencies: string[]) {
  return {
    extractionId: row.id,
    type: row.screen_type,
    referencePrice: row.reference_price,
    currency: row.currency,
    confidence: row.confidence,
    confidenceLevel: row.confidence_level,
    source: 'OCR' as const,
    priceContext: row.price_context,
    productTitle: row.product_title || null,
    platform: row.platform || null,
    sourceUrl: row.source_url || null,
    code: row.code,
    ayroviPrice: row.ayrovi_price_tnd,
    pricingVersion: row.pricing_version,
    supportedCurrencies: rulesCurrencies,
  };
}

function quoteRow(db: QatafoDatabase, row: OcerexExtractionRow, currency: string) {
  const title = [row.product_title, row.screen_type === 'CART' ? 'panier' : '', row.platform].filter(Boolean).join(' ');
  return quoteOcerex(db, Number(row.reference_price), currency, title);
}

export function createOcerexRouter(db: QatafoDatabase, scraper: SmartLinkScraper): Router {
  const router = Router();
  const guard = optionalCustomer(db);

  router.post('/events', guard, (req, res) => {
    const sid = requireSession(req, res);
    if (!sid) return;
    if (!isOcerexEvent(req.body?.event) || req.body?.image || req.body?.screenshot) {
      return res.status(400).json({ success: false, code: 'INVALID_EVENT', error: 'Événement inconnu.' });
    }
    recordOcerexEvent(db, req.body.event, {
      sessionId: sid,
      extractionType: typeof req.body.type === 'string' ? req.body.type : null,
      confidenceLevel: typeof req.body.confidenceLevel === 'string' ? req.body.confidenceLevel : null,
    });
    return res.json({ success: true });
  });

  router.post('/analyze', guard, (req, res, next) => {
    upload.single('image')(req, res, (error) => {
      if (error) return next(error);
      void handleAnalyze(req, res);
    });
  });

  async function handleAnalyze(req: Request, res: Response) {
    const sid = requireSession(req, res);
    if (!sid) return;
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ success: false, code: 'INVALID_IMAGE', error: 'Image manquante.' });
    }
    recordOcerexEvent(db, 'ocerex_ocr_started', { sessionId: sid });
    try {
      const rules = db.getPricingRules();
      const declared = file.mimetype === 'image/jpg' || file.mimetype === 'image/pjpeg' ? 'image/jpeg' : file.mimetype;
      const { decision } = await analyzeOcerexImage(file.buffer, declared, ocerexOCRService, rules);
      const saved = saveOcerexExtraction(db, { sessionId: sid, accountId: accountId(req), decision });
      recordOcerexEvent(db, decision.code === 'OK' ? 'ocerex_ocr_success' : 'ocerex_ocr_failed', {
        sessionId: sid,
        extractionType: decision.type,
        confidenceLevel: decision.confidenceLevel,
      });
      if (decision.type === 'PRODUCT') recordOcerexEvent(db, 'ocerex_product_detected', { sessionId: sid, extractionType: 'PRODUCT', confidenceLevel: decision.confidenceLevel });
      if (decision.type === 'CART') recordOcerexEvent(db, 'ocerex_cart_detected', { sessionId: sid, extractionType: 'CART', confidenceLevel: decision.confidenceLevel });
      if (decision.referencePrice != null) recordOcerexEvent(db, 'ocerex_reference_price_detected', { sessionId: sid, extractionType: decision.type, confidenceLevel: decision.confidenceLevel });
      if (decision.code === 'LOW_CONFIDENCE') recordOcerexEvent(db, 'ocerex_low_confidence', { sessionId: sid, confidenceLevel: 'LOW' });
      return res.json({ success: decision.code === 'OK', ...publicExtraction(saved, supportedPricingCurrencies(rules)) });
    } catch (error) {
      const code = ocerexFailureCode(error);
      recordOcerexEvent(db, 'ocerex_ocr_failed', { sessionId: sid });
      const status = code === 'INVALID_IMAGE' || error instanceof InvalidImageError ? 415 : 500;
      return res.status(status).json({
        success: false,
        code,
        error: code === 'INVALID_IMAGE' ? 'Image invalide.' : 'Analyse impossible.',
      });
    }
  }

  router.post('/calculate', guard, (req, res) => {
    const sid = requireSession(req, res);
    if (!sid) return;
    const row = getOcerexExtraction(db, String(req.body?.extractionId || ''), sid);
    if (!row || row.reference_price == null || row.confidence_level === 'LOW' || row.code !== 'OK') {
      return res.status(409).json({ success: false, code: row?.code || 'EXTRACTION_EXPIRED', error: 'Extraction inutilisable.' });
    }
    const rules = db.getPricingRules();
    const requested = typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : '';
    const currency = row.currency || requested;
    if (!currency || !getExchangeRate(rules, currency)) {
      return res.status(409).json({
        success: false,
        code: 'CURRENCY_UNCONFIRMED',
        supportedCurrencies: supportedPricingCurrencies(rules),
        error: 'Devise à confirmer.',
      });
    }
    if (row.currency && requested && requested !== row.currency) {
      return res.status(400).json({ success: false, code: 'CURRENCY_LOCKED', error: 'La devise extraite ne peut pas être remplacée.' });
    }
    try {
      const quote = quoteRow(db, row, currency);
      if (quote.line.restricted) {
        return res.status(409).json({ success: false, code: 'RESTRICTED', error: 'Article non commandable.' });
      }
      const saved = updateOcerexExtraction(db, row.id, sid, {
        currency,
        ayrovi_price_tnd: quote.totalTND,
        pricing_version: quote.pricingVersion,
        status: 'CALCULATED',
        account_id: accountId(req) || row.account_id,
      });
      recordOcerexEvent(db, 'ocerex_price_calculated', { sessionId: sid, extractionType: row.screen_type, confidenceLevel: row.confidence_level });
      return res.json({
        success: true,
        ...publicExtraction(saved!, supportedPricingCurrencies(rules)),
        ayroviPrice: quote.totalTND,
        pricingVersion: quote.pricingVersion,
        referencePrice: row.reference_price,
        sourceCurrency: currency,
      });
    } catch {
      return res.status(409).json({ success: false, code: 'RESTRICTED', error: 'Prix non calculable.' });
    }
  });

  router.post('/resolve', guard, async (req, res) => {
    const sid = requireSession(req, res);
    if (!sid) return;
    const row = getOcerexExtraction(db, String(req.body?.extractionId || ''), sid);
    if (!row) return res.status(404).json({ success: false, code: 'EXTRACTION_EXPIRED', error: 'Extraction introuvable.' });
    const url = validateOcerexUrl(req.body?.url, scraper);
    recordOcerexEvent(db, 'ocerex_link_submitted', { sessionId: sid, extractionType: row.screen_type });
    if (!url) return res.status(400).json({ success: false, code: 'INVALID_URL', error: 'الرابط غير صالح.' });
    let title = row.product_title;
    let platform = platformFromUrl(url);
    let imageUrl = '';
    try {
      const extracted = await Promise.race([
        extractProductFromUrl(db, scraper, url),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), process.env.NODE_ENV === 'test' ? 1200 : 8000)),
      ]);
      if (extracted?.product) {
        title = extracted.product.title || title;
        platform = extracted.product.source || platform;
        imageUrl = extracted.product.image || '';
      }
    } catch (error) {
      if (error instanceof InvalidUrlError) {
        return res.status(400).json({ success: false, code: 'INVALID_URL', error: 'الرابط غير صالح.' });
      }
    }
    const saved = updateOcerexExtraction(db, row.id, sid, {
      source_url: url,
      product_title: title || row.product_title,
      platform,
      status: 'RESOLVED',
      account_id: accountId(req) || row.account_id,
    });
    return res.json({
      success: true,
      ...publicExtraction(saved!, supportedPricingCurrencies(db.getPricingRules())),
      resolved: {
        title: saved!.product_title,
        platform: saved!.platform,
        url,
        imageUrl,
      },
    });
  });

  router.post('/commit', guard, (req, res) => {
    const sid = requireSession(req, res);
    if (!sid) return;
    const row = getOcerexExtraction(db, String(req.body?.extractionId || ''), sid);
    if (!row || row.code !== 'OK' || row.confidence_level === 'LOW' || row.reference_price == null || !row.currency) {
      return res.status(409).json({ success: false, code: row?.code || 'EXTRACTION_EXPIRED', error: 'Prix de référence indisponible.' });
    }
    if (!validateOcerexUrl(row.source_url, scraper)) {
      return res.status(400).json({ success: false, code: 'INVALID_URL', error: 'الرابط غير صالح.' });
    }
    try {
      const quote = quoteRow(db, row, row.currency);
      if (quote.line.restricted) return res.status(409).json({ success: false, code: 'RESTRICTED', error: 'Article non commandable.' });
      const owner = accountId(req);
      const cartItem = db.addItem(sid, {
        store: storeSlug(row.platform, row.source_url),
        externalId: `ocerex-${row.id}`,
        url: row.source_url,
        title: row.product_title || (row.screen_type === 'CART' ? 'Panier OCEREX' : 'Produit OCEREX'),
        imageUrl: '',
        sourcePrice: row.reference_price,
        sourceCurrency: row.currency,
        priceTND: quote.line.totalTND,
        referenceUrl: row.source_url,
        priceVerificationStatus: 'VERIFIED',
        quantity: 1,
      }, owner);
      db.run('UPDATE cart_items SET ocerex_extraction_id=? WHERE id=?', row.id, cartItem.id);
      const saved = updateOcerexExtraction(db, row.id, sid, {
        cart_item_id: cartItem.id,
        ayrovi_price_tnd: quote.totalTND,
        pricing_version: quote.pricingVersion,
        status: 'COMMITTED',
        account_id: owner || row.account_id,
      });
      recordOcerexEvent(db, 'ocerex_order_started', { sessionId: sid, extractionType: row.screen_type, confidenceLevel: row.confidence_level });
      return res.status(201).json({
        success: true,
        cartItemId: cartItem.id,
        ...publicExtraction(saved!, supportedPricingCurrencies(db.getPricingRules())),
        ayroviPrice: quote.totalTND,
      });
    } catch (error) {
      console.warn('[OCEREX commit]', error instanceof Error ? error.message : 'failed');
      return res.status(500).json({ success: false, code: 'PROCESSING_ERROR', error: 'Panier indisponible.' });
    }
  });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ success: false, code: 'INVALID_IMAGE', error: error.code === 'LIMIT_FILE_SIZE' ? 'Image trop volumineuse.' : 'Fichier invalide.' });
    }
    if (error instanceof InvalidImageError) {
      return res.status(415).json({ success: false, code: 'INVALID_IMAGE', error: error.message });
    }
    return res.status(500).json({ success: false, code: 'PROCESSING_ERROR', error: 'Analyse impossible.' });
  });

  return router;
}
