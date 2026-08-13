import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import { identifyProduct, buildSearchQuery, AyrovixUnavailableError } from './services/ai';
import { searchCandidates, serpSearch, freeExternalSearch } from './services/search';
import { extractProductFromUrl, ExtractionFailedError, InvalidUrlError } from './services/product';
import { markAyrovixChosen, recordAyrovixEvent } from './events';
import type { AyrovixChannel } from './types';

/**
 * AYROVIX · API publique V2 — Free Tier Search (Brave + DuckDuckGo) + Vision multi-provider
 * POST /api/ayrovix/analyze-image  — image → identification → candidats
 * POST /api/ayrovix/analyze-url    — URL/QR → fiche + alternates (fallback gratuit si scraper fail)
 * POST /api/ayrovix/analyze-barcode — code-barres → recherche libre (SERPAPI si dispo, sinon Brave/DuckDuckGo gratuit)
 */

const MAX_IMAGE_SIZE = 6 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_SIZE, files: 1 } });
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CHANNELS = new Set<AyrovixChannel>(['image', 'url', 'qr']);

export function createAyrovixRouter(db: QatafoDatabase, scraper: SmartLinkScraper): Router {
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
      const identification = await identifyProduct(file.buffer, file.mimetype);
      const query = buildSearchQuery(identification);
      const candidates = query ? await searchCandidates(db, identification, query) : [];
      const eventId = recordAyrovixEvent(db, {
        channel: 'image',
        brand: identification.brand,
        query: query || identification.description,
        candidatesCount: candidates.length,
      });
      return res.json({ success: true, data: { identification, query, candidates, eventId } });
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
      // Même si scraper échoue, extractProductFromUrl V2 ne lance plus EXTRACTION_FAILED sauf URL invalide
      // On garde le catch pour compatibilité mais on tente un dernier fallback gratuit
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
                description: 'Lien partagé — résultats de recherche libre ci-dessous.',
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

  // Code-barres: maintenant 100% gratuit — essaie SERPAPI si clé, sinon Brave (free 2000/mo), sinon DuckDuckGo (0 clé)
  router.post('/analyze-barcode', async (req: Request, res: Response) => {
    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (!/^[\d]{6,14}$/.test(code)) {
      return res.status(400).json({ success: false, code: 'INVALID_BARCODE', error: 'Ce code-barres est illisible. Rapprochez-vous et réessayez.' });
    }
    try {
      // Essai parallèle: SERPAPI (si clé) + free search (Brave/DuckDuckGo)
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
