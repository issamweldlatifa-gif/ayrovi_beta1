import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { QatafoDatabase as AyroviDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import { calculatePrice } from '../services/pricing';
import { cardGatewayAvailable } from '../services/paymentGateway';
import { renderedProviderReady } from '../scraper/renderedPageFetcher';
import { getAyroviAiCore } from '../ai-core/core';
import {
  AYWEBS_CATEGORIES,
  AYWEBS_STORES,
  ayWebsStoreCan,
  findAyWebsStore,
  type AyWebsStoreDefinition,
} from '../../shared/aywebsStores';
import { AYWEBS_FUNNEL_EVENTS } from '../../shared/aywebsTypes';
import { AYWEBS_ADAPTER_DESCRIPTORS } from './adapters/registry';
import { AyWebsCaptureError } from './adapters/contract';
import { AyWebsDomainError } from './errors';
import { AYWEBS_EVENTS, recordAyWebsEvent } from './analytics';
import { ayWebsMetrics, logAyWebsOperation, recordAyWebsMetric } from './events';
import { ensureAyWebsSchema, ayWebsSchemaReady } from './schema';
import {
  analyzeAyWebsUrl,
  listAyWebsPopularStores,
  listAyWebsRecentStores,
  readAyWebsSession,
} from './browser';
import {
  checkAyWebsProductAvailability,
  listAyWebsRecentProducts,
  readAyWebsProduct,
  resolveAyWebsProduct,
} from './productResolver';
import {
  acceptAyWebsCartPriceChange,
  addAyWebsCartItem,
  normalizeAttributes,
  readAyWebsCartView,
  removeAyWebsCartItem,
  updateAyWebsCartItem,
  verifyAyWebsCart,
} from './cart';
import { ayWebsCheckoutPreviewPayload, computeAyWebsCheckoutPreview } from './checkoutFees';
import {
  acceptedAyWebsPaymentMethods,
  confirmAyWebsPayment,
  createAyWebsOrder,
  createAyWebsPaymentIntent,
  listAyWebsOrders,
  readAyWebsOrderByNumber,
  recordAyWebsTransferProof,
  requireOwnedOrder,
  submitAyWebsOrder,
} from './orders';
import {
  createAyWebsPurchaseRequest,
  createAyWebsStoreRequest,
  listAyWebsPurchaseRequests,
  listAyWebsStoreRequests,
  readAyWebsPurchaseRequest,
} from './purchaseRequests';
import { bridgeAyWebsCartToAyrovi, listAyWebsOrderLinks } from './ayroviBridge';
import {
  createAyWebsContext,
  optionalAyWebsCustomer,
  readSessionId,
  requireAyWebsCustomer,
  requireAyWebsSession,
  resolveAyWebsIdentity,
  sendAyWebsError,
  trackAyWebsFunnel,
  trackAyWebsNavigation,
  type AyWebsContext,
} from './context';
import { listAyWebsCartItems, readAyWebsCart } from './cart';

/**
 * AYWEBs — API `/api/v1/aywebs` (§43).
 *
 * Couche HTTP fine : validation, identité, appel du domaine, sérialisation.
 * Aucune règle métier ni formule financière ne vit ici.
 *
 * Compatibilité V1 préservée (§2 non-destructif) : `GET /stores`,
 * `GET /session`, `GET /health`, `POST /capture`, `POST /price-quote` et
 * `POST /events` conservent exactement leur contrat de réponse, y compris la
 * forme `product` / `normalized_product` que l'écran de confirmation actuel
 * consomme. `/capture` délègue désormais au Product Engine : un seul chemin de
 * résolution, deux formes de réponse.
 *
 * Les endpoints des phases 6-8 (warehouse, consolidation, shipping) répondent
 * `NOT_IMPLEMENTED` avec le contrat d'erreur (§48) : jamais un faux succès.
 */

const PROOF_MAX_BYTES = 10 * 1024 * 1024;
const proofUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PROOF_MAX_BYTES, files: 1 } });
const PROOF_SIGNATURES: Array<{ test: RegExp; ext: string; mime: string }> = [
  { test: /^\xff\xd8\xff/, ext: 'jpg', mime: 'image/jpeg' },
  { test: /^\x89PNG\r\n\x1a\n/, ext: 'png', mime: 'image/png' },
  { test: /^%PDF-/, ext: 'pdf', mime: 'application/pdf' },
];

