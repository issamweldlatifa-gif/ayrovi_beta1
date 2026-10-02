import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { QatafoDatabase as AyroviDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import { calculatePrice, type PriceBreakdown } from '../services/pricing';
import { parsePublicHttpUrl, UnsafeUrlError } from '../services/safeUrl';
import {
  AYWEBS_STORES,
  detectAyWebsStore,
  findAyWebsStore,
  type AyWebsStoreDefinition,
} from '../../shared/aywebsStores';
import { AyWebsCaptureError, createAyWebsAdapter } from './adapters';
import { AYWEBS_EVENTS, recordAyWebsEvent } from './analytics';
import { renderedProviderReady } from '../scraper/renderedPageFetcher';
import { getAyroviAiCore } from '../ai-core/core';
import { recordVariantContract } from '../ayrovix/services/variantAvailability';

function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value.trim() === '') return fallback;
  return !['0', 'false', 'off', 'disabled'].includes(value.trim().toLowerCase());
}

function featureFlags() {
  return {
    enabled: envFlag('AYWEBS_ENABLED', true),
    capture_enabled: envFlag('AYWEBS_CAPTURE_ENABLED', true),
    ocr_fallback_enabled: envFlag('AYWEBS_OCR_FALLBACK_ENABLED', true),
    ai_extraction_enabled: envFlag('AYWEBS_AI_EXTRACTION_ENABLED', false),
  };
}

function storeCaptureEnabled(store: AyWebsStoreDefinition, captureEnabled: boolean): boolean {
  const storeFlag = `AYWEBS_${store.id.toUpperCase()}_CAPTURE_ENABLED`;
  return store.captureSupported && captureEnabled && envFlag(storeFlag, true);
}

function publicStore(store: AyWebsStoreDefinition, captureEnabled: boolean) {
  return {
    id: store.id,
    name: store.name,
    domains: [...store.domains],
    enabled: store.enabled,
    capture_supported: storeCaptureEnabled(store, captureEnabled),
    adapter: store.adapter,
    status: store.status,
    browser_mode: store.browserMode,
    home_url: store.homeUrl,
    search_url_template: store.searchUrlTemplate,
    phase: store.phase,
  };
}

function normalizedProduct(product: Awaited<ReturnType<SmartLinkScraper['scrapeProduct']>>, price: PriceBreakdown) {
  return {
    source: {
      store: product.store,
      url: product.url,
      product_id: product.externalId,
      captured_at: product.scrapedAt,
      extraction: {
        verified: product.priceVerified === true,
        provider: product.verificationProvider || null,
        method: product.verificationMethod || null,
        failure_code: product.verificationFailureCode || null,
      },
    },
    product: {
      title: product.title,
      brand: product.brand,
      description: product.description,
      images: product.images,
      category: price.categoryLabel || null,
    },
    pricing: {
      source_price: product.sourcePrice,
      currency: product.sourceCurrency,
      estimated_price_tnd: price.totalTND,
      pricing_version: price.pricingVersion,
      breakdown: {
        converted_source_price: price.convertedPriceTND,
        shipping: price.shippingFeeTND,
        customs: price.customsFeeTND,
        service_fee: price.serviceFeeTND,
        other: price.freightTND + price.expressFeeTND,
      },
    },
    variants: {
      colors: product.variants?.colors || [],
      sizes: product.variants?.sizes || [],
      selected_color: null,
      selected_size: null,
    },
    availability: {
      available: product.availability === 'in_stock' || product.availability === 'limited'
        ? true
        : product.availability === 'out_of_stock' ? false : null,
      status: product.availability,
      checked_at: product.scrapedAt,
    },
  };
}

function rememberAyWebsAvailability(product: Awaited<ReturnType<SmartLinkScraper['scrapeProduct']>>): void {
  const productAvailability = product.availability === 'out_of_stock'
    ? 'unavailable' as const
    : product.availability === 'in_stock' || product.availability === 'limited'
      ? 'available' as const
      : 'unknown' as const;
  const details = product.variants?.details || [];
  const variants = details.map((detail) => ({
    value: String(detail.size || detail.label || detail.color || '').trim(),
    color: detail.color || null,
    availability: detail.stock === true ? 'available' as const : detail.stock === false ? 'unavailable' as const : 'unknown' as const,
    reason: detail.stock === true ? 'merchant_in_stock' : detail.stock === false ? 'merchant_out_of_stock' : 'merchant_stock_unspecified',
  })).filter((detail) => detail.value);

  if (!variants.length) {
    const sizes = product.variants?.sizes || [];
    const colors = product.variants?.colors || [];
    if (sizes.length) {
      for (const size of sizes) {
        if (colors.length) {
          for (const color of colors) variants.push({ value: size, color, availability: 'unknown', reason: 'merchant_stock_unspecified' });
        } else variants.push({ value: size, color: null, availability: 'unknown', reason: 'merchant_stock_unspecified' });
      }
    } else {
      for (const color of colors) variants.push({ value: color, color, availability: 'unknown', reason: 'merchant_stock_unspecified' });
    }
  }

  // Silence from the merchant remains the historical manual-review path. A
  // contract is written only when the source established product or option state.
  if (productAvailability === 'unknown' && !variants.some((variant) => variant.availability !== 'unknown')) return;
  recordVariantContract(product.url, {
    attribute: product.variants?.sizes?.length ? 'Taille' : product.variants?.colors?.length ? 'Couleur' : '',
    productAvailability,
    source: product.verificationProvider || product.store,
    variants,
  }, product.scrapedAt);
}

