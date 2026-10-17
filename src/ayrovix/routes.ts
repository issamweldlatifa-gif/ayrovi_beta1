import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import { buildSearchQuery, AyrovixUnavailableError, fallbackIdentification } from './services/ai';
import { catalogSearch, externalProductSearch, groupOffers, scoreCandidate, searchCandidates } from './services/search';
import { LENS_LIVE_SEARCH_COUNTRIES, SerpApiVisualError, serpApiVisualReady, serpApiVisualSearch } from './services/visualSearch';
import { recognizeImage } from './services/lensEngine';
import { enrichCandidatesLiveStock, filterPurchasable, purchaseBlocker, refreshLiveStock } from './services/lensLiveStock';
import { deduplicateCandidates } from './services/candidateDedup';
import { estimateWithDb } from './services/currency';
import { extractProductFromUrl, ExtractionFailedError, InvalidUrlError, sanitizeProductUrl } from './services/product';
import { markAyrovixChosen, recordAyrovixEvent } from './events';
import { createAyrovixReviewRequest, getAyrovixReviewForOwner } from './reviews';
import { resolveCustomer } from '../customer/auth';
import type { AyrovixCandidate, AyrovixChannel, AyrovixIdentification, AyrovixProduct } from './types';
import { InvalidImageError, normalizeUploadedImage } from '../services/imageValidation';
import { createAyrovixPriceToken, type AyrovixQuoteStatus } from './priceQuote';
import { listAyrovixHistory, recordAyrovixHistory, type AyrovixHistoryInput } from './history';
import { filterLenientCandidates, filterWithFallback, isConfirmedOutOfStockCandidate, withDisplayRating } from './services/candidatePolicy';
import { startTrace, mark, endTrace } from './services/lensPerformanceTrace';
import { armLensDeadline, lensAnalyzeDeadlineMs } from './services/lensDeadline';
import { warmIsolation } from '../services/imageIsolation';
import { warmComposition } from '../services/imageComposition';
import { addPriceWatcher, listPriceWatchers, priceWatcherLimitReached, removePriceWatcher } from './services/priceWatch';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

/**
 * AYROVIX public API — AI Core provides visual understanding, visible-price
 * reading and text Web Search; SerpApi Google Lens adds reverse-image product
 * matches. QR/barcode decoding remains local on-device and product URLs are
 * fetched directly through the SSRF-safe metadata extractor.
 */

const MAX_IMAGE_SIZE = 6 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_SIZE, files: 1 } });
// GOOGLE LENS LEVEL: pipeline cache for 1000+ users — instant repeat
const pipelineCache = new Map<string, { at: number; data: any }>();
const PIPELINE_TTL_MS = 6 * 60_000;
export function pipelineKey(buf: Buffer, intent: string | null): string {
  // Full content digest prevents same-size images with different middle bytes
  // from sharing analysis results. Intent is a separate, length-delimited input.
  return createHash('sha256')
    .update(buf)
    .update(Buffer.from([0]))
    .update(intent || '')
    .digest('hex');
}
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CHANNELS = new Set<AyrovixChannel>(['image', 'url', 'qr']);

/**
 * Message de la recherche visuelle (SerpApi), le MÊME pour le flux et pour le
 * JSON : il dit CE QUI A MANQUÉ — lent, vide, ou fournisseur muet. Jamais un
 * code brut dans l'interface.
 */
function visualSearchMessage(code: string): string {
  if (code === 'SERPAPI_TIMEOUT') return "La recherche visuelle a mis trop de temps. Réessayez dans un instant.";
  if (code === 'SERPAPI_NO_MATCHES') return "Aucun produit correspondant trouvé sur la photo. Essayez une photo plus nette et centrée.";
  return "La recherche visuelle est temporairement indisponible. Réessayez dans un instant.";
}

function reviewSessionId(req: Request): string | null {
  const raw = Array.isArray(req.headers['x-session-id']) ? req.headers['x-session-id'][0] : req.headers['x-session-id'];
  const value = String(raw || '').trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : null;
}

function reviewContact(raw: unknown): string | null {
  const value = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
  const digits = value.replace(/\D/g, '');
  return email || (digits.length >= 8 && digits.length <= 15) ? value : null;
}

function optionalPublicUrl(raw: unknown): string {
  const safe = sanitizeProductUrl(raw);
  if (!safe) return '';
  const parsed = new URL(safe);
  return parsed.username || parsed.password ? '' : parsed.toString();
}

function publicReview(row: any) {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    sourceUrl: row.source_url,
    imageUrl: row.image_url,
    source: row.source,
    lensPrice: row.lens_price == null ? null : Number(row.lens_price),
    lensCurrency: row.lens_currency || null,
    desiredSize: row.desired_size || '',
    desiredColor: row.desired_color || '',
    quotedPrice: row.quoted_price == null ? null : Number(row.quoted_price),
    quotedCurrency: row.quoted_currency || null,
    verifiedVariant: row.verified_variant || '',
    verifiedUrl: row.verified_url || '',
    customerMessage: row.customer_message || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    duplicate: Boolean(row.duplicate),
  };
}

function quoteToken(price: number | null, currency: string | null, title: string, referenceUrl: string, status: AyrovixQuoteStatus): string | null {
  if (price == null || !currency) return null;
  return createAyrovixPriceToken({ price, currency, title, referenceUrl, status });
}

function tokenizedCandidate(candidate: AyrovixCandidate): AyrovixCandidate {
  const normalized = withDisplayRating(candidate);
  const status: AyrovixQuoteStatus = normalized.kind === 'catalog' ? 'VERIFIED' : 'PENDING_MANUAL';
  return {
    ...normalized,
    priceVerificationStatus: status,
    priceToken: quoteToken(candidate.price, candidate.currency, candidate.title, candidate.sourceUrl, status),
  };
}