export function createAyWebsRouter(db: AyroviDatabase, scraper: SmartLinkScraper): Router {
  const router = Router();
  const ctx = createAyWebsContext(db, scraper);
  ensureAyWebsSchema(db);

  /** Identité de requête : session obligatoire, compte optionnel selon la route. */
  const identityOf = (req: Request, res: Response) => {
    const sessionId = requireAyWebsSession(req, res);
    if (!sessionId) return null;
    return resolveAyWebsIdentity(db, req, sessionId);
  };

  const requestIdOf = (req: Request): string => String((req as any).requestId || '');

  /** Enveloppe les gestionnaires : toute erreur devient un contrat (§44). */
  const handle = (fn: (req: Request, res: Response) => unknown) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await fn(req, res);
      } catch (error) {
        if (error instanceof AyWebsCaptureError) {
          sendAyWebsError(res, new AyWebsDomainError(
            error.code === 'PRODUCT_PAGE_REQUIRED' ? 'PRODUCT_PAGE_REQUIRED'
              : error.code === 'STORE_MISMATCH' ? 'STORE_MISMATCH'
              : 'STORE_UNKNOWN',
            { userMessage: error.message },
          ), undefined, { requestId: requestIdOf(req) });
          return;
        }
        if (res.headersSent) { next(error); return; }
        if (!(error instanceof AyWebsDomainError)) {
          console.error('[AyWebs]', {
            requestId: requestIdOf(req),
            path: req.path,
            error: String((error as Error)?.message || error),
            stack: error instanceof Error ? error.stack?.split('\n').slice(1, 5).join(' | ') : '',
          });
        }
        sendAyWebsError(res, error, undefined, { requestId: requestIdOf(req) });
      }
    };

  const publicStore = (store: AyWebsStoreDefinition) => ({
    id: store.id,
    name: store.name,
    display_name: store.displayName,
    domains: [...store.domains],
    country: store.country,
    currency: store.currency,
    logo: store.logo,
    enabled: store.enabled,
    capture_supported: ctx.storeCaptureEnabled(store),
    adapter: store.adapter,
    status: store.status,
    integration_type: store.integrationType,
    capabilities: [...store.capabilities],
    can: Object.fromEntries(['browse', 'search', 'product', 'variants', 'availability', 'purchase', 'tracking']
      .map((capability) => [capability, ayWebsStoreCan(store, capability as any)])),
    browser_mode: store.browserMode,
    home_url: store.homeUrl,
    search_url_template: store.searchUrlTemplate,
    categories: [...store.categories],
    popular: store.popular,
    phase: store.phase,
    /** Mode d'achat réel — jamais « supported » par simple présence au registre. */
    purchase_mode: store.capabilities.includes('purchase') ? 'SUPPORTED'
      : store.integrationType === 'URL_REQUEST' || store.integrationType === 'BLOCKED' ? 'URL_REQUEST'
      : 'MANUAL_REVIEW',
  });

  /* ================================================================== *
   * STORES (§7, §43)
   * ================================================================== */

  router.get('/stores', handle((req, res) => {
    const flags = ctx.flags;
    const stores = AYWEBS_STORES.filter((store) => store.enabled).map(publicStore);
    res.json({
      success: true,
      data: stores,
      // Contrat V1 : `features` garde ses clés snake_case d'origine.
      features: {
        enabled: flags.enabled,
        capture_enabled: flags.captureEnabled,
        ocr_fallback_enabled: flags.ocrFallbackEnabled,
        ai_extraction_enabled: flags.aiExtractionEnabled,
        purchase_integration_enabled: flags.purchaseIntegrationEnabled,
        warehouse_enabled: flags.warehouseEnabled,
        shipping_enabled: flags.shippingEnabled,
      },
      categories: AYWEBS_CATEGORIES,
      adapters: AYWEBS_ADAPTER_DESCRIPTORS,
    });
  }));

  router.get('/stores/:id', handle((req, res) => {
    const store = findAyWebsStore(req.params.id);
    if (!store || !store.enabled) throw new AyWebsDomainError('STORE_UNKNOWN');
    res.json({ success: true, data: publicStore(store) });
  }));

  router.get('/stores/:id/capabilities', handle((req, res) => {
    const store = findAyWebsStore(req.params.id);
    if (!store) throw new AyWebsDomainError('STORE_UNKNOWN');
    res.json({
      success: true,
      data: {
        store_id: store.id,
        integration_type: store.integrationType,
        capabilities: [...store.capabilities],
        granted: Object.fromEntries(store.capabilities.map((capability) => [capability, ayWebsStoreCan(store, capability)])),
        capture_enabled: ctx.storeCaptureEnabled(store),
        purchase_mode: store.capabilities.includes('purchase') ? 'SUPPORTED' : 'MANUAL_REVIEW',
        adapters: AYWEBS_ADAPTER_DESCRIPTORS.filter((descriptor) => descriptor.id === store.adapter),
      },
    });
  }));

  /* ================================================================== *
   * HOME (§6) — tout vient des données, rien n'est codé dans l'écran
   * ================================================================== */

  router.get('/home', handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const recentStores = listAyWebsRecentStores(db, identity.sessionId, identity.accountId, 6);
    const recentProducts = listAyWebsRecentProducts(db, 6).map((product) => ({
      product_id: product.productId,
      store_id: product.storeId,
      store_name: product.storeName,
      title: product.title,
      image: product.images[0] || null,
      price: product.price,
      currency: product.currency,
      availability: product.availability.state,
      pricing_tnd: product.pricingTnd,
      // Le lien source reste l'identité du produit (§53) : l'accueil le rouvre tel quel.
      source_url: product.sourceUrl,
      resolved_at: product.resolvedAt,
    }));
    const view = readAyWebsCartView(db, identity.sessionId, identity.accountId);
    res.json({
      success: true,
      data: {
        stores: AYWEBS_STORES.filter((store) => store.enabled).map(publicStore),
        popular_stores: listAyWebsPopularStores().map(publicStore),
        categories: AYWEBS_CATEGORIES.map((category) => ({
          ...category,
          stores: AYWEBS_STORES.filter((store) => store.enabled && store.categories.includes(category.id)).map((store) => store.id),
        })),
        recent_stores: recentStores,
        recent_products: recentProducts,
        cart: {
          id: view.cart?.id || null,
          items_count: view.items.length,
          units: view.totals.units,
          subtotal_tnd: view.totals.productSubtotalTnd,
          blocked_items: view.totals.blockedItems,
          checkout_ready: view.totals.checkoutReady,
        },
        /** §23 : la piste « demander l’achat avec URL » est toujours disponible. */
        request_store_supported: true,
        request_purchase_supported: true,
        session: readAyWebsSession(db, identity.sessionId, identity.accountId),
      },
      features: {
        enabled: ctx.flags.enabled,
        capture_enabled: ctx.flags.captureEnabled,
        purchase_integration_enabled: ctx.flags.purchaseIntegrationEnabled,
      },
    });
  }));

  /* ================================================================== *
   * SESSION CONTEXT (§26) — contrat V1 `/session` conservé
   * ================================================================== */

  router.get('/session', handle((req, res) => {
    const sessionId = readSessionId(req);
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(sessionId)) {
      throw new AyWebsDomainError('SESSION_REQUIRED');
    }
    const identity = resolveAyWebsIdentity(db, req, sessionId);
    const session = readAyWebsSession(db, sessionId, identity.accountId);
    res.json({
      success: true,
      data: {
        // Champs V1 : l'écran existant les lit tels quels.
        session_id: sessionId,
        shared_cart: true,
        // Contexte AYWEBs (§26) : boutique, URL, produit, variante, panier.
        account_id: identity.accountId,
        authenticated: identity.authenticated,
        current_store_id: session.currentStoreId,
        current_url: session.currentUrl,
        current_product_id: session.currentProductId,
        selected_variant: session.selectedVariant,
        cart_id: session.cartId,
        cart_item_count: session.cartItemCount,
        updated_at: session.updatedAt,
      },
    });
  }));

  router.post('/session/context', handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const storeId = req.body?.store_id == null ? undefined : String(req.body.store_id).slice(0, 40);
    if (storeId && !findAyWebsStore(storeId)) throw new AyWebsDomainError('STORE_UNKNOWN');
    trackAyWebsNavigation(ctx, {
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      ...(storeId !== undefined ? { storeId } : {}),
      ...(typeof req.body?.url === 'string' ? { url: req.body.url.slice(0, 4096) } : {}),
      ...(typeof req.body?.product_id === 'string' ? { productId: req.body.product_id.slice(0, 80) } : {}),
      ...(req.body?.selected_variant ? { variant: normalizeAttributes(req.body.selected_variant) } : {}),
    });
    res.json({ success: true, data: readAyWebsSession(db, identity.sessionId, identity.accountId) });
  }));

  /* ================================================================== *
   * HEALTH & METRICS (§46)
   * ================================================================== */

  router.get('/health', handle((_req, res) => {
    const flags = ctx.flags;
    const stores = AYWEBS_STORES.filter((store) => store.enabled);
    res.json({
      success: true,
      data: {
        enabled: flags.enabled,
        capture_enabled: flags.captureEnabled,
        active_adapters: stores.filter((store) => ctx.storeCaptureEnabled(store)).map((store) => store.id),
        deterministic_extraction: true,
        jina_reader_enabled: process.env.AYROVI_JINA_READER !== 'false',
        rendered_provider_ready: renderedProviderReady(),
        ai_fallback_enabled: flags.aiExtractionEnabled,
        ai_provider_ready: flags.aiExtractionEnabled && getAyroviAiCore().responses().isConfigured(),
        schema_ready: ayWebsSchemaReady(db),
        /** Honnêteté (§48) : l'achat marchand automatisé n'est pas connecté. */
        purchase_integration_enabled: flags.purchaseIntegrationEnabled,
        purchase_integration_state: flags.purchaseIntegrationEnabled ? 'ENABLED' : 'PENDING_INTEGRATION',
        warehouse_enabled: flags.warehouseEnabled,
        shipping_enabled: flags.shippingEnabled,
        adapters: AYWEBS_ADAPTER_DESCRIPTORS.map((descriptor) => ({
          id: descriptor.id, implemented: descriptor.implemented, pending_integration: descriptor.pendingIntegration,
        })),
      },
    });
  }));

  router.get('/metrics', handle((req, res) => {
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 1));
    res.json({ success: true, data: ayWebsMetrics(days) });
  }));

  /* ================================================================== *
   * EVENTS (§39, funnel V1 conservé)
   * ================================================================== */

  router.post('/events', handle((req, res) => {
    const event = String(req.body?.event || '');
    const known = (AYWEBS_EVENTS as readonly string[]).includes(event)
      || (AYWEBS_FUNNEL_EVENTS as readonly string[]).includes(event);
    if (!known) throw new AyWebsDomainError('SESSION_REQUIRED', {
      userMessage: 'Événement AyWebs invalide.',
      technicalMessage: `événement inconnu : ${event}`,
    });
    recordAyWebsEvent(db, event as any, {
      store: req.body?.store,
      captureId: req.body?.capture_id,
      code: req.body?.code,
      sessionId: req.headers['x-session-id'],
    });
    recordAyWebsMetric({
      operation: `funnel:${event}`,
      storeId: req.body?.store || null,
      sessionId: String(req.headers['x-session-id'] || '') || null,
      result: String(req.body?.code || '').includes('FAILED') ? 'failure' : 'success',
      errorCode: req.body?.code || null,
    });
    res.status(202).json({ success: true });
  }));

  /* ================================================================== *
   * PAGE ANALYSIS (§10) & PRODUCT RESOLUTION (§11)
   * ================================================================== */

  router.post('/page/analyze', handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    if (!ctx.flags.enabled) throw new AyWebsDomainError('AYWEBS_DISABLED');
    const rawUrl = scraper.cleanPastedUrl(String(req.body?.url || ''));
    const analysis = analyzeAyWebsUrl(rawUrl, scraper, {
      captureEnabled: ctx.flags.captureEnabled,
      storeCaptureEnabled: ctx.storeCaptureEnabled,
    });
    trackAyWebsNavigation(ctx, {
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      storeId: analysis.storeId,
      url: analysis.normalizedUrl,
    });
    if (analysis.storeId && analysis.pageType === 'PRODUCT') {
      trackAyWebsFunnel(ctx, 'product_page_detected', { store: analysis.storeId }, identity.sessionId);
    }
    logAyWebsOperation({
      operation: 'page_analyze',
      storeId: analysis.storeId,
      sessionId: identity.sessionId,
      customerId: identity.accountId,
      result: analysis.registered ? 'success' : 'skipped',
      errorCode: analysis.registered ? null : 'DOMAIN_NOT_ALLOWED',
    });
    res.json({
      success: true,
      data: {
        url: analysis.normalizedUrl,
        store_id: analysis.storeId,
        store_name: analysis.storeName,
        integration_type: analysis.integrationType,
        registered: analysis.registered,
        browse_allowed: analysis.browseAllowed,
        capture_allowed: analysis.captureAllowed,
        page_type: analysis.pageType,
        is_product_page: analysis.isProductPage,
        /** §11 : le pont de détection répond franchement « produit détecté ? ». */
        product_detected: analysis.isProductPage && Boolean(analysis.storeId),
        customer_action_required: analysis.customerActionRequired,
        browser_mode: analysis.browserMode,
        /** Piste explicite quand la boutique n'est pas intégrée (§23). */
        fallback: analysis.fallback,
        reason: analysis.reason,
        analyzed_at: analysis.analyzedAt,
      },
    });
  }));

  router.post('/product/resolve', handle(async (req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    if (!ctx.flags.enabled) throw new AyWebsDomainError('AYWEBS_DISABLED');
    if (!ctx.flags.captureEnabled) throw new AyWebsDomainError('CAPTURE_DISABLED');

    const rawUrl = scraper.cleanPastedUrl(String(req.body?.url || ''));
    const storeId = req.body?.store == null || req.body?.store_id == null
      ? null
      : String(req.body.store ?? req.body.store_id);
    const variantAttributes = normalizeAttributes(req.body?.variant || req.body?.variant_attributes);
    const quantity = Number(req.body?.quantity ?? 1);

    trackAyWebsFunnel(ctx, 'capture_started', { store: storeId || undefined }, identity.sessionId);
    const startedAt = Date.now();
    try {
      const result = await resolveAyWebsProduct(ctx.resolver, {
        url: rawUrl,
        storeId,
        selectedVariant: variantAttributes,
        quantity: Number.isFinite(quantity) ? quantity : 1,
        sessionId: identity.sessionId,
        accountId: identity.accountId,
      });
      trackAyWebsNavigation(ctx, {
        sessionId: identity.sessionId,
        accountId: identity.accountId,
        storeId: result.product.storeId,
        url: result.product.sourceUrl,
        productId: result.productId,
        variant: variantAttributes,
      });
      trackAyWebsFunnel(ctx, 'capture_succeeded', { store: result.product.storeId, capture_id: result.captureId }, identity.sessionId);
      res.status(201).json({
        success: true,
        capture_id: result.captureId,
        status: result.missing.length ? 'NEEDS_SELECTION' : 'READY',
        data: productPayload(result.product),
        missing: result.missing,
        // Contrat V1 : le produit AYROVI historique reste disponible tel quel.
        product: result.scrapedProduct,
        normalized_product: normalizedProductV1(result),
      });
    } catch (error) {
      trackAyWebsFunnel(ctx, 'capture_failed', {
        store: storeId || undefined,
        code: error instanceof AyWebsDomainError ? String(error.code) : 'CAPTURE_FAILED',
      }, identity.sessionId);
      recordAyWebsMetric({
        operation: 'product_resolve',
        storeId,
        sessionId: identity.sessionId,
        customerId: identity.accountId,
        durationMs: Date.now() - startedAt,
        result: 'failure',
        errorCode: error instanceof AyWebsDomainError ? String(error.code) : 'CAPTURE_FAILED',
      });
      throw error;
    }
  }));

  router.post('/product/variants', handle(async (req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const productId = String(req.body?.product_id || req.body?.productId || '').trim();
    const url = String(req.body?.url || '').trim();
    if (!productId && !url) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');

    const stored = productId ? readAyWebsProduct(db, productId) : null;
    if (!stored && !url) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');
    const result = stored
      ? null
      : await resolveAyWebsProduct(ctx.resolver, {
          url,
          storeId: req.body?.store ? String(req.body.store) : null,
          sessionId: identity.sessionId,
          accountId: identity.accountId,
        });
    const product = stored || readAyWebsProduct(db, result!.productId)!;
    res.json({
      success: true,
      data: {
        product_id: product.productId,
        store_id: product.storeId,
        source_url: product.sourceUrl,
        variant_groups: product.variantGroups,
        variants: product.variants.map((variant) => ({
          source_variant_id: variant.sourceVariantId,
          attributes: variant.attributes,
          label: variant.label,
          price: variant.price,
          currency: variant.currency,
          availability: variant.availability,
          availability_reason: variant.availabilityReason,
          image: variant.image,
        })),
        /** §13 : la sélection est exigée si le marchand publie des attributs. */
        selection_required: product.variantGroups.some((group) => group.values.length > 0),
        availability: product.availability.state,
        availability_reason: product.availability.reason,
        resolved_at: product.resolvedAt,
      },
    });
  }));

  router.get('/product/:id/availability', handle(async (req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const variantAttributes = req.query.variant
      ? normalizeAttributes(Object.fromEntries(String(req.query.variant).split(',').map((pair) => pair.split(':'))))
      : null;
    const result = await checkAyWebsProductAvailability(ctx.resolver, {
      productId: String(req.params.id),
      variantAttributes,
    });
    res.json({
      success: true,
      data: {
        product_id: String(req.params.id),
        availability: {
          state: result.availability.state,
          reason: result.availability.reason,
          checked_at: result.availability.checkedAt,
          source: result.availability.source,
          quantity_hint: result.availability.quantityHint,
        },
        variant: result.variant,
        /** Une lecture en cache le dit : le client ne croit jamais à du live (§51). */
        from_cache: result.fromCache,
        network_required_for_live: true,
      },
    });
  }));

  /* ================================================================== *
   * CAPTURE (contrat V1 conservé) — délègue au Product Engine
   * ================================================================== */

  router.post('/capture', handle(async (req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    if (!ctx.flags.enabled) throw new AyWebsDomainError('AYWEBS_DISABLED');
    if (!ctx.flags.captureEnabled) throw new AyWebsDomainError('CAPTURE_DISABLED');

    const rawUrl = scraper.cleanPastedUrl(String(req.body?.url || ''));
    const storeId = req.body?.store == null ? null : String(req.body.store);
    trackAyWebsFunnel(ctx, 'capture_started', { store: storeId || undefined }, identity.sessionId);
    const startedAt = Date.now();

    try {
      const result = await resolveAyWebsProduct(ctx.resolver, {
        url: rawUrl,
        storeId,
        sessionId: identity.sessionId,
        accountId: identity.accountId,
      });

      if (result.missing.length) {
        trackAyWebsFunnel(ctx, 'capture_failed', { store: result.product.storeId, code: 'CAPTURE_INCOMPLETE' }, identity.sessionId);
        return res.status(422).json({
          success: false,
          capture_id: result.captureId,
          status: 'NEEDS_SELECTION',
          outcome: 'needs_user_input',
          code: 'CAPTURE_INCOMPLETE',
          missing: result.missing,
          product: result.scrapedProduct,
          error: 'Nous n’avons pas pu lire toutes les informations du produit.',
          fallback: ['retry', 'product_link', 'screenshot'],
        });
      }
      if (result.product.availability.state === 'OUT_OF_STOCK') {
        trackAyWebsFunnel(ctx, 'capture_failed', { store: result.product.storeId, code: 'PRODUCT_UNAVAILABLE' }, identity.sessionId);
        return sendAyWebsError(res, new AyWebsDomainError('PRODUCT_UNAVAILABLE'), 409, {
          capture_id: result.captureId,
          status: 'NEEDS_SELECTION',
          data: productPayload(result.product),
        });
      }
      if (!result.pricing || result.pricing.restricted) {
        return sendAyWebsError(res, new AyWebsDomainError(result.pricing?.restricted ? 'PRODUCT_RESTRICTED' : 'PRICE_UNAVAILABLE'), 422, {
          capture_id: result.captureId,
        });
      }

      trackAyWebsNavigation(ctx, {
        sessionId: identity.sessionId,
        accountId: identity.accountId,
        storeId: result.product.storeId,
        url: result.product.sourceUrl,
        productId: result.productId,
      });
      trackAyWebsFunnel(ctx, 'capture_succeeded', { store: result.product.storeId, capture_id: result.captureId }, identity.sessionId);
      recordAyWebsMetric({
        operation: 'capture',
        storeId: result.product.storeId,
        sessionId: identity.sessionId,
        durationMs: Date.now() - startedAt,
        result: 'success',
      });
      return res.status(201).json({
        success: true,
        capture_id: result.captureId,
        status: 'READY',
        product: result.scrapedProduct,
        normalized_product: normalizedProductV1(result),
        data: productPayload(result.product),
        product_id: result.productId,
      });
    } catch (error) {
      trackAyWebsFunnel(ctx, 'capture_failed', {
        store: storeId || undefined,
        code: error instanceof AyWebsDomainError ? String(error.code) : 'CAPTURE_FAILED',
      }, identity.sessionId);
      recordAyWebsMetric({
        operation: 'capture',
        storeId,
        sessionId: identity.sessionId,
        durationMs: Date.now() - startedAt,
        result: 'failure',
        errorCode: error instanceof AyWebsDomainError ? String(error.code) : 'CAPTURE_FAILED',
      });
      throw error;
    }
  }));

  router.post('/price-quote', handle((req, res) => {
    if (!ctx.flags.enabled || !ctx.flags.captureEnabled) throw new AyWebsDomainError('AYWEBS_DISABLED');
    const sourcePrice = Number(req.body?.source_price);
    const currency = String(req.body?.currency || '').trim().toUpperCase();
    const source = findAyWebsStore(req.body?.source);
    const title = String(req.body?.title || source?.name || 'Produit AyWebs').trim().slice(0, 500);
    if (!source || !Number.isFinite(sourcePrice) || sourcePrice <= 0 || sourcePrice > 1_000_000 || !/^[A-Z]{3}$/.test(currency)) {
      throw new AyWebsDomainError('INVALID_QUOTE');
    }
    const quote = calculatePrice(db.getPricingRules(), sourcePrice, currency, { title });
    if (!quote) throw new AyWebsDomainError('PRICE_UNAVAILABLE');
    if (quote.restricted) throw new AyWebsDomainError('PRODUCT_RESTRICTED');
    res.json({
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
  }));

  /* ================================================================== *
   * CART (§16-18, §43)
   * ================================================================== */

  router.get('/cart', handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const view = readAyWebsCartView(db, identity.sessionId, identity.accountId);
    trackAyWebsFunnel(ctx, 'cart_opened', {}, identity.sessionId);
    res.json({ success: true, data: cartPayload(view) });
  }));

  router.post('/cart/items', optionalAyWebsCustomer(db), handle(async (req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    if (!ctx.flags.enabled) throw new AyWebsDomainError('AYWEBS_DISABLED');
    trackAyWebsFunnel(ctx, 'add_to_cart_clicked', { store: req.body?.store }, identity.sessionId);

    const result = await addAyWebsCartItem(ctx.resolver, {
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      productId: req.body?.product_id ? String(req.body.product_id) : null,
      sourceUrl: req.body?.source_url ? String(req.body.source_url) : null,
      storeId: req.body?.store_id ? String(req.body.store_id) : null,
      variantAttributes: normalizeAttributes(req.body?.variant || req.body?.variant_attributes),
      quantity: Number(req.body?.quantity ?? 1),
      customerNote: req.body?.customer_note ? String(req.body.customer_note) : '',
      requestId: requestIdOf(req),
    });

    trackAyWebsNavigation(ctx, {
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      storeId: result.item.storeId,
      productId: result.item.productId,
      variant: result.item.variantSnapshot?.attributes || null,
    });
    trackAyWebsFunnel(ctx, 'add_to_cart_succeeded', { store: result.item.storeId }, identity.sessionId);
    res.status(201).json({
      success: true,
      data: { item: cartItemPayload(result.item), duplicate: result.duplicate, message: result.message },
      cart: cartPayload(result.view),
    });
  }));

  router.patch('/cart/items/:id', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const result = updateAyWebsCartItem(db, {
      itemId: String(req.params.id),
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      ...(req.body?.quantity != null ? { quantity: Number(req.body.quantity) } : {}),
      ...(req.body?.customer_note != null ? { customerNote: String(req.body.customer_note) } : {}),
      ...(req.body?.variant !== undefined || req.body?.variant_attributes !== undefined
        ? { variantAttributes: normalizeAttributes(req.body.variant ?? req.body.variant_attributes) }
        : {}),
      requestId: requestIdOf(req),
    });
    res.json({
      success: true,
      data: { item: result.item ? cartItemPayload(result.item) : null, removed: Boolean(result.removed) },
      cart: cartPayload(result.view),
    });
  }));

  router.delete('/cart/items/:id', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const result = removeAyWebsCartItem(db, {
      itemId: String(req.params.id),
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      requestId: requestIdOf(req),
    });
    res.json({ success: true, data: { removed: true }, cart: cartPayload(result.view) });
  }));

  /** §29 : le client accepte explicitement le nouveau prix. Jamais automatique. */
  router.post('/cart/items/:id/accept-price', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const result = acceptAyWebsCartPriceChange(db, {
      itemId: String(req.params.id),
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      requestId: requestIdOf(req),
    });
    res.json({ success: true, data: { item: cartItemPayload(result.item) }, cart: cartPayload(result.view) });
  }));

  /** §18/§29/§30 : recontrôle prix + variantes avant checkout. */
  router.post('/cart/verify', optionalAyWebsCustomer(db), handle(async (req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const result = await verifyAyWebsCart(ctx.resolver, {
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      recheckSource: req.body?.recheck_source === true,
    });
    res.json({ success: true, data: { changes: result.changes }, cart: cartPayload(result.view) });
  }));

  /** Pont vers le panier AYROVI existant (§2 : aucun second panier côté AYROVI). */
  router.post('/cart/bridge-to-ayrovi', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const result = bridgeAyWebsCartToAyrovi(db, {
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      itemIds: Array.isArray(req.body?.item_ids) ? req.body.item_ids.map(String).slice(0, 60) : undefined,
      requestId: requestIdOf(req),
    });
    res.json({ success: true, data: result });
  }));

  /* ================================================================== *
   * CHECKOUT & ORDERS (§19, §21)
   * ================================================================== */

  router.post('/checkout/preview', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const cart = readAyWebsCart(db, identity.sessionId, identity.accountId);
    if (!cart) throw new AyWebsDomainError('CART_EMPTY');
    const items = listAyWebsCartItems(db, cart.id);
    if (!items.length) throw new AyWebsDomainError('CART_EMPTY');
    const preview = computeAyWebsCheckoutPreview(db, items, {
      express: req.body?.express === true,
      includeLocalDelivery: req.body?.include_local_delivery !== false,
    });
    trackAyWebsFunnel(ctx, 'checkout_previewed', {}, identity.sessionId);
    res.json({ success: true, data: ayWebsCheckoutPreviewPayload(preview) });
  }));

  router.post('/orders', requireAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const { order, preview } = createAyWebsOrder(db, {
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      notes: req.body?.notes ? String(req.body.notes) : '',
      express: req.body?.express === true,
      includeLocalDelivery: req.body?.include_local_delivery !== false,
      shippingAddress: readShippingAddress(req.body?.shipping_address),
      requestId: requestIdOf(req),
    });
    trackAyWebsFunnel(ctx, 'order_created', {}, identity.sessionId);
    res.status(201).json({
      success: true,
      data: orderPayload(order),
      preview: ayWebsCheckoutPreviewPayload(preview),
      /** §48 : l'achat marchand automatisé n'est pas connecté — la revue est annoncée. */
      purchase_integration: ctx.flags.purchaseIntegrationEnabled ? 'ENABLED' : 'PENDING_INTEGRATION',
    });
  }));

  router.get('/orders', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const orders = listAyWebsOrders(db, {
      accountId: identity.accountId,
      sessionId: identity.sessionId,
      limit: Number(req.query.limit) || 25,
    });
    res.json({ success: true, data: orders.map(orderPayload) });
  }));

  router.get('/orders/:id', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const order = /^AYW-/.test(String(req.params.id))
      ? readAyWebsOrderByNumber(db, String(req.params.id), identity.accountId)
      : requireOwnedOrder(db, String(req.params.id), identity.accountId);
    if (!order) throw new AyWebsDomainError('ORDER_NOT_FOUND');
    res.json({
      success: true,
      data: orderPayload(order),
      links: listAyWebsOrderLinks(db, order.id),
    });
  }));

  router.post('/orders/:id/submit', requireAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const order = submitAyWebsOrder(db, {
      orderId: String(req.params.id),
      accountId: identity.accountId,
      requestId: requestIdOf(req),
    });
    trackAyWebsFunnel(ctx, 'order_submitted', {}, identity.sessionId);
    res.json({ success: true, data: orderPayload(order) });
  }));

  /* ================================================================== *
   * PAYMENTS (§20) — passerelle AYROVI existante, aucun écosystème parallèle
   * ================================================================== */

  router.get('/payments/methods', handle((_req, res) => {
    res.json({
      success: true,
      data: {
        methods: acceptedAyWebsPaymentMethods(db),
        card_gateway_available: cardGatewayAvailable(),
        /** Aucun moyen inventé : ce qui n'est pas configurable est dit, pas masqué. */
        note: 'Les moyens proviennent de la configuration commerciale AYROVI existante.',
      },
    });
  }));

  router.post('/payments/intents', requireAyWebsCustomer(db), handle(async (req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const intent = await createAyWebsPaymentIntent(db, {
      orderId: String(req.body?.order_id || req.params.id || ''),
      accountId: identity.accountId,
      method: String(req.body?.method || 'PENDING_SELECTION'),
      requestId: requestIdOf(req),
    });
    res.status(201).json({ success: true, data: intent });
  }));

  router.post('/payments/confirm', requireAyWebsCustomer(db), handle(async (req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const result = await confirmAyWebsPayment(db, {
      orderId: String(req.body?.order_id || ''),
      accountId: identity.accountId,
      paymentId: req.body?.payment_id ? String(req.body.payment_id) : null,
      requestId: requestIdOf(req),
    });
    res.json({ success: true, data: { payment: result.payment }, order: orderPayload(result.order) });
  }));

  router.post('/orders/:id/payments/transfer-proof', requireAyWebsCustomer(db), proofUpload.single('proof'), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const transferReference = String(req.body?.transferReference || req.body?.transfer_reference || '').trim();
    if (!transferReference) {
      throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', {
        userMessage: 'Indiquez la référence du virement ou du versement postal.',
      });
    }
    const file = req.file;
    if (!file?.buffer?.length) {
      throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', {
        userMessage: 'Fichier de preuve manquant (JPG, PNG ou PDF, 10 Mo max).',
      });
    }
    const head = Array.from(file.buffer.subarray(0, 8)).map((byte) => String.fromCharCode(byte)).join('');
    const signature = PROOF_SIGNATURES.find((candidate) => candidate.test.test(head));
    if (!signature) {
      throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', {
        userMessage: 'Format non supporté : JPG, PNG ou PDF uniquement.',
      });
    }
    // Les preuves sont écrites hors de toute racine publique, comme pour l'OMS.
    const proofPath = `aywebs/proofs/${String(req.params.id)}-${Date.now()}.${signature.ext}`;
    const result = recordAyWebsTransferProof(db, {
      orderId: String(req.params.id),
      accountId: identity.accountId,
      transferReference,
      proofPath,
      originalName: file.originalname || proofPath,
      requestId: requestIdOf(req),
    });
    res.json({ success: true, data: result });
  }));

  /* ================================================================== *
   * PURCHASE REQUESTS (§23) & STORE REQUESTS (§38)
   * ================================================================== */

  router.post('/purchase-requests', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const request = createAyWebsPurchaseRequest(db, {
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      productUrl: String(req.body?.product_url || req.body?.url || ''),
      quantity: Number(req.body?.quantity ?? 1),
      productName: req.body?.product_name ? String(req.body.product_name) : '',
      variantAttributes: normalizeAttributes(req.body?.variant || req.body?.variant_attributes),
      requirements: req.body?.requirements ? String(req.body.requirements) : '',
      customerNotes: req.body?.customer_notes ? String(req.body.customer_notes) : '',
      storeId: req.body?.store_id ? String(req.body.store_id) : null,
      requestId: requestIdOf(req),
    });
    trackAyWebsFunnel(ctx, 'purchase_request_submitted', { store: request.storeId || undefined }, identity.sessionId);
    res.status(201).json({ success: true, data: purchaseRequestPayload(request) });
  }));

  router.get('/purchase-requests', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const requests = listAyWebsPurchaseRequests(db, {
      accountId: identity.accountId,
      sessionId: identity.sessionId,
      limit: Number(req.query.limit) || 25,
    });
    res.json({ success: true, data: requests.map(purchaseRequestPayload) });
  }));

  router.get('/purchase-requests/:id', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const request = readAyWebsPurchaseRequest(db, String(req.params.id));
    if (!request) throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', { userMessage: 'Demande introuvable.' });
    const owned = (identity.accountId && request.accountId === identity.accountId)
      || (!request.accountId && request.sessionId === identity.sessionId);
    if (!owned) throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', { userMessage: 'Demande introuvable.' });
    res.json({ success: true, data: purchaseRequestPayload(request) });
  }));

  router.post('/store-requests', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const request = createAyWebsStoreRequest(db, {
      sessionId: identity.sessionId,
      accountId: identity.accountId,
      storeUrl: String(req.body?.store_url || req.body?.url || ''),
      storeName: req.body?.store_name ? String(req.body.store_name) : '',
      intent: req.body?.intent ? String(req.body.intent) : '',
      notes: req.body?.notes ? String(req.body.notes) : '',
      requestId: requestIdOf(req),
    });
    trackAyWebsFunnel(ctx, 'store_request_submitted', {}, identity.sessionId);
    res.status(201).json({ success: true, data: storeRequestPayload(request) });
  }));

  router.get('/store-requests', optionalAyWebsCustomer(db), handle((req, res) => {
    const identity = identityOf(req, res);
    if (!identity) return;
    const requests = listAyWebsStoreRequests(db, { accountId: identity.accountId, limit: Number(req.query.limit) || 25 });
    res.json({ success: true, data: requests.map(storeRequestPayload) });
  }));

  /* ================================================================== *
   * WAREHOUSE / CONSOLIDATION / SHIPPING (§33-35) — phases 6-8
   * ================================================================== */

  const notImplemented = (phase: string, what: string) => handle((_req, res) => {
    throw new AyWebsDomainError('NOT_IMPLEMENTED', {
      userMessage: `${what} n’est pas encore disponible dans cette version.`,
      technicalMessage: `${phase} non implémentée : aucune donnée simulée n'est renvoyée (§48)`,
      requiredAction: 'WAIT_FOR_REVIEW',
    });
  });

  router.get('/warehouse', notImplemented('PHASE 7 — Warehouse', 'Le suivi entrepôt'));
  router.get('/warehouse/items/:id', notImplemented('PHASE 7 — Warehouse', 'La fiche article en entrepôt'));
  router.post('/warehouse/items/:id/consolidate', notImplemented('PHASE 7 — Consolidation', 'Le groupement de colis'));
  router.post('/shipping/quote', notImplemented('PHASE 8 — Shipping', 'Le devis d’expédition internationale'));
  router.post('/shipping/request', notImplemented('PHASE 8 — Shipping', 'La demande d’expédition'));
  router.post('/shipping/pay', notImplemented('PHASE 8 — Shipping', 'Le paiement de l’expédition'));

  return router;
}

