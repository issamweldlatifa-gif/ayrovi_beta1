import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import type { VisualProductExtractor } from '../services/vision';
import { identifyProduct, buildSearchQuery, AyrovixUnavailableError } from './services/ai';
import { searchCandidates, serpSearch, freeExternalSearch } from './services/search';
import { extractProductFromUrl, ExtractionFailedError, InvalidUrlError } from './services/product';
import { markAyrovixChosen, recordAyrovixEvent } from './events';
import type { AyrovixChannel } from './types';
import { calculatePrice } from '../services/pricing';

/**
 * AYROVIX · API publique V3 — Free Tier + OCR Price Extraction combined
 * Image → AI Vision (identification) + OCR (price from screenshot) + External Search (DuckDuckGo/Brave) + Catalog
 * - Live camera / gallery upload now returns both identification AND ocrPrice
 * - Before checkout, frontend will ask for product link to verify — as requested
 */

const MAX_IMAGE_SIZE = 6 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_SIZE, files: 1 } });
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CHANNELS = new Set<AyrovixChannel>(['image', 'url', 'qr']);

export function createAyrovixRouter(
  db: QatafoDatabase,
  scraper: SmartLinkScraper,
  visionExtractor?: VisualProductExtractor,
): Router {
  const router = Router();

  router.post('/analyze-image', upload.single('image'), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file || !file.buffer?.length) {
      return res.status(400).json({ success: false, code: 'IMAGE_REQUIRED', error: 'Veuillez envoyer une image du produit.' });
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return res.status(415).json({ success: false, code: 'UNSUPPORTED_IMAGE', error: 'Format non supporté — JPEG, PNG ou WebP uniquement.' });
    }
    try {
      // Run AI vision + OCR price extraction in parallel (as requested: attach image/live + external search + OCR)
      const [identification, ocrResult] = await Promise.all([
        identifyProduct(file.buffer, file.mimetype),
        (async () => {
          if (!visionExtractor) return null;
          try {
            const product = await visionExtractor.extractFromImage(file.buffer, (file as any).originalname || 'upload.jpg');
            const priced = calculatePrice(db.getPricingRules(), product.sourcePrice, product.sourceCurrency);
            return {
              sourcePrice: product.sourcePrice,
              sourceCurrency: product.sourceCurrency,
              convertedPriceTND: priced?.convertedPriceTND ?? product.convertedPriceTND,
              serviceFeeTND: priced?.serviceFeeTND ?? product.serviceFeeTND,
              estimatedShippingTND: priced?.shippingFeeTND ?? product.estimatedShippingTND,
              totalPriceTND: priced?.totalTND ?? product.totalPriceTND,
              title: product.title,
              brand: product.brand,
              isCartScreenshot: String(product.description||'').toLowerCase().includes('panier') || String(product.externalId||'') === 'CART-TOTAL',
              imageUrl: product.mainImage || product.images?.[0] || null,
            };
          } catch (e) {
            console.warn('[AYROVIX OCR] extraction failed', (e as any)?.message);
            return null;
          }
        })(),
      ]);

      const query = buildSearchQuery(identification);
      const candidates = query ? await searchCandidates(db, identification, query) : [];
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
          ocrPrice: ocrResult, // NEW: price extracted from image via Tesseract (for cart screenshots etc.)
          message: ocrResult?.isCartScreenshot
            ? `Prix panier détecté: ${ocrResult.sourcePrice} ${ocrResult.sourceCurrency} ≈ ${ocrResult.totalPriceTND} DT. Veuillez fournir le lien du produit pour vérification avant commande.`
            : undefined,
        },
      });
    } catch (error: any) {
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
        console.warn('[AYROVIX analyze-url] Fallback after EXTRACTION_FAILED for', url);
        try {
          const fallbackQuery = String(url).slice(0, 100);
          const freeCandidates = await freeExternalSearch(fallbackQuery, 6);
          return res.json({
            success: true,
            data: {
              product: {
                title: `Produit ${String(url).slice(0, 60)}`,
                brand: null,
                model: null,
                description: 'Lien partagé — résultats de recherche libre ci-dessous. Veuillez confirmer le lien avant commande.',
                image: '',
                images: [],
                source: 'Web',
                sourceUrl: String(url),
                price: null,
                currency: null,
                priceTnd: null,
                exchangeRate: null,
                colors: [],
                sizes: [],
                availability: 'unknown',
              },
              alternates: freeCandidates,
              eventId: recordAyrovixEvent(db, { channel, query: fallbackQuery, candidatesCount: freeCandidates.length }),
              fallback: true,
            },
          });
        } catch {}
        return res.status(422).json({ success: false, code: 'EXTRACTION_FAILED', error: 'Impossible de récupérer toutes les informations automatiquement.' });
      }
      console.warn('[AYROVIX analyze-url]', error?.message || 'unknown');
      return res.status(500).json({ success: false, code: 'EXTRACTION_FAILED', error: 'Impossible de récupérer toutes les informations automatiquement.' });
    }
  });

  router.post('/choose', (req: Request, res: Response) => {
    const eventId = String(req.body?.eventId || '');
    markAyrovixChosen(db, eventId);
    return res.json({ success: true });
  });

  router.post('/analyze-barcode', async (req: Request, res: Response) => {
    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (!/^[\d]{6,14}$/.test(code)) {
      return res.status(400).json({ success: false, code: 'INVALID_BARCODE', error: 'Ce code-barres est illisible. Rapprochez-vous et réessayez.' });
    }
    try {
      const [serp, free] = await Promise.all([
        serpSearch(code, 6).catch(()=>[]),
        freeExternalSearch(code, 6).catch(()=>[]),
      ]);
      const candidates = [...serp, ...free];
      const eventId = recordAyrovixEvent(db, { channel: 'qr', query: `barcode:${code}`, candidatesCount: candidates.length });
      return res.json({ success: true, data: { code, candidates, eventId } });
    } catch (error: any) {
      console.warn('[AYROVIX analyze-barcode]', error?.message || 'unknown');
      return res.status(502).json({ success: false, code: 'BARCODE_SEARCH_FAILED', error: 'La recherche par code a échoué. Essayez avec une photo.' });
    }
  });

  return router;
}