function captureFailure(res: Response, status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({
    success: false,
    status: code === 'STORE_CAPTURE_UNSUPPORTED' ? 'UNSUPPORTED' : 'FAILED',
    code,
    error,
    fallback: ['retry', 'product_link', 'screenshot'],
    ...extra,
  });
}

export function createAyWebsRouter(db: AyroviDatabase, scraper: SmartLinkScraper): Router {
  const router = Router();

  router.get('/stores', (_req, res) => {
    const flags = featureFlags();
    res.json({
      success: true,
      data: AYWEBS_STORES.filter((store) => store.enabled).map((store) => publicStore(store, flags.capture_enabled)),
      features: flags,
    });
  });

  router.get('/health', (_req, res) => {
    const flags = featureFlags();
    const stores = AYWEBS_STORES.filter((store) => store.enabled);
    res.json({
      success: true,
      data: {
        enabled: flags.enabled,
        capture_enabled: flags.capture_enabled,
        active_adapters: stores.filter((store) => storeCaptureEnabled(store, flags.capture_enabled)).map((store) => store.id),
        deterministic_extraction: true,
        jina_reader_enabled: process.env.AYROVI_JINA_READER !== 'false',
        rendered_provider_ready: renderedProviderReady(),
        ai_fallback_enabled: flags.ai_extraction_enabled,
        ai_provider_ready: flags.ai_extraction_enabled && getAyroviAiCore().responses().isConfigured(),
      },
    });
  });

  router.get('/session', (req, res) => {
    const sessionId = String(req.headers['x-session-id'] || '').trim();
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(sessionId)) {
      return res.status(400).json({ success: false, code: 'SESSION_REQUIRED', error: 'Session AYROVI invalide ou absente.' });
    }
    return res.json({ success: true, data: { session_id: sessionId, shared_cart: true } });
  });

  router.post('/events', (req, res) => {
    const event = String(req.body?.event || '') as (typeof AYWEBS_EVENTS)[number];
    if (!AYWEBS_EVENTS.includes(event)) {
      return res.status(400).json({ success: false, code: 'INVALID_EVENT', error: 'Événement AyWebs invalide.' });
    }
    recordAyWebsEvent(db, event, {
      store: req.body?.store,
      captureId: req.body?.capture_id,
      code: req.body?.code,
      sessionId: req.headers['x-session-id'],
    });
    return res.status(202).json({ success: true });
  });

  router.post('/capture', async (req: Request, res: Response) => {
    const flags = featureFlags();
    if (!flags.enabled) return captureFailure(res, 503, 'AYWEBS_DISABLED', 'AyWebs est temporairement indisponible.');
    if (!flags.capture_enabled) return captureFailure(res, 503, 'CAPTURE_DISABLED', 'La capture AyWebs est temporairement suspendue.');

    const rawUrl = scraper.cleanPastedUrl(String(req.body?.url || ''));
    if (!rawUrl || rawUrl.length > 4096) {
      return captureFailure(res, 400, 'INVALID_URL', 'Collez un lien produit valide.');
    }

    let url: URL;
    try {
      url = parsePublicHttpUrl(rawUrl);
    } catch (error) {
      const message = error instanceof UnsafeUrlError ? error.message : 'Ce lien ne peut pas être analysé.';
      return captureFailure(res, 400, 'INVALID_URL', message);
    }
    if (url.protocol !== 'https:') {
      return captureFailure(res, 400, 'HTTPS_REQUIRED', 'Le lien produit doit utiliser HTTPS.');
    }

    const detectedStore = detectAyWebsStore(url.toString());
    if (!detectedStore || !detectedStore.enabled) {
      return captureFailure(res, 400, 'DOMAIN_NOT_ALLOWED', 'Cette boutique ne fait pas encore partie du registre AyWebs.', {
        status: 'UNSUPPORTED',
      });
    }

    const requestedStore = req.body?.store == null ? null : findAyWebsStore(req.body.store);
    if (req.body?.store != null && !requestedStore) {
      return captureFailure(res, 400, 'STORE_UNKNOWN', 'Boutique AyWebs inconnue.');
    }
    if (requestedStore && requestedStore.id !== detectedStore.id) {
      return captureFailure(res, 400, 'STORE_MISMATCH', 'Le domaine du lien ne correspond pas à la boutique sélectionnée.');
    }
    if (!storeCaptureEnabled(detectedStore, flags.capture_enabled)) {
      return captureFailure(res, 422, 'STORE_CAPTURE_UNSUPPORTED', 'La navigation reste disponible, mais la capture de cette boutique est désactivée.', {
        store: publicStore(detectedStore, flags.capture_enabled),
      });
    }

    const captureId = `ayw_${randomUUID()}`;
    try {
      const adapter = createAyWebsAdapter(detectedStore, scraper);
      if (!adapter.isProductPage(url)) {
        return captureFailure(res, 422, 'PRODUCT_PAGE_REQUIRED', 'Ouvrez la fiche exacte du produit, puis copiez son lien.', {
          capture_id: captureId,
          status: 'NEEDS_SELECTION',
          missing: ['product_page'],
        });
      }

      const product = await adapter.capture(url.toString());
      const missing = [
        !product.title?.trim() ? 'title' : '',
        !(product.sourcePrice > 0) ? 'price' : '',
        product.priceVerified !== true ? 'verified_price' : '',
        !/^[A-Z]{3}$/.test(String(product.sourceCurrency || '')) ? 'currency' : '',
        !(product.images?.length || product.mainImage) ? 'image' : '',
      ].filter(Boolean);
      if (missing.length) {
        return res.status(422).json({
          success: false,
          capture_id: captureId,
          status: 'NEEDS_SELECTION',
          outcome: 'needs_user_input',
          code: 'CAPTURE_INCOMPLETE',
          missing,
          product,
          error: 'Nous n’avons pas pu lire toutes les informations du produit.',
          fallback: ['retry', 'product_link', 'screenshot'],
        });
      }

      if (product.availability === 'out_of_stock') {
        rememberAyWebsAvailability(product);
        return captureFailure(res, 409, 'PRODUCT_UNAVAILABLE', 'Le marchand indique que ce produit est épuisé.', {
          capture_id: captureId,
          status: 'NEEDS_SELECTION',
        });
      }

      const quote = calculatePrice(db.getPricingRules(), product.sourcePrice, product.sourceCurrency, { title: product.title });
      if (!quote || quote.restricted) {
        return captureFailure(res, 422, quote?.restricted ? 'PRODUCT_RESTRICTED' : 'PRICE_UNAVAILABLE', quote?.restricted
          ? 'Ce type de produit nécessite une vérification manuelle avant commande.'
          : 'Le devis AYROVI est indisponible pour cette devise.');
      }

      const pricedProduct = {
        ...product,
        captureId,
        convertedPriceTND: quote.convertedPriceTND,
        estimatedShippingTND: quote.shippingFeeTND,
        serviceFeeTND: quote.serviceFeeTND,
        totalPriceTND: quote.totalTND,
      };
      rememberAyWebsAvailability(pricedProduct);
      return res.status(201).json({
        success: true,
        capture_id: captureId,
        status: 'READY',
        product: pricedProduct,
        normalized_product: normalizedProduct(pricedProduct, quote),
      });
    } catch (error: any) {
      if (error instanceof AyWebsCaptureError) {
        return captureFailure(res, error.code === 'PRODUCT_PAGE_REQUIRED' ? 422 : 400, error.code, error.message);
      }
      if (error instanceof UnsafeUrlError || error?.code === 'UNSAFE_URL') {
        return captureFailure(res, 400, 'INVALID_URL', error.message);
      }
      console.error('[AyWebs Capture]', { captureId, store: detectedStore.id, error: String(error?.message || error) });
      return captureFailure(res, 502, 'CAPTURE_FAILED', 'Nous n’avons pas pu lire ce produit. Réessayez ou utilisez une capture d’écran.', {
        capture_id: captureId,
      });
    }
  });

  router.post('/price-quote', (req, res) => {
    const flags = featureFlags();
    if (!flags.enabled || !flags.capture_enabled) {
      return res.status(503).json({ success: false, code: 'AYWEBS_DISABLED', error: 'Le devis AyWebs est temporairement indisponible.' });
    }
    const sourcePrice = Number(req.body?.source_price);
    const currency = String(req.body?.currency || '').trim().toUpperCase();
    const source = findAyWebsStore(req.body?.source);
    const title = String(req.body?.title || source?.name || 'Produit AyWebs').trim().slice(0, 500);
    if (!source || !Number.isFinite(sourcePrice) || sourcePrice <= 0 || sourcePrice > 1_000_000 || !/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ success: false, code: 'INVALID_QUOTE', error: 'Données de devis AyWebs invalides.' });
    }
    const quote = calculatePrice(db.getPricingRules(), sourcePrice, currency, { title });
    if (!quote || quote.restricted) {
      return res.status(422).json({ success: false, code: quote?.restricted ? 'PRODUCT_RESTRICTED' : 'QUOTE_UNAVAILABLE', error: 'Devis AyWebs indisponible.' });
    }
    return res.json({
      success: true,
      data: {
        estimated_price_tnd: quote.totalTND,
        pricing_version: quote.pricingVersion,
        breakdown: {
          source_price: quote.convertedPriceTND,
          shipping: quote.shippingFeeTND,
          customs: quote.customsFeeTND,
          service_fee: quote.serviceFeeTND,
          other: quote.freightTND + quote.expressFeeTND,
        },
      },
    });
  });

  return router;
}
