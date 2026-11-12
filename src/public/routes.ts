import { readSocialCounts, readSocialComments } from '../magazine/socialEngagementReads';
import { viewerContentReactions, writeSocialInteraction } from '../magazine/socialInteractions';
import { readPublisherFollow, writePublisherFollow, writePublicationPreference } from '../magazine/publicationPreferences';
import { preferenceTiming } from '../analytics/preferenceTiming';
import { readPublicProducts } from '../catalogue/publicProducts';
import { socialPage } from './socialPaging';
import { readPublishedSocial } from '../magazine/publicSocialReads';
import { imageWork, writeImageCache } from '../services/imageWork';
import { readPublicationFeedSettings } from '../services/publicationFeedSettings';
import { PUBLICATION_CATEGORIES } from '../../shared/publicationFeed';
import { availableProductParams, availableProductSql } from '../catalogue/contentProducts';
import { readFicheLabels } from '../catalogue/products';
import { brandAccentColor, enforceBrandIdentity, enforceLegacyTheme } from '../../shared/identityPolicy';
import { publicNavDestination } from '../../shared/publicNavigation';
import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { cardGatewayAvailable } from '../services/paymentGateway';
import { QatafoDatabase, resolveAcceptedPaymentMethods } from '../db/database';
import { calculatePrice } from '../services/pricing';
import { quoteCartLine } from '../services/cartQuote';
import { resolvePromoForQuote, tunisIsoDay } from '../services/promotions';
import { getIsolatedImage, isPublicHttpUrl, readCachedPng, fetchRemoteImage, warmIsolation } from '../services/imageIsolation';
import { getComposedCard, readComposedPng, IDEAL_FRAME_WIDTH, frameSizeFor, CARD_CANVAS } from '../services/imageComposition';
import { getNativeCard, readNativeCard } from '../services/cardNative';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { customerFromRequest, keyedHash, optionalCustomer, requireCustomer } from '../customer/auth';
import { ownerHashOf, recordLearningEvent } from '../assistant/learning';
import { liveValues, publishedRows, toPublicCards } from '../services/heroSlideDrafts';
import {
  COVER_DESTINATIONS, DEFAULT_COVER_SETTINGS, MAX_COVER_INTERVAL_MS, MIN_COVER_INTERVAL_MS,
  resolveCoverPublic, type CoverSettings, type CoverSlide,
} from '../../shared/homeCover';
import { UnsafeUrlError } from '../services/safeUrl';
import { pruneDiskCache } from '../services/diskCache';
import { LINKED_PRODUCT_JOIN_SELECT, linkedProductFromJoin } from '../services/shoppableContent';
import { publicProductsByContent, type ContentKind } from '../services/contentProducts';
import { buildProductSheet, MAX_SHEET_IMAGES } from '../services/productSheet';
import { listVariants } from '../catalogue/variants';
import { listMedia } from '../catalogue/media';
import { getCategory } from '../catalogue/categories';

function parseJson(value: string, fallback: any = []) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapArrival(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    departureAt: row.departure_at,
    expectedArrivalAt: row.expected_arrival_at,
    endsAt: row.ends_at,
    description: row.description,
    mainImage: row.main_image,
    secondaryImages: parseJson(row.secondary_images),
    badge: row.badge,
    status: row.status,
  };
}

/**
 * Sortie publique d'un contenu shoppable : les colonnes de jointure `lp_*` sont
 * retirées, et `product` porte la carte (ou null si le produit n'est plus vendable).
 */
function withLinkedProduct(row: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('lp_')) out[key] = value;
  }
  out.product = linkedProductFromJoin(row);
  /* Liste (0..n) : remplie plus bas par `attachContentProducts`, qui lit la table
     de liaison. Un contenu sans ligne retombe sur son `product_id` historique. */
  out.products = out.product ? [out.product] : [];
  return out;
}

/**
 * Attache la liste complète des articles d'un lot de contenus (lot F1).
 * Une seule requête pour tout le lot. Le `product` singulier reste renvoyé pour
 * les clients déjà déployés : aucune rupture, on ajoute.
 */
function attachContentProducts(db: QatafoDatabase, kind: ContentKind, rows: Array<Record<string, any>>) {
  const map = publicProductsByContent(db, kind, rows as any);
  for (const row of rows) {
    const list = map.get(String(row.id)) ?? [];
    row.products = list;
    if (list.length === 0) row.product = null;
    else if (!row.product) row.product = list[0];
  }
  return rows;
}

/**
 * Racine de l'arbre : la famille d'un produit, lue dans la donnée.
 * Boucle bornée (10 niveaux) : un cycle en base ne peut pas figer la requête.
 */
function rootCategoryOf(db: QatafoDatabase, categoryId: string | null): { id: string; name: string; slug: string } | null {
  let current = categoryId;
  let last: { id: string; name: string; slug: string } | null = null;
  for (let depth = 0; current && depth < 10; depth += 1) {
    const category = getCategory(db, current);
    if (!category) break;
    last = { id: category.id, name: category.name, slug: category.slug };
    if (!category.parent_id) break;
    current = category.parent_id;
  }
  return last;
}

function mapProduct(row: any) {
  return {
    /**
     * LIBELLÉS DE LA FICHE (25/10/2026) : les noms que le CRM a donnés aux blocs
     * (« Taille » → « Pointure », sections propres au produit). Un libellé absent
     * n'est pas publié : l'application retombe sur le sien, elle n'invente rien.
     */
    ficheLabels: readFicheLabels(row.fiche_labels),
    id: row.id,
    name: row.name,
    description: row.description,
    image: row.image,
    additionalImages: parseJson(row.additional_images),
    brandId: row.brand_id,
    brandName: row.brand_name,
    category: row.category,
    sourceUrl: row.source_url,
    sourcePlatform: row.source_platform,
    originalPrice: Number(row.original_price),
    // Prix barré : `null` quand le propriétaire n'en a pas saisi — l'app n'affiche
    // alors rien, elle ne fabrique pas de remise.
    compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : Number(row.compare_at_price),
    currency: row.currency,
    convertedPrice: Number(row.converted_price),
    customsFee: Number(row.customs_fee),
    shippingFee: Number(row.shipping_fee),
    serviceFee: Number(row.service_fee),
    finalPrice: Number(row.final_price),
    expressAvailable: Boolean(row.express_available),
    stockStatus: row.stock_status,
    arrivalIds: row.arrival_ids ? String(row.arrival_ids).split(',').filter(Boolean) : [],
    // `CONTENT` = produit temporaire : la fiche reste accessible, mais il n'est jamais listé.
    visibility: row.visibility === 'CONTENT' ? 'CONTENT' : 'CATALOG',
  };
}

