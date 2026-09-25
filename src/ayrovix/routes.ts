import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import { identifyProduct, buildSearchQuery, AyrovixUnavailableError, ayrovixAiReady, fallbackIdentification } from './services/ai';
import { catalogSearch, externalProductSearch, groupOffers, scoreCandidate, searchCandidates } from './services/search';
import { serpApiVisualReady, serpApiVisualSearch } from './services/visualSearch';
import { generateOptimizedSearch, analyzeResultRelevance, deduplicateCandidates, understandCustomerIntent } from './services/aiLensIntelligence';
import { extractProductFromUrl, ExtractionFailedError, InvalidUrlError, sanitizeProductUrl } from './services/product';
import { markAyrovixChosen, recordAyrovixEvent } from './events';
import { createAyrovixReviewRequest, getAyrovixReviewForOwner } from './reviews';
import { resolveCustomer } from '../customer/auth';
import type { AyrovixCandidate, AyrovixChannel, AyrovixDetectedPrice, AyrovixProduct } from './types';
import { calculatePrice } from '../services/pricing';
import { InvalidImageError, normalizeUploadedImage } from '../services/imageValidation';
import { createAyrovixPriceToken, type AyrovixQuoteStatus } from './priceQuote';
import { verifyCommerceProduct, signCommerceProduct } from './commerceQuote';
import { normalizeProduct, priceCommerceProduct, projectCandidate, projectProduct } from './services/commerceProduct';
import type { CommerceProduct } from '../../shared/commerceProduct';
import { listAyrovixHistory, recordAyrovixHistory, type AyrovixHistoryInput } from './history';
import { filterDisplayableCandidates, filterWithFallback, withDisplayRating } from './services/candidatePolicy';
import { startTrace, mark, endTrace } from './services/lensPerformanceTrace';
import { warmIsolation } from '../services/imageIsolation';
import { addPriceWatcher, listPriceWatchers, removePriceWatcher } from './services/priceWatch';
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
  // Full contents, not matching headers/tails: two different photos must never
  // share a result (or someone's merchant product/price).
  return createHash('sha256').update(buf).update('\0').update(intent || '').digest('hex');
}
function getCachedPricingRules(db: QatafoDatabase) {
  // Pricing rules can change between requests. A 5-minute cached FX table made
  // screenshot estimates disagree with fresh unit quotes and cart totals.
  return db.getPricingRules();
}
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CHANNELS = new Set<AyrovixChannel>(['image', 'url', 'qr']);

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

function currentProduct(db: QatafoDatabase, product: CommerceProduct): CommerceProduct {
  return product.quoteToken && verifyCommerceProduct(product) && product.pricing.pricingVersion === db.getPricingRules().version
    ? product : priceCommerceProduct(db, product);
}

function tokenizedCandidate(db: QatafoDatabase, candidate: AyrovixCandidate): AyrovixCandidate {
  const input = candidate.canonical || normalizeProduct({
    source: candidate.kind === 'catalog' ? 'catalog' : 'web', sourceUrl: candidate.sourceUrl,
    merchant: candidate.source, title: candidate.title, description: candidate.description,
    brand: candidate.brand, imageUrls: [candidate.image, candidate.images],
    sourcePrice: candidate.price, sourceCurrency: candidate.currency,
    rating: candidate.ratingKind === 'merchant' ? candidate.rating : null, reviews: candidate.ratingCount,
    availability: candidate.availability, verificationStatus: candidate.kind === 'catalog' ? 'VERIFIED' : 'PENDING_MANUAL',
  });
  const product = currentProduct(db, input);
  const normalized = withDisplayRating({ ...candidate, ...projectCandidate(product, candidate.match, candidate.kind),
    offerCount: candidate.offerCount, offers: candidate.offers });
  return { ...normalized, priceToken: quoteToken(product.pricing.sourcePrice, product.pricing.sourceCurrency,
    product.basic.title, product.identity.sourceUrl || '', product.verificationStatus) };
}

