import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import { identifyProduct, buildSearchQuery, AyrovixUnavailableError, ayrovixAiReady } from './services/ai';
import { catalogSearch, anthropicExternalSearch, scoreCandidate, searchCandidates } from './services/search';
import { extractProductFromUrl, ExtractionFailedError, InvalidUrlError } from './services/product';
import { markAyrovixChosen, recordAyrovixEvent } from './events';
import type { AyrovixCandidate, AyrovixChannel } from './types';
import { calculatePrice } from '../services/pricing';
import { InvalidImageError, normalizeUploadedImage } from '../services/imageValidation';

/**
 * AYROVIX public API — one paid Anthropic key powers Vision, visible-price
 * reading and official Web Search. QR/barcode decoding remains local on-device;
 * product URLs are fetched directly through the SSRF-safe metadata extractor.
 */

const MAX_IMAGE_SIZE = 6 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_SIZE, files: 1 } });
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CHANNELS = new Set<AyrovixChannel>(['image', 'url', 'qr']);

function mergeCandidates(items: AyrovixCandidate[], limit = 8): AyrovixCandidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.sourceUrl || ''}|${item.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.match - a.match).slice(0, limit);
}

async function searchByCodeOrText(db: QatafoDatabase, value: string): Promise<AyrovixCandidate[]> {
  const local = catalogSearch(db, null, value, 4)
    .map((candidate) => ({ ...candidate, match: scoreCandidate(null, value, candidate) }));
  const external = await anthropicExternalSearch(value, 8).catch(() => []);
  return mergeCandidates([
    ...local,
    ...external.map((candidate) => ({ ...candidate, match: scoreCandidate(null, value, candidate) })),
  ]);
}

