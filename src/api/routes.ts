import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { SmartLinkScraper } from '../scraper/scraper';
import { QatafoDatabase as AyroviDatabase } from '../db/database';
import type { PaymentMethodCode } from '../db/database';
import { VisualProductExtractor } from '../services/vision';
import { ownerHashOf, recordLearningEvent } from '../assistant/learning';
import { AddToCartRequest } from '../types';
import { calculatePrice, orderLocalDelivery } from '../services/pricing';
import { customerFromRequest, requireCustomer, resolveCustomer } from '../customer/auth';
import { InvalidImageError, normalizeUploadedImage } from '../services/imageValidation';
import { isUnsafeHostname, parsePublicHttpUrl, UnsafeUrlError } from '../services/safeUrl';
import { verifyAyrovixPriceToken } from '../ayrovix/priceQuote';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_SIZE, files: 1 } });
const SUPPORTED_STORES = new Set(['amazon', 'shein', 'temu', 'aliexpress', 'generic']);
const PAYMENT_METHODS = new Set<PaymentMethodCode>(['PENDING_SELECTION', 'COD', 'D17', 'FLOUCI', 'CARD', 'BANK_TRANSFER', 'POSTE']);
const DEFAULT_PAYMENT_METHODS: PaymentMethodCode[] = ['CARD', 'FLOUCI', 'BANK_TRANSFER', 'POSTE'];


