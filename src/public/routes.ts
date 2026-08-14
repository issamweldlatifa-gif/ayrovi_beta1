import { createHash } from 'node:crypto';
import { Router } from 'express';
import { QatafoDatabase } from '../db/database';
import { calculatePrice } from '../services/pricing';
import { customerFromRequest, optionalCustomer } from '../customer/auth';

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

function mapProduct(row: any) {
  return {
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
    currency: row.currency,
    convertedPrice: Number(row.converted_price),
    customsFee: Number(row.customs_fee),
    shippingFee: Number(row.shipping_fee),
    serviceFee: Number(row.service_fee),
    finalPrice: Number(row.final_price),
    expressAvailable: Boolean(row.express_available),
    stockStatus: row.stock_status,
    arrivalIds: row.arrival_ids ? String(row.arrival_ids).split(',').filter(Boolean) : [],
  };
}

export function createPublicRouter(db: QatafoDatabase): Router {
  const router = Router();

  const commerceConfig = () => {
    const pricing = db.getPricingRules();
    const settings = db.all<any>(`SELECT setting_key,setting_value,value_type FROM settings WHERE setting_key IN
      ('delivery_delay','governorates','payment_methods','deposit_percent','company_legal_name','company_name','bank_rib','poste_account','flouci_number','card_discount_percent','facebook_url','instagram_url','tiktok_url','whatsapp_url','site_theme','footer_about')`);
    const facts: Record<string, any> = {};
    for (const row of settings) facts[row.setting_key] = row.value_type === 'JSON' ? parseJson(row.setting_value) : row.setting_value;
    return {
      pricing: {
        version: pricing.version,
        rates: { EUR: pricing.rateEUR, USD: pricing.rateUSD, GBP: pricing.rateGBP, JPY: pricing.rateJPY, TND: 1 },
        customsFeePercent: pricing.customsFeePercent,
        shippingFeeTND: pricing.shippingFeeTND,
        serviceFeePercent: pricing.serviceFeePercent,
        minimumServiceFeeTND: pricing.minimumServiceFeeTND,
        expressFeeTND: pricing.expressFeeTND,
      },
      governorates: Array.isArray(facts.governorates) ? facts.governorates : [],
      paymentMethods: Array.isArray(facts.payment_methods) ? facts.payment_methods : [],
      deliveryDelay: String(facts.delivery_delay || ''),
      // تعليمات دفع العربون المعروضة في نموذج الطلب (قابلة للتحرير من لوحة الأدمن)
      deposit: {
        percent: Number(facts.deposit_percent) > 0 ? Number(facts.deposit_percent) : 20,
        cardDiscountPercent: Number(facts.card_discount_percent) >= 0 ? Number(facts.card_discount_percent) : 5,
        companyName: String(facts.company_legal_name || facts.company_name || 'AYROVI'),
        bankRib: String(facts.bank_rib || ''),
        posteAccount: String(facts.poste_account || ''),
        flouciNumber: String(facts.flouci_number || ''),
      },
      // قنوات التواصل الاجتماعي (تُدار من لوحة الأدمن ← Paramètres ← CHANNELS)
      channels: {
        facebook: String(facts.facebook_url || ''),
        instagram: String(facts.instagram_url || ''),
        tiktok: String(facts.tiktok_url || ''),
        whatsapp: String(facts.whatsapp_url || ''),
      },
      // الثيم البصري (لوحة التطوير في الإدارة)
      theme: facts.site_theme && typeof facts.site_theme === 'object' ? facts.site_theme : null,
      footerAbout: String(facts.footer_about || ''),
    };
  };

  router.get('/commerce-config', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ success: true, data: commerceConfig(), serverTime: new Date().toISOString() });
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

  router.get('/hero-slides', (_req, res) => {
    const rows = db.all<any>(`SELECT id,image,video,title,subtitle,cta,target_url targetUrl,display_order displayOrder
      FROM hero_slides WHERE active=1 ORDER BY display_order,id`);
    res.json({ success: true, data: rows });
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
    const params: any[] = [];
    const filter = arrivalId ? 'AND EXISTS (SELECT 1 FROM product_arrivals f WHERE f.product_id=p.id AND f.arrival_id=?)' : '';
    if (arrivalId) params.push(arrivalId);
    const rows = db.all<any>(`SELECT p.*,GROUP_CONCAT(pa.arrival_id) arrival_ids FROM products p
      LEFT JOIN product_arrivals pa ON pa.product_id=p.id WHERE p.status='ACTIVE' ${filter}
      GROUP BY p.id ORDER BY p.updated_at DESC LIMIT ?`, ...params, limit);
    res.json({ success: true, data: rows.map(mapProduct) });
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
    const rows = db.all<any>(`SELECT * FROM stories WHERE status='PUBLISHED' AND publish_at<=?
      AND (expires_at IS NULL OR expires_at>?) ORDER BY priority DESC,publish_at DESC`, now, now);
    res.json({ success: true, data: rows, serverTime: now });
  });

  router.get('/news', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
    const now = new Date().toISOString();
    const rows = db.all<any>(`SELECT * FROM news_items WHERE status='PUBLISHED' AND published_at<=?
      ORDER BY published_at DESC LIMIT ?`, now, limit);
    res.json({ success: true, data: rows, serverTime: now });
  });

  router.get('/home', (_req, res) => {
    const now = new Date().toISOString();
    const hero = db.all<any>(`SELECT id,image,video,title,subtitle,cta,target_url targetUrl,display_order displayOrder
      FROM hero_slides WHERE active=1 ORDER BY display_order,id`);
    const brands = db.all<any>(`SELECT id,name,logo,image,category,url,description,display_order displayOrder
      FROM brands WHERE active=1 ORDER BY display_order,name`);
    const arrivals = db.all<any>(`SELECT * FROM arrivals WHERE status IN ('ACTIVE','SCHEDULED') ORDER BY expected_arrival_at`).map(mapArrival);
    const products = db.all<any>(`SELECT p.*,GROUP_CONCAT(pa.arrival_id) arrival_ids FROM products p LEFT JOIN product_arrivals pa ON pa.product_id=p.id
      WHERE p.status='ACTIVE' GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 12`).map(mapProduct);
    const promotions = db.all<any>(`SELECT p.*,
      (SELECT GROUP_CONCAT(arrival_id) FROM promotion_arrivals WHERE promotion_id=p.id) arrival_ids,
      (SELECT GROUP_CONCAT(product_id) FROM promotion_products WHERE promotion_id=p.id) product_ids
      FROM promotions p WHERE p.status='ACTIVE' AND p.starts_at<=? AND p.ends_at>? ORDER BY p.starts_at DESC LIMIT 8`, now, now)
      .map((row) => ({ ...row, arrival_ids: row.arrival_ids ? row.arrival_ids.split(',') : [], product_ids: row.product_ids ? row.product_ids.split(',') : [] }));
    const stories = db.all<any>(`SELECT * FROM stories WHERE status='PUBLISHED' AND publish_at<=? AND (expires_at IS NULL OR expires_at>?) ORDER BY priority DESC,publish_at DESC LIMIT 12`, now, now);
    const news = db.all<any>(`SELECT * FROM news_items WHERE status='PUBLISHED' AND published_at<=? ORDER BY published_at DESC LIMIT 8`, now);
    res.json({ success: true, data: { hero, brands, arrivals, products, promotions, stories, news }, serverTime: now });
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
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ success: true, data: {
      serverTime: now,
      pricing: {
        version: pricing.version,
        rates: { EUR: pricing.rateEUR, USD: pricing.rateUSD, GBP: pricing.rateGBP, JPY: pricing.rateJPY, TND: 1 },
        customsFeePercent: pricing.customsFeePercent,
        shippingFeeTND: pricing.shippingFeeTND,
        serviceFeePercent: pricing.serviceFeePercent,
        minimumServiceFeeTND: pricing.minimumServiceFeeTND,
        expressFeeTND: pricing.expressFeeTND,
      },
      facts, arrivals, promotions, brands, knowledge,
    } });
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
    res.status(201).json({ success: true, data: { rating, hasComment: Boolean(comment), updatedAt: now } });
  });

  return router;
}