function tokenizedCandidates(items: AyrovixCandidate[]): AyrovixCandidate[] {
  // D2-10: strict first, lenient PENDING fallback — never 0 when lens has matches without price
  const filtered = filterWithFallback(items, 24);
  return filtered.map(tokenizedCandidate);
}

const PRICE_LIKE_TEXT = /(?:(?:€|[$£]|\b(?:TND|EUR|USD|GBP|CAD|AED|DT)\b|د\.?\s?ت)\s*(?:\d{1,3}(?:[ .,'’\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)|(?:\d{1,3}(?:[ .,'’\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|[$£]|\b(?:TND|EUR|USD|GBP|CAD|AED|DT)\b|د\.?\s?ت))/giu;

/** Supprime les montants de recherche : un titre/snippet n'est pas une preuve de prix. */
function stripPriceLikeText(value: unknown): string {
  return String(value || '')
    .replace(PRICE_LIKE_TEXT, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*[|•,;:—–-]\s*){2,}/gu, ' ')
    .replace(/^[\s|•,;:—–-]+|[\s|•,;:—–-]+$/gu, '')
    .trim();
}
/**
 * SerpApi discovery card: keep the title, image and merchant URL visible while
 * Bright Data reads the page. A SerpApi snippet is NOT a current merchant price
 * or stock proof, so hide it until the merchant page supplies it.
 */
function safeVisualDiscoveryCandidate(candidate: AyrovixCandidate): AyrovixCandidate {
  if (candidate.kind === 'catalog') return candidate;
  const cleanTitle = stripPriceLikeText(candidate.title);
  const hasPagePrice = Boolean(candidate.sourceRead)
    && candidate.priceOrigin === 'merchant'
    && candidate.priceVerificationStatus === 'VERIFIED'
    && Number.isFinite(candidate.price)
    && Number(candidate.price) > 0
    && Boolean(candidate.currency);
  const safeCopy: AyrovixCandidate = {
    ...candidate,
    title: cleanTitle.length >= 4 ? cleanTitle : 'Produit repéré',
    // applyLiveStock replaces an index snippet with the merchant description (or null).
    // Remove embedded amounts even from page copy so the structured verified price is
    // the only price claim shown by Lens.
    description: candidate.sourceRead ? (stripPriceLikeText(candidate.description) || null) : null,
  };
  if (hasPagePrice) return safeCopy;
  return {
    ...safeCopy,
    // The card needs only title/image/link when the page price is not verified.
    description: null,
    details: [],
    sourceCondition: null,
    offers: undefined,
    price: null,
    currency: null,
    priceTnd: null,
    originalPrice: null,
    originalPriceTnd: null,
    promo: null,
    priceOrigin: null,
    priceVerificationStatus: 'PENDING_MANUAL',
    priceToken: null,
    // `in_stock` / `out_of_stock` in a visual-search snippet is not live proof.
    ...(candidate.sourceRead ? {} : { availability: 'unknown' as const }),
  };
}

function tokenizedProduct(product: AyrovixProduct): AyrovixProduct {
  const status: AyrovixQuoteStatus = product.priceVerified ? 'VERIFIED' : 'PENDING_MANUAL';
  return {
    ...product,
    priceVerificationStatus: status,
    priceToken: quoteToken(product.price, product.currency, product.title, product.sourceUrl, status),
    variantOptions: product.variantOptions?.map((option) => ({
      ...option,
      priceToken: quoteToken(option.price, option.currency, product.title, product.sourceUrl, status),
    })),
  };
}

function rememberAuthenticatedHistory(
  db: QatafoDatabase,
  req: Request,
  input: Omit<AyrovixHistoryInput, 'accountId'>,
): void {
  try {
    recordAyrovixHistory(db, { ...input, accountId: resolveCustomer(db, req)?.id });
  } catch (error: any) {
    // History is a convenience and must never break Lens analysis/order flows.
    console.warn('[AYROVIX history]', error?.message || 'write failed');
  }
}

/** GLOBAL DISCOVERY — les doublons multi-sources deviennent un produit avec
 *  plusieurs offres AVANT la coupe finale, pour que la limite serve des produits
 *  distincts et non quatre fois le même. */
function mergeCandidates(items: AyrovixCandidate[], limit = 8): AyrovixCandidate[] {
  return filterWithFallback(groupOffers(items), limit);
}

async function searchByCodeOrText(db: QatafoDatabase, value: string): Promise<AyrovixCandidate[]> {
  const local = catalogSearch(db, null, value, 4)
    .map((candidate) => ({ ...candidate, match: scoreCandidate(null, value, candidate) }));
  const external = await externalProductSearch(value, 8).catch(() => []);
  return mergeCandidates([
    ...local,
    ...external.map((candidate) => ({ ...candidate, match: scoreCandidate(null, value, candidate) })),
  ]);
}

export function createAyrovixRouter(db: QatafoDatabase, scraper: SmartLinkScraper): Router {
  const router = Router();

  router.get('/history', (req: Request, res: Response) => {
    const customer = resolveCustomer(db, req);
    if (!customer) return res.json({ success: true, data: [] });
    return res.json({ success: true, data: listAyrovixHistory(db, customer.id, Number(req.query.limit) || 30) });
  });

  // أحداث Live مجهولة (analytics منتج): لا صورة/لا IP/لا بيانات شخصية.
  const LIVE_EVENTS = new Set(['live_opened', 'object_detected', 'object_locked', 'tracking_lost', 'ai_unavailable', 'match_requested', 'match_returned']);
  router.post('/live-events', (req: Request, res: Response) => {
    const type = String(req.body?.type || '');
    if (!LIVE_EVENTS.has(type)) return res.status(400).json({ success: false, error: 'Type invalide.' });
    db.run(`CREATE TABLE IF NOT EXISTS ayrovix_live_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      meta TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`);
    const meta = req.body?.meta && typeof req.body.meta === 'object' ? JSON.stringify(req.body.meta).slice(0, 300) : '{}';
    db.run('INSERT INTO ayrovix_live_events (type,meta,created_at) VALUES (?,?,?)', type, meta, new Date().toISOString());
    res.json({ success: true });
  });

  router.post('/analyze-image', upload.single('image'), async (req: Request, res: Response) => {
    const requestId = `ayx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    const trace = startTrace(requestId);
    // expose requestId for client correlation (no PII)
    res.setHeader('X-Ayrovix-Request-Id', requestId);
    const stream = String(req.headers.accept || '').includes('text/event-stream');
    const emit = (event: string, data: unknown) => {
      if (!stream || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    // ANNULATION — le client peut fermer la connexion (« Annuler » dans
    // l'application). Sans ce drapeau, le serveur continue de lire les pages
    // marchandes (quota Bright Data, temps Render) pour un résultat que
    // personne ne verra. `writableEnded` distingue la fin normale d'une
    // fermeture par le client.
    let cancelled = false;
    res.on('close', () => { if (!res.writableEnded) cancelled = true; });
    if (stream) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
    }
    const tStart = Date.now();
    // Frontend may send crop timing via header
    const headerCrop = Number(req.headers['x-lens-crop-ms']);
    if (Number.isFinite(headerCrop)) mark(trace, 'cropMs', Math.max(0, Math.round(headerCrop)));
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ success: false, code: 'IMAGE_REQUIRED', error: 'Veuillez envoyer une image du produit.' });
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return res.status(415).json({ success: false, code: 'UNSUPPORTED_IMAGE', error: 'Format non supporté — JPEG, PNG ou WebP uniquement.' });
    }
    // Journal d'arrivée, avant Sharp/SerpApi : permet de distinguer en une ligne
    // « le téléphone n'a jamais envoyé le fichier » d'un échec fournisseur.
    const clientKind = String(req.headers['x-ayrovi-client'] || 'web').slice(0, 40);
    const nativeTransport = req.headers['x-ayrovi-native'] === '1';
    console.info(`[AYROVIX analyze-image] received ${requestId} bytes=${file.buffer.length} mime=${file.mimetype} client=${clientKind} native=${nativeTransport ? 1 : 0}`);
    // Délai global : sans lui, une étape muette laisse le client sur « Analyse en cours… ».
    let timedOut = false;
    const deadlineMs = lensAnalyzeDeadlineMs();
    const cancelDeadline = armLensDeadline(deadlineMs, () => {
      timedOut = true;
      console.warn('[AYROVIX analyze-image] ANALYZE_TIMEOUT', requestId, deadlineMs);
      const message = "L'analyse a pris trop de temps. Réessayez avec une photo plus nette ou dans un instant.";
      if (stream) {
        if (!res.writableEnded) { emit('error', { code: 'ANALYZE_TIMEOUT', error: message }); res.end(); }
      } else if (!res.headersSent) {
        res.status(504).json({ success: false, code: 'ANALYZE_TIMEOUT', error: message });
      }
    });
    try {
      const tNorm = Date.now();
      const normalized = await normalizeUploadedImage(file.buffer, file.mimetype);
      mark(trace, 'normalizeMs', Date.now() - tNorm);
      // D2-8: backend ROI crop — if frontend sends roi (x,y,w,h % 0..100), crop server-side and avoid second upload
      // keeps 18% pad like canvas, uses sharp extract on normalized buffer
      let effectiveBuffer = normalized.buffer;
      let effectiveMime: typeof normalized.mimeType = normalized.mimeType;
      const roiRaw = String((req.body as any)?.roi || (req.body as any)?.box || '').trim();
      if (roiRaw) {
        try {
          const roi = JSON.parse(roiRaw);
          let x = Number(roi.x), y = Number(roi.y), w = Number(roi.w), h = Number(roi.h);
          if ([x, y, w, h].every((n) => Number.isFinite(n)) && w > 2 && h > 2 && w <= 100 && h <= 100) {
            x = Math.max(0, Math.min(100, x)); y = Math.max(0, Math.min(100, y));
            w = Math.max(2, Math.min(100 - x, w)); h = Math.max(2, Math.min(100 - y, h));
            const nx = normalized.width, ny = normalized.height;
            let px = Math.round((x / 100) * nx), py = Math.round((y / 100) * ny);
            let pw = Math.round((w / 100) * nx), ph = Math.round((h / 100) * ny);
            const pad = Math.max(24, Math.max(pw, ph) * 0.18);
            let padX = Math.round(px - pad), padY = Math.round(py - pad);
            let padW = Math.round(pw + pad * 2), padH = Math.round(ph + pad * 2);
            if (padX < 0) { padW += padX; padX = 0; }
            if (padY < 0) { padH += padY; padY = 0; }
            if (padX + padW > nx) padW = nx - padX;
            if (padY + padH > ny) padH = ny - padY;
            if (padW >= 20 && padH >= 20) {
              const tCrop = Date.now();
              effectiveBuffer = await sharp(effectiveBuffer).extract({ left: padX, top: padY, width: padW, height: padH }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
              effectiveMime = 'image/jpeg';
              mark(trace, 'cropMs', Date.now() - tCrop);
            }
          }
        } catch { /* ignore malformed roi — fallback to full image */ }
      }
      mark(trace, 'imageBytesIn', effectiveBuffer.length);
      // SerpApi EST l'entrée de la recherche : sans elle, la recherche ne peut
      // pas commencer. (La vision IA ne la remplace plus — 17/10/2026.)
      if (!serpApiVisualReady()) {
        return res.status(503).json({ success: false, code: 'AYROVIX_UNAVAILABLE', error: "AYROVIX n'est pas encore activé. Réessayez bientôt." });
      }

      /*
       * UN SEUL CHEMIN (décision produit du 02/10/2026, confirmée le 17/10/2026).
       *
       *   photo → SerpApi (liens) → pages marchandes (vérité) → calculateur,
       *   promo, isolation → compréhension produit → écran adapté.
       *
       * Tout ce qui DEVINAIT a été retiré de ce chemin : prix lu sur l'image,
       * OCR, requête IA « optimisée », re-scoring IA de pertinence, recherche
       * web textuelle. SerpApi ne sert qu'à trouver les pages ; ce qui s'affiche
       * vient des pages.
       *
       * SERPAPI EST L'ENTRÉE — ET LA SEULE (17/10/2026). La vision IA n'est
       * PLUS un dernier recours de la recherche : quand SerpApi ne rend aucun
       * lien, la recherche s'arrête là et le DIT (VISUAL_SEARCH_FAILED). Aucun
       * autre fournisseur ne prend le relais en silence.
       */
      const recognition = await recognizeImage(effectiveBuffer, effectiveMime, { withVision: false, withSignals: false });
      res.setHeader('X-Ayrovix-Cache', recognition.cacheHit);
      mark(trace, 'cacheHit', {
        vision: false,
        serpApi: recognition.cacheHit === 'matches' || recognition.cacheHit === 'both',
        query: false,
        relevance: false,
      });
      mark(trace, 'serpApiTotalMs', recognition.timings.matchesMs);
      const visualCandidates = recognition.matches;
      const visualStatus = visualCandidates.length
        ? 'ok'
        : recognition.matchesError instanceof SerpApiVisualError
          ? recognition.matchesError.code
          : 'empty';
      res.setHeader('X-Ayrovix-Visual-Status', visualStatus);

      let identification: AyrovixIdentification;
      if (visualCandidates.length) {
        // L'intitulé vient de la meilleure page, mais un prix du titre SerpApi
        // n'est ni actuel ni vérifié : seul le texte produit est conservé.
        identification = fallbackIdentification(stripPriceLikeText(visualCandidates[0].title) || 'Produit visuellement similaire');
      } else {
        /*
         * SERPAPI SEUL. Pas de vision IA en secours : SerpApi EST l'entrée de
         * la recherche. Sans lien, on s'arrête ici et on le dit clairement —
         * plutôt que d'appeler un autre fournisseur en silence (et d'afficher
         * une erreur de facturation à l'utilisateur).
         */
        throw recognition.matchesError instanceof SerpApiVisualError
          ? recognition.matchesError
          : new SerpApiVisualError('NO_MATCHES');
      }
      // Aucun prix ne vient de l'image : ni de la vision, ni de l'OCR.
      identification.detected_price = { amount: 0, currency: '', label: 'none', confidence: 0 };
      identification.pricing = { sale_price: null, original_price: null, shipping_price: null, total_price: null, currency: null, discount_percent: null };
      if (identification.products?.length) {
        identification.products = identification.products.map((product) => ({ ...product, price: null, currency: null }));
      }

      const pKey = pipelineKey(effectiveBuffer, null);
      const isTest = !!(process.env.VITEST || process.env.NODE_ENV === 'test');
      // D3-13: ETag for 304 Not Modified — same image hash → no re-download
      const etag = `W/"${createHash('sha1').update(pKey).digest('hex').slice(0, 16)}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      if (!isTest && req.headers['if-none-match'] === etag) {
        mark(trace, 'pipelineCacheHit', true);
        endTrace(trace);
        return res.status(304).end();
      }
      const pCached = isTest ? null : pipelineCache.get(pKey);
      if (pCached && Date.now() - pCached.at < PIPELINE_TTL_MS) {
        mark(trace, 'pipelineCacheHit', true);
        mark(trace, 'candidatesCount', (pCached.data?.candidates?.length ?? 0));
        endTrace(trace);
        if (stream) {
          // Le client attend du SSE : en-tête déjà posé, donc on rejoue les fiches et `done`
          // (un `res.json` ici envoyait du JSON sous `text/event-stream` → « Réponse illisible »).
          const cachedData = pCached.data;
          for (const candidate of cachedData.candidates ?? []) emit('card', candidate);
          emit('done', {
            eventId: cachedData.eventId,
            query: cachedData.query,
            identification: cachedData.identification,
            excluded: cachedData.excluded,
            liveStock: cachedData.liveStock,
          });
          return res.end();
        }
        return res.json({ success: true, data: pCached.data });
      }
      mark(trace, 'pipelineCacheHit', false);

      emit('progress', { step: 'identified', identification });
      const effectiveQuery = buildSearchQuery(identification);
      emit('progress', { step: 'searching' });
      const tSearch = Date.now();
      // Avec des liens SerpApi, `searchCandidates` n'appelle AUCUNE recherche web :
      // il note, convertit (calculateur ZAYROVI) et regroupe les offres, puis
      // ajoute le catalogue ZAYROVI (données réelles elles aussi).
      const rawCandidates = (visualCandidates.length > 0 || identification.confidence >= 0.35) && effectiveQuery
        ? await searchCandidates(db, identification, effectiveQuery, visualCandidates)
        : [];
      mark(trace, 'searchCandidatesMs', Date.now() - tSearch);

      const tDedup = Date.now();
      const candidates = deduplicateCandidates(rawCandidates);
      mark(trace, 'dedupMs', Date.now() - tDedup);

      /*
       * SerpApi matches are useful BEFORE merchant scraping completes: publish
       * title + thumbnail + link as soon as they arrive. Never pass its price
       * snippet/stock hint through as live merchant proof; the card is clearly
       * marked « price not published » until the page is read.
       */
      const discoveryCandidates = filterLenientCandidates(candidates, 24)
        .filter((candidate) => !isConfirmedOutOfStockCandidate(candidate))
        .map(safeVisualDiscoveryCandidate);
      if (stream && !cancelled) {
        for (const candidate of discoveryCandidates) {
          emit('card', tokenizedCandidate(candidate));
        }
      }

      /*
       * VÉRITÉ MARCHANDE — Bright Data lit les liens SerpApi en parallèle :
       * prix du jour, disponibilité, tailles, photos, description. La fiche
       * visuelle reste affichée si Bright Data ne peut pas lire la page, mais
       * son prix reste masqué.
       */
      const tLiveStock = Date.now();
      let readyCount = 0;
      emit('progress', { step: 'reading', done: 0, total: candidates.length });
      const { candidates: liveCandidates, report: liveStock } = await enrichCandidatesLiveStock(candidates, {
        fetcher: (url) => scraper.scrapeParsedPage(url).then((result) => result.data),
        reprice: (price, currency) => {
          const estimate = estimateWithDb(db, price, currency);
          return estimate ? { priceTnd: estimate.priceTnd, promo: estimate.promo } : null;
        },
        onReady: (candidate) => {
          readyCount += 1;
          // Le client a fermé la connexion : plus rien à émettre, et la lecture
          // des pages suivantes ne sert plus personne.
          if (cancelled) return;
          emit('progress', { step: 'reading', done: readyCount, total: candidates.length });
          // Peut remplacer la carte de découverte déjà émise par SerpApi :
          // le client met à jour le même lien avec les faits de la page.
          emit('card', tokenizedCandidate(safeVisualDiscoveryCandidate(candidate)));
        },
      });
      mark(trace, 'liveStockMs', Date.now() - tLiveStock);
      mark(trace, 'liveStockFetched', liveStock.fetched);
      mark(trace, 'liveStockCacheHits', liveStock.cacheHits);
      mark(trace, 'liveStockApplied', liveStock.applied);
      // Annulé en cours de route : on s'arrête ici (pas de fiche en base, pas
      // de cache pollutionné, pas de travail inutile).
      if (cancelled) { endTrace(trace); return; }
      /*
       * ACHETABILITÉ ≠ DÉCOUVERTE VISUELLE.
       * Les fiches avec prix + stock prouvés restent les premières cartes.
       * Les autres matches SerpApi restent visibles (titre, image, lien), mais
       * sans prix SerpApi/non vérifié et sans action d'achat. Une rupture
       * confirmée reste cachée.
       */
      const purchasable = filterPurchasable(liveCandidates);
      mark(trace, 'purchasableKept', purchasable.report.kept);
      mark(trace, 'purchasableBlocked', purchasable.report.excluded);
      const purchasableUrls = new Set(purchasable.candidates.map((candidate) => candidate.sourceUrl));
      const visualFallback = filterLenientCandidates(liveCandidates, 24)
        .filter((candidate) => !isConfirmedOutOfStockCandidate(candidate))
        .filter((candidate) => !purchasableUrls.has(candidate.sourceUrl));
      const excludedReasons: Record<string, number> = { ...purchasable.report.reasons };
      for (const candidate of visualFallback) {
        const blocker = purchaseBlocker(candidate);
        if (!blocker) continue;
        const remaining = Math.max(0, (excludedReasons[blocker] || 0) - 1);
        if (remaining) excludedReasons[blocker] = remaining;
        else delete excludedReasons[blocker];
      }
      const excludedCount = Object.values(excludedReasons).reduce((sum, count) => sum + count, 0);
      mark(trace, 'visualFallbackKept', visualFallback.length);
      mark(trace, 'excludedCount', excludedCount);
      mark(trace, 'excludedReasons', excludedReasons);
      if (visualFallback.length || excludedCount) {
        console.info(`[AYROVIX analyze-image] ${visualFallback.length} match(s) SerpApi conservé(s) sans prix non vérifié ; ${excludedCount} fiche(s) masquée(s) : ${JSON.stringify(excludedReasons)}`);
      }
      const title = [identification.brand, identification.model].filter(Boolean).join(' ')
        || identification.description
        || 'Produit détecté par AYROVIX';
      const query = effectiveQuery;
      const securedCandidates = [
        ...purchasable.candidates.map(safeVisualDiscoveryCandidate),
        ...visualFallback.map(safeVisualDiscoveryCandidate),
      ].slice(0, 24).map(tokenizedCandidate);
      // Chauffe le cache d'isolation/redimensionnement pendant que le client lit la grille.
      const candidateMedia = [...securedCandidates.map((item) => item.image), ...securedCandidates.flatMap((item) => item.images || [])];
      warmIsolation(candidateMedia, 8);
      warmComposition(candidateMedia, 8);
      // Le délai a déjà répondu : on n'écrit plus rien dans la réponse.
      if (timedOut) return;
      const eventId = recordAyrovixEvent(db, {
        channel: 'image',
        brand: identification.brand,
        query: query || identification.description,
        candidatesCount: securedCandidates.length,
      });
      const historyMatch = securedCandidates[0];
      rememberAuthenticatedHistory(db, req, {
        eventId,
        kind: 'image',
        queryLabel: query || identification.description,
        title: historyMatch?.title || title,
        imageUrl: historyMatch?.image || '',
        sourceUrl: historyMatch?.sourceUrl || '',
        source: historyMatch?.source || 'AYROVIX Vision',
        price: historyMatch?.price ?? null,
        currency: historyMatch?.currency ?? null,
        verificationStatus: historyMatch?.priceVerificationStatus || 'PENDING_MANUAL',
        resultsCount: candidates.length,
      });

      const responseData = {
        identification,
        query,
        candidates: securedCandidates,
        eventId,
        // Plus aucun prix ne vient de l'image (02/10/2026) : le champ reste pour le contrat client.
        detectedPrice: null,
        liveStock: { fetched: liveStock.fetched, cacheHits: liveStock.cacheHits, applied: liveStock.applied, budget: liveStock.budget },
        excluded: { count: excludedCount, reasons: excludedReasons },
      };
      if (!isTest) {
        if (pipelineCache.size > 300) pipelineCache.delete(pipelineCache.keys().next().value as string);
        pipelineCache.set(pKey, { at: Date.now(), data: responseData });
      }
      mark(trace, 'candidatesCount', securedCandidates.length);
      mark(trace, 'totalBackendMs', Date.now() - tStart);
      endTrace(trace);
      if (stream) {
        // Final cards replace the initial SerpApi-only cards by sourceUrl,
        // attaching Bright Data facts/prices where a page was successfully read.
        for (const candidate of securedCandidates) {
          emit('card', candidate);
        }
        emit('done', { eventId, query, identification, excluded: responseData.excluded, liveStock: responseData.liveStock });
        return res.end();
      }
      return res.json({ success: true, data: responseData });
    } catch (error: any) {
      if (timedOut) return;
      if (stream && !res.writableEnded) {
        emit('error', error instanceof SerpApiVisualError
          ? { code: 'VISUAL_SEARCH_FAILED', error: visualSearchMessage(error.code) }
          : { code: error?.code || 'IDENTIFICATION_FAILED', error: error?.message || 'IDENTIFICATION_FAILED' });
        return res.end();
      }
      if (error instanceof InvalidImageError || error?.code === 'INVALID_IMAGE') {
        return res.status(415).json({ success: false, code: 'INVALID_IMAGE', error: error.message });
      }
      if (error instanceof AyrovixUnavailableError || error?.code === 'AYROVIX_UNAVAILABLE') {
        return res.status(503).json({ success: false, code: 'AYROVIX_UNAVAILABLE', error: "AYROVIX n'est pas encore activé. Réessayez bientôt." });
      }
      if (error instanceof SerpApiVisualError) {
        console.warn('[AYROVIX analyze-image]', error.code);
        // Le message dit CE QUI A MANQUÉ : lent, vide, ou fournisseur muet.
        return res.status(502).json({
          success: false,
          code: 'VISUAL_SEARCH_FAILED',
          providerCode: error.code,
          error: visualSearchMessage(error.code),
        });
      }
      console.warn('[AYROVIX analyze-image]', error?.code || error?.message || 'unknown');
      return res.status(422).json({ success: false, code: 'IDENTIFICATION_FAILED', error: "Impossible d'identifier le produit. Essayez une photo plus nette et centrée." });
    } finally {
      cancelDeadline();
    }
  });

  /*
   * Z Lens mobile — DÉTECTION : ce que la photo fait ressembler, en
   * « correspondances visuelles ». SerpApi EST l'entrée (17/10/2026) : il rend
   * les PAGES qui ressemblent à la photo, pas des boîtes. Donc pas de cadre
   * automatique — le cadre reste manuel — et la liste des correspondances est
   * ce que l'utilisateur voit (mode Live).
   *
   * Aucun prix ici : le prix vient de la page marchande, quand on l'ouvre.
   */
  router.post('/detect', upload.single('image'), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ success: false, code: 'IMAGE_REQUIRED', error: 'Veuillez envoyer une image.' });
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return res.status(415).json({ success: false, code: 'UNSUPPORTED_IMAGE', error: 'Format non supporté — JPEG, PNG ou WebP uniquement.' });
    }
    if (!serpApiVisualReady()) {
      return res.status(503).json({ success: false, code: 'AYROVIX_UNAVAILABLE', error: "La recherche visuelle n'est pas encore activée." });
    }
    try {
      const normalized = await normalizeUploadedImage(file.buffer, file.mimetype);
      // 768 px : SerpApi n'a pas besoin de plus, et la requête reste légère.
      const small = await sharp(normalized.buffer)
        .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      const matches = await serpApiVisualSearch(small.data, 12, { countries: LENS_LIVE_SEARCH_COUNTRIES });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        success: true,
        data: {
          // SerpApi ne rend pas d'itinéraires (boîtes) : pas de cadre automatique.
          products: [],
          matches: matches.map((match) => ({
            name: stripPriceLikeText(match.title) || 'Produit repéré',
            image: match.image,
            url: match.sourceUrl,
            source: match.source,
          })),
          width: normalized.width,
          height: normalized.height,
        },
      });
    } catch (error: any) {
      if (error instanceof InvalidImageError || error?.code === 'INVALID_IMAGE') {
        return res.status(415).json({ success: false, code: 'INVALID_IMAGE', error: error.message });
      }
      if (error instanceof SerpApiVisualError) {
        console.warn('[AYROVIX detect]', error.code);
        return res.status(502).json({
          success: false,
          code: 'VISUAL_SEARCH_FAILED',
          providerCode: error.code,
          error: visualSearchMessage(error.code),
        });
      }
      console.warn('[AYROVIX detect]', error?.message || 'unknown');
      return res.status(422).json({
        success: false,
        code: 'DETECTION_FAILED',
        error: 'Aucun produit n’a pu être repéré sur cette image.',
      });
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
      const securedProduct = tokenizedProduct(result.product);
      const securedAlternates = tokenizedCandidates(result.alternates);
      // La galerie complète du produit est préparée en arrière-plan (isolation + WebP).
      const productMedia = [...securedProduct.images, securedProduct.image, ...securedAlternates.map((item) => item.image)];
      warmIsolation(productMedia, 10);
      warmComposition(productMedia, 10);
      const historyMatch = securedProduct.price != null ? null : securedAlternates[0];
      if (req.body?.recordHistory !== false) rememberAuthenticatedHistory(db, req, {
        eventId,
        kind: channel === 'qr' ? 'qr' : 'url',
        inputValue: String(url || ''),
        queryLabel: result.product.title,
        title: historyMatch?.title || securedProduct.title,
        imageUrl: historyMatch?.image || securedProduct.image,
        sourceUrl: securedProduct.sourceUrl,
        source: historyMatch?.source || securedProduct.source,
        price: historyMatch?.price ?? securedProduct.price,
        currency: historyMatch?.currency ?? securedProduct.currency,
        verificationStatus: historyMatch?.priceVerificationStatus || securedProduct.priceVerificationStatus,
        resultsCount: 1 + result.alternates.length,
      });
      return res.json({
        success: true,
        data: { product: securedProduct, alternates: securedAlternates, eventId },
      });
    } catch (error: any) {
      if (error instanceof InvalidUrlError || error?.code === 'INVALID_URL') {
        return res.status(400).json({ success: false, code: 'INVALID_URL', error: 'Ce lien ne peut pas être analysé. Vérifiez le format.' });
      }
      if (error instanceof ExtractionFailedError || error?.code === 'EXTRACTION_FAILED') {
        try {
          const fallbackQuery = String(url || '').slice(0, 160);
          const candidates = await externalProductSearch(fallbackQuery, 6);
          const eventId = recordAyrovixEvent(db, { channel, query: fallbackQuery, candidatesCount: candidates.length });
          const securedAlternates = tokenizedCandidates(candidates);
          const fallbackProduct: AyrovixProduct = {
            title: `Produit ${fallbackQuery.slice(0, 60)}`,
            brand: null,
            model: null,
            description: 'Lien partagé — résultats de recherche web à confirmer.',
            image: '', images: [], source: 'Web', sourceUrl: String(url || ''),
            price: null, currency: null, priceTnd: null, exchangeRate: null,
            colors: [], sizes: [], availability: 'unknown', priceVerified: false,
            priceVerificationStatus: 'PENDING_MANUAL', verificationFailureCode: 'MERCHANT_EXTRACTION_FAILED',
          };
          const historyMatch = securedAlternates[0];
          if (req.body?.recordHistory !== false) rememberAuthenticatedHistory(db, req, {
            eventId,
            kind: channel === 'qr' ? 'qr' : 'url',
            inputValue: String(url || ''),
            queryLabel: fallbackQuery,
            title: historyMatch?.title || fallbackProduct.title,
            imageUrl: historyMatch?.image || '',
            sourceUrl: String(url || ''),
            source: historyMatch?.source || 'Web',
            price: historyMatch?.price ?? null,
            currency: historyMatch?.currency ?? null,
            verificationStatus: historyMatch?.priceVerificationStatus || 'PENDING_MANUAL',
            resultsCount: candidates.length,
          });
          return res.json({
            success: true,
            data: { product: fallbackProduct, alternates: securedAlternates, eventId, fallback: true },
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
      const securedCandidates = tokenizedCandidates(candidates);
      const eventId = recordAyrovixEvent(db, { channel: 'qr', query: `qr:${value}`, candidatesCount: candidates.length });
      const historyMatch = securedCandidates[0];
      rememberAuthenticatedHistory(db, req, {
        eventId, kind: 'code', inputValue: value, queryLabel: value,
        title: historyMatch?.title || `Code ${value}`,
        imageUrl: historyMatch?.image || '', sourceUrl: historyMatch?.sourceUrl || '', source: historyMatch?.source || 'QR',
        price: historyMatch?.price ?? null, currency: historyMatch?.currency ?? null,
        verificationStatus: historyMatch?.priceVerificationStatus || 'PENDING_MANUAL', resultsCount: candidates.length,
      });
      return res.json({ success: true, data: { code: value, candidates: securedCandidates, eventId } });
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
      const securedCandidates = tokenizedCandidates(candidates);
      const eventId = recordAyrovixEvent(db, { channel: 'qr', query: `barcode:${code}`, candidatesCount: candidates.length });
      const historyMatch = securedCandidates[0];
      rememberAuthenticatedHistory(db, req, {
        eventId, kind: 'barcode', inputValue: code, queryLabel: code,
        title: historyMatch?.title || `Code-barres ${code}`,
        imageUrl: historyMatch?.image || '', sourceUrl: historyMatch?.sourceUrl || '', source: historyMatch?.source || 'Code-barres',
        price: historyMatch?.price ?? null, currency: historyMatch?.currency ?? null,
        verificationStatus: historyMatch?.priceVerificationStatus || 'PENDING_MANUAL', resultsCount: candidates.length,
      });
      return res.json({ success: true, data: { code, candidates: securedCandidates, eventId } });
    } catch (error: any) {
      console.warn('[AYROVIX analyze-barcode]', error?.message || 'unknown');
      return res.status(502).json({ success: false, code: 'BARCODE_SEARCH_FAILED', error: 'La recherche par code a échoué. Essayez avec une photo.' });
    }
  });

  router.post('/analyze-text', async (req: Request, res: Response) => {
    const raw = String(req.body?.query ?? req.body?.value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (raw.length < 2) {
      return res.status(400).json({ success: false, code: 'INVALID_TEXT', error: 'Saisissez au moins 2 caractères pour rechercher un produit.' });
    }
    // Guard: if the query looks like a URL, suggest URL flow but still handle as text
    try {
      const candidates = await searchByCodeOrText(db, raw);
      const securedCandidates = tokenizedCandidates(candidates);
      const eventId = recordAyrovixEvent(db, { channel: 'text', query: raw, candidatesCount: candidates.length });
      const historyMatch = securedCandidates[0];
      rememberAuthenticatedHistory(db, req, {
        eventId, kind: 'text', inputValue: raw, queryLabel: raw,
        title: historyMatch?.title || raw,
        imageUrl: historyMatch?.image || '', sourceUrl: historyMatch?.sourceUrl || '', source: historyMatch?.source || 'Recherche texte',
        price: historyMatch?.price ?? null, currency: historyMatch?.currency ?? null,
        verificationStatus: historyMatch?.priceVerificationStatus || 'PENDING_MANUAL', resultsCount: candidates.length,
      });
      return res.json({ success: true, data: { query: raw, candidates: securedCandidates, eventId } });
    } catch (error: any) {
      console.warn('[AYROVIX analyze-text]', error?.message || 'unknown');
      return res.status(502).json({ success: false, code: 'TEXT_SEARCH_FAILED', error: 'La recherche par mot-clé a échoué. Vérifiez votre connexion.' });
    }
  });

  // VEILLE PRIX — «راقب السعر» (24/09/2026) : réservée au compte client connecté.
  router.post('/watch', (req: Request, res: Response) => {
    const account = resolveCustomer(db, req);
    if (!account) return res.status(401).json({ success: false, error: 'Connectez-vous pour surveiller un prix.' });
    if (priceWatcherLimitReached(db, account.id, req.body?.url)) {
      return res.status(429).json({ success: false, code: 'PRICE_WATCH_LIMIT', error: 'Limite de 50 veilles actives atteinte. Supprimez-en une avant d’en ajouter.' });
    }
    const created = addPriceWatcher(db, account.id, {
      url: String(req.body?.url || ''),
      title: String(req.body?.title || ''),
      imageUrl: String(req.body?.imageUrl || ''),
      source: String(req.body?.source || ''),
      targetPriceTnd: req.body?.targetPriceTnd == null ? null : Number(req.body.targetPriceTnd),
    });
    if (!created) return res.status(400).json({ success: false, error: 'Lien de produit invalide.' });
    res.json({ success: true, data: created });
  });

  router.get('/watch', (req: Request, res: Response) => {
    const account = resolveCustomer(db, req);
    if (!account) return res.status(401).json({ success: false, error: 'Connectez-vous pour voir vos veilles.' });
    res.json({ success: true, data: listPriceWatchers(db, account.id) });
  });

  router.delete('/watch/:id', (req: Request, res: Response) => {
    const account = resolveCustomer(db, req);
    if (!account) return res.status(401).json({ success: false, error: 'Connectez-vous.' });
    const removed = removePriceWatcher(db, account.id, String(req.params.id || ''));
    if (!removed) return res.status(404).json({ success: false, error: 'Veille introuvable.' });
    res.json({ success: true });
  });

  router.post('/review-request', (req: Request, res: Response) => {
    const sessionId = reviewSessionId(req);
    if (!sessionId) return res.status(400).json({ success: false, code: 'INVALID_SESSION', error: 'Session client invalide.' });
    const sourceUrl = optionalPublicUrl(req.body?.sourceUrl);
    const title = String(req.body?.title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!sourceUrl || title.length < 3) {
      return res.status(400).json({ success: false, code: 'INVALID_PRODUCT', error: 'Produit ou lien marchand invalide.' });
    }
    const customer = resolveCustomer(db, req);
    const contact = reviewContact(req.body?.contact) || reviewContact(customer?.phone) || reviewContact(customer?.email);
    if (!contact) {
      return res.status(400).json({ success: false, code: 'CONTACT_REQUIRED', error: 'Ajoutez un numéro de téléphone ou un e-mail valide.' });
    }
    const rawPrice = Number(req.body?.lensPrice);
    const lensPrice = Number.isFinite(rawPrice) && rawPrice > 0 && rawPrice <= 1_000_000 ? rawPrice : null;
    const rawCurrency = String(req.body?.lensCurrency || '').trim().toUpperCase();
    const lensCurrency = lensPrice && /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null;
    const eventId = /^ayx_[a-zA-Z0-9-]{10,64}$/.test(String(req.body?.eventId || '')) ? String(req.body.eventId) : null;
    const request = createAyrovixReviewRequest(db, {
      sessionId,
      accountId: customer?.id || null,
      eventId,
      sourceUrl,
      title,
      imageUrl: optionalPublicUrl(req.body?.imageUrl),
      source: String(req.body?.source || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100),
      lensPrice,
      lensCurrency,
      desiredSize: String(req.body?.desiredSize || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80),
      desiredColor: String(req.body?.desiredColor || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80),
      contact,
    });
    if (eventId) markAyrovixChosen(db, eventId);
    return res.status(request.duplicate ? 200 : 201).json({ success: true, data: publicReview(request) });
  });

  router.get('/review-request/:id', (req: Request, res: Response) => {
    const sessionId = reviewSessionId(req);
    const id = String(req.params.id || '');
    if (!sessionId || !/^ayx_review_[a-zA-Z0-9-]{10,64}$/.test(id)) {
      return res.status(400).json({ success: false, code: 'INVALID_REQUEST', error: 'Demande invalide.' });
    }
    const customer = resolveCustomer(db, req);
    const row = getAyrovixReviewForOwner(db, id, sessionId, customer?.id || null);
    if (!row) return res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Demande introuvable.' });
    return res.json({ success: true, data: publicReview(row) });
  });

  /*
   * STOCK FRAIS À LA DEMANDE (01/10/2026) — le bouton « vérifier le stock » de la
   * carte produit. Contrairement à la grille (budget + cache + échéance), cette
   * lecture ne sert JAMAIS le cache : c'est la preuve fraîche qu'une commande
   * attend. Elle alimente aussi le contrat de variantes, seul document qui
   * autorise « ajouter au panier » (le navigateur ne peut pas l'affirmer).
   */
  router.post('/live-stock', async (req: Request, res: Response) => {
    const raw = Array.isArray(req.body?.urls) ? req.body.urls : [];
    const urls = raw.filter((value: unknown): value is string => typeof value === 'string').slice(0, 8);
    if (!urls.length) {
      return res.status(400).json({ success: false, code: 'INVALID_REQUEST', error: 'Au moins un lien produit est requis.' });
    }
    try {
      const titleHint = String(req.body?.title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500);
      const { results } = await refreshLiveStock(urls, {
        fetcher: (url) => scraper.scrapeParsedPage(url).then((result) => result.data),
        reprice: (price, currency) => {
          const estimate = estimateWithDb(db, price, currency);
          return estimate ? { priceTnd: estimate.priceTnd, promo: estimate.promo } : null;
        },
      });
      const signed = results.map((row) => ({
        ...row,
        priceToken: row.price && row.currency
          ? quoteToken(row.price, row.currency, titleHint || row.url, row.url, 'VERIFIED')
          : null,
      }));
      return res.json({ success: true, data: { results: signed } });
    } catch (error: any) {
      console.warn(`[AYROVIX live-stock] ${String(error?.message || error).slice(0, 120)}`);
      return res.status(502).json({ success: false, code: 'LIVE_STOCK_FAILED', error: 'Vérification du stock impossible pour le moment.' });
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