export function createApiRouter(
  db: AyroviDatabase,
  scraper: SmartLinkScraper,
  visionExtractor: VisualProductExtractor
): Router {
  const router = Router();

  function cartSummary() {
    const rules = db.getPricingRules();
    return (items: ReturnType<AyroviDatabase['getItems']>) => {
      const pricedItems = items.map((item) => {
        const breakdown = calculatePrice(rules, item.sourcePrice, item.sourceCurrency, {
          quantity: item.quantity, includeLocalDelivery: false, title: item.title,
        });
        if (!breakdown || breakdown.restricted) throw new Error('CART_PRICING_FAILED');
        return {
          ...item,
          lineTotalTND: breakdown.totalTND,
          pricingVersion: breakdown.pricingVersion,
          convertedPriceTND: breakdown.convertedPriceTND,
          customsFeeTND: breakdown.customsFeeTND,
          shippingFeeTND: breakdown.shippingFeeTND,
          serviceFeeTND: breakdown.serviceFeeTND,
          expressFeeTND: breakdown.expressFeeTND,
          discountTND: breakdown.discountTND,
          freightTND: breakdown.freightTND,
          categoryId: breakdown.categoryId,
        };
      });
      const goods = pricedItems.reduce((sum, item) => sum + item.lineTotalTND, 0);
      const totalTND = Math.round((goods + orderLocalDelivery(rules)) * 1000) / 1000;
      return { items: pricedItems, totalTND };
    };
  }

  function getSessionId(req: Request): string {
    const candidate = req.headers['x-session-id'] || req.query.sessionId;
    const value = Array.isArray(candidate) ? candidate[0] : candidate;
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    return /^[A-Za-z0-9._:-]{8,160}$/.test(normalized) ? normalized : '';
  }

  function requireSessionId(req: Request, res: Response): string | null {
    const sessionId = getSessionId(req);
    if (sessionId) return sessionId;
    res.status(400).json({ success: false, error: 'Session client invalide ou absente.' });
    return null;
  }

  const protectAuthenticatedCart = (req: Request, res: Response, next: NextFunction) => {
    if (!resolveCustomer(db, req)) return next();
    return requireCustomer(db)(req, res, next);
  };

  function cartAccountId(req: Request, sessionId: string): string | null {
    const customer = (req as any).customer || resolveCustomer(db, req);
    if (!customer) return null;
    db.attachCartToAccount(sessionId, customer.id);
    return customer.id;
  }

  /**
   * POST /api/extract-image
   * Visual AI Screenshot Extractor
   */
  router.post('/extract-image', upload.single('image'), async (req: Request, res: Response) => {
    try {
      let imageBuffer: Buffer | null = null;
      let declaredMimeType = '';

      if (req.file) {
        imageBuffer = req.file.buffer;
        declaredMimeType = req.file.mimetype;
      } else if (typeof req.body?.imageBase64 === 'string') {
        const match = req.body.imageBase64.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
        if (match) {
          declaredMimeType = match[1];
          imageBuffer = Buffer.from(match[2], 'base64');
        }
      }

      if (!imageBuffer || imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_SIZE) {
        return res.status(400).json({
          success: false,
          error: 'Veuillez télécharger une capture d\'écran.'
        });
      }

      const normalized = await normalizeUploadedImage(imageBuffer, declaredMimeType);
      const product = await visionExtractor.extractFromImage(normalized.buffer);
      const priced = calculatePrice(db.getPricingRules(), product.sourcePrice, product.sourceCurrency);
      const normalizedProduct = priced ? {
        ...product,
        convertedPriceTND: priced.convertedPriceTND,
        serviceFeeTND: priced.serviceFeeTND,
        estimatedShippingTND: priced.shippingFeeTND,
        totalPriceTND: priced.totalTND,
      } : product;
      return res.json({
        success: true,
        product: normalizedProduct
      });
    } catch (err: any) {
      if (err instanceof InvalidImageError || err?.code === 'INVALID_IMAGE') {
        return res.status(415).json({ success: false, code: 'INVALID_IMAGE', error: err.message });
      }
      console.error('[Vision Error]', err);
      return res.status(500).json({
        success: false,
        error: "L'analyse de l'image a échoué. Réessayez avec une capture plus nette."
      });
    }
  });

  /**
   * POST /api/scrape
   */
  router.post('/scrape', async (req: Request, res: Response) => {
    const url = req.body?.url;

    if (typeof url !== 'string' || !url.trim() || url.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez fournir une URL valide.'
      });
    }

    const cleanUrl = scraper.cleanPastedUrl(url);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanUrl);
    } catch {
      return res.status(400).json({ success: false, error: 'Veuillez fournir une URL Web valide.' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || isUnsafeHostname(parsedUrl.hostname)) {
      return res.status(400).json({ success: false, error: 'Cette adresse Web ne peut pas être analysée.' });
    }

    try {
      const product = await scraper.scrapeProduct(cleanUrl);
      const priced = calculatePrice(db.getPricingRules(), product.sourcePrice, product.sourceCurrency);
      const normalizedProduct = priced ? {
        ...product,
        convertedPriceTND: priced.convertedPriceTND,
        serviceFeeTND: priced.serviceFeeTND,
        estimatedShippingTND: priced.shippingFeeTND,
        totalPriceTND: priced.totalTND,
      } : product;
      return res.json({
        success: true,
        product: normalizedProduct
      });
    } catch (err: any) {
      if (err instanceof UnsafeUrlError || err?.code === 'UNSAFE_URL') {
        return res.status(400).json({ success: false, code: 'INVALID_URL', error: err.message });
      }
      console.error('[Scraper Error]', err);
      return res.status(500).json({
        success: false,
        error: "L'extraction du produit a échoué. Vérifiez le lien ou utilisez une capture d'écran."
      });
    }
  });

  /**
   * POST /api/cart/items
   */
  router.post('/cart/items', protectAuthenticatedCart, (req: Request, res: Response) => {
    const sessionId = requireSessionId(req, res);
    if (!sessionId) return;

    const item = req.body as Partial<AddToCartRequest> | null;
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ success: false, error: 'Données produit incomplètes ou invalides.' });
    }

    const quantity = Number(item.quantity ?? 1);
    const sourcePrice = Number(item.sourcePrice);
    const sourceCurrency = typeof item.sourceCurrency === 'string' ? item.sourceCurrency.trim().toUpperCase() : '';
    const calculatedPrice = calculatePrice(db.getPricingRules(), sourcePrice, sourceCurrency, { title: String(item.title || '') });
    const calculatedPriceTND = calculatedPrice && !calculatedPrice.restricted ? calculatedPrice.totalTND : null;
    const ayrovixItem = typeof item.priceVerificationStatus === 'string' || typeof item.priceToken === 'string';
    const priceVerificationStatus = item.priceVerificationStatus === 'PENDING_MANUAL' ? 'PENDING_MANUAL' : 'VERIFIED';
    const requestedSize = String(item.requestedSize || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100);
    const requestedColor = String(item.requestedColor || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100);
    const customerNote = String(item.customerNote || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
    const referenceUrl = String(item.referenceUrl || '').trim();
    let manualUrlValid = true;
    let referenceUrlValid = true;
    if (ayrovixItem) {
      try { parsePublicHttpUrl(item.url); } catch { manualUrlValid = false; }
      if (referenceUrl) {
        try { parsePublicHttpUrl(referenceUrl); } catch { referenceUrlValid = false; }
      }
    }
    const quoteValid = !ayrovixItem || verifyAyrovixPriceToken(item.priceToken, {
      price: sourcePrice,
      currency: sourceCurrency,
      title: item.title,
      referenceUrl,
      status: priceVerificationStatus,
    });

    if (
      typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500 ||
      typeof item.store !== 'string' || !SUPPORTED_STORES.has(item.store) ||
      typeof item.url !== 'string' || item.url.length > 4096 ||
      typeof item.imageUrl !== 'string' || item.imageUrl.length > 4096 ||
      !Number.isFinite(sourcePrice) || sourcePrice <= 0 || sourcePrice > 1_000_000 ||
      calculatedPriceTND === null ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 99 ||
      !manualUrlValid || !referenceUrlValid || !quoteValid ||
      (item.requestedSize != null && typeof item.requestedSize !== 'string') ||
      (item.requestedColor != null && typeof item.requestedColor !== 'string') ||
      (item.customerNote != null && typeof item.customerNote !== 'string') ||
      (item.externalId != null && (typeof item.externalId !== 'string' || item.externalId.length > 300)) ||
      (item.variant != null && (typeof item.variant !== 'string' || item.variant.length > 500))
    ) {
      return res.status(400).json({
        success: false,
        code: !quoteValid ? 'INVALID_AYROVIX_PRICE_TOKEN' : !manualUrlValid ? 'MANUAL_PRODUCT_URL_REQUIRED' : 'INVALID_CART_ITEM',
        error: !quoteValid
          ? 'Le prix AYROVIX a expiré ou a été modifié. Relancez Lens.'
          : !manualUrlValid
            ? 'Le lien produit fourni par le client est obligatoire et doit être public.'
            : 'Données produit incomplètes ou invalides.'
      });
    }

    const normalizedItem: AddToCartRequest = {
      store: item.store,
      externalId: item.externalId?.trim() || null,
      url: item.url.trim(),
      title: item.title.trim(),
      imageUrl: item.imageUrl.trim(),
      sourcePrice,
      sourceCurrency,
      priceTND: calculatedPriceTND,
      variant: item.variant?.trim() || null,
      requestedSize,
      requestedColor,
      customerNote,
      referenceUrl,
      priceVerificationStatus,
      quantity,
    };

    try {
      const accountId = cartAccountId(req, sessionId);
      const cartItem = db.addItem(sessionId, normalizedItem, accountId);
      const summary = cartSummary()(db.getItems(sessionId, accountId));
      return res.status(201).json({
        success: true,
        cartItem,
        totalItemsCount: summary.items.reduce((sum, current) => sum + current.quantity, 0),
        totalTND: summary.totalTND,
      });
    } catch (err: any) {
      if (err instanceof RangeError && err.message === 'CART_QUANTITY_LIMIT') {
        return res.status(400).json({ success: false, error: 'La quantité maximale par article est de 99.' });
      }
      console.error('[Cart Add Error]', err);
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'enregistrement dans le panier.'
      });
    }
  });

  /**
   * GET /api/cart/items
   */
  router.get('/cart/items', (req: Request, res: Response) => {
    const sessionId = requireSessionId(req, res);
    if (!sessionId) return;

    try {
      const accountId = cartAccountId(req, sessionId);
      const summary = cartSummary()(db.getItems(sessionId, accountId));

      return res.json({
        success: true,
        sessionId,
        itemCount: summary.items.length,
        totalItemsCount: summary.items.reduce((sum, item) => sum + item.quantity, 0),
        totalTND: summary.totalTND,
        items: summary.items,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: 'Erreur de lecture du panier.'
      });
    }
  });

  /**
   * DELETE /api/cart/items/:id
   */
  router.delete('/cart/items/:id', protectAuthenticatedCart, (req: Request, res: Response) => {
    const sessionId = requireSessionId(req, res);
    if (!sessionId) return;

    const { id } = req.params;
    try {
      const accountId = cartAccountId(req, sessionId);
      const removed = db.removeItem(id, sessionId, accountId);
      if (!removed) return res.status(404).json({ success: false, error: 'Article introuvable.' });
      return res.json({ success: true, removed: true });
    } catch {
      return res.status(500).json({ success: false, error: 'Erreur de suppression.' });
    }
  });

  /**
   * PATCH /api/cart/items/:id
   */
  router.patch('/cart/items/:id', protectAuthenticatedCart, (req: Request, res: Response) => {
    const sessionId = requireSessionId(req, res);
    if (!sessionId) return;

    const { id } = req.params;
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      return res.status(400).json({ success: false, error: 'Quantité invalide.' });
    }

    try {
      const accountId = cartAccountId(req, sessionId);
      const existing = db.getItemById(id, sessionId, accountId);
      if (!existing) return res.status(404).json({ success: false, error: 'Article introuvable.' });
      const updated = db.updateQuantity(id, quantity, sessionId, accountId);
      return res.json({ success: true, cartItem: updated });
    } catch {
      return res.status(500).json({ success: false, error: 'Erreur de mise à jour.' });
    }
  });

  /**
   * POST /api/checkout
   */
  router.post('/checkout', requireCustomer(db), (req: Request, res: Response) => {
    const sessionId = requireSessionId(req, res);
    if (!sessionId) return;

    const customer = customerFromRequest(req);
    const { name, email, phone, city, address, paymentMethod, latitude, longitude, termsAccepted, locale } = req.body ?? {};

    if (
      typeof name !== 'string' || !name.trim() || name.length > 160 ||
      typeof city !== 'string' || !city.trim() || city.length > 100 ||
      typeof address !== 'string' || !address.trim() || address.length > 500
    ) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez remplir des coordonnées de livraison valides.'
      });
    }

    const contactEmail = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 254) {
      return res.status(400).json({ success: false, code: 'CHECKOUT_EMAIL_INVALID', error: 'Veuillez confirmer une adresse e-mail valide pour la facture.' });
    }
    if (termsAccepted !== true) {
      return res.status(400).json({ success: false, code: 'TERMS_REQUIRED', error: 'Vous devez accepter les conditions de vente et la politique de retour.' });
    }
    const account = db.get<any>('SELECT email,email_verified_at,phone_verified_at,status FROM customer_accounts WHERE id=?', customer.id);
    if (!account?.email_verified_at && !account?.phone_verified_at) {
      return res.status(403).json({ success: false, code: 'CONTACT_VERIFICATION_REQUIRED', error: 'Vérifiez votre e-mail ou votre téléphone avant de confirmer la commande.' });
    }
    if (account.email_verified_at && !account.phone_verified_at && contactEmail !== String(account.email || '').toLowerCase()) {
      return res.status(403).json({ success: false, code: 'VERIFIED_EMAIL_REQUIRED', error: 'Utilisez votre adresse e-mail vérifiée, ou vérifiez votre téléphone avant de changer l’adresse de facturation.' });
    }
    const parsedLatitude = latitude === null || latitude === undefined || latitude === '' ? null : Number(latitude);
    const parsedLongitude = longitude === null || longitude === undefined || longitude === '' ? null : Number(longitude);
    if ((parsedLatitude !== null && (!Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90))
      || (parsedLongitude !== null && (!Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180))
      || (parsedLatitude === null) !== (parsedLongitude === null)) {
      return res.status(400).json({ success: false, code: 'DELIVERY_LOCATION_INVALID', error: 'La position de livraison est invalide.' });
    }
    if (locale !== 'fr-TN' && locale !== 'ar-TN') {
      return res.status(400).json({ success: false, code: 'CHECKOUT_LOCALE_INVALID', error: 'La langue de la commande est invalide.' });
    }
    const checkoutLocale: 'fr-TN' | 'ar-TN' = locale;

    // Le téléphone de livraison peut différer du téléphone vérifié; le compte doit toutefois
    // posséder au moins un canal vérifié (e-mail OAuth ou téléphone OTP).
    const deliveryPhone = String(phone ?? '').replace(/\s+/g, ' ').trim();
    const deliveryDigits = deliveryPhone.replace(/\D/g, '')
      .replace(/^00216(?=\d{8}$)/, '')
      .replace(/^216(?=\d{8}$)/, '');
    if (!deliveryPhone || deliveryPhone.length > 32 || !/^[24579]\d{7}$/.test(deliveryDigits)) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez renseigner un numéro tunisien valide à 8 chiffres commençant par 2, 4, 5, 7 ou 9.'
      });
    }

    // Checkout creates the order first. Payment method selection belongs to the
    // persisted order detail, not to order creation.
    const paymentCode = String(paymentMethod || 'PENDING_SELECTION').trim().toUpperCase();
    const paymentSetting = db.get<any>("SELECT setting_value FROM settings WHERE setting_key='payment_methods'");
    const governorateSetting = db.get<any>("SELECT setting_value FROM settings WHERE setting_key='governorates'");
    let configuredPayments: PaymentMethodCode[] = DEFAULT_PAYMENT_METHODS;
    let configuredGovernorates: string[] = [];
    try {
      const parsedPayments = JSON.parse(paymentSetting?.setting_value || '[]');
      const parsedGovernorates = JSON.parse(governorateSetting?.setting_value || '[]');
      if (Array.isArray(parsedPayments) && parsedPayments.length) {
        const validPayments = parsedPayments
          .map((value) => String(value).trim().toUpperCase())
          .filter((value): value is PaymentMethodCode => PAYMENT_METHODS.has(value as PaymentMethodCode));
        if (validPayments.length) configuredPayments = [...new Set(validPayments)];
      }
      if (Array.isArray(parsedGovernorates)) configuredGovernorates = parsedGovernorates.map(String);
    } catch {
      return res.status(500).json({ success: false, error: 'La configuration commerciale est invalide.' });
    }
    if (!PAYMENT_METHODS.has(paymentCode as PaymentMethodCode)
      || (paymentCode !== 'PENDING_SELECTION' && !configuredPayments.includes(paymentCode as PaymentMethodCode))) {
      return res.status(400).json({ success: false, error: 'Ce moyen de paiement n’est pas disponible.' });
    }
    if (configuredGovernorates.length && !configuredGovernorates.includes(city.trim())) {
      return res.status(400).json({ success: false, error: 'Ce gouvernorat n’est pas desservi actuellement.' });
    }

    db.attachCartToAccount(sessionId, customer.id);
    const items = db.getItems(sessionId, customer.id);
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Votre panier est vide.'
      });
    }

    const normalizedPaymentMethod = paymentCode as PaymentMethodCode;

    try {
      const result = db.createOrderFromCart(sessionId, {
        name: name.trim(),
        email: contactEmail,
        phone: deliveryPhone,
        governorate: city.trim(),
        address: address.trim(),
        paymentMethod: normalizedPaymentMethod,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        termsAcceptedAt: new Date().toISOString(),
        locale: checkoutLocale,
      }, customer.id);
      try {
        recordLearningEvent(db, { executionLane: 'active', type: 'ORDER_CONVERSION', ownerHash: ownerHashOf((req as any).customer?.id || null, sessionId), success: true });
      } catch (learningError) {
        console.warn('[Checkout Learning Event]', learningError);
      }
      return res.json({
        success: true,
        ...result,
        message: 'Votre commande a été enregistrée avec succès chez AYSONIC !'
      });
    } catch (error: any) {
      if (error?.message === 'EMPTY_CART') return res.status(400).json({ success: false, error: 'Votre panier est vide.' });
      if (error?.message === 'ACCOUNT_UNAVAILABLE') return res.status(403).json({ success: false, code: 'ACCOUNT_UNAVAILABLE', error: 'Votre compte n’est plus actif. Contactez le support AYROVI.' });
      console.error('[Checkout Error]', error);
      return res.status(500).json({ success: false, error: 'La commande n’a pas pu être enregistrée.' });
    }
  });

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Image trop volumineuse (10 Mo maximum).'
        : 'Le fichier envoyé est invalide.';
      return res.status(400).json({ success: false, error: message });
    }
    console.error('[API Error]', err);
    return res.status(500).json({ success: false, error: 'Erreur interne du service.' });
  });

  return router;
}