/* ------------------------------------------------------------------ *
 * Sérialisation HTTP stable (contrats consommés par le client)
 * ------------------------------------------------------------------ */

function productPayload(product: Awaited<ReturnType<typeof resolveAyWebsProduct>>['product']) {
  return {
    product_id: product.productId,
    store_id: product.storeId,
    store_name: product.storeName,
    source_url: product.sourceUrl,
    source_domain: product.sourceDomain,
    source_product_id: product.sourceProductId,
    title: product.title,
    description: product.description,
    brand: product.brand,
    images: product.images,
    price: product.price,
    currency: product.currency,
    variants: product.variants,
    variant_groups: product.variantGroups,
    selected_variant: product.selectedVariant,
    availability: {
      state: product.availability.state,
      reason: product.availability.reason,
      checked_at: product.availability.checkedAt,
      source: product.availability.source,
      quantity_hint: product.availability.quantityHint,
    },
    merchant: product.merchant,
    purchase_mode: product.purchaseMode,
    integration_type: product.integrationType,
    captured_at: product.capturedAt,
    evidence_hash: product.evidenceHash,
    ayrovi_pricing: product.ayroviPricing ? {
      total_tnd: product.ayroviPricing.totalTnd,
      pricing_version: product.ayroviPricing.pricingVersion,
      breakdown: {
        converted_source_price: product.ayroviPricing.breakdown.convertedSourcePrice,
        shipping: product.ayroviPricing.breakdown.shipping,
        customs: product.ayroviPricing.breakdown.customs,
        service_fee: product.ayroviPricing.breakdown.serviceFee,
        other: product.ayroviPricing.breakdown.other,
      },
    } : null,
  };
}