export function createAyrovixRouter(db: QatafoDatabase, scraper: SmartLinkScraper): Router {
  const router = Router();

  router.post('/analyze-image', upload.single('image'), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ success: false, code: 'IMAGE_REQUIRED', error: 'Veuillez envoyer une image du produit.' });
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return res.status(415).json({ success: false, code: 'UNSUPPORTED_IMAGE', error: 'Format non supporté — JPEG, PNG ou WebP uniquement.' });
    }
    try {
      const normalized = await normalizeUploadedImage(file.buffer, file.mimetype);
      if (!ayrovixAiReady()) {
        return res.status(503).json({ success: false, code: 'AYROVIX_UNAVAILABLE', error: "AYROVIX n'est pas encore activé. Réessayez bientôt." });
      }

      // Claude performs identification and visible-price reading in one request.
      const identification = await identifyProduct(normalized.buffer, normalized.mimeType);
      const visiblePrice = identification.detected_price;
      const usablePrice = visiblePrice.confidence >= 0.65
        && visiblePrice.amount > 0
        && Boolean(visiblePrice.currency)
        && (visiblePrice.label === 'product_price' || visiblePrice.label === 'cart_total');
      const calculated = usablePrice
        ? calculatePrice(db.getPricingRules(), visiblePrice.amount, visiblePrice.currency)
        : null;
      const isCartScreenshot = identification.input_kind === 'cart_screenshot'
        || visiblePrice.label === 'cart_total';
      const title = [identification.brand, identification.model].filter(Boolean).join(' ')
        || identification.description
        || 'Produit détecté par AYROVIX';
      const priceResult = usablePrice ? {
        sourcePrice: visiblePrice.amount,
        sourceCurrency: visiblePrice.currency,
        convertedPriceTND: calculated?.convertedPriceTND ?? null,
        serviceFeeTND: calculated?.serviceFeeTND ?? null,
        estimatedShippingTND: calculated?.shippingFeeTND ?? null,
        totalPriceTND: calculated?.totalTND ?? null,
        title,
        brand: identification.brand,
        isCartScreenshot,
        imageUrl: null,
      } : null;

      const query = buildSearchQuery(identification);
      const candidates = identification.confidence >= 0.35 && query
        ? await searchCandidates(db, identification, query)
        : [];
      const eventId = recordAyrovixEvent(db, {
        channel: 'image',
        brand: identification.brand,
        query: query || identification.description,
        candidatesCount: candidates.length,
      });

      return res.json({
        success: true,
        data: {
          identification,
          query,
          candidates,
          eventId,
          detectedPrice: priceResult,
          message: priceResult
            ? isCartScreenshot
              ? `Total visible détecté: ${priceResult.sourcePrice} ${priceResult.sourceCurrency}. Un lien produit reste obligatoire avant commande.`
              : `Prix visible détecté: ${priceResult.sourcePrice} ${priceResult.sourceCurrency}. Le lien marchand permettra de le vérifier.`
            : undefined,
        },
      });
    } catch (error: any) {
      if (error instanceof InvalidImageError || error?.code === 'INVALID_IMAGE') {
        return res.status(415).json({ success: false, code: 'INVALID_IMAGE', error: error.message });
      }
      if (error instanceof AyrovixUnavailableError || error?.code === 'AYROVIX_UNAVAILABLE') {
        return res.status(503).json({ success: false, code: 'AYROVIX_UNAVAILABLE', error: "AYROVIX n'est pas encore activé. Réessayez bientôt." });
      }
      console.warn('[AYROVIX analyze-image]', error?.code || error?.message || 'unknown');
      return res.status(422).json({ success: false, code: 'IDENTIFICATION_FAILED', error: "Impossible d'identifier le produit. Essayez une photo plus nette et centrée." });
    }
  });

  router.post('/analyze-url', async (req: Request, res: Response) => {
    const url = req.body?.url;
    const channel: AyrovixChannel = CHANNELS.has(req.body?.channel) ? req.body.channel : 'url';
    try {
      const result = await extractProductFromUrl(db, scraper, String(url ?? ''));
      const eventId = recordAyrovixEvent(db, {
        channel,
        brand: result.product.brand,
        query: result.product.title,
        candidatesCount: 1 + result.alternates.length,
      });
      return res.json({ success: true, data: { ...result, eventId } });
    } catch (error: any) {
      if (error instanceof InvalidUrlError || error?.code === 'INVALID_URL') {
        return res.status(400).json({ success: false, code: 'INVALID_URL', error: 'Ce lien ne peut pas être analysé. Vérifiez le format.' });
      }
      if (error instanceof ExtractionFailedError || error?.code === 'EXTRACTION_FAILED') {
        try {
          const fallbackQuery = String(url || '').slice(0, 160);
          const candidates = await anthropicExternalSearch(fallbackQuery, 6);
          return res.json({
            success: true,
            data: {
              product: {
                title: `Produit ${fallbackQuery.slice(0, 60)}`,
                brand: null,
                model: null,
                description: 'Lien partagé — résultats Claude Web Search à confirmer.',
                image: '', images: [], source: 'Web', sourceUrl: String(url || ''),
                price: null, currency: null, priceTnd: null, exchangeRate: null,
                colors: [], sizes: [], availability: 'unknown',
              },
              alternates: candidates,
              eventId: recordAyrovixEvent(db, { channel, query: fallbackQuery, candidatesCount: candidates.length }),
              fallback: true,
            },
          });
        } catch { /* clean error below */ }
      }
      console.warn('[AYROVIX analyze-url]', error?.message || 'unknown');
      return res.status(422).json({ success: false, code: 'EXTRACTION_FAILED', error: 'Impossible de récupérer les informations du produit.' });
    }
  });

  router.post('/analyze-code', async (req: Request, res: Response) => {
    const value = String(req.body?.value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (value.length < 2) {
      return res.status(400).json({ success: false, code: 'INVALID_CODE', error: 'Le contenu de ce QR code est vide ou illisible.' });
    }
    try {
      const candidates = await searchByCodeOrText(db, value);
      const eventId = recordAyrovixEvent(db, { channel: 'qr', query: `qr:${value}`, candidatesCount: candidates.length });
      return res.json({ success: true, data: { code: value, candidates, eventId } });
    } catch (error: any) {
      console.warn('[AYROVIX analyze-code]', error?.message || 'unknown');
      return res.status(502).json({ success: false, code: 'CODE_SEARCH_FAILED', error: 'La recherche de ce QR code a échoué.' });
    }
  });

  router.post('/analyze-barcode', async (req: Request, res: Response) => {
    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (!/^\d{6,14}$/.test(code)) {
      return res.status(400).json({ success: false, code: 'INVALID_BARCODE', error: 'Ce code-barres est illisible. Rapprochez-vous et réessayez.' });
    }
    try {
      const candidates = await searchByCodeOrText(db, code);
      const eventId = recordAyrovixEvent(db, { channel: 'qr', query: `barcode:${code}`, candidatesCount: candidates.length });
      return res.json({ success: true, data: { code, candidates, eventId } });
    } catch (error: any) {
      console.warn('[AYROVIX analyze-barcode]', error?.message || 'unknown');
      return res.status(502).json({ success: false, code: 'BARCODE_SEARCH_FAILED', error: 'La recherche par code a échoué. Essayez avec une photo.' });
    }
  });

  router.post('/choose', (req: Request, res: Response) => {
    markAyrovixChosen(db, String(req.body?.eventId || ''));
    return res.json({ success: true });
  });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Image trop volumineuse (6 Mo maximum).'
        : 'Le fichier envoyé est invalide.';
      return res.status(400).json({ success: false, code: error.code, error: message });
    }
    return res.status(500).json({ success: false, code: 'AYROVIX_INTERNAL_ERROR', error: 'Erreur interne du service.' });
  });

  return router;
}