export function createPublicRouter(db: QatafoDatabase): Router {
  const router = Router();

  const commerceConfig = () => {
    const pricing = db.getPricingRules();
    const settings = db.all<any>(`SELECT setting_key,setting_value,value_type FROM settings WHERE setting_key IN
      ('delivery_delay','return_window_days','governorates','payment_methods','deposit_percent','deposit_review_delay','unavailable_refund_policy','company_legal_name','company_name','bank_rib','poste_account','flouci_number','card_discount_percent','facebook_url','instagram_url','tiktok_url','whatsapp_url','site_theme','interface_config','footer_about')`);
    const facts: Record<string, any> = {};
    for (const row of settings) facts[row.setting_key] = row.value_type === 'JSON' ? parseJson(row.setting_value) : row.setting_value;
    return {
      pricing: {
        version: pricing.version,
        rates: { EUR: pricing.rateEUR, USD: pricing.rateUSD, GBP: pricing.rateGBP, JPY: pricing.rateJPY, TND: 1 },
        // Transparence (audit 23/09/2026) : provenance et fraîcheur des taux affichés.
        ratesSource: pricing.fxSource || 'seed',
        ratesUpdatedAt: pricing.fxUpdatedAt || null,
        exchangeBufferPercent: pricing.exchangeBufferPercent,
        freightPerKgTND: pricing.freightPerKgTND,
        localDeliveryTND: pricing.localDeliveryTND,
        commissionPercent: pricing.commissionPercent,
        rpdPercent: pricing.rpdPercent,
        rpdMinimumTND: pricing.rpdMinimumTND,
        expressFeeTND: pricing.expressFeeTND,
        categories: pricing.categories.map((item) => ({ id: item.id, label: item.label, status: item.status })),
      },
      // Moteur de promotions (management 23/09/2026) : offre du jour tunisienne,
      // appliquée sur le prix produit converti — les cartes l'affichent en badge.
      promo: (() => { const day = resolvePromoForQuote(db); return day ? { percent: day.percent, label: day.label, day: tunisIsoDay() } : null; })(),
      governorates: Array.isArray(facts.governorates) ? facts.governorates : [],
      // La liste EFFECTIVE, résolue par la même fonction que le checkout : ce que
      // la caisse affiche est exactement ce que POST /api/checkout acceptera.
      // Publier la valeur brute laissait le client deviner, et proposer un moyen
      // que le serveur refusait ensuite — une commande perdue à la dernière étape.
      paymentMethods: resolveAcceptedPaymentMethods(facts.payment_methods),
      deliveryDelay: String(facts.delivery_delay || ''),
      /**
       * Fenêtre de RETOUR, en jours après la livraison, réglée dans le CRM
       * (`Paramètres → delivery → return_window_days`). La fiche du produit ne
       * doit pas l'écrire en dur : elle affiche ce que le serveur publie, et la
       * ligne disparaît si le réglage est absent ou illisible.
       */
      returns: {
        days: Number.isFinite(Number(facts.return_window_days)) && Number(facts.return_window_days) > 0
          ? Math.floor(Number(facts.return_window_days))
          : null,
      },
      capabilities: { cardGateway: cardGatewayAvailable() },
      // Feature flags — LIVE multi-product vision. مفعّل افتراضيًا؛ عطّله بـ AYROVIX_LENS_LIVE_ENABLED=false
      features: {
        ayrovixLensLive: process.env.AYROVIX_LENS_LIVE_ENABLED !== 'false',
        aywebsEnabled: !['0', 'false', 'off', 'disabled'].includes(String(process.env.AYWEBS_ENABLED ?? 'true').trim().toLowerCase()),
      },
      // تعليمات دفع العربون المعروضة في نموذج الطلب (قابلة للتحرير من لوحة الأدمن)
      deposit: {
        percent: Number(facts.deposit_percent) > 0 ? Number(facts.deposit_percent) : 20,
        cardDiscountPercent: Number(facts.card_discount_percent) >= 0 ? Number(facts.card_discount_percent) : 5,
        companyName: String(facts.company_legal_name || facts.company_name || 'ZAYROVI'),
        bankRib: String(facts.bank_rib || ''),
        posteAccount: String(facts.poste_account || ''),
        flouciNumber: String(facts.flouci_number || ''),
        reviewDelay: String(facts.deposit_review_delay || 'Sous 1 jour ouvré après réception du justificatif'),
        unavailableRefundPolicy: String(facts.unavailable_refund_policy || 'Acompte remboursé si ZAYROVI ne peut pas valider ou acheter l’article demandé'),
      },
      // قنوات التواصل الاجتماعي (تُدار من لوحة الأدمن ← Paramètres ← CHANNELS)
      channels: {
        facebook: String(facts.facebook_url || ''),
        instagram: String(facts.instagram_url || ''),
        tiktok: String(facts.tiktok_url || ''),
        whatsapp: String(facts.whatsapp_url || ''),
      },
      // الثيم البصري العام + استوديو «واجهتي».
      theme: facts.site_theme && typeof facts.site_theme === 'object' ? enforceLegacyTheme(facts.site_theme) : null,
      interfaceConfig: facts.interface_config && typeof facts.interface_config === 'object' ? enforceBrandIdentity(facts.interface_config) : null,
      footerAbout: String(facts.footer_about || ''),
    };
  };

  router.get('/commerce-config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ success: true, data: commerceConfig(), serverTime: new Date().toISOString() });
  });

  // ISOLATION D'ARRIÈRE-PLAN : fond studio uniforme → PNG transparent.
  // Les échecs ne redirigent jamais vers l'hôte externe : DNS/routage côté client
  // pourrait changer après la validation côté serveur (DNS rebinding).
  router.get('/media/isolated', async (req, res) => {
    const url = String(req.query.url || '');
    if (!isPublicHttpUrl(url)) { res.status(400).json({ success: false, error: 'INVALID_IMAGE_URL' }); return; }
    try {
      const meta = await getIsolatedImage(url);
      if (meta.file) {
        const png = readCachedPng(meta.file);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        res.send(png);
        return;
      }
    } catch (error: any) {
      if (error?.code === 'IMAGE_BUSY') { res.setHeader('Retry-After', '2'); return res.status(503).json({ success: false, code: 'IMAGE_BUSY', error: 'Image processing busy. Retry shortly.' }); }
      if (error instanceof UnsafeUrlError || error?.code === 'UNSAFE_URL') {
        return res.status(400).json({ success: false, error: 'INVALID_IMAGE_URL' });
      }
      // réseau/format unavailable: do not hand the URL back to the browser.
    }
    return res.status(502).json({ success: false, error: 'IMAGE_UNAVAILABLE' });
  });



  // COMPOSITION D'IMAGE PRODUIT (phase 2, 25/09/2026) : le produit est détouré puis
  // POSÉ sur le mockup ZAYROVI (9/13, #F0F2F2) avec une échelle UNIFORME et un
  // centrage sur son barycentre — ratio conservé, aucun rognage, aucune règle
  // spécifique à une image. Contrat d'acceptation vérifié AVANT mise en cache.
  // Aucun échec de traitement ne redirige vers un hôte externe.
  const COMPOSED_WIDTHS = new Set([600, 760, 900, 1080]);
  router.get('/media/card', async (req, res) => {
    const url = String(req.query.u || req.query.url || '');
    const width = Number(req.query.w || IDEAL_FRAME_WIDTH);
    if (!isPublicHttpUrl(url)) { res.status(400).json({ success: false, error: 'INVALID_IMAGE_URL' }); return; }
    if (!COMPOSED_WIDTHS.has(width)) { res.status(400).json({ success: false, error: 'INVALID_WIDTH' }); return; }
    /*
     * VOIE NATIVE D'ABORD (16/10/2026) : fond blanc → trim + canvas blanc ;
     * fond uniforme → trim + canvas couleur du bord ; fond complexe proche du
     * ratio → photo entière sur ses bords floutés. Aucune isolation ne part
     * d'ici : l'isolation (composition) ne reste que le cas D — photo très loin
     * du ratio 9/13, où le contain laisserait de grandes bandes.
     */
    try {
      const native = await getNativeCard(url, width);
      if (native.file) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('X-Ayrovi-Card', `native-${native.mode}`);
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        res.send(readNativeCard(native.file));
        return;
      }
    } catch (error: any) {
      if (error?.code === 'IMAGE_BUSY') { res.setHeader('Retry-After', '2'); return res.status(503).json({ success: false, code: 'IMAGE_BUSY', error: 'Image processing busy. Retry shortly.' }); }
      if (error instanceof UnsafeUrlError || error?.code === 'UNSAFE_URL') {
        return res.status(400).json({ success: false, error: 'INVALID_IMAGE_URL' });
      }
      // analyse/rendu impossible : la composition reste le plan suivant.
    }
    try {
      const meta = await getComposedCard(url, width);
      if (meta.file) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('X-Ayrovi-Card', 'composed');
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        res.send(readComposedPng(meta.file));
        return;
      }
    } catch (error: any) {
      if (error?.code === 'IMAGE_BUSY') { res.setHeader('Retry-After', '2'); return res.status(503).json({ success: false, code: 'IMAGE_BUSY', error: 'Image processing busy. Retry shortly.' }); }
      if (error instanceof UnsafeUrlError || error?.code === 'UNSAFE_URL') {
        return res.status(400).json({ success: false, error: 'INVALID_IMAGE_URL' });
      }
      // réseau, format exotique, produit non détourable → cadrage local ci-dessous.
    }

    /*
     * REPLI SUR NOTRE CANVAS (25/09/2026) — défaut constaté en production par le
     * client : quand la composition décline (produit non détourable), on
     * renvoyait l'image marchand via le navigateur. Résultat dans une grille :
     * trois cartes sur notre gris studio et une quatrième avec un rectangle
     * BLANC au milieu — la photo du marchand avec son propre fond. L'œil ne voit
     * que celle-là.
     *
     * Décliner le détourage ne dispense pas de tenir le cadre : l'image est donc
     * posée ENTIÈRE (contain, ratio conservé, aucun rognage) sur le canvas
     * ZAYROVI 9/13 #F0F2F2. Ce n'est pas une composition et on ne le prétend pas
     * — l'en-tête le dit — mais la grille redevient homogène.
     */
    try {
      const frame = frameSizeFor(width);
      const buffer = await fetchRemoteImage(url);
      const letterboxed = await sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
        .rotate()
        .resize({
          width: frame.width,
          height: frame.height,
          fit: 'contain',
          background: { ...CARD_CANVAS, alpha: 1 },
        })
        .flatten({ background: { ...CARD_CANVAS, alpha: 1 } })
        .png()
        .toBuffer();
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('X-Ayrovi-Card', 'letterbox');
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.send(letterboxed);
      return;
    } catch (error: any) {
      if (error?.code === 'IMAGE_BUSY') { res.setHeader('Retry-After', '2'); return res.status(503).json({ success: false, code: 'IMAGE_BUSY', error: 'Image processing busy. Retry shortly.' }); }
      if (error instanceof UnsafeUrlError || error?.code === 'UNSAFE_URL') {
        return res.status(400).json({ success: false, error: 'INVALID_IMAGE_URL' });
      }
      // même le cadrage a échoué : l'original reste le dernier repli.
    }

    return res.status(502).json({ success: false, error: 'IMAGE_UNAVAILABLE' });
  });

  // PROXY IMAGES PROPRE AU SITE (24/09/2026) : l'image marchand est redimensionnée
  // (WebP) et servie depuis notre domaine — pas de hotlink fragile, des octets
  // divisés, et un cache disque par (URL, largeur). Le rendu reste chaîné côté
  // client : isolated cache → proxy cache; failures never expose original-host redirects.
  const PROXY_WIDTHS = new Set([156, 320, 480, 760, 1000]);
  router.get('/media/img', async (req, res) => {
    const url = String(req.query.u || '');
    const width = Number(req.query.w || 760);
    if (!isPublicHttpUrl(url)) { res.status(400).json({ success: false, error: 'INVALID_IMAGE_URL' }); return; }
    if (!PROXY_WIDTHS.has(width)) { res.status(400).json({ success: false, error: 'INVALID_WIDTH' }); return; }
    try {
      const crypto = await import('node:crypto');
      const dir = process.env.AYROVI_PROXY_CACHE_DIR || path.resolve(process.cwd(), 'data', 'media-proxy');
      const key = crypto.createHash('sha256').update(`${width}|${url}`).digest('hex').slice(0, 32);
      const file = path.join(dir, `${key}.webp`);
      await imageWork.share(`proxy|${file}`, async () => {
        if (fs.existsSync(file)) return;
        await imageWork.limit(async () => {
          if (!fs.existsSync(file)) {
            const buffer = await fetchRemoteImage(url);
            const resized = await sharp(buffer, { failOn: 'none', limitInputPixels: 40_000_000 })
              .rotate()
              .resize({ width, withoutEnlargement: true })
              .webp({ quality: 78 })
              .toBuffer();
            fs.mkdirSync(dir, { recursive: true });
            writeImageCache(file, resized);
            pruneDiskCache(dir, { maxBytes: 256 * 1024 * 1024, maxFiles: 5_000 });
          }
        });
      });
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
      res.send(fs.readFileSync(file));
      return;
    } catch (error: any) {
      if (error?.code === 'IMAGE_BUSY') { res.setHeader('Retry-After', '2'); return res.status(503).json({ success: false, code: 'IMAGE_BUSY', error: 'Image processing busy. Retry shortly.' }); }
      if (error instanceof UnsafeUrlError || error?.code === 'UNSAFE_URL') {
        return res.status(400).json({ success: false, error: 'INVALID_IMAGE_URL' });
      }
      // Do not let a client resolve an unchecked (potentially rebound) origin.
      return res.status(502).json({ success: false, error: 'IMAGE_UNAVAILABLE' });
    }
  });

  // Same calculation as GET /api/cart/items and createOrderFromCart. A preview
  // does not reserve a price; the cart is always re-quoted by the server.
  router.post('/pricing/cart-line', (req, res) => {
    const { title, sourcePrice, sourceCurrency, quantity = 1 } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 500
      || typeof sourcePrice !== 'number' || !Number.isFinite(sourcePrice) || sourcePrice <= 0 || sourcePrice > 1_000_000
      || typeof sourceCurrency !== 'string' || !/^[A-Z]{3}$/.test(sourceCurrency)
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ success: false, error: 'Devis produit invalide.' });
    }
    try {
      const { price, promo, originalLineTotalTND } = quoteCartLine(db, { title, sourcePrice, sourceCurrency, quantity });
      return res.json({ success: true, data: {
        lineTotalTND: price.totalTND,
        originalLineTotalTND,
        promo: promo ? { percent: promo.percent, label: promo.label, discountTND: promo.discountTND } : null,
        pricingVersion: price.pricingVersion,
      } });
    } catch {
      return res.status(400).json({ success: false, error: 'Devis indisponible pour ce produit.' });
    }
  });

  router.post('/pricing/preview', (req, res) => {
    const originalPrice = Number(req.body?.originalPrice);
    const quantity = Number(req.body?.quantity ?? 1);
    const currency = String(req.body?.currency || '').trim().toUpperCase();
    const express = req.body?.express === true;
    if (originalPrice > 1_000_000 || quantity > 99) {
      return res.status(400).json({ success: false, error: 'Montant ou quantité hors limites.' });
    }
    const result = calculatePrice(db.getPricingRules(), originalPrice, currency, { quantity, express });
    if (!result) return res.status(400).json({ success: false, error: 'Données de calcul invalides.' });
    res.json({ success: true, data: result });
  });

  /** HREF validé d'une slide : type fermé + existence de la cible quand exigée. */
  // Contrat public : seules les cartes PUBLIÉES (`hero_slides`) — jamais les brouillons.
  // Même règle que l'aperçu Admin (src/services/heroSlideDrafts.ts).
  router.get('/hero-slides', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const settings = db.get<any>("SELECT * FROM hero_carousel_settings WHERE id='global'");
    const maxCards = Math.max(1, Math.min(12, Number(settings?.max_cards) || 6));
    const rows = publishedRows(db).map((row) => ({ id: String(row.id), values: liveValues(row), palette: row.palette ? String(row.palette) : null }));
    const cards = toPublicCards(db, rows, Date.now(), maxCards);
    res.json({ success: true, data: cards });
  });

  /* « Cover » d'accueil : le nouveau bloc d'entrée piloté par le CRM — médias,
     grand texte posé dessus, bouton contour transparent. Rien si désactivé. */
  router.get('/home-cover', (_req, res) => {
    const row = db.get<any>("SELECT * FROM home_cover_settings WHERE id='global'");
    const settings: CoverSettings = row ? {
      enabled: row.enabled !== 0,
      title: String(row.title || ''),
      ctaLabel: String(row.cta_label || ''),
      destination: COVER_DESTINATIONS.includes(row.destination) ? row.destination : 'publications',
      autoplayIntervalMs: Math.max(MIN_COVER_INTERVAL_MS, Math.min(MAX_COVER_INTERVAL_MS, Number(row.autoplay_interval_ms) || 5000)),
    } : DEFAULT_COVER_SETTINGS;
    const slides = db.all<any>('SELECT id,type,url,poster,alt FROM home_cover_slides ORDER BY position ASC, created_at ASC')
      .map((slide) => ({
        id: String(slide.id),
        type: (slide.type === 'video' ? 'video' : 'image') as CoverSlide['type'],
        url: String(slide.url || ''),
        poster: String(slide.poster || ''),
        alt: String(slide.alt || ''),
      }));
    res.json({ success: true, data: resolveCoverPublic(settings, slides) });
  });

  router.get('/hero-carousel-settings', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const row = db.get<any>("SELECT * FROM hero_carousel_settings WHERE id='global'");
    res.json({
      success: true,
      data: {
        enabled: !row || row.enabled !== 0,
        maxCards: Math.max(1, Math.min(12, Number(row?.max_cards) || 6)),
        autoplay: row?.autoplay === 1,
        autoplayIntervalMs: Math.max(1000, Math.min(60000, Number(row?.autoplay_interval_ms) || 5000)),
        transitionMs: Math.max(100, Math.min(2000, Number(row?.transition_ms) || 300)),
        paginationVisible: !row || row.pagination_visible !== 0,
      },
    });
  });

  // Télémétrie carrousel — mesurer ne doit jamais casser l'expérience : toujours 200.
  router.post('/hero-events', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const event = String(body.event || '');
      const cardId = String(body.cardId || '').trim().slice(0, 100);
      if ((event === 'impression' || event === 'click') && cardId) {
        const session = keyedHash(`hero:${req.ip || ''}:${req.headers['user-agent'] || ''}`).slice(0, 32);
        db.run(
          `INSERT INTO hero_events (id,card_id,event,destination_type,locale,session,created_at) VALUES (?,?,?,?,?,?,?)`,
          `hev_${randomUUID()}`,
          cardId,
          event,
          String(body.destinationType || '').trim().slice(0, 40),
          String(body.locale || '').trim().slice(0, 12),
          session,
          new Date().toISOString(),
        );
      }
    } catch (error) {
      console.warn('[hero-events]', error instanceof Error ? error.message : 'failed');
    }
    res.json({ success: true });
  });

  router.get('/navigation', (_req, res) => {
    // Barre publique sous l'en-tête : seules les entrées actives sont servies, dans l'ordre Admin.
    // Aucun chemin n'est inventé côté client — `href` vient du contrat partagé.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const rows = db.all<any>('SELECT id,destination,label_fr,label_ar,display_order FROM public_nav_items WHERE active=1 ORDER BY display_order,id');
    const data = rows.flatMap((row) => {
      const destination = publicNavDestination(row.destination);
      if (!destination) return [];
      return [{
        id: String(row.id),
        destination: destination.id,
        href: destination.href,
        labelFr: String(row.label_fr || destination.labelFr),
        labelAr: String(row.label_ar || row.label_fr || destination.labelAr),
        order: Number(row.display_order) || 0,
      }];
    });
    res.json({ success: true, data });
  });

  /** AYROVIX LENS HERO — إعدادات عامة (خلفية/محتوى) — كل المحتوى من الـ Dashboard */
  router.get('/lens-hero', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const row = db.get<any>("SELECT * FROM lens_hero_settings WHERE id='global'");
    res.json({ success: true, data: row ? {
      eyebrow: row.eyebrow, title: row.title, description: row.description,
      ctaLabel: row.cta_label, ctaUrl: row.cta_url || '', proofLine: row.proof_line || '',
      accentColor: brandAccentColor(row.accent_color), elementOrder: row.element_order || 'eyebrow,title,description,cta,proof',
      bgType: row.bg_type, bgColor: row.bg_color, bgImage: row.bg_image,
      overlayStrength: row.overlay_strength, focalX: row.focal_x, focalY: row.focal_y,
      phoneEnabled: Boolean(row.phone_enabled), enabled: Boolean(row.enabled),
      sortOrder: Number(row.sort_order ?? 40),
      sections: (() => { try { return JSON.parse(row.sections_json || '{}'); } catch { return {}; } })(),
      phone: {
        image: row.phone_image || '',
        statusLabel: row.phone_status_label || '',
        resultLabel: row.phone_result_label || '',
        productName: row.phone_product_name || '',
        priceChip: row.phone_price_chip || '',
        metaChip: row.phone_meta_chip || '',
        stockChip: row.phone_stock_chip || '',
        ctaLabel: row.phone_cta_label || '',
      },
      media: {
        type: row.media_type === 'IMAGE' ? 'IMAGE' : 'VIDEO',
        videoUrl: row.video_url || '',
        videoPath: row.video_path || '',
        poster: row.video_poster || '',
        ratio: row.video_ratio || '16/9',
        autoplay: Boolean(row.video_autoplay ?? 1),
        muted: Boolean(row.video_muted ?? 1),
        loop: Boolean(row.video_loop ?? 1),
      },
    } : null });
  });

  /** ترتيب وإظهار كتل الصفحة الرئيسية */
  router.get('/home-blocks', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const rows = db.all<any>('SELECT id,sort_order sortOrder,visible FROM home_blocks ORDER BY sort_order,id');
    res.json({ success: true, data: rows.map((row) => ({ id: row.id, sortOrder: row.sortOrder, visible: Boolean(row.visible) })) });
  });

  router.get('/brands', (_req, res) => {
    const rows = db.all<any>(`SELECT id,name,logo,image,category,url,description,display_order displayOrder
      FROM brands WHERE active=1 ORDER BY display_order,name`);
    res.json({ success: true, data: rows });
  });

  router.get('/arrivals', (_req, res) => {
    const rows = db.all<any>(`SELECT * FROM arrivals WHERE status IN ('ACTIVE','SCHEDULED')
      ORDER BY CASE type WHEN 'EXPRESS' THEN 0 ELSE 1 END,expected_arrival_at`);
    res.json({ success: true, data: rows.map(mapArrival), serverTime: new Date().toISOString() });
  });

  router.get('/products', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
    const arrivalId = typeof req.query.arrivalId === 'string' ? req.query.arrivalId : '';
    const rows = readPublicProducts(db, { scope: 'catalog', limit, arrivalId });
    res.json({ success: true, data: rows.map(mapProduct) });
  });

  /**
   * Fiche d'un produit, par identifiant (page produit, « Découvrir » d'un contenu shoppable).
   * Catalogue : produit ACTIVE. Temporaire : ACTIVE ET lié à un contenu publié et daté.
   * Le reste (brouillon, archivé, contenu non publié) répond 404, comme un id inconnu.
   */
  /**
   * La grande fiche lit **une seule** réponse : galerie, choix (taille/couleur),
   * disponibilité par choix et état du stock, calculés par `productSheet.ts`.
   * Sans ça, l'écran devrait enchaîner trois appels (produit, variantes, stock)
   * et composer lui-même une disponibilité — donc la décider.
   */
  router.get('/products/:id', (req, res) => {
    const now = new Date().toISOString();
    const row = db.get<any>(`SELECT p.*,GROUP_CONCAT(pa.arrival_id) arrival_ids FROM products p
      LEFT JOIN product_arrivals pa ON pa.product_id=p.id WHERE p.id=? AND ${availableProductSql('p')} GROUP BY p.id`,
    req.params.id, ...availableProductParams(now));
    if (!row) return res.status(404).json({ success: false, error: 'Produit introuvable.' });
    /**
     * Les médias sont lus AVANT la feuille : chaque variante (couleur) porte ses
     * propres photos (`catalogue_media.variant_id`). Sans ça, l'écran ne pouvait
     * pas montrer « la photo du gris » et « la photo du rouge » sans les deviner.
     */
    const media = listMedia(db, row.id);
    const sheet = buildProductSheet(
      row,
      listVariants(db, row.id),
      db.all<any>(`SELECT variant_id, quantity, reorder_point FROM inventory_stock_items
        WHERE product_id=? AND status='ACTIVE'`, row.id),
      media,
    );

    /**
     * ── Media du catalogue (24/10/2026) ─────────────────────────────────────
     * Avant : la fiche ne recevait que `products.image` (le miroir de la photo
     * principale) et `additional_images`. Les autres photos et **la vidéo**
     * vivaient dans `catalogue_media` et n'arrivaient jamais jusqu'à
     * l'application : on pouvait téléverser dix images et une vidéo depuis le
     * CRM, la fiche n'en montrait qu'une. Les médias passent maintenant en
     * premier (la principale d'abord, `listMedia` trie), puis les colonnes
     * historiques complètent sans doublon.
     */
    const images = [...new Set([
      ...media.filter((item) => item.media_type === 'IMAGE').map((item) => item.url),
      ...sheet.images,
    ])].slice(0, MAX_SHEET_IMAGES);
    /** Vidéos de la fiche : une liste, même vide. Le client n'invente rien. */
    const videos = media.filter((item) => item.media_type === 'VIDEO').map((item) => item.url);

    /**
     * Attributs déclarés du produit (libellé + type + valeur), dans l'ordre du
     * CRM. Seuls les attributs **actifs** sortent, et seuls ceux qui ont une
     * valeur : un attribut vide n'a rien à dire à l'écran (règle : la donnée
     * absente disparaît).
     */
    const attributes = db.all<any>(
      `SELECT a.attribute_key AS key, a.label, a.data_type AS type, a.section, a.sort_order AS sortOrder, v.value_text AS value
         FROM catalogue_attribute_values v
         JOIN catalogue_attributes a ON a.attribute_key = v.attribute_key
        WHERE v.product_id=? AND v.variant_id IS NULL AND a.status='ACTIVE'
        ORDER BY a.sort_order, a.label`,
      row.id,
    )
      .map((item) => ({
        key: String(item.key),
        label: String(item.label ?? item.key),
        type: String(item.type ?? 'TEXT'),
        section: String(item.section ?? ''),
        value: String(item.value ?? '').trim(),
      }))
      .filter((item) => item.value.length > 0);

    /**
     * Famille = **racine de l'arbre des catégories**, pas une liste en dur :
     * « جاكيتات ← ملابس نساء » donne `ملابس نساء`. C'est la donnée du CRM qui
     * décide, jamais un nom écrit dans le code (exigence du propriétaire).
     */
    const family = rootCategoryOf(db, row.category_id ? String(row.category_id) : null);

    res.json({ success: true, data: { ...mapProduct(row), family, attributes, sheet: { ...sheet, images, videos } } });
  });

  router.get('/promotions', (_req, res) => {
    const now = new Date().toISOString();
    const rows = db.all<any>(`SELECT p.*,
      (SELECT GROUP_CONCAT(arrival_id) FROM promotion_arrivals WHERE promotion_id=p.id) arrival_ids,
      (SELECT GROUP_CONCAT(product_id) FROM promotion_products WHERE promotion_id=p.id) product_ids
      FROM promotions p WHERE p.status='ACTIVE' AND p.starts_at<=? AND p.ends_at>? ORDER BY p.starts_at DESC`, now, now)
      .map((row) => ({ ...row, arrival_ids: row.arrival_ids ? row.arrival_ids.split(',') : [], product_ids: row.product_ids ? row.product_ids.split(',') : [] }));
    res.json({ success: true, data: rows, serverTime: now });
  });

  router.get('/stories', (_req, res) => {
    const now = new Date().toISOString();
    const rows = db.all<any>(`SELECT s.*,${LINKED_PRODUCT_JOIN_SELECT} FROM stories s LEFT JOIN products p ON p.id=s.product_id
      WHERE s.status='PUBLISHED' AND s.publish_at<=?
      AND (s.expires_at IS NULL OR s.expires_at>?) ORDER BY s.priority DESC,s.publish_at DESC`, now, now).map(withLinkedProduct)
      // Story shoppable dont le produit n'est plus vendable : on coupe le lien, pour que le CTA
      // existant (qui suit product_id) n'ouvre jamais une page produit morte.
      .map((story) => (story.content_mode === 'shoppable' && !story.product ? { ...story, product_id: null } : story));
    attachContentProducts(db, 'story', rows);
    res.json({ success: true, data: rows, serverTime: now });
  });

  /** Bloc « Stories » de la page d'accueil — réglages du conteneur (Admin → Stories). */
  router.get('/stories-showcase', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const row = db.get<any>("SELECT * FROM stories_showcase_settings WHERE id='global'");
    res.json({ success: true, data: row ? {
      title: row.title,
      subtitle: row.subtitle,
      titleAr: row.title_ar, subtitleAr: row.subtitle_ar, ctaLabelAr: row.cta_label_ar,
      ctaLabel: row.cta_label,
      ctaUrl: row.cta_url || '',
      cardCount: Number(row.card_count ?? 7),
      enabled: Boolean(row.enabled),
      sortOrder: Number(row.sort_order ?? 0),
    } : null });
  });

  router.get('/news', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
    const now = new Date().toISOString();
    const rows = db.all<any>(`SELECT * FROM news_items WHERE status IN ('PUBLISHED','SCHEDULED') AND published_at<=?
      ORDER BY published_at DESC LIMIT ?`, now, limit);
    res.json({ success: true, data: rows, serverTime: now });
  });

  router.get('/home', (_req, res) => {
    const now = new Date().toISOString();
    // Le Hero n'est PAS dans cette réponse : il vit sur /api/public/hero-slides (publié seulement).
    const brands = db.all<any>(`SELECT id,name,logo,image,category,url,description,display_order displayOrder
      FROM brands WHERE active=1 ORDER BY display_order,name`);
    const arrivals = db.all<any>(`SELECT * FROM arrivals WHERE status IN ('ACTIVE','SCHEDULED') ORDER BY expected_arrival_at`).map(mapArrival);
    const products = readPublicProducts(db, { scope: 'home', limit: 12 }).map(mapProduct);
    const promotions = db.all<any>(`SELECT * FROM promotions WHERE status='ACTIVE' AND starts_at<=? AND ends_at>? ORDER BY starts_at DESC LIMIT 8`, now, now);
    const stories = db.all<any>(`SELECT * FROM stories WHERE status='PUBLISHED' AND publish_at<=? AND (expires_at IS NULL OR expires_at>?) ORDER BY priority DESC,publish_at DESC LIMIT 12`, now, now);
    const news = db.all<any>(`SELECT * FROM news_items WHERE status IN ('PUBLISHED','SCHEDULED') AND published_at<=? ORDER BY published_at DESC LIMIT 8`, now);
    res.json({ success: true, data: { brands, arrivals, products, promotions, stories, news }, serverTime: now });
  });

  router.get('/assistant-context', (_req, res) => {
    const now = new Date().toISOString();
    const pricing = db.getPricingRules();
    const knowledge = db.all<any>(`SELECT id,category,question,answer,keywords,priority FROM ai_knowledge
      WHERE active=1 ORDER BY priority DESC,created_at DESC`).map((row) => ({ ...row, keywords: parseJson(row.keywords) }));
    const arrivals = db.all<any>(`SELECT id,name,type,expected_arrival_at,description,badge FROM arrivals
      WHERE status='ACTIVE' ORDER BY expected_arrival_at`).map((row) => ({ id: row.id, name: row.name, type: row.type, expectedArrivalAt: row.expected_arrival_at, description: row.description, badge: row.badge }));
    const promotions = db.all<any>(`SELECT id,name,description,discount_type,value,promo_code,ends_at FROM promotions
      WHERE status='ACTIVE' AND starts_at<=? AND ends_at>? ORDER BY ends_at`, now, now);
    const brands = db.all<any>('SELECT id,name,category FROM brands WHERE active=1 ORDER BY display_order,name');
    const settings = db.all<any>(`SELECT setting_key,setting_value,value_type FROM settings WHERE setting_key IN
      ('company_name','company_phone','company_email','delivery_delay','governorates','payment_methods')`);
    const facts: Record<string, any> = {};
    for (const row of settings) facts[row.setting_key] = row.value_type === 'JSON' ? parseJson(row.setting_value) : row.setting_value;
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ success: true, data: {
      serverTime: now,
      pricing: {
        version: pricing.version,
        rates: { EUR: pricing.rateEUR, USD: pricing.rateUSD, GBP: pricing.rateGBP, JPY: pricing.rateJPY, TND: 1 },
        // Transparence (audit 23/09/2026) : provenance et fraîcheur des taux affichés.
        ratesSource: pricing.fxSource || 'seed',
        ratesUpdatedAt: pricing.fxUpdatedAt || null,
        exchangeBufferPercent: pricing.exchangeBufferPercent,
        freightPerKgTND: pricing.freightPerKgTND,
        localDeliveryTND: pricing.localDeliveryTND,
        commissionPercent: pricing.commissionPercent,
        rpdPercent: pricing.rpdPercent,
        expressFeeTND: pricing.expressFeeTND,
      },
      promo: (() => { const day = resolvePromoForQuote(db); return day ? { percent: day.percent, label: day.label, day: tunisIsoDay() } : null; })(),
      facts, arrivals, promotions, brands, knowledge,
    } });
  });

  router.get('/social/publication-feed-settings', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: readPublicationFeedSettings(db) });
  });

  // Additive Phase 1 endpoint; personal state must never enter a shared cache.
  router.get('/social/publication-feed', optionalCustomer(db), (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const category = String(req.query.category || '');
    const q = String(req.query.q || '').trim();
    const post = String(req.query.post || '').trim();
    const limit = Number(req.query.limit || 12);
    if ((category && !PUBLICATION_CATEGORIES.includes(category as any)) || q.length > 100
        || (post && !/^[A-Za-z0-9_-]{1,120}$/.test(post)) || !Number.isInteger(limit) || limit < 1 || limit > 30) {
      return res.status(400).json({ success: false, error: 'Filtre Publication invalide.' });
    }
    const settings = readPublicationFeedSettings(db);
    if (!settings.enabled) return res.json({ success: true, data: { items: [], nextCursor: null } });
    if (category && !settings.categories.some(c => c.key === category && c.enabled)) {
      return res.status(400).json({ success: false, error: 'Catégorie masquée.' });
    }
    const filters = { type: String(req.query.type || ''), audience: String(req.query.audience || ''), topic: String(req.query.topic || '') };
    if ((filters.type && !['image','carousel','video','product','collection','editorial'].includes(filters.type))
      || !['','men','women','unisex'].includes(filters.audience) || !['','shoes','accessories','new-trends'].includes(filters.topic)) return res.status(400).json({ success: false, error: 'Filtres invalides.' });
    const where = ["pub.status='publie'", 'pub.publish_at<=?'];
    const args: any[] = [new Date().toISOString()];
    const account = (req as any).customer?.id || '';
    where.push("NOT EXISTS(SELECT 1 FROM publication_preferences pref WHERE pref.account_id=? AND pref.publication_id=pub.id AND pref.feedback!='')"); args.push(account);
    if (req.query.saved === '1') { where.push('EXISTS(SELECT 1 FROM publication_preferences pref WHERE pref.account_id=? AND pref.publication_id=pub.id AND pref.saved=1)'); args.push(account); }
    if (req.query.following === '1') { where.push('EXISTS(SELECT 1 FROM publication_follows f WHERE f.account_id=? AND f.publisher_id=pub.channel_id)'); args.push(account); }
    if (req.query.hasProducts === '1') where.push("EXISTS(SELECT 1 FROM content_products cp WHERE cp.content_kind='publication' AND cp.content_id=pub.id)");
    for (const [key, value] of Object.entries(filters)) if (value) { where.push(`pub.${key === 'type' ? 'post_type' : key}=?`); args.push(value); }

    if (category) { where.push('pub.category=?'); args.push(category); }
    if (post) { where.push('pub.id=?'); args.push(post); }
    if (q) { where.push('(instr(lower(pub.title),lower(?))>0 OR instr(lower(pub.subtitle),lower(?))>0)'); args.push(q, q); }
    if (req.query.cursor) {
      try {
        const raw = String(req.query.cursor);
        if (raw.length > 600 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('cursor');
        const cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
        if (!Array.isArray(cursor) || cursor.length !== 2) throw new Error('cursor');
        const [date, id] = cursor;
        if (typeof date !== 'string' || !Number.isFinite(Date.parse(date)) || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('cursor');
        where.push('(pub.publish_at<? OR (pub.publish_at=? AND pub.id<?))'); args.push(date, date, id);
      } catch { return res.status(400).json({ success: false, error: 'Curseur Publication invalide.' }); }
    }
    const accountId = (req as any).customer?.id || '';
    const rows = db.all<any>(`SELECT pub.id,pub.title,pub.subtitle,pub.image_url,pub.channel_id,pub.category,pub.media_origin,pub.publish_at,pub.content_mode,
      channel.name channel_name,channel.avatar channel_avatar,channel.official channel_official,
      pub.show_title,pub.template_id,pub.action_label,pub.action_target,pub.post_type,pub.media_json,pub.description,pub.description_position,pub.sponsored,pub.sponsor_name,pub.audience,pub.topic,
      EXISTS(SELECT 1 FROM publication_follows f WHERE f.publisher_id=pub.channel_id AND f.account_id=?) following,
      EXISTS(SELECT 1 FROM publication_preferences pref WHERE pref.publication_id=pub.id AND pref.account_id=? AND pref.saved=1) saved,
      (SELECT COUNT(*) FROM story_interactions i WHERE i.target_id=pub.id AND i.type='view') views,
      (SELECT COUNT(*) FROM story_interactions i WHERE i.target_id=pub.id AND i.type='share') shares,
      EXISTS(SELECT 1 FROM story_interactions i WHERE i.target_id=pub.id AND i.type='like' AND i.account_id=?) liked,
      EXISTS(SELECT 1 FROM publication_dislikes d WHERE d.target_id=pub.id AND d.account_id=?) disliked,
      EXISTS(SELECT 1 FROM social_loves l WHERE l.target_id=pub.id AND l.account_id=?) loved,
      (SELECT COUNT(*) FROM social_loves l WHERE l.target_id=pub.id) loves,
      (SELECT COUNT(*) FROM story_interactions i WHERE i.target_id=pub.id AND i.type='like') likes,
      (SELECT COUNT(*) FROM story_interactions i WHERE i.target_id=pub.id AND i.type='comment') comments,
      ${LINKED_PRODUCT_JOIN_SELECT}
      FROM publications pub LEFT JOIN products p ON p.id=pub.product_id
      LEFT JOIN story_publishers channel ON channel.id=pub.channel_id
      WHERE ${where.join(' AND ')} ORDER BY pub.publish_at DESC,pub.id DESC LIMIT ?`, accountId, accountId, accountId, accountId, accountId, ...args, limit + 1);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(withLinkedProduct);
    attachContentProducts(db, 'publication', items);
    const last = items[items.length - 1];
    res.json({ success: true, data: { items, nextCursor: hasMore && last
      ? Buffer.from(JSON.stringify([last.publish_at, last.id])).toString('base64url') : null } });
  });

  // Read the same persisted follow relation used by Publication; never guess from a local toggle.
  router.get('/social/publishers/:id/follow', optionalCustomer(db), (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const result = readPublisherFollow(db, (req as any).customer?.id || '', req.params.id);
    if (result.status === 'not_found') return res.status(404).json({ success: false, error: 'Éditeur introuvable.' });
    res.json({ success: true, data: result.data });
  });

  router.put('/social/publishers/:id/follow', preferenceTiming.observe('publisher_follow_write'), requireCustomer(db), (req, res) => {
    const result = writePublisherFollow(db, (req as any).customer.id, req.params.id, req.body, new Date().toISOString());
    if (result.status === 'not_found') return res.status(404).json({ success: false, error: 'Éditeur introuvable.' });
    if (result.status === 'invalid') return res.status(400).json({ success: false, error: 'État invalide.' });
    res.json({ success: true, data: result.data });
  });
  router.put('/social/publications/:id/preferences', preferenceTiming.observe('publication_preference_write'), requireCustomer(db), (req, res) => {
    const result = writePublicationPreference(db, (req as any).customer.id, req.params.id, req.body, new Date().toISOString());
    if (result.status === 'not_found') return res.status(404).json({ success: false, error: 'Publication introuvable.' });
    if (result.status === 'invalid') return res.status(400).json({ success: false, error: 'Préférence invalide.' });
    res.json({ success: true, data: result.data });
  });
  router.get('/social/publications', (req, res) => {
    let page: ReturnType<typeof socialPage>;
    try { page = socialPage(req.query); }
    catch { return res.status(400).json({ success: false, code: 'INVALID_PAGE', error: 'Invalid page cursor or limit.' }); }
    const result = readPublishedSocial(db, 'publication', new Date().toISOString(), page);
    const rows = result.items.map(withLinkedProduct);
    attachContentProducts(db, 'publication', rows);
    res.json({ success: true, data: page ? { items: rows, nextCursor: result.nextCursor } : rows });
  });

  router.get('/social/reels', optionalCustomer(db), (req, res) => {
    let page: ReturnType<typeof socialPage>;
    try { page = socialPage(req.query); }
    catch { return res.status(400).json({ success: false, code: 'INVALID_PAGE', error: 'Invalid page cursor or limit.' }); }
    const result = readPublishedSocial(db, 'reel', new Date().toISOString(), page);
    const rows = result.items.map(withLinkedProduct);
    attachContentProducts(db, 'reel', rows);
    // Z-Reactions : la réaction du compte connecté arrive AVEC le Reel — le rail
    // s'ouvre sur le bon état (plus de « j'aime » perdu à chaque ouverture).
    const accountId = (req as any).customer?.id || '';
    if (accountId) {
      res.setHeader('Cache-Control', 'private, no-store');
      const mine = viewerContentReactions(db, accountId, rows.map((row: any) => String(row.id)));
      for (const row of rows as any[]) row.my_reaction = mine[row.id] ?? null;
    }
    res.json({ success: true, data: page ? { items: rows, nextCursor: result.nextCursor } : rows });
  });

  // Anciens endpoints non protégés : fermeture explicite. Le client courant utilise /social/interact.
  router.post('/social/reels/:id/view', (_req, res) => res.status(410).json({ success: false, code: 'ENDPOINT_REPLACED', error: 'Utilisez /api/public/social/interact.' }));
  router.post('/social/reels/:id/like', (_req, res) => res.status(410).json({ success: false, code: 'ENDPOINT_REPLACED', error: 'Utilisez /api/public/social/interact.' }));

  router.get('/story-publishers', (_req, res) => {
    const rows = db.all<any>(`SELECT id,slug,name,subtitle,avatar,official FROM story_publishers ORDER BY official DESC, name`);
    res.json({ success: true, data: rows });
  });

  /* ===== Interactions sociales persistantes et dédupliquées ===== */
  router.get('/social/counts', optionalCustomer(db), (req, res) => {
    const out = readSocialCounts(db, req.query.ids);
    // Z-Reactions (12/11) : un compte connecté reçoit AUSSI sa propre réaction
    // (`mine`) — les stories (sans feed personnalisé) s'ouvrent sur le bon état.
    // Contrat visiteur strictement inchangé ; réponse personnelle jamais cachée.
    const accountId = (req as any).customer?.id || '';
    if (!accountId) return res.json({ success: true, data: out });
    res.setHeader('Cache-Control', 'private, no-store');
    const mine = viewerContentReactions(db, accountId, Object.keys(out));
    res.json({ success: true, data: out, mine: { ...mine } });
  });

  router.get('/social/comments', optionalCustomer(db), (req, res) => {
    const id = String(req.query.targetId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return res.status(400).json({ success: false, error: 'Cible invalide.' });
    const viewer = (req as any).customer?.id || null;
    const result = readSocialComments(db, id, new Date().toISOString(), viewer);
    if (result.status === 'not_found') return res.status(404).json({ success: false, error: 'Contenu introuvable.' });
    res.json({ success: true, data: result.data });
  });

  router.post('/social/interact', optionalCustomer(db), (req, res) => {
    const result = writeSocialInteraction(db, req.body, (req as any).customer || null,
      String(req.headers['x-session-id'] || '').trim(), new Date().toISOString());
    switch (result.outcome) {
      case 'invalid_interaction': return res.status(400).json({ success: false, code: 'INVALID_SOCIAL_INTERACTION', error: 'Interaction invalide.' });
      case 'target_not_found': return res.status(404).json({ success: false, code: 'SOCIAL_TARGET_NOT_FOUND', error: 'Contenu introuvable.' });
      case 'auth_required': return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Créez un compte ou connectez-vous pour interagir.' });
      case 'guest_session_required': return res.status(400).json({ success: false, code: 'SOCIAL_SESSION_REQUIRED', error: 'Session visiteur invalide.' });
      case 'invalid_reaction': return res.status(400).json({ success:false, error:'Réaction invalide.' });
      case 'reaction_target_invalid': return res.status(400).json({ success:false, error:'Réaction réservée aux publications.' });
      case 'comment_too_short': return res.status(400).json({ success: false, error: 'Commentaire trop court.' });
      case 'comment_parent_invalid': return res.status(400).json({success:false,error:'Commentaire parent introuvable.'});
      case 'comment_request_invalid': return res.status(400).json({success:false,error:'Identifiant de commentaire invalide.'});
      case 'comment_conflict': return res.status(409).json({success:false,error:'Ce commentaire a déjà été envoyé avec un contenu différent.'});
      case 'created': return res.status(201).json({ success: true, data: result.data });
      case 'ok': return res.json({ success: true, data: result.data });
    }
  });

  router.post('/assistant-feedback', optionalCustomer(db), (req, res) => {
    const cleanId = (value: unknown) => {
      const text = String(value || '').trim();
      return /^[a-zA-Z0-9:_-]{1,120}$/.test(text) ? text : '';
    };
    const conversationId = cleanId(req.body?.conversationId);
    const messageId = cleanId(req.body?.messageId);
    const rating = req.body?.rating === 'up' || req.body?.rating === 'down' ? req.body.rating : '';
    const comment = String(req.body?.comment || '').trim().slice(0, 1500);
    const responseExcerpt = String(req.body?.responseExcerpt || '').trim().slice(0, 2000);
    if (!conversationId || !messageId || !rating) {
      return res.status(400).json({ success: false, code: 'INVALID_ASSISTANT_FEEDBACK', error: 'Avis assistant invalide.' });
    }

    const customer = (req as any).customer ? customerFromRequest(req) : null;
    const guestSession = String(req.headers['x-session-id'] || '').trim();
    if (!customer && (guestSession.length < 8 || guestSession.length > 240)) {
      return res.status(400).json({ success: false, code: 'ASSISTANT_SESSION_REQUIRED', error: 'Session visiteur invalide.' });
    }
    const guestSessionHash = customer ? '' : createHash('sha256').update(guestSession).digest('hex');
    const owner = customer ? `account:${customer.id}` : `guest:${guestSessionHash}`;
    const id = `assistant_feedback_${createHash('sha256').update(`${owner}\u0000${conversationId}\u0000${messageId}`).digest('hex').slice(0, 32)}`;
    const now = new Date().toISOString();
    db.run(`INSERT INTO assistant_feedback
      (id,account_id,guest_session_hash,conversation_id,message_id,rating,comment,response_excerpt,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,
        response_excerpt=excluded.response_excerpt,updated_at=excluded.updated_at`,
    id, customer?.id || null, guestSessionHash, conversationId, messageId, rating, comment, responseExcerpt, now, now);
    recordLearningEvent(db, {
    executionLane: 'active',
    type: rating === 'up' ? 'FEEDBACK_UP' : 'FEEDBACK_DOWN',
    conversationId, ownerHash: ownerHashOf(customer?.id || null, String(req.headers['x-session-id'] || '')),
    success: rating === 'up', meta: { hasComment: Boolean(comment) },
  });
  res.status(201).json({ success: true, data: { rating, hasComment: Boolean(comment), updatedAt: now } });
  });

  return router;
}
