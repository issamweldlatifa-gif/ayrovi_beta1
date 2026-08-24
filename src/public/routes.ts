import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { cardGatewayAvailable } from '../services/paymentGateway';
import { QatafoDatabase } from '../db/database';
import { calculatePrice } from '../services/pricing';
import { customerFromRequest, optionalCustomer } from '../customer/auth';
import { ownerHashOf, recordLearningEvent } from '../assistant/learning';
import { resolveActiveHeroVisual } from '../services/heroVisual';

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
      ('delivery_delay','governorates','payment_methods','deposit_percent','deposit_review_delay','unavailable_refund_policy','company_legal_name','company_name','bank_rib','poste_account','flouci_number','card_discount_percent','facebook_url','instagram_url','tiktok_url','whatsapp_url','site_theme','interface_config','footer_about')`);
    const facts: Record<string, any> = {};
    for (const row of settings) facts[row.setting_key] = row.value_type === 'JSON' ? parseJson(row.setting_value) : row.setting_value;
    return {
      pricing: {
        version: pricing.version,
        rates: { EUR: pricing.rateEUR, USD: pricing.rateUSD, GBP: pricing.rateGBP, JPY: pricing.rateJPY, TND: 1 },
        exchangeBufferPercent: pricing.exchangeBufferPercent,
        freightPerKgTND: pricing.freightPerKgTND,
        localDeliveryTND: pricing.localDeliveryTND,
        commissionPercent: pricing.commissionPercent,
        rpdPercent: pricing.rpdPercent,
        rpdMinimumTND: pricing.rpdMinimumTND,
        expressFeeTND: pricing.expressFeeTND,
        categories: pricing.categories.map((item) => ({ id: item.id, label: item.label, status: item.status })),
      },
      governorates: Array.isArray(facts.governorates) ? facts.governorates : [],
      paymentMethods: Array.isArray(facts.payment_methods) ? facts.payment_methods : [],
      deliveryDelay: String(facts.delivery_delay || ''),
      capabilities: { cardGateway: cardGatewayAvailable() },
      // تعليمات دفع العربون المعروضة في نموذج الطلب (قابلة للتحرير من لوحة الأدمن)
      deposit: {
        percent: Number(facts.deposit_percent) > 0 ? Number(facts.deposit_percent) : 20,
        cardDiscountPercent: Number(facts.card_discount_percent) >= 0 ? Number(facts.card_discount_percent) : 5,
        companyName: String(facts.company_legal_name || facts.company_name || 'AYSONIC'),
        bankRib: String(facts.bank_rib || ''),
        posteAccount: String(facts.poste_account || ''),
        flouciNumber: String(facts.flouci_number || ''),
        reviewDelay: String(facts.deposit_review_delay || 'Sous 1 jour ouvré après réception du justificatif'),
        unavailableRefundPolicy: String(facts.unavailable_refund_policy || 'Acompte remboursé si AYSONIC ne peut pas valider ou acheter l’article demandé'),
      },
      // قنوات التواصل الاجتماعي (تُدار من لوحة الأدمن ← Paramètres ← CHANNELS)
      channels: {
        facebook: String(facts.facebook_url || ''),
        instagram: String(facts.instagram_url || ''),
        tiktok: String(facts.tiktok_url || ''),
        whatsapp: String(facts.whatsapp_url || ''),
      },
      // الثيم البصري العام + استوديو «واجهتي».
      theme: facts.site_theme && typeof facts.site_theme === 'object' ? facts.site_theme : null,
      interfaceConfig: facts.interface_config && typeof facts.interface_config === 'object' ? facts.interface_config : null,
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

  router.get('/announcement-messages', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    const rows = db.all<any>(`SELECT id,text FROM announcement_messages WHERE active=1 ORDER BY display_order,id`);
    res.json({ success: true, data: rows });
  });

  /** Visual الـ Hero النشط — المجدول الصالح حالياً، وإلا آخر منشور، وإلا الافتراضي */
  router.get('/hero/active', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json({ success: true, data: resolveActiveHeroVisual(db) });
  });

  /** AYROVI Trust Bar — العناصر المفعّلة + الإعدادات العامة */
  router.get('/trust-bar', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    const settings = db.get<any>(`SELECT * FROM trust_bar_settings WHERE id='global'`);
    const items = db.all<any>(`SELECT title,description,icon,title_color titleColor,description_color descriptionColor,icon_color iconColor
      FROM trust_bar_items WHERE enabled=1 ORDER BY sort_order,id`);
    res.json({ success: true, data: {
      enabled: Boolean(settings?.enabled ?? 1),
      settings: settings ? {
        backgroundColor: settings.background_color, titleColor: settings.title_color,
        descriptionColor: settings.description_color, accentColor: settings.accent_color,
        dividerColor: settings.divider_color,
      } : null,
      items,
    } });
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
    const rows = db.all<any>(`SELECT * FROM news_items WHERE status IN ('PUBLISHED','SCHEDULED') AND published_at<=?
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
    const promotions = db.all<any>(`SELECT * FROM promotions WHERE status='ACTIVE' AND starts_at<=? AND ends_at>? ORDER BY starts_at DESC LIMIT 8`, now, now);
    const stories = db.all<any>(`SELECT * FROM stories WHERE status='PUBLISHED' AND publish_at<=? AND (expires_at IS NULL OR expires_at>?) ORDER BY priority DESC,publish_at DESC LIMIT 12`, now, now);
    const news = db.all<any>(`SELECT * FROM news_items WHERE status IN ('PUBLISHED','SCHEDULED') AND published_at<=? ORDER BY published_at DESC LIMIT 8`, now);
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
        exchangeBufferPercent: pricing.exchangeBufferPercent,
        freightPerKgTND: pricing.freightPerKgTND,
        localDeliveryTND: pricing.localDeliveryTND,
        commissionPercent: pricing.commissionPercent,
        rpdPercent: pricing.rpdPercent,
        expressFeeTND: pricing.expressFeeTND,
      },
      facts, arrivals, promotions, brands, knowledge,
    } });
  });

  router.get('/social/publications', (_req, res) => {
    const now = new Date().toISOString();
    // Liste blanche stricte : les notes éditoriales et champs Admin ne quittent jamais l'API publique.
    const rows = db.all<any>(`SELECT id,title,subtitle,channel_id,image_url,publish_at
      FROM publications WHERE status='publie' AND publish_at<=? ORDER BY publish_at DESC`, now);
    res.json({ success: true, data: rows });
  });

  router.get('/social/reels', (_req, res) => {
    const now = new Date().toISOString();
    const rows = db.all<any>(`SELECT r.id,r.title,r.channel_id,r.description,r.video_url,r.duration_seconds,r.publish_at,
      (SELECT COUNT(*) FROM story_interactions i WHERE i.target_id=r.id AND i.type='view') views,
      (SELECT COUNT(*) FROM story_interactions i WHERE i.target_id=r.id AND i.type='like') likes
      FROM reels r WHERE r.status='publie' AND r.publish_at<=? ORDER BY r.publish_at DESC`, now);
    res.json({ success: true, data: rows });
  });

  // Anciens endpoints non protégés : fermeture explicite. Le client courant utilise /social/interact.
  router.post('/social/reels/:id/view', (_req, res) => res.status(410).json({ success: false, code: 'ENDPOINT_REPLACED', error: 'Utilisez /api/public/social/interact.' }));
  router.post('/social/reels/:id/like', (_req, res) => res.status(410).json({ success: false, code: 'ENDPOINT_REPLACED', error: 'Utilisez /api/public/social/interact.' }));

  router.get('/story-publishers', (_req, res) => {
    const rows = db.all<any>(`SELECT id,slug,name,subtitle,avatar,official FROM story_publishers ORDER BY official DESC, name`);
    res.json({ success: true, data: rows });
  });

  type SocialTarget = { kind: 'story' | 'post'; source: 'story' | 'publication' | 'reel' };
  const publishedTarget = (targetId: string): SocialTarget | null => {
    const now = new Date().toISOString();
    if (db.get(`SELECT 1 FROM stories WHERE id=? AND status='PUBLISHED' AND publish_at<=?
      AND (expires_at IS NULL OR expires_at>?)`, targetId, now, now)) return { kind: 'story', source: 'story' };
    if (db.get(`SELECT 1 FROM publications WHERE id=? AND status='publie' AND publish_at<=?`, targetId, now)) {
      return { kind: 'post', source: 'publication' };
    }
    if (db.get(`SELECT 1 FROM reels WHERE id=? AND status='publie' AND publish_at<=?`, targetId, now)) {
      return { kind: 'post', source: 'reel' };
    }
    return null;
  };
  const interactionCounts = (targetId: string) => {
    const result = { likes: 0, comments: 0, views: 0, shares: 0 };
    const rows = db.all<any>(`SELECT type,COUNT(*) n FROM story_interactions WHERE target_id=? GROUP BY type`, targetId);
    for (const row of rows) {
      if (row.type === 'like') result.likes = Number(row.n);
      if (row.type === 'comment') result.comments = Number(row.n);
      if (row.type === 'view') result.views = Number(row.n);
      if (row.type === 'share') result.shares = Number(row.n);
    }
    return result;
  };
  const syncReelCounters = (targetId: string, target: SocialTarget, now: string) => {
    if (target.source !== 'reel') return;
    const counts = interactionCounts(targetId);
    db.run('UPDATE reels SET views=?,likes=?,updated_at=? WHERE id=?', counts.views, counts.likes, now, targetId);
  };

  /* ===== Interactions sociales persistantes et dédupliquées ===== */
  router.get('/social/counts', (req, res) => {
    const ids = [...new Set(String(req.query.ids || '').split(',')
      .map((value) => value.trim()).filter((value) => /^[A-Za-z0-9_-]{1,120}$/.test(value)).slice(0, 60))];
    const out: Record<string, { likes: number; comments: number; views: number; shares: number }> = {};
    for (const id of ids) out[id] = { likes: 0, comments: 0, views: 0, shares: 0 };
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = db.all<any>(`SELECT target_id,type,COUNT(*) n FROM story_interactions
        WHERE target_id IN (${placeholders}) GROUP BY target_id,type`, ...ids);
      for (const row of rows) {
        const counts = out[row.target_id];
        if (!counts) continue;
        if (row.type === 'like') counts.likes = Number(row.n);
        if (row.type === 'comment') counts.comments = Number(row.n);
        if (row.type === 'view') counts.views = Number(row.n);
        if (row.type === 'share') counts.shares = Number(row.n);
      }
    }
    res.json({ success: true, data: out });
  });

  router.get('/social/comments', (req, res) => {
    const id = String(req.query.targetId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return res.status(400).json({ success: false, error: 'Cible invalide.' });
    if (!publishedTarget(id)) return res.status(404).json({ success: false, error: 'Contenu introuvable.' });
    const rows = db.all<any>(`SELECT i.id,i.text,i.created_at,c.display_name author
      FROM story_interactions i LEFT JOIN customer_accounts c ON c.id=i.account_id
      WHERE i.target_id=? AND i.type='comment' ORDER BY i.created_at DESC LIMIT 100`, id).reverse();
    res.json({ success: true, data: rows.map((row) => ({ id: row.id, author: row.author || 'Membre AYROVI', text: row.text, createdAt: row.created_at })) });
  });

  router.post('/social/interact', optionalCustomer(db), (req, res) => {
    const type = String(req.body?.type || '');
    const targetId = String(req.body?.targetId || '').trim();
    if (!['like', 'comment', 'view', 'share'].includes(type) || !/^[A-Za-z0-9_-]{1,120}$/.test(targetId)) {
      return res.status(400).json({ success: false, code: 'INVALID_SOCIAL_INTERACTION', error: 'Interaction invalide.' });
    }
    const target = publishedTarget(targetId);
    if (!target) return res.status(404).json({ success: false, code: 'SOCIAL_TARGET_NOT_FOUND', error: 'Contenu introuvable.' });

    const customer = (req as any).customer || null;
    if ((type === 'like' || type === 'comment') && !customer) {
      return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Créez un compte ou connectez-vous pour interagir.' });
    }
    const guestSession = String(req.headers['x-session-id'] || '').trim();
    if (!customer && !/^[A-Za-z0-9._:-]{8,160}$/.test(guestSession)) {
      return res.status(400).json({ success: false, code: 'SOCIAL_SESSION_REQUIRED', error: 'Session visiteur invalide.' });
    }
    const owner = customer
      ? `account:${customer.id}`
      : `guest:${createHash('sha256').update(guestSession).digest('hex').slice(0, 32)}`;
    const accountId = customer?.id || null;
    const guestHash = accountId ? null : owner;
    const now = new Date().toISOString();

    if (type === 'like') {
      const liked = db.transaction(() => {
        const existing = db.get<any>(`SELECT id FROM story_interactions WHERE target_id=? AND type='like' AND account_id=?`, targetId, accountId);
        if (existing) db.run('DELETE FROM story_interactions WHERE id=?', existing.id);
        else db.run(`INSERT INTO story_interactions (id,target_id,target_kind,type,account_id,guest_hash,text,created_at)
          VALUES (?,?,?,?,?,NULL,NULL,?)`,
        `int_${createHash('sha256').update(`${owner}:${targetId}:like`).digest('hex').slice(0, 32)}`, targetId, target.kind, 'like', accountId, now);
        syncReelCounters(targetId, target, now);
        return !existing;
      });
      const counts = interactionCounts(targetId);
      return res.json({ success: true, data: { liked, likesCount: counts.likes, counts } });
    }

    if (type === 'comment') {
      const text = String(req.body?.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (text.length < 2) return res.status(400).json({ success: false, error: 'Commentaire trop court.' });
      const id = `int_${randomUUID()}`;
      db.run(`INSERT INTO story_interactions (id,target_id,target_kind,type,account_id,guest_hash,text,created_at)
        VALUES (?,?,?,?,?,NULL,?,?)`, id, targetId, target.kind, 'comment', accountId, text, now);
      return res.status(201).json({ success: true, data: { id, author: customer.displayName || 'Membre AYROVI', text, createdAt: now } });
    }

    // Les vues et partages sont comptés par propriétaire unique afin d'éviter le gonflement artificiel.
    const ownerColumn = accountId ? 'account_id' : 'guest_hash';
    const ownerValue = accountId || guestHash;
    const inserted = db.transaction(() => {
      const existing = db.get<any>(`SELECT id FROM story_interactions WHERE target_id=? AND type=? AND ${ownerColumn}=?`, targetId, type, ownerValue);
      if (existing) return false;
      db.run(`INSERT INTO story_interactions (id,target_id,target_kind,type,account_id,guest_hash,text,created_at)
        VALUES (?,?,?,?,?,?,NULL,?)`, `int_${randomUUID()}`, targetId, target.kind, type, accountId, guestHash, now);
      syncReelCounters(targetId, target, now);
      return true;
    });
    return res.json({ success: true, data: { recorded: inserted, counts: interactionCounts(targetId) } });
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
    type: rating === 'up' ? 'FEEDBACK_UP' : 'FEEDBACK_DOWN',
    conversationId, ownerHash: ownerHashOf(customer?.id || null, String(req.headers['x-session-id'] || '')),
    success: rating === 'up', meta: { hasComment: Boolean(comment) },
  });
  res.status(201).json({ success: true, data: { rating, hasComment: Boolean(comment), updatedAt: now } });
  });

  return router;
}
