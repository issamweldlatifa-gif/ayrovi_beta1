import { isIP } from 'node:net';
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { SmartLinkScraper } from '../scraper/scraper';
import { QatafoDatabase as AyroviDatabase } from '../db/database';
import { VisualProductExtractor } from '../services/vision';
import { AddToCartRequest } from '../types';
import { calculatePrice } from '../services/pricing';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_SIZE, files: 1 } });
const SUPPORTED_STORES = new Set(['amazon', 'shein', 'temu', 'aliexpress', 'generic']);

function isUnsafeHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan')
  ) return true;

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const [first, second] = hostname.split('.').map(Number);
    return (
      first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19))
    );
  }
  if (ipVersion === 6) {
    return (
      hostname === '::' || hostname === '::1' ||
      hostname.startsWith('fc') || hostname.startsWith('fd') ||
      /^fe[89ab]/.test(hostname) || hostname.startsWith('::ffff:')
    );
  }
  return false;
}


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
        const breakdown = calculatePrice(rules, item.sourcePrice, item.sourceCurrency, { quantity: item.quantity });
        if (!breakdown) throw new Error('CART_PRICING_FAILED');
        return { ...item, lineTotalTND: breakdown.totalTND, pricingVersion: breakdown.pricingVersion };
      });
      const totalTND = Math.round(pricedItems.reduce((sum, item) => sum + item.lineTotalTND, 0) * 100) / 100;
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

  /**
   * POST /api/extract-image
   * Visual AI Screenshot Extractor
   */
  router.post('/extract-image', upload.single('image'), async (req: Request, res: Response) => {
    try {
      let imageBuffer: Buffer | null = null;
      let filename: string = 'screenshot.jpg';

      if (req.file) {
        if (!req.file.mimetype.startsWith('image/')) {
          return res.status(415).json({ success: false, error: 'Le fichier envoyé doit être une image.' });
        }
        imageBuffer = req.file.buffer;
        filename = req.file.originalname;
      } else if (typeof req.body?.imageBase64 === 'string') {
        const match = req.body.imageBase64.match(/^data:image\/[A-Za-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/);
        if (match) imageBuffer = Buffer.from(match[1], 'base64');
      }

      if (!imageBuffer || imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_SIZE) {
        return res.status(400).json({
          success: false,
          error: 'Veuillez télécharger une capture d\'écran.'
        });
      }

      const product = await visionExtractor.extractFromImage(imageBuffer, filename);
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
  router.post('/cart/items', (req: Request, res: Response) => {
    const sessionId = requireSessionId(req, res);
    if (!sessionId) return;

    const item = req.body as Partial<AddToCartRequest> | null;
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ success: false, error: 'Données produit incomplètes ou invalides.' });
    }

    const quantity = Number(item.quantity ?? 1);
    const sourcePrice = Number(item.sourcePrice);
    const sourceCurrency = typeof item.sourceCurrency === 'string' ? item.sourceCurrency.trim().toUpperCase() : '';
    const calculatedPrice = calculatePrice(db.getPricingRules(), sourcePrice, sourceCurrency);
    const calculatedPriceTND = calculatedPrice?.totalTND ?? null;

    if (
      typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500 ||
      typeof item.store !== 'string' || !SUPPORTED_STORES.has(item.store) ||
      typeof item.url !== 'string' || item.url.length > 4096 ||
      typeof item.imageUrl !== 'string' || item.imageUrl.length > 4096 ||
      !Number.isFinite(sourcePrice) || sourcePrice <= 0 || sourcePrice > 1_000_000 ||
      calculatedPriceTND === null ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 99 ||
      (item.externalId != null && (typeof item.externalId !== 'string' || item.externalId.length > 300)) ||
      (item.variant != null && (typeof item.variant !== 'string' || item.variant.length > 500))
    ) {
      return res.status(400).json({
        success: false,
        error: 'Données produit incomplètes ou invalides.'
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
      quantity,
    };

    try {
      const cartItem = db.addItem(sessionId, normalizedItem);
      const summary = cartSummary()(db.getItems(sessionId));
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
      const summary = cartSummary()(db.getItems(sessionId));

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
  router.delete('/cart/items/:id', (req: Request, res: Response) => {
    const sessionId = requireSessionId(req, res);
    if (!sessionId) return;

    const { id } = req.params;
    try {
      const removed = db.removeItem(id, sessionId);
      if (!removed) return res.status(404).json({ success: false, error: 'Article introuvable.' });
      return res.json({ success: true, removed: true });
    } catch {
      return res.status(500).json({ success: false, error: 'Erreur de suppression.' });
    }
  });

  /**
   * PATCH /api/cart/items/:id
   */
  router.patch('/cart/items/:id', (req: Request, res: Response) => {
    const sessionId = requireSessionId(req, res);
    if (!sessionId) return;

    const { id } = req.params;
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      return res.status(400).json({ success: false, error: 'Quantité invalide.' });
    }

    try {
      const existing = db.getItemById(id, sessionId);
      if (!existing) return res.status(404).json({ success: false, error: 'Article introuvable.' });
      const updated = db.updateQuantity(id, quantity, sessionId);
      return res.json({ success: true, cartItem: updated });
    } catch {
      return res.status(500).json({ success: false, error: 'Erreur de mise à jour.' });
    }
  });

  /**
   * POST /api/checkout
   */
  router.post('/checkout', (req: Request, res: Response) => {
    const sessionId = requireSessionId(req, res);
    if (!sessionId) return;

    const { name, phone, city, address, paymentMethod } = req.body ?? {};

    if (
      typeof name !== 'string' || !name.trim() || name.length > 160 ||
      typeof phone !== 'string' || phone.length > 40 || phone.replace(/\D/g, '').length < 8 ||
      typeof city !== 'string' || !city.trim() || city.length > 100 ||
      typeof address !== 'string' || !address.trim() || address.length > 500
    ) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez remplir des coordonnées de livraison valides.'
      });
    }

    const paymentCode = String(paymentMethod || '').trim().toUpperCase();
    const paymentSetting = db.get<any>("SELECT setting_value FROM settings WHERE setting_key='payment_methods'");
    const governorateSetting = db.get<any>("SELECT setting_value FROM settings WHERE setting_key='governorates'");
    let configuredPayments: string[] = ['COD', 'D17', 'FLOUCI'];
    let configuredGovernorates: string[] = [];
    try {
      const parsedPayments = JSON.parse(paymentSetting?.setting_value || '[]');
      const parsedGovernorates = JSON.parse(governorateSetting?.setting_value || '[]');
      if (Array.isArray(parsedPayments) && parsedPayments.length) configuredPayments = parsedPayments.map(String);
      if (Array.isArray(parsedGovernorates)) configuredGovernorates = parsedGovernorates.map(String);
    } catch {
      return res.status(500).json({ success: false, error: 'La configuration commerciale est invalide.' });
    }
    if (!configuredPayments.includes(paymentCode)) {
      return res.status(400).json({ success: false, error: 'Ce moyen de paiement n’est pas disponible.' });
    }
    if (configuredGovernorates.length && !configuredGovernorates.includes(city.trim())) {
      return res.status(400).json({ success: false, error: 'Ce gouvernorat n’est pas desservi actuellement.' });
    }

    const items = db.getItems(sessionId);
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Votre panier est vide.'
      });
    }

    const normalizedPaymentMethod = paymentCode as 'COD' | 'D17' | 'FLOUCI';

    try {
      const result = db.createOrderFromCart(sessionId, {
        name: name.trim(),
        phone: phone.trim(),
        governorate: city.trim(),
        address: address.trim(),
        paymentMethod: normalizedPaymentMethod,
      });
      return res.json({
        success: true,
        ...result,
        message: 'Votre commande a été enregistrée avec succès chez AYROVI !'
      });
    } catch (error) {
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