/** Contrat V1 `normalized_product` : conservé à l'identique pour l'écran actuel. */
function normalizedProductV1(result: Awaited<ReturnType<typeof resolveAyWebsProduct>>) {
  const { product, scrapedProduct, pricing } = result;
  return {
    source: {
      store: scrapedProduct.store,
      url: scrapedProduct.url,
      product_id: scrapedProduct.externalId,
      captured_at: scrapedProduct.scrapedAt,
      extraction: {
        verified: scrapedProduct.priceVerified === true,
        provider: scrapedProduct.verificationProvider || null,
        method: scrapedProduct.verificationMethod || null,
        failure_code: scrapedProduct.verificationFailureCode || null,
      },
    },
    product: {
      title: product.title,
      brand: product.brand,
      description: product.description,
      images: product.images,
      category: pricing?.categoryLabel || null,
    },
    pricing: {
      source_price: product.price,
      currency: product.currency,
      estimated_price_tnd: pricing && !pricing.restricted ? pricing.totalTND : 0,
      pricing_version: pricing?.pricingVersion || 0,
      breakdown: {
        converted_source_price: pricing?.convertedPriceTND || 0,
        shipping: pricing?.shippingFeeTND || 0,
        customs: pricing?.customsFeeTND || 0,
        service_fee: pricing?.serviceFeeTND || 0,
        other: (pricing?.freightTND || 0) + (pricing?.expressFeeTND || 0),
      },
    },
    variants: {
      colors: scrapedProduct.variants?.colors || [],
      sizes: scrapedProduct.variants?.sizes || [],
      groups: product.variantGroups,
      options: product.variants,
      selected_color: (product.selectedVariant?.attributes?.color as string) || null,
      selected_size: (product.selectedVariant?.attributes?.size as string) || null,
    },
    availability: {
      available: product.availability.state === 'AVAILABLE' || product.availability.state === 'LOW_STOCK'
        ? true
        : product.availability.state === 'OUT_OF_STOCK' ? false : null,
      status: scrapedProduct.availability,
      state: product.availability.state,
      reason: product.availability.reason,
      checked_at: product.availability.checkedAt,
    },
    purchase_mode: product.purchaseMode,
    integration_type: product.integrationType,
    evidence_hash: product.evidenceHash,
  };
}

