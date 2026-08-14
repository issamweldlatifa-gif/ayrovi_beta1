import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import { identifyProduct, buildSearchQuery, AyrovixUnavailableError, ayrovixAiReady } from './services/ai';
import { catalogSearch, anthropicExternalSearch, scoreCandidate, searchCandidates } from './services/search';
import { serpApiVisualSearch } from './services/visualSearch';
import { extractProductFromUrl, ExtractionFailedError, InvalidUrlError, sanitizeProductUrl } from './services/product';
import { markAyrovixChosen, recordAyrovixEvent } from './events';
import { createAyrovixReviewRequest, getAyrovixReviewForOwner } from './reviews';
import { resolveCustomer } from '../customer/auth';
import type { AyrovixCandidate, AyrovixChannel, AyrovixDetectedPrice, AyrovixProduct } from './types';
import { calculatePrice } from '../services/pricing';
import { InvalidImageError, normalizeUploadedImage } from '../services/imageValidation';
import { createAyrovixPriceToken, type AyrovixQuoteStatus } from './priceQuote';
import { listAyrovixHistory, recordAyrovixHistory, type AyrovixHistoryInput } from './history';

/**
 * AYROVIX public API — Claude powers visual understanding, visible-price
 * reading and text Web Search; SerpApi Google Lens adds reverse-image product
 * matches. QR/barcode decoding remains local on-device and product URLs are
 * fetched directly through the SSRF-safe metadata extractor.
 */

const MAX_IMAGE_SIZE = 6 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_SIZE, files: 1 } });
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

function tokenizedCandidate(candidate: AyrovixCandidate): AyrovixCandidate {
  const status: AyrovixQuoteStatus = candidate.kind === 'catalog' ? 'VERIFIED' : 'PENDING_MANUAL';
  return {
    ...candidate,
    priceVerificationStatus: status,
    priceToken: quoteToken(candidate.price, candidate.currency, candidate.title, candidate.sourceUrl, status),
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

  router.get('/history', (req: Request, res: Response) => {
    const customer = resolveCustomer(db, req);
    if (!customer) return res.json({ success: true, data: [] });
    return res.json({ success: true, data: listAyrovixHistory(db, customer.id, Number(req.query.limit) || 30) });
  });

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

      // Run understanding/price reading and reverse-image discovery in parallel.
      // If Google Lens is not configured it resolves immediately to an empty list.
      const [identification, visualCandidates] = await Promise.all([
        identifyProduct(normalized.buffer, normalized.mimeType),
        serpApiVisualSearch(normalized.buffer, 8),
      ]);
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
      const candidates = (identification.confidence >= 0.35 || visualCandidates.length > 0) && query
        ? await searchCandidates(db, identification, query, visualCandidates)
        : [];
      const securedCandidates = candidates.map(tokenizedCandidate);
      const securedPrice = tokenizedDetectedPrice(priceResult);
      const eventId = recordAyrovixEvent(db, {
        channel: 'image',
        brand: identification.brand,
        query: query || identification.description,
        candidatesCount: candidates.length,
      });
      const historyMatch = securedCandidates[0];
      rememberAuthenticatedHistory(db, req, {
        eventId,
        kind: 'image',
        queryLabel: query || identification.description,
        title: historyMatch?.title || securedPrice?.title || title,
        imageUrl: historyMatch?.image || securedPrice?.imageUrl || '',
        sourceUrl: historyMatch?.sourceUrl || '',
        source: historyMatch?.source || 'AYROVIX Vision',
        price: historyMatch?.price ?? securedPrice?.sourcePrice ?? null,
        currency: historyMatch?.currency ?? securedPrice?.sourceCurrency ?? null,
        verificationStatus: historyMatch?.priceVerificationStatus || 'PENDING_MANUAL',
        resultsCount: candidates.length,
      });

      return res.json({
        success: true,
        data: {
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
      const securedProduct = tokenizedProduct(result.product);
      const securedAlternates = result.alternates.map(tokenizedCandidate);
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
          const candidates = await anthropicExternalSearch(fallbackQuery, 6);
          const eventId = recordAyrovixEvent(db, { channel, query: fallbackQuery, candidatesCount: candidates.length });
          const securedAlternates = candidates.map(tokenizedCandidate);
          const fallbackProduct: AyrovixProduct = {
            title: `Produit ${fallbackQuery.slice(0, 60)}`,
            brand: null,
            model: null,
            description: 'Lien partagé — résultats Claude Web Search à confirmer.',
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
      const securedCandidates = candidates.map(tokenizedCandidate);
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
      const securedCandidates = candidates.map(tokenizedCandidate);
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