function tokenizedCandidates(db: QatafoDatabase, items: AyrovixCandidate[]): AyrovixCandidate[] {
  return filterWithFallback(items, 8).map(candidate => tokenizedCandidate(db, candidate));
}

function tokenizedProduct(db: QatafoDatabase, product: AyrovixProduct): AyrovixProduct {
  const canonical = product.canonical ? currentProduct(db, product.canonical) : null;
  const normalized = canonical ? { ...product, ...projectProduct(canonical) } : product;
  const status: AyrovixQuoteStatus = normalized.priceVerified ? 'VERIFIED' : 'PENDING_MANUAL';
  return {
    ...normalized,
    priceVerificationStatus: status,
    priceToken: quoteToken(normalized.price, normalized.currency, normalized.title, normalized.sourceUrl, status),
    variantOptions: normalized.variantOptions?.map(option => ({
      ...option,
      priceToken: quoteToken(option.price, option.currency, normalized.title, normalized.sourceUrl, status),
    })),
  };
}

function tokenizedDetectedPrice(price: AyrovixDetectedPrice | null): AyrovixDetectedPrice | null {
  if (!price) return null;
  return {
    ...price,
    priceToken: quoteToken(price.sourcePrice, price.sourceCurrency, price.title, '', 'PENDING_MANUAL'),
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

/** Cached discovery contains source evidence, not a frozen quote or converted screenshot total. */
export function refreshCachedImagePricing(db: QatafoDatabase, data: {
  candidates: AyrovixCandidate[]; detectedPrice?: AyrovixDetectedPrice | null;
}): { candidates: AyrovixCandidate[]; detectedPrice: AyrovixDetectedPrice | null } {
  const candidates = data.candidates.map(candidate => {
    if (!candidate.canonical) return tokenizedCandidate(db, candidate);
    return tokenizedCandidate(db, { ...candidate, canonical: priceCommerceProduct(db, candidate.canonical) });
  });
  const oldPrice = data.detectedPrice ?? null;
  const detectedPrice = oldPrice ? (() => {
    const calculated = calculatePrice(db.getPricingRules(), oldPrice.sourcePrice, oldPrice.sourceCurrency);
    return tokenizedDetectedPrice({ ...oldPrice, convertedPriceTND: calculated?.convertedPriceTND ?? null,
      serviceFeeTND: calculated?.serviceFeeTND ?? null,
      estimatedShippingTND: calculated?.shippingFeeTND ?? null,
      totalPriceTND: calculated?.totalTND ?? null });
  })() : null;
  return { candidates, detectedPrice };
}

/** A cached discovery is reusable evidence, never the previous visitor's event. */
function recordImageSearchEvent(db: QatafoDatabase, req: Request, details: {
  brand: string | null; query: string; title: string; candidates: AyrovixCandidate[];
  price: AyrovixDetectedPrice | null;
}): string {
  const eventId = recordAyrovixEvent(db, {
    channel: 'image', brand: details.brand, query: details.query, candidatesCount: details.candidates.length,
  });
  const first = details.candidates[0];
  rememberAuthenticatedHistory(db, req, {
    eventId, kind: 'image', queryLabel: details.query,
    title: first?.title || details.price?.title || details.title,
    imageUrl: first?.image || details.price?.imageUrl || '',
    sourceUrl: first?.sourceUrl || '', source: first?.source || 'AYROVIX Vision',
    price: first?.price ?? details.price?.sourcePrice ?? null,
    currency: first?.currency ?? details.price?.sourceCurrency ?? null,
    verificationStatus: first?.priceVerificationStatus || 'PENDING_MANUAL',
    resultsCount: details.candidates.length,
  });
  return eventId;
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
              mark(trace, 'cropMs', Date.now() - tCrop as any);
            }
          }
        } catch { /* ignore malformed roi — fallback to full image */ }
      }
      mark(trace, 'imageBytesIn', effectiveBuffer.length as any);
      if (!ayrovixAiReady() && !serpApiVisualReady()) {
        return res.status(503).json({ success: false, code: 'AYROVIX_UNAVAILABLE', error: "AYROVIX n'est pas encore activé. Réessayez bientôt." });
      }

      // Vision and reverse-image must not take each other down. A provider
      // timeout/schema error used to abort the whole Lens request even when
      // Google Lens had already found priced matches.
      const tParallel = Date.now();
      const [visionResult, visualResult] = await Promise.allSettled([
        identifyProduct(effectiveBuffer, effectiveMime),
        serpApiVisualSearch(effectiveBuffer, 8),
      ]);
      mark(trace, 'anthropicVisionMs', Date.now() - tParallel as any); // approx parallel total, serpApiTotalMs overlaps
      mark(trace, 'serpApiTotalMs', Date.now() - tParallel as any);
      const visualCandidates = visualResult.status === 'fulfilled' ? visualResult.value : [];
      let identification = visionResult.status === 'fulfilled' ? visionResult.value : null;
      if (!identification) {
        const visionError = visionResult.status === 'rejected' ? visionResult.reason : null;
        if (visionError instanceof AyrovixUnavailableError && visualCandidates.length === 0) throw visionError;
        if (visualCandidates.length === 0) throw visionError || new Error('IDENTIFICATION_FAILED');
        identification = fallbackIdentification(visualCandidates[0]?.title);
        console.warn('[AYROVIX analyze-image] vision failed — continuing with visual matches');
      }
      if (identification.products?.length) {
        const tPricing = Date.now();
        const rules = getCachedPricingRules(db);
        identification.products = identification.products.map((p) => {
          if (p.price != null && p.price > 0 && p.currency) {
            const calc = calculatePrice(rules, p.price, p.currency);
            return {
              ...p,
              priceTnd: calc?.totalTND ?? null,
            };
          }
          return p;
        });
        mark(trace, 'pricingMs', Date.now() - tPricing as any);
      }

      const visiblePrice = identification.detected_price;
      const usablePrice = visiblePrice.confidence >= 0.65
        && visiblePrice.amount > 0
        && Boolean(visiblePrice.currency)
        && (visiblePrice.label === 'product_price' || visiblePrice.label === 'cart_total');
      const calculated = usablePrice
        ? calculatePrice(getCachedPricingRules(db), visiblePrice.amount, visiblePrice.currency)
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

      // AI Search Intelligence — GOOGLE LENS LEVEL: cached, race with 2.5s, visual shortcut (skip cache in tests — 1px PNG collides)
      const customerIntentText: string | null = String((req.body as any)?.customerIntent || (req.body as any)?.intent || req.query?.intent || '').trim().slice(0,200) || null;
      const pKey = pipelineKey(effectiveBuffer, customerIntentText);
      const isTest = !!(process.env.VITEST || process.env.NODE_ENV === 'test');
      // Results include visitor-specific history events and time-sensitive FX.
      // Do not emit an unconditional 304 for the same photo; a different account
      // must never inherit another visitor's event or an outdated signed quote.
      res.setHeader('Cache-Control', 'private, no-store');
      const pCached = isTest ? null : pipelineCache.get(pKey);
      if (pCached && Date.now() - pCached.at < PIPELINE_TTL_MS) {
        mark(trace, 'pipelineCacheHit', true as any);
        const { candidates: refreshedCandidates, detectedPrice: refreshedPrice } = refreshCachedImagePricing(db, pCached.data);
        const freshEventId = recordImageSearchEvent(db, req, { brand: identification.brand,
          query: pCached.data.query || identification.description || '', title, candidates: refreshedCandidates,
          price: refreshedPrice });
        mark(trace, 'candidatesCount', refreshedCandidates.length as any);
        endTrace(trace);
        return res.json({ success: true, data: { ...pCached.data, identification,
          candidates: refreshedCandidates, detectedPrice: refreshedPrice, eventId: freshEventId } });
      }
      mark(trace, 'pipelineCacheHit', false as any);
      const baseQuery = buildSearchQuery(identification);
      // Search uses the source evidence immediately. Optional AI query refinement
      // warms its own cache asynchronously; provider cancellation is owned by the
      // provider, not an extra timer with a competing outcome.
      let effectiveQuery = baseQuery;
      if (!isTest && visualCandidates.length < 6) {
        const tOpt = Date.now();
        void generateOptimizedSearch(identification,
          customerIntentText ? understandCustomerIntent(identification, customerIntentText) : null,
          customerIntentText)
          .then((opt) => {
            if (opt?.primaryQuery) console.log('[AYROVIX] AI query warmed:', opt.primaryQuery.slice(0, 40));
            mark(trace, 'anthropicOptimizeMs', Date.now() - tOpt as any);
          })
          .catch(() => { mark(trace, 'anthropicOptimizeMs', Date.now() - tOpt as any); });
      }
      const tSearch = Date.now();
      const rawCandidates = (identification.confidence >= 0.35 || visualCandidates.length > 0) && effectiveQuery
        ? await searchCandidates(db, identification, effectiveQuery, visualCandidates)
        : [];
      mark(trace, 'searchCandidatesMs', Date.now() - tSearch as any);
      // A configured provider has its own AbortSignal deadline. No additional
      // arbitrary race may silently replace an actual relevance result.
      let relevanceMap: Map<string, any> | null = null;
      if (rawCandidates.length) {
        if (isTest) {
          const tRel = Date.now();
          try { relevanceMap = await analyzeResultRelevance(identification, rawCandidates, effectiveQuery); }
          catch { relevanceMap = null; }
          mark(trace, 'anthropicRelevanceMs', Date.now() - tRel as any);
        } else {
          const tRelBg = Date.now();
          void analyzeResultRelevance(identification, rawCandidates, effectiveQuery)
            .then(() => { mark(trace, 'anthropicRelevanceMs', Date.now() - tRelBg as any); })
            .catch(() => { mark(trace, 'anthropicRelevanceMs', Date.now() - tRelBg as any); });
        }
      }
      let rescoredCandidates = rawCandidates.map((c) => {
        if (relevanceMap && relevanceMap.has(c.id)) {
          const entry = relevanceMap.get(c.id);
          // never falsely claim exact match: cap strong at 94 if confidence low
          let adj = entry.adjustedMatch;
          if (entry.relevance === 'strong' && identification.confidence < 0.55) adj = Math.min(adj, 86);
          return { ...c, match: adj, relevance: entry.relevance } as any;
        }
        return c;
      });
      // filter irrelevant (below threshold) but keep at least 2 if all irrelevant
      if (relevanceMap) {
        const filtered = rescoredCandidates.filter((c:any) => c.relevance !== 'irrelevant');
        if (filtered.length >= 2 || filtered.length === rescoredCandidates.length) rescoredCandidates = filtered;
      }
      const tDedup = Date.now();
      const deduped = deduplicateCandidates(rescoredCandidates);
      mark(trace, 'dedupMs', Date.now() - tDedup as any);
      const candidates = deduped;
      const query = effectiveQuery;
      const securedCandidates = tokenizedCandidates(db, candidates);
      // Chauffe le cache d'isolation/redimensionnement pendant que le client lit la grille.
      warmIsolation([...securedCandidates.map((item) => item.image), ...securedCandidates.flatMap((item) => item.images || [])], 8);
      const securedPrice = tokenizedDetectedPrice(priceResult);
      const eventId = recordImageSearchEvent(db, req, { brand: identification.brand,
        query: query || identification.description || '', title, candidates: securedCandidates, price: securedPrice });

      const responseData = {
        identification,
        query,
        candidates: securedCandidates,
        eventId,
        detectedPrice: securedPrice,
        message: securedPrice
          ? isCartScreenshot
            ? `Total visible détecté: ${priceResult.sourcePrice} ${priceResult.sourceCurrency}. Un lien produit reste obligatoire avant commande.`
            : `Prix visible détecté: ${priceResult.sourcePrice} ${priceResult.sourceCurrency}. Le lien marchand permettra de le vérifier.`
          : undefined,
      };
      if (!isTest) {
        if (pipelineCache.size > 300) pipelineCache.delete(pipelineCache.keys().next().value as string);
        pipelineCache.set(pKey, { at: Date.now(), data: responseData });
      }
      mark(trace, 'candidatesCount', candidates.length as any);
      mark(trace, 'totalBackendMs', Date.now() - tStart as any);
      endTrace(trace);
      return res.json({ success: true, data: responseData });
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
      const securedProduct = tokenizedProduct(db, result.product);
      const securedAlternates = tokenizedCandidates(db, result.alternates);
      // La galerie complète du produit est préparée en arrière-plan (isolation + WebP).
      warmIsolation([...securedProduct.images, securedProduct.image, ...securedAlternates.map((item) => item.image)], 10);
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
          const securedAlternates = tokenizedCandidates(db, candidates);
          const fallbackProduct: AyrovixProduct = {
            title: 'Produit indisponible',
            brand: null,
            model: null,
            description: '',
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

  // Optional merchant-page enrichment for a SerpAPI hit. The incoming signed
  // canonical quote remains the monetary/rating/identity source of truth; a
  // source-matched merchant page may contribute only documented real media,
  // description or options. The server re-signs the WHOLE updated product.
  router.post('/enrich-candidate', async (req: Request, res: Response) => {
    const original = req.body?.product as CommerceProduct | undefined;
    if (!original || !verifyCommerceProduct(original) || original.identity.source !== 'serpapi' || !original.identity.sourceUrl) {
      return res.status(409).json({ success: false, code: 'INVALID_PRODUCT_QUOTE' });
    }
    try {
      const result = await extractProductFromUrl(db, scraper, original.identity.sourceUrl);
      const merchant = result.product.canonical;
      if (!merchant || merchant.identity.sourceUrl !== original.identity.sourceUrl || !merchant.basic.title) {
        return res.json({ success: true, data: { product: projectProduct(original), enriched: false } });
      }
      // A redirected or mismatched merchant page must never attach another item's image/options.
      const words = (title: string) => new Set(title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(word => word.length > 2));
      const one = words(original.basic.title), two = words(merchant.basic.title);
      const overlap = [...one].filter(word => two.has(word)).length;
      if (one.size && two.size && overlap < Math.min(2, one.size, two.size)) {
        return res.json({ success: true, data: { product: projectProduct(original), enriched: false } });
      }
      const urls = [...new Set([...original.media.originalImages, ...merchant.media.originalImages])];
      const merged: CommerceProduct = {
        ...original,
        basic: { ...original.basic,
          description: original.basic.description || merchant.basic.description,
          brand: original.basic.brand || merchant.basic.brand,
          category: original.basic.category || merchant.basic.category },
        media: { ...original.media, originalImages: urls,
          primaryImage: original.media.primaryImage || urls[0] || null,
          colorImages: { ...merchant.media.colorImages, ...original.media.colorImages } },
        availability: original.availability === 'unknown' ? merchant.availability : original.availability,
        variants: original.variants.groups.length ? original.variants : merchant.variants,
        sourceMetadata: { ...original.sourceMetadata, mediaProvider: 'merchant',
          ...(original.variants.groups.length ? {} : { variantProvider: 'merchant' }),
          ...(original.basic.description ? {} : { descriptionProvider: 'merchant' }) },
        quoteToken: null,
      };
      return res.json({ success: true, data: { product: projectProduct({ ...merged, quoteToken: signCommerceProduct(merged) }), enriched: true } });
    } catch {
      return res.json({ success: true, data: { product: projectProduct(original), enriched: false } });
    }
  });

  router.post('/analyze-code', async (req: Request, res: Response) => {
    const value = String(req.body?.value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (value.length < 2) {
      return res.status(400).json({ success: false, code: 'INVALID_CODE', error: 'Le contenu de ce QR code est vide ou illisible.' });
    }
    try {
      const candidates = await searchByCodeOrText(db, value);
      const securedCandidates = tokenizedCandidates(db, candidates);
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
      const securedCandidates = tokenizedCandidates(db, candidates);
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
      const securedCandidates = tokenizedCandidates(db, candidates);
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