function cartItemPayload(item: ReturnType<typeof listAyWebsCartItems>[number]) {
  return {
    id: item.id,
    item_number: item.itemNumber,
    cart_id: item.cartId,
    product_id: item.productId,
    store_id: item.storeId,
    store_name: item.storeName,
    source_url: item.sourceUrl,
    source_product_id: item.sourceProductId,
    title: item.title,
    images: item.images,
    unit_price: item.unitPrice,
    currency: item.currency,
    variant_snapshot: item.variantSnapshot,
    variant_label: item.variantLabel,
    quantity: item.quantity,
    availability: item.availability,
    price_snapshot: item.priceSnapshot,
    pricing_tnd: item.pricingTnd,
    line_total_tnd: item.lineTotalTnd,
    evidence_hash: item.evidenceHash,
    status: item.status,
    status_reason: item.statusReason,
    customer_note: item.customerNote,
    purchase_mode: item.purchaseMode,
    checkout_ready: item.checkoutReady,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function cartPayload(view: ReturnType<typeof readAyWebsCartView>) {
  return {
    cart: view.cart ? {
      id: view.cart.id,
      account_id: view.cart.accountId,
      session_id: view.cart.sessionId,
      status: view.cart.status,
      currency: view.cart.currency,
      items_count: view.items.length,
      created_at: view.cart.createdAt,
      updated_at: view.cart.updatedAt,
    } : null,
    items: view.items.map(cartItemPayload),
    groups: view.groups.map((group) => ({
      store_id: group.storeId,
      store_name: group.storeName,
      integration_type: group.integrationType,
      subtotal_tnd: group.subtotalTnd,
      blocked_items: group.blockedItems,
      items: group.items.map(cartItemPayload),
    })),
    totals: {
      units: view.totals.units,
      product_subtotal_tnd: view.totals.productSubtotalTnd,
      currency: view.totals.currency,
      blocked_items: view.totals.blockedItems,
      checkout_ready: view.totals.checkoutReady,
    },
    blockers: view.blockers,
    /** §51 : prix, stock et achat exigent le réseau — le client le sait. */
    live_data_requires_network: true,
  };
}

/** Adresse de livraison du checkout (§21) : recopiée telle quelle, sinon null. */
function readShippingAddress(raw: unknown): { name: string; phone: string; city: string; line: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const pick = (key: string): string => (typeof value[key] === 'string' ? String(value[key]).trim() : '');
  const address = { name: pick('name'), phone: pick('phone'), city: pick('city'), line: pick('line') };
  return address.name || address.phone || address.city || address.line ? address : null;
}

function orderPayload(order: ReturnType<typeof listAyWebsOrders>[number]) {
  return {
    id: order.id,
    order_number: order.orderNumber,
    status: order.status,
    master_stage: order.masterStage,
    exception_state: order.exceptionState,
    exception_reason: order.exceptionReason,
    currency: order.currency,
    shipping_address: order.shippingAddress || {},
    totals: {
      product_subtotal_tnd: order.totals.productSubtotalTnd,
      service_fee_tnd: order.totals.serviceFeeTnd,
      import_fee_tnd: order.totals.importFeeTnd,
      shipping_estimate_tnd: order.totals.shippingEstimateTnd,
      other_fee_tnd: order.totals.otherFeeTnd,
      payable_tnd: order.totals.payableTnd,
    },
    fees: order.fees.map((fee) => ({
      kind: fee.kind, code: fee.code, label: fee.label, amount_tnd: fee.amountTnd, detail: fee.detail,
    })),
    pricing_version: order.pricingVersion,
    payment_status: order.paymentStatus,
    payment_method: order.paymentMethod,
    payment_reference: order.paymentReference,
    paid_at: order.paidAt,
    submitted_at: order.submittedAt,
    notes: order.notes,
    items: order.items.map((item) => ({
      id: item.id,
      store_id: item.storeId,
      source_url: item.sourceUrl,
      source_product_id: item.sourceProductId,
      title: item.title,
      images: item.images,
      unit_price: item.unitPrice,
      currency: item.currency,
      quantity: item.quantity,
      variant_label: item.variantLabel,
      variant_snapshot: item.variantSnapshot,
      line_total_tnd: item.lineTotalTnd,
      evidence_hash: item.evidenceHash,
      purchase_status: item.purchaseStatus,
      purchase_reason: item.purchaseReason,
      warehouse_state: item.warehouseState,
    })),
    /** §36 : projection client, jamais les états techniques internes. */
    timeline: order.timeline.map((step) => ({ key: step.key, state: step.state })),
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}

function purchaseRequestPayload(request: ReturnType<typeof listAyWebsPurchaseRequests>[number]) {
  return {
    id: request.id,
    request_number: request.requestNumber,
    store_id: request.storeId,
    store_name: request.storeName,
    registered_store: request.registeredStore,
    product_url: request.productUrl,
    source_domain: request.sourceDomain,
    quantity: request.quantity,
    product_name: request.productName,
    variant_attributes: request.variantAttributes,
    requirements: request.requirements,
    customer_notes: request.customerNotes,
    status: request.status,
    reason: request.reason,
    decision_note: request.decisionNote,
    decided_at: request.decidedAt,
    order_id: request.orderId,
    next_action: request.nextAction,
    created_at: request.createdAt,
    updated_at: request.updatedAt,
  };
}

function storeRequestPayload(request: ReturnType<typeof listAyWebsStoreRequests>[number]) {
  return {
    id: request.id,
    store_url: request.storeUrl,
    store_name: request.storeName,
    source_domain: request.sourceDomain,
    intent: request.intent,
    notes: request.notes,
    status: request.status,
    decision_note: request.decisionNote,
    decided_at: request.decidedAt,
    promoted_store_id: request.promotedStoreId,
    created_at: request.createdAt,
  };
}
