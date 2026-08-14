import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { QatafoDatabase } from '../db/database';
import { calculatePrice } from '../services/pricing';
import { generateInvoicePdf, invoiceEmailHtml, uploadsDir } from '../services/invoice';
import { sendMail } from '../services/mailer';
import {
  cleanupExpiredSessions,
  clearAdminCookie,
  createAdminSession,
  destroySession,
  ensureBootstrapAdmin,
  hashPassword,
  requireAdmin,
  resolveAdmin,
  rotateCsrfToken,
  setAdminCookie,
  verifyPassword,
} from './auth';
import { AdminPermission, AdminRole, permissionsForRole } from './permissions';
import { getAyrovixStats } from '../ayrovix/events';
import { ayrovixAiReady, getActiveProviders } from '../ayrovix/services/ai';
import { checkAnthropicSearchHealth } from '../ayrovix/services/search';
import { checkSerpApiVisualHealth } from '../ayrovix/services/visualSearch';
import { sanitizeProductUrl } from '../ayrovix/services/product';
import {
  AyrovixReviewStatus,
  getAyrovixReviewForAdmin,
  listAyrovixReviews,
  updateAyrovixReview,
} from '../ayrovix/reviews';

interface ResourceConfig {
  table: string;
  module: string;
  prefix: string;
  permission: AdminPermission;
  fields: string[];
  required: string[];
  searchable: string[];
  sortable: string[];
  defaultSort: string;
  jsonFields?: string[];
  enums?: Record<string, string[]>;
  softDelete: Record<string, any>;
}

const resources: Record<string, ResourceConfig> = {
  arrivals: {
    table: 'arrivals', module: 'ARRIVALS', prefix: 'arrival', permission: 'content:write',
    fields: ['name','type','departure_at','expected_arrival_at','ends_at','description','main_image','secondary_images','badge','status','published_at'],
    required: ['name','type','expected_arrival_at','status'], searchable: ['name','description','badge'],
    sortable: ['name','type','expected_arrival_at','status','created_at','updated_at'], defaultSort: 'expected_arrival_at',
    jsonFields: ['secondary_images'], enums: { type: ['STANDARD','EXPRESS'], status: ['DRAFT','SCHEDULED','ACTIVE','COMPLETED','ARCHIVED'] },
    softDelete: { status: 'ARCHIVED' },
  },
  products: {
    table: 'products', module: 'PRODUCTS', prefix: 'product', permission: 'content:write',
    fields: ['name','description','image','additional_images','brand_id','brand_name','category','source_url','source_platform','original_price','currency','express_available','stock_status','status'],
    required: ['name','source_platform','original_price','currency','status'], searchable: ['name','description','brand_name','category','source_platform'],
    sortable: ['name','source_platform','original_price','final_price','stock_status','status','created_at','updated_at'], defaultSort: 'updated_at',
    jsonFields: ['additional_images'],
    enums: { source_platform: ['SHEIN','AMAZON','TEMU','ALIEXPRESS','OTHER'], currency: ['TND','EUR','USD','GBP','JPY'], stock_status: ['AVAILABLE','LIMITED','OUT_OF_STOCK'], status: ['DRAFT','ACTIVE','INACTIVE','ARCHIVED'] },
    softDelete: { status: 'ARCHIVED' },
  },
  promotions: {
    table: 'promotions', module: 'PROMOTIONS', prefix: 'promotion', permission: 'content:write',
    fields: ['name','description','image','discount_type','value','starts_at','ends_at','promo_code','usage_limit','status'],
    required: ['name','discount_type','value','starts_at','ends_at','status'], searchable: ['name','description','promo_code'],
    sortable: ['name','value','starts_at','ends_at','usage_count','status','created_at'], defaultSort: 'starts_at',
    enums: { discount_type: ['PERCENTAGE','FIXED'], status: ['DRAFT','SCHEDULED','ACTIVE','EXPIRED','ARCHIVED'] },
    softDelete: { status: 'ARCHIVED' },
  },
  stories: {
    table: 'stories', module: 'STORIES', prefix: 'story', permission: 'content:write',
    fields: ['media_type','media_url','title','description','cta','target_url','product_id','arrival_id','promotion_id','publish_at','expires_at','priority','status'],
    required: ['media_type','media_url','title','publish_at','status'], searchable: ['title','description','cta'],
    sortable: ['title','media_type','publish_at','expires_at','priority','status','created_at'], defaultSort: 'priority',
    enums: { media_type: ['IMAGE','VIDEO'], status: ['DRAFT','SCHEDULED','PUBLISHED','EXPIRED'] },
    softDelete: { status: 'EXPIRED' },
  },
  news: {
    table: 'news_items', module: 'NEWS', prefix: 'news', permission: 'content:write',
    fields: ['title','summary','content','image','category','arrival_id','product_id','author','published_at','status'],
    required: ['title','category','published_at','status'], searchable: ['title','summary','content','author'],
    sortable: ['title','category','published_at','status','created_at'], defaultSort: 'published_at',
    enums: { category: ['NEW_ARRIVAL','NEW_BRAND','PROMOTION','DELIVERY','AYROVI','INFORMATION','OTHER'], status: ['DRAFT','SCHEDULED','PUBLISHED','ARCHIVED'] },
    softDelete: { status: 'ARCHIVED' },
  },
  brands: {
    table: 'brands', module: 'BRANDS', prefix: 'brand', permission: 'content:write',
    fields: ['name','logo','image','category','url','description','display_order','active'], required: ['name','category'],
    searchable: ['name','description','category'], sortable: ['name','category','display_order','active','created_at'], defaultSort: 'display_order',
    enums: { category: ['FASHION','SPORT_LIFESTYLE','BEAUTY','TECH','HOME','OTHER'] }, softDelete: { active: 0 },
  },
  'hero-slides': {
    table: 'hero_slides', module: 'HERO', prefix: 'hero', permission: 'content:write',
    fields: ['image','video','title','subtitle','cta','target_url','display_order','active'], required: ['image','title'],
    searchable: ['title','subtitle','cta'], sortable: ['title','display_order','active','created_at'], defaultSort: 'display_order', softDelete: { active: 0 },
  },
  'ai-knowledge': {
    table: 'ai_knowledge', module: 'AI_KNOWLEDGE', prefix: 'knowledge', permission: 'settings:write',
    fields: ['category','question','answer','keywords','priority','active'], required: ['category','answer'],
    searchable: ['question','answer','category'], sortable: ['category','priority','active','created_at'], defaultSort: 'priority',
    jsonFields: ['keywords'], enums: { category: ['FAQ','PREDEFINED_RESPONSE','DELIVERY','PAYMENT','BRAND','ARRIVAL','PROMOTION','GENERAL'] }, softDelete: { active: 0 },
  },
};

const orderStatuses = ['NEW','CONFIRMED','PAYMENT_PENDING','PAID','PURCHASING','PURCHASED','IN_TRANSIT','ARRIVED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
const paymentStatuses = ['PENDING','PAID','FAILED','REFUNDED','CANCELLED'];
const deliveryStatuses = ['PENDING','PREPARING','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED'];
const adminRoles: AdminRole[] = ['SUPER_ADMIN','ADMIN','CONTENT_MANAGER','ORDER_MANAGER'];
const ayrovixReviewStatuses: AyrovixReviewStatus[] = ['PENDING','IN_REVIEW','QUOTED','REJECTED','CANCELLED'];
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function parsePositiveInteger(value: unknown, fallback: number, max: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function serializeJsonFields(row: Record<string, any>, fields: string[] = []) {
  const result = { ...row };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field]); } catch { result[field] = []; }
    }
  }
  return result;
}

function normalizeTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Date invalide pour ${field}.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) throw new Error(`Date invalide pour ${field}. Utilisez une date et une heure ISO 8601.`);

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', , timezone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const timezoneValid = !timezone || timezone === 'Z' || (() => {
    const [offsetHour, offsetMinute] = timezone.slice(1).split(':').map(Number);
    return offsetHour <= 23 && offsetMinute <= 59;
  })();

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
      || hour > 23 || minute > 59 || second > 59 || !timezoneValid) {
    throw new Error(`Date invalide pour ${field}.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Date invalide pour ${field}.`);
  return date.toISOString();
}

function sanitizePayload(body: any, config: ResourceConfig, partial = false): Record<string, any> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Le contenu envoyé est invalide.');
  const payload: Record<string, any> = {};
  for (const field of config.fields) {
    if (body[field] === undefined) continue;
    let value = body[field];
    if (config.jsonFields?.includes(field)) {
      if (!Array.isArray(value)) throw new Error(`${field} doit être une liste.`);
      value = JSON.stringify(value.slice(0, 50).map((item: any) => String(item).slice(0, 1000)));
    }
    if (typeof value === 'string') value = value.trim().slice(0, field === 'content' ? 20000 : 4000);
    if (['active','express_available'].includes(field)) value = value ? 1 : 0;
    if (['display_order','priority','usage_limit'].includes(field) && value !== null && value !== '') {
      value = Math.max(0, Math.round(Number(value)));
      if (!Number.isFinite(value)) throw new Error(`${field} doit être un nombre.`);
    }
    if (['original_price','value'].includes(field)) {
      value = Number(value);
      if (!Number.isFinite(value) || value < 0) throw new Error(`${field} doit être un nombre positif.`);
    }
    if (config.enums?.[field] && !config.enums[field].includes(String(value))) {
      throw new Error(`Valeur invalide pour ${field}.`);
    }
    if (field.endsWith('_at') && value) value = normalizeTimestamp(value, field);
    payload[field] = value === '' && field.endsWith('_id') ? null : value;
  }
  if (!partial) {
    for (const field of config.required) {
      if (payload[field] === undefined || payload[field] === null || payload[field] === '') throw new Error(`Le champ ${field} est obligatoire.`);
    }
  }
  if ('starts_at' in payload && 'ends_at' in payload && new Date(payload.starts_at) >= new Date(payload.ends_at)) {
    throw new Error('La date de fin doit être postérieure à la date de début.');
  }
  return payload;
}

function validateResourceDates(resource: string, payload: Record<string, any>, existing?: Record<string, any>) {
  const value = (field: string) => payload[field] ?? existing?.[field] ?? null;
  const ensureBefore = (startField: string, endField: string, message: string) => {
    const start = value(startField);
    const end = value(endField);
    if (start && end && new Date(start).getTime() >= new Date(end).getTime()) throw new Error(message);
  };
  if (resource === 'arrivals') {
    ensureBefore('departure_at', 'expected_arrival_at', 'La date d’arrivée doit être postérieure au départ.');
    ensureBefore('expected_arrival_at', 'ends_at', 'La date de fin doit être postérieure à l’arrivée.');
  }
  if (resource === 'promotions') ensureBefore('starts_at', 'ends_at', 'La date de fin doit être postérieure au début.');
  if (resource === 'stories') ensureBefore('publish_at', 'expires_at', 'L’expiration doit être postérieure à la publication.');
}

function admin(req: Request) {
  return (req as any).admin as { id: string; name: string; role: AdminRole };
}

function audit(db: QatafoDatabase, req: Request, action: string, module: string, entityId: string | null, oldValue: any, newValue: any) {
  const actor = admin(req);
  db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,entity_id,old_value,new_value,ip_address,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, `audit_${randomUUID()}`, actor?.id || null, actor?.name || 'Système', action, module, entityId,
    oldValue == null ? null : JSON.stringify(oldValue), newValue == null ? null : JSON.stringify(newValue), req.ip || null, new Date().toISOString());
}

function addRelations(db: QatafoDatabase, resource: string, id: string, body: any) {
  if (resource === 'products' && Array.isArray(body.arrival_ids)) {
    db.run('DELETE FROM product_arrivals WHERE product_id=?', id);
    for (const arrivalId of body.arrival_ids.slice(0, 100)) db.run('INSERT OR IGNORE INTO product_arrivals (product_id,arrival_id) VALUES (?,?)', id, String(arrivalId));
  }
  if (resource === 'promotions') {
    if (Array.isArray(body.arrival_ids)) {
      db.run('DELETE FROM promotion_arrivals WHERE promotion_id=?', id);
      for (const arrivalId of body.arrival_ids.slice(0, 100)) db.run('INSERT OR IGNORE INTO promotion_arrivals (promotion_id,arrival_id) VALUES (?,?)', id, String(arrivalId));
    }
    if (Array.isArray(body.product_ids)) {
      db.run('DELETE FROM promotion_products WHERE promotion_id=?', id);
      for (const productId of body.product_ids.slice(0, 100)) db.run('INSERT OR IGNORE INTO promotion_products (promotion_id,product_id) VALUES (?,?)', id, String(productId));
    }
  }
}

function withRelations(db: QatafoDatabase, resource: string, row: any) {
  if (!row) return row;
  const result = serializeJsonFields(row, resources[resource].jsonFields);
  if (resource === 'products') result.arrival_ids = db.all<any>('SELECT arrival_id FROM product_arrivals WHERE product_id=?', row.id).map((link) => link.arrival_id);
  if (resource === 'promotions') {
    result.arrival_ids = db.all<any>('SELECT arrival_id FROM promotion_arrivals WHERE promotion_id=?', row.id).map((link) => link.arrival_id);
    result.product_ids = db.all<any>('SELECT product_id FROM promotion_products WHERE promotion_id=?', row.id).map((link) => link.product_id);
  }
  return result;
}

function recomputeProductPricing(db: QatafoDatabase, payload: Record<string, any>, existing?: any) {
  const originalPrice = payload.original_price ?? existing?.original_price;
  const currency = payload.currency ?? existing?.currency;
  if (originalPrice === undefined || !currency) return;
  const breakdown = calculatePrice(db.getPricingRules(), Number(originalPrice), String(currency), { express: false });
  if (!breakdown) throw new Error('Le calcul de prix est impossible avec ces données.');
  payload.converted_price = breakdown.convertedPriceTND;
  payload.customs_fee = breakdown.customsFeeTND;
  payload.shipping_fee = breakdown.shippingFeeTND;
  payload.service_fee = breakdown.serviceFeeTND;
  payload.final_price = breakdown.totalTND;
}

function csvCell(value: any) {
  const string = String(value ?? '');
  return `"${string.replace(/"/g, '""')}"`;
}

export function createAdminRouter(db: QatafoDatabase): Router {
  const router = Router();
  ensureBootstrapAdmin(db);
  cleanupExpiredSessions(db);

  router.post('/auth/login', (req, res) => {
    const key = req.ip || 'unknown';
    const nowTime = Date.now();
    const attempt = loginAttempts.get(key);
    if (attempt && attempt.resetAt > nowTime && attempt.count >= 8) {
      return res.status(429).json({ success: false, error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = db.get<any>('SELECT * FROM admin_users WHERE email=? AND active=1', email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      const current = attempt && attempt.resetAt > nowTime ? attempt : { count: 0, resetAt: nowTime + 15 * 60 * 1000 };
      current.count += 1;
      loginAttempts.set(key, current);
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect.' });
    }
    loginAttempts.delete(key);
    const session = createAdminSession(db, user);
    setAdminCookie(res, session.token);
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: permissionsForRole(user.role as AdminRole),
        },
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      },
    });
  });

  router.get('/auth/me', (req, res) => {
    const identity = resolveAdmin(db, req);
    if (!identity) {
      clearAdminCookie(res);
      return res.status(401).json({ success: false, error: 'Non authentifié.' });
    }
    const csrfToken = rotateCsrfToken(db, req);
    res.json({ success: true, data: { user: { id: identity.id, email: identity.email, name: identity.name, role: identity.role, permissions: identity.permissions }, csrfToken } });
  });

  router.post('/auth/logout', requireAdmin(db), (req, res) => {
    destroySession(db, req);
    clearAdminCookie(res);
    res.json({ success: true });
  });

  router.post('/auth/change-password', requireAdmin(db), (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const nextPassword = String(req.body?.newPassword || '');
    if (nextPassword.length < 12) return res.status(400).json({ success: false, error: 'Le nouveau mot de passe doit contenir au moins 12 caractères.' });
    const actor = admin(req);
    const user = db.get<any>('SELECT * FROM admin_users WHERE id=?', actor.id);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) return res.status(400).json({ success: false, error: 'Mot de passe actuel incorrect.' });
    db.run('UPDATE admin_users SET password_hash=?, updated_at=? WHERE id=?', hashPassword(nextPassword), new Date().toISOString(), actor.id);
    db.run('DELETE FROM admin_sessions WHERE user_id=?', actor.id);
    clearAdminCookie(res);
    audit(db, req, 'CHANGE_PASSWORD', 'USERS', actor.id, null, null);
    res.json({ success: true });
  });

  router.get('/dashboard', requireAdmin(db, 'dashboard:read'), (req, res) => {
    const range = Math.min(Math.max(Number(req.query.days) || 30, 7), 365);
    const since = new Date(Date.now() - range * 86400000).toISOString();
    const previousSince = new Date(Date.now() - range * 2 * 86400000).toISOString();
    const metrics = db.get<any>(`SELECT COUNT(*) orders, COALESCE(SUM(total_tnd),0) revenue,
      COUNT(DISTINCT customer_id) customers, COALESCE(AVG(total_tnd),0) average_basket
      FROM orders WHERE created_at>=? AND status!='CANCELLED'`, since);
    const previous = db.get<any>(`SELECT COUNT(*) orders, COALESCE(SUM(total_tnd),0) revenue,
      COUNT(DISTINCT customer_id) customers, COALESCE(AVG(total_tnd),0) average_basket
      FROM orders WHERE created_at>=? AND created_at<? AND status!='CANCELLED'`, previousSince, since);
    const arrivals = db.all<any>(`SELECT type,COUNT(*) count FROM arrivals WHERE status='ACTIVE' AND expected_arrival_at>? GROUP BY type`, new Date().toISOString());
    const statuses = db.all<any>('SELECT status,COUNT(*) count FROM orders GROUP BY status ORDER BY count DESC');
    const daily = db.all<any>(`SELECT substr(created_at,1,10) date,COUNT(*) orders,ROUND(SUM(total_tnd),2) revenue
      FROM orders WHERE created_at>=? AND status!='CANCELLED' GROUP BY substr(created_at,1,10) ORDER BY date`, since);
    const sources = db.all<any>(`SELECT source,COUNT(*) orders,ROUND(SUM(total_tnd),2) revenue FROM orders
      WHERE created_at>=? AND status!='CANCELLED' GROUP BY source ORDER BY orders DESC`, since);
    const recentOrders = db.all<any>(`SELECT o.id,o.order_number,o.status,o.payment_status,o.total_tnd,o.created_at,c.name customer_name
      FROM orders o JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 8`);
    const ratio = (current: number, before: number) => before ? Math.round(((current - before) / before) * 1000) / 10 : current ? 100 : 0;
    res.json({ success: true, data: {
      range,
      metrics: {
        orders: Number(metrics.orders), revenue: Number(metrics.revenue), customers: Number(metrics.customers), averageBasket: Number(metrics.average_basket),
        changes: { orders: ratio(metrics.orders, previous.orders), revenue: ratio(metrics.revenue, previous.revenue), customers: ratio(metrics.customers, previous.customers), averageBasket: ratio(metrics.average_basket, previous.average_basket) },
        activeStandardArrivals: Number(arrivals.find((row) => row.type === 'STANDARD')?.count || 0),
        activeExpressArrivals: Number(arrivals.find((row) => row.type === 'EXPRESS')?.count || 0),
      }, statuses, daily, sources, recentOrders,
    } });
  });

  router.get('/ayrovix-reviews', requireAdmin(db, 'commerce:read'), (req, res) => {
    const page = parsePositiveInteger(req.query.page, 1, 100000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
    const requestedStatus = String(req.query.status || '').trim() as AyrovixReviewStatus | '';
    if (requestedStatus && !ayrovixReviewStatuses.includes(requestedStatus)) {
      return res.status(400).json({ success: false, error: 'Statut de demande invalide.' });
    }
    const search = String(req.query.search || '').trim().slice(0, 160);
    const { rows, total } = listAyrovixReviews(db, { status: requestedStatus, search, page, pageSize });
    return res.json({ success: true, data: rows, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
  });

  router.get('/ayrovix-reviews/:id', requireAdmin(db, 'commerce:read'), (req, res) => {
    const request = getAyrovixReviewForAdmin(db, String(req.params.id || ''));
    if (!request) return res.status(404).json({ success: false, error: 'Demande AYROVIX introuvable.' });
    return res.json({ success: true, data: request });
  });

  router.put('/ayrovix-reviews/:id', requireAdmin(db, 'orders:write'), (req, res) => {
    const existing = getAyrovixReviewForAdmin(db, String(req.params.id || ''));
    if (!existing) return res.status(404).json({ success: false, error: 'Demande AYROVIX introuvable.' });
    const status = String(req.body?.status || '') as AyrovixReviewStatus;
    if (!ayrovixReviewStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Statut invalide.' });
    const rawPrice = req.body?.quotedPrice;
    const quotedPrice = rawPrice === '' || rawPrice == null ? null : Number(rawPrice);
    const quotedCurrency = String(req.body?.quotedCurrency || '').trim().toUpperCase();
    if (quotedPrice != null && (!Number.isFinite(quotedPrice) || quotedPrice <= 0 || quotedPrice > 1_000_000)) {
      return res.status(400).json({ success: false, error: 'Prix confirmé invalide.' });
    }
    if (status === 'QUOTED' && (quotedPrice == null || !/^[A-Z]{3}$/.test(quotedCurrency))) {
      return res.status(400).json({ success: false, error: 'Un prix et une devise confirmés sont requis pour envoyer un devis.' });
    }
    let verifiedUrl = String(req.body?.verifiedUrl || '').trim().slice(0, 2048);
    if (verifiedUrl) {
      const safeUrl = sanitizeProductUrl(verifiedUrl);
      if (!safeUrl) return res.status(400).json({ success: false, error: 'Lien de vérification invalide.' });
      const parsed = new URL(safeUrl);
      if (parsed.username || parsed.password) return res.status(400).json({ success: false, error: 'Lien de vérification invalide.' });
      verifiedUrl = parsed.toString();
    }
    const clean = (value: unknown, limit: number) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
    const updated = updateAyrovixReview(db, existing.id, {
      status,
      quotedPrice,
      quotedCurrency: quotedPrice == null ? null : quotedCurrency,
      verifiedVariant: clean(req.body?.verifiedVariant, 240),
      verifiedUrl,
      customerMessage: clean(req.body?.customerMessage, 1000),
      adminNote: clean(req.body?.adminNote, 2000),
      adminId: admin(req).id,
    });
    audit(db, req, 'STATUS_CHANGE', 'AYROVIX_REVIEWS', existing.id, existing, updated);
    if (existing.account_id && existing.status !== status && ['QUOTED', 'REJECTED'].includes(status)) {
      const title = status === 'QUOTED' ? 'Votre produit AYROVIX a été vérifié' : 'Mise à jour de votre demande AYROVIX';
      const message = status === 'QUOTED'
        ? `Le prix et la disponibilité de « ${String(existing.title).slice(0, 100)} » ont été vérifiés.`
        : (clean(req.body?.customerMessage, 500) || `La demande pour « ${String(existing.title).slice(0, 100)} » ne peut pas être confirmée actuellement.`);
      db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,?,?,?,?,?)`, `notification_${randomUUID()}`, existing.account_id, 'GENERAL', title, message, '/account?tab=notifications', new Date().toISOString());
    }
    return res.json({ success: true, data: updated });
  });

  router.get('/assistant-support', requireAdmin(db, 'commerce:read'), (req, res) => {
    const page = parsePositiveInteger(req.query.page, 1, 100000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
    const search = String(req.query.search || '').trim().slice(0, 160);
    const status = ['PENDING','IN_PROGRESS','RESOLVED','CLOSED'].includes(String(req.query.status)) ? String(req.query.status) : '';
    const filters: string[] = [];
    const params: any[] = [];
    if (search) {
      filters.push('(t.id LIKE ? OR t.reason LIKE ? OR t.contact LIKE ? OR a.display_name LIKE ?)');
      params.push(...Array(4).fill(`%${search}%`));
    }
    if (status) { filters.push('t.status=?'); params.push(status); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = Number(db.get<any>(`SELECT COUNT(*) count FROM assistant_support_tickets t
      LEFT JOIN customer_accounts a ON a.id=t.account_id ${where}`, ...params)?.count || 0);
    const rows = db.all<any>(`SELECT t.id,t.conversation_id,t.account_id,t.contact,t.reason,t.status,t.priority,
      t.assigned_to,t.created_at,t.updated_at,t.resolved_at,a.display_name account_name,u.name assigned_name
      FROM assistant_support_tickets t
      LEFT JOIN customer_accounts a ON a.id=t.account_id LEFT JOIN admin_users u ON u.id=t.assigned_to
      ${where} ORDER BY CASE t.priority WHEN 'HIGH' THEN 0 ELSE 1 END,t.created_at DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize);
    return res.json({ success: true, data: rows, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
  });

  router.get('/assistant-support/:id', requireAdmin(db, 'commerce:read'), (req, res) => {
    const row = db.get<any>(`SELECT t.id,t.conversation_id,t.account_id,t.contact,t.reason,t.context_excerpt,t.status,t.priority,
      t.assigned_to,t.admin_note,t.created_at,t.updated_at,t.resolved_at,a.display_name account_name,a.email account_email,a.phone account_phone,u.name assigned_name
      FROM assistant_support_tickets t LEFT JOIN customer_accounts a ON a.id=t.account_id
      LEFT JOIN admin_users u ON u.id=t.assigned_to WHERE t.id=?`, req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Ticket support introuvable.' });
    return res.json({ success: true, data: row });
  });

  router.put('/assistant-support/:id', requireAdmin(db, 'orders:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM assistant_support_tickets WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Ticket support introuvable.' });
    const status = ['PENDING','IN_PROGRESS','RESOLVED','CLOSED'].includes(String(req.body?.status)) ? String(req.body.status) : existing.status;
    const priority = ['NORMAL','HIGH'].includes(String(req.body?.priority)) ? String(req.body.priority) : existing.priority;
    const adminNote = typeof req.body?.adminNote === 'string'
      ? req.body.adminNote.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000)
      : existing.admin_note;
    const assignee = status === 'PENDING' ? existing.assigned_to : admin(req).id;
    const resolvedAt = ['RESOLVED','CLOSED'].includes(status) ? (existing.resolved_at || new Date().toISOString()) : null;
    const now = new Date().toISOString();
    db.run(`UPDATE assistant_support_tickets SET status=?,priority=?,admin_note=?,assigned_to=?,resolved_at=?,updated_at=? WHERE id=?`,
    status, priority, adminNote, assignee, resolvedAt, now, existing.id);
    const updated = db.get<any>('SELECT * FROM assistant_support_tickets WHERE id=?', existing.id);
    audit(db, req, 'UPDATE', 'ASSISTANT_SUPPORT', existing.id, existing, updated);
    if (existing.account_id && existing.status !== status && status === 'RESOLVED') {
      db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,?,?,?,?,?)`, `notification_${randomUUID()}`, existing.account_id, 'GENERAL',
      'Votre demande de support a été traitée', 'L’équipe AYROVI a traité votre demande envoyée depuis l’assistant.', '/account?tab=notifications', now);
    }
    return res.json({ success: true, data: {
      id: updated.id, status: updated.status, priority: updated.priority, admin_note: updated.admin_note,
      assigned_to: updated.assigned_to, resolved_at: updated.resolved_at, updated_at: updated.updated_at,
    } });
  });

  for (const [resource, config] of Object.entries(resources)) {
    router.get(`/${resource}`, requireAdmin(db, resource === 'ai-knowledge' ? 'settings:write' : 'content:read'), (req, res) => {
      const page = parsePositiveInteger(req.query.page, 1, 100000);
      const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
      const search = String(req.query.search || '').trim().slice(0, 200);
      const sort = config.sortable.includes(String(req.query.sort)) ? String(req.query.sort) : config.defaultSort;
      const direction = String(req.query.direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      const filters: string[] = [];
      const params: any[] = [];
      if (search) {
        filters.push(`(${config.searchable.map((field) => `${field} LIKE ?`).join(' OR ')})`);
        params.push(...config.searchable.map(() => `%${search}%`));
      }
      for (const [field, values] of Object.entries(config.enums || {})) {
        const value = req.query[field];
        if (typeof value === 'string' && values.includes(value)) { filters.push(`${field}=?`); params.push(value); }
      }
      if (req.query.active !== undefined && config.fields.includes('active')) { filters.push('active=?'); params.push(String(req.query.active) === 'true' || String(req.query.active) === '1' ? 1 : 0); }
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const count = db.get<any>(`SELECT COUNT(*) count FROM ${config.table} ${where}`, ...params)?.count || 0;
      const rows = db.all<any>(`SELECT * FROM ${config.table} ${where} ORDER BY ${sort} ${direction} LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize)
        .map((row) => withRelations(db, resource, row));
      res.json({ success: true, data: rows, pagination: { page, pageSize, total: Number(count), totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)) } });
    });

    router.get(`/${resource}/:id`, requireAdmin(db, resource === 'ai-knowledge' ? 'settings:write' : 'content:read'), (req, res) => {
      const row = db.get<any>(`SELECT * FROM ${config.table} WHERE id=?`, req.params.id);
      if (!row) return res.status(404).json({ success: false, error: 'Élément introuvable.' });
      res.json({ success: true, data: withRelations(db, resource, row) });
    });

    router.post(`/${resource}`, requireAdmin(db, config.permission), (req, res) => {
      try {
        const payload = sanitizePayload(req.body, config);
        validateResourceDates(resource, payload);
        if (resource === 'products') recomputeProductPricing(db, payload);
        const id = `${config.prefix}_${randomUUID()}`;
        const now = new Date().toISOString();
        const columns = ['id', ...Object.keys(payload), 'created_at', 'updated_at'];
        const values = [id, ...Object.values(payload), now, now];
        db.transaction(() => {
          db.run(`INSERT INTO ${config.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...values);
          addRelations(db, resource, id, req.body);
        });
        const created = withRelations(db, resource, db.get<any>(`SELECT * FROM ${config.table} WHERE id=?`, id));
        audit(db, req, 'CREATE', config.module, id, null, created);
        res.status(201).json({ success: true, data: created });
      } catch (error: any) {
        const conflict = String(error?.code || '').includes('CONSTRAINT');
        res.status(conflict ? 409 : 400).json({ success: false, error: conflict ? 'Cette valeur existe déjà ou une relation est invalide.' : error.message });
      }
    });

    router.put(`/${resource}/:id`, requireAdmin(db, config.permission), (req, res) => {
      try {
        const existing = db.get<any>(`SELECT * FROM ${config.table} WHERE id=?`, req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Élément introuvable.' });
        const payload = sanitizePayload(req.body, config, true);
        validateResourceDates(resource, payload, existing);
        if (resource === 'products') recomputeProductPricing(db, payload, existing);
        if (Object.keys(payload).length === 0 && !req.body.arrival_ids && !req.body.product_ids) return res.status(400).json({ success: false, error: 'Aucune modification reçue.' });
        const now = new Date().toISOString();
        db.transaction(() => {
          if (Object.keys(payload).length) {
            const assignments = [...Object.keys(payload).map((field) => `${field}=?`), 'updated_at=?'];
            db.run(`UPDATE ${config.table} SET ${assignments.join(',')} WHERE id=?`, ...Object.values(payload), now, req.params.id);
          }
          addRelations(db, resource, req.params.id, req.body);
        });
        const updated = withRelations(db, resource, db.get<any>(`SELECT * FROM ${config.table} WHERE id=?`, req.params.id));
        audit(db, req, 'UPDATE', config.module, req.params.id, withRelations(db, resource, existing), updated);
        res.json({ success: true, data: updated });
      } catch (error: any) {
        const conflict = String(error?.code || '').includes('CONSTRAINT');
        res.status(conflict ? 409 : 400).json({ success: false, error: conflict ? 'Cette valeur existe déjà ou une relation est invalide.' : error.message });
      }
    });

    router.delete(`/${resource}/:id`, requireAdmin(db, config.permission), (req, res) => {
      const existing = db.get<any>(`SELECT * FROM ${config.table} WHERE id=?`, req.params.id);
      if (!existing) return res.status(404).json({ success: false, error: 'Élément introuvable.' });
      const assignments = Object.keys(config.softDelete).map((field) => `${field}=?`);
      db.run(`UPDATE ${config.table} SET ${assignments.join(',')},updated_at=? WHERE id=?`, ...Object.values(config.softDelete), new Date().toISOString(), req.params.id);
      audit(db, req, 'ARCHIVE', config.module, req.params.id, existing, config.softDelete);
      res.json({ success: true });
    });
  }

  router.get('/orders', requireAdmin(db, 'commerce:read'), (req, res) => {
    const page = parsePositiveInteger(req.query.page, 1, 100000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filters: string[] = [];
    const params: any[] = [];
    if (search) { filters.push('(o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (typeof req.query.status === 'string' && orderStatuses.includes(req.query.status)) { filters.push('o.status=?'); params.push(req.query.status); }
    if (typeof req.query.payment_status === 'string' && paymentStatuses.includes(req.query.payment_status)) { filters.push('o.payment_status=?'); params.push(req.query.payment_status); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const count = db.get<any>(`SELECT COUNT(*) count FROM orders o JOIN customers c ON c.id=o.customer_id ${where}`, ...params)?.count || 0;
    const rows = db.all<any>(`SELECT o.*,c.name customer_name,c.phone customer_phone FROM orders o JOIN customers c ON c.id=o.customer_id
      ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
    res.json({ success: true, data: rows, pagination: { page, pageSize, total: Number(count), totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)) } });
  });

  router.get('/orders/:id', requireAdmin(db, 'commerce:read'), (req, res) => {
    const order = db.get<any>(`SELECT o.*,c.name customer_name,c.registered_at customer_since FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?`, req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Commande introuvable.' });
    res.json({ success: true, data: {
      ...order,
      pricing_snapshot: JSON.parse(order.pricing_snapshot),
      items: db.all<any>('SELECT * FROM order_items WHERE order_id=? ORDER BY created_at', order.id).map((item) => ({ ...item, pricing_snapshot: JSON.parse(item.pricing_snapshot) })),
      history: db.all<any>('SELECT * FROM order_status_history WHERE order_id=? ORDER BY created_at DESC', order.id),
      payment: db.get<any>('SELECT * FROM payments WHERE order_id=?', order.id),
      delivery: db.get<any>('SELECT * FROM deliveries WHERE order_id=?', order.id),
    } });
  });

  router.put('/orders/:id/status', requireAdmin(db, 'orders:write'), (req, res) => {
    const status = String(req.body?.status || '');
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (!orderStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Statut de commande invalide.' });
    const existing = db.get<any>('SELECT * FROM orders WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Commande introuvable.' });
    const now = new Date().toISOString();
    db.transaction(() => {
      db.run('UPDATE orders SET status=?,updated_at=? WHERE id=?', status, now, existing.id);
      db.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at) VALUES (?,?,?,?,?,?,?)`,
        `history_${randomUUID()}`, existing.id, existing.status, status, note, admin(req).id, now);
      if (status === 'DELIVERED') db.run("UPDATE deliveries SET status='DELIVERED',delivered_at=?,updated_at=? WHERE order_id=?", now, now, existing.id);
      if (status === 'CANCELLED') {
        db.run("UPDATE payments SET status=CASE WHEN status='PAID' THEN 'REFUNDED' ELSE 'CANCELLED' END,updated_at=? WHERE order_id=?", now, existing.id);
        db.run("UPDATE orders SET payment_status=CASE WHEN payment_status='PAID' THEN 'REFUNDED' ELSE 'CANCELLED' END WHERE id=?", existing.id);
      }
      if (existing.account_id && status !== existing.status) {
        db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
          VALUES (?,?,'ORDER','Mise à jour de commande',?,?,?)`, `notification_${randomUUID()}`, existing.account_id,
        `La commande ${existing.order_number} est maintenant au statut ${status}.`, `/compte/commandes/${existing.id}`, now);
      }
    });
    audit(db, req, 'STATUS_CHANGE', 'ORDERS', existing.id, { status: existing.status }, { status, note });
    res.json({ success: true, data: db.get<any>('SELECT * FROM orders WHERE id=?', existing.id) });
  });

  router.put('/orders/:id/payment', requireAdmin(db, 'payments:write'), (req, res) => {
    const status = String(req.body?.status || '');
    const reference = String(req.body?.reference || '').trim().slice(0, 200) || null;
    if (!paymentStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Statut de paiement invalide.' });
    const payment = db.get<any>('SELECT * FROM payments WHERE order_id=?', req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: 'Paiement introuvable.' });
    const now = new Date().toISOString();
    db.transaction(() => {
      db.run(`UPDATE payments SET status=?,reference=?,confirmed_by=?,confirmed_at=?,updated_at=? WHERE order_id=?`,
        status, reference, status === 'PAID' ? admin(req).id : null, status === 'PAID' ? now : null, now, req.params.id);
      db.run('UPDATE orders SET payment_status=?,updated_at=? WHERE id=?', status, now, req.params.id);
      const order = db.get<any>('SELECT id,order_number,account_id FROM orders WHERE id=?', req.params.id);
      if (order?.account_id) db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,'ORDER','Paiement mis à jour',?,?,?)`, `notification_${randomUUID()}`, order.account_id,
      `Le paiement de la commande ${order.order_number} est maintenant ${status}.`, `/compte/commandes/${order.id}`, now);
    });
    audit(db, req, 'PAYMENT_STATUS', 'PAYMENTS', payment.id, payment, { status, reference });
    res.json({ success: true, data: db.get<any>('SELECT * FROM payments WHERE order_id=?', req.params.id) });
  });

  // ===== عرض وصل دفع العربون (للإدارة فقط) =====
  router.get('/orders/:id/deposit-proof', requireAdmin(db, 'commerce:read'), (req, res) => {
    const order = db.get<any>('SELECT id,deposit_proof_path FROM orders WHERE id=?', req.params.id);
    if (!order?.deposit_proof_path || !fs.existsSync(String(order.deposit_proof_path))) {
      return res.status(404).json({ success: false, error: 'Aucune preuve téléversée pour cette commande.' });
    }
    const absolute = path.resolve(String(order.deposit_proof_path));
    const safeRoot = path.resolve(uploadsDir('deposits'));
    if (!absolute.startsWith(safeRoot + path.sep)) return res.status(403).json({ success: false, error: 'Chemin de preuve invalide.' });
    const ext = path.extname(absolute).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(absolute).pipe(res);
  });

  // ===== مراجعة العربون: قبول (تأكيد الطلب + فاتورة + كود تتبع) أو رفض =====
  router.post('/orders/:id/deposit/review', requireAdmin(db, 'payments:write'), async (req, res) => {
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ success: false, error: 'Décision invalide (approve/reject).' });
    const before = db.get<any>('SELECT * FROM orders WHERE id=?', req.params.id);
    if (!before) return res.status(404).json({ success: false, error: 'Commande introuvable.' });

    if (decision === 'reject') {
      try {
        const order = db.rejectOrderDeposit(req.params.id, admin(req).id, note);
        audit(db, req, 'DEPOSIT_REJECTED', 'ORDERS', order.id, { deposit_status: before.deposit_status }, { deposit_status: 'REJECTED', note });
        return res.json({ success: true, data: { depositStatus: 'REJECTED' } });
      } catch (error: any) {
        return res.status(error?.message === 'DEPOSIT_NOT_REVIEWABLE' ? 409 : 500).json({ success: false, error: 'Cet acompte ne peut plus être refusé.' });
      }
    }

    // قبول: يتطلب وجود وصل للطرق اليدوية (بنك/بريد/فلوسي) أو تأكيد بوابة للدفع بالبطاقة
    if (before.payment_method !== 'CARD' && !before.deposit_proof_path) {
      return res.status(409).json({ success: false, error: 'Aucune preuve téléversée — attendez le reçu du client.' });
    }
    try {
      const order = db.confirmOrderDeposit(req.params.id, admin(req).id, note);
      audit(db, req, 'DEPOSIT_APPROVED', 'ORDERS', order.id, { deposit_status: before.deposit_status }, { deposit_status: 'PAID', note });

      // الفاتورة الإلكترونية PDF — يولّدها Chromium (لا تبعيات جديدة)
      let invoice: { number: string; generated: boolean } = { number: String(order.invoice_number), generated: false };
      try {
        await generateInvoicePdf(db, order.id);
        invoice = { number: String(order.invoice_number), generated: true };
      } catch (pdfError: any) {
        console.error('[Invoice] فشل توليد PDF:', pdfError?.message || pdfError);
      }

      // إرسال الفاتورة بالبريد إن كان العميل لديه بريد والإعداد مفعّل
      let mail: { delivered: boolean; provider: string } = { delivered: false, provider: 'disabled' };
      const emailEnabled = db.get<any>("SELECT setting_value FROM settings WHERE setting_key='invoice_email_enabled'")?.setting_value !== 'false';
      const account = order.account_id ? db.get<any>('SELECT email,display_name FROM customer_accounts WHERE id=?', order.account_id) : null;
      if (emailEnabled && account?.email && invoice.generated) {
        const total = Number(order.total_tnd), dep = Number(order.deposit_amount_tnd);
        const balance = Math.max(0, Math.round((total - dep) * 1000) / 1000);
        const pdfPath = String(db.get<any>('SELECT invoice_path FROM orders WHERE id=?', order.id)?.invoice_path || '');
        mail = await sendMail({
          to: String(account.email),
          subject: `Facture ${order.invoice_number} — commande ${order.order_number} confirmée`,
          html: invoiceEmailHtml({
            customerName: String(account.display_name || 'Client AYROVI'),
            orderNumber: String(order.order_number),
            invoiceNumber: String(order.invoice_number),
            trackingCode: String(order.tracking_code || ''),
            totalLabel: `${total.toFixed(3)} DT`,
            depositLabel: `${dep.toFixed(3)} DT`,
            balanceLabel: `${balance.toFixed(3)} DT`,
            company: String(db.get<any>("SELECT setting_value FROM settings WHERE setting_key='company_legal_name'")?.setting_value || 'AYROVI'),
          }),
          attachments: pdfPath && fs.existsSync(pdfPath) ? [{ filename: `${order.invoice_number}.pdf`, path: pdfPath }] : [],
        });
      }
      return res.json({ success: true, data: { depositStatus: 'PAID', status: 'CONFIRMED', trackingCode: order.tracking_code, invoice, mail } });
    } catch (error: any) {
      return res.status(error?.message === 'DEPOSIT_NOT_REVIEWABLE' || error?.message === 'ORDER_NOT_FOUND' ? 409 : 500)
        .json({ success: false, error: 'Cet acompte ne peut plus être confirmé.' });
    }
  });

  router.put('/orders/:id/delivery', requireAdmin(db, 'orders:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM deliveries WHERE order_id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Livraison introuvable.' });
    const allowed = ['governorate','address','phone','status','expected_at','notes','carrier','tracking_number'];
    const payload: Record<string, any> = {};
    for (const field of allowed) if (req.body?.[field] !== undefined) payload[field] = typeof req.body[field] === 'string' ? req.body[field].trim().slice(0, 1000) : req.body[field];
    if (payload.status && !deliveryStatuses.includes(payload.status)) return res.status(400).json({ success: false, error: 'Statut de livraison invalide.' });
    if (payload.expected_at && Number.isNaN(new Date(payload.expected_at).getTime())) return res.status(400).json({ success: false, error: 'Date prévue invalide.' });
    if (!Object.keys(payload).length) return res.status(400).json({ success: false, error: 'Aucune modification reçue.' });
    const now = new Date().toISOString();
    if (payload.status === 'DELIVERED') payload.delivered_at = now;
    db.run(`UPDATE deliveries SET ${Object.keys(payload).map((key) => `${key}=?`).join(',')},updated_at=? WHERE order_id=?`, ...Object.values(payload), now, req.params.id);
    audit(db, req, 'UPDATE', 'DELIVERIES', existing.id, existing, payload);
    res.json({ success: true, data: db.get<any>('SELECT * FROM deliveries WHERE order_id=?', req.params.id) });
  });

  // ===== إشعارات الإدارة (وصل جديد / طلب جديد …) =====
  router.get('/notifications', requireAdmin(db, 'dashboard:read'), (req, res) => {
    const limit = parsePositiveInteger(req.query.limit, 30, 100);
    res.json({ success: true, data: db.listAdminNotifications(limit), unread: db.unreadAdminNotificationsCount() });
  });
  router.post('/notifications/:id/read', requireAdmin(db, 'dashboard:read'), (req, res) => {
    db.markAdminNotificationRead(String(req.params.id).slice(0, 80));
    res.json({ success: true, unread: db.unreadAdminNotificationsCount() });
  });
  router.post('/notifications/read-all', requireAdmin(db, 'dashboard:read'), (_req, res) => {
    db.markAllAdminNotificationsRead();
    res.json({ success: true, unread: 0 });
  });

  // ===== التقارير المالية والمصاريف =====
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  router.get('/reports/finance', requireAdmin(db, 'reports:read'), (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const from = datePattern.test(String(req.query.from || '')) ? String(req.query.from) : monthStart;
    const to = datePattern.test(String(req.query.to || '')) ? String(req.query.to) : today;
    if (from > to) return res.status(400).json({ success: false, error: 'Plage de dates invalide.' });
    res.json({ success: true, data: db.getFinancialReport(from, to) });
  });
  router.get('/expenses', requireAdmin(db, 'reports:read'), (req, res) => {
    const from = datePattern.test(String(req.query.from || '')) ? String(req.query.from) : undefined;
    const to = datePattern.test(String(req.query.to || '')) ? String(req.query.to) : undefined;
    res.json({ success: true, data: db.listExpenses(from, to) });
  });
  // AYROVIX Lens — Claude understanding/search + SerpApi Google Lens matches.
  router.get('/ayrovix/stats', requireAdmin(db, 'reports:read'), async (_req, res) => {
    res.json({
      success: true,
      data: {
        ...getAyrovixStats(db),
        providers: {
          vision: { configured: ayrovixAiReady(), activeProviders: getActiveProviders(), label: 'Claude Vision — compréhension et prix visible' },
          visualSearch: checkSerpApiVisualHealth(),
          search: checkAnthropicSearchHealth(),
        },
      },
    });
  });
  const expenseCategories = ['ADS', 'SHIPPING', 'STOCK', 'SERVICES', 'SALARIES', 'FEES', 'OTHER'];
  router.post('/expenses', requireAdmin(db, 'reports:write'), (req, res) => {
    const label = String(req.body?.label || '').trim().slice(0, 160);
    const category = expenseCategories.includes(String(req.body?.category)) ? String(req.body.category) : 'OTHER';
    const amount = Math.round(Number(req.body?.amountTnd) * 1000) / 1000;
    const expenseDate = String(req.body?.expenseDate || '').slice(0, 10);
    const notes = String(req.body?.notes || '').trim().slice(0, 500);
    if (!label || !datePattern.test(expenseDate)) return res.status(400).json({ success: false, error: 'Libellé et date (AAAA-MM-JJ) obligatoires.' });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return res.status(400).json({ success: false, error: 'Montant invalide.' });
    const expense = db.createExpense({ label, category, amountTnd: amount, expenseDate, notes, createdBy: admin(req).id });
    audit(db, req, 'CREATE', 'EXPENSES', expense.id, null, expense);
    res.status(201).json({ success: true, data: expense });
  });
  router.delete('/expenses/:id', requireAdmin(db, 'reports:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM expenses WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Dépense introuvable.' });
    db.deleteExpense(existing.id);
    audit(db, req, 'DELETE', 'EXPENSES', existing.id, existing, null);
    res.json({ success: true });
  });

  // ===== إعادة توليد/إرسال الفاتورة يدويًا عند الحاجة =====
  router.post('/orders/:id/invoice/resend', requireAdmin(db, 'payments:write'), async (req, res) => {
    const order = db.get<any>('SELECT * FROM orders WHERE id=?', req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Commande introuvable.' });
    if (!order.invoice_number) return res.status(409).json({ success: false, error: 'Aucune facture — confirmez d’abord l’acompte.' });
    try {
      await generateInvoicePdf(db, order.id);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'La facture n’a pas pu être régénérée.' });
    }
    const account = order.account_id ? db.get<any>('SELECT email,display_name FROM customer_accounts WHERE id=?', order.account_id) : null;
    let mail: { delivered: boolean; provider: string } = { delivered: false, provider: 'no-email' };
    if (account?.email) {
      const updated = db.get<any>('SELECT * FROM orders WHERE id=?', order.id);
      const total = Number(order.total_tnd), dep = Number(order.deposit_amount_tnd);
      const balance = Math.max(0, Math.round((total - dep) * 1000) / 1000);
      const result = await sendMail({
        to: String(account.email),
        subject: `Facture ${order.invoice_number} — commande ${order.order_number}`,
        html: invoiceEmailHtml({
          customerName: String(account.display_name || 'Client AYROVI'),
          orderNumber: String(order.order_number),
          invoiceNumber: String(order.invoice_number),
          trackingCode: String(updated?.tracking_code || ''),
          totalLabel: `${total.toFixed(3)} DT`,
          depositLabel: `${dep.toFixed(3)} DT`,
          balanceLabel: `${balance.toFixed(3)} DT`,
          company: String(db.get<any>("SELECT setting_value FROM settings WHERE setting_key='company_legal_name'")?.setting_value || 'AYROVI'),
        }),
        attachments: updated?.invoice_path && fs.existsSync(String(updated.invoice_path)) ? [{ filename: `${order.invoice_number}.pdf`, path: String(updated.invoice_path) }] : [],
      });
      mail = { delivered: result.delivered, provider: result.provider };
    }
    audit(db, req, 'INVOICE_RESENT', 'ORDERS', order.id, null, { invoice_number: order.invoice_number, mailed: mail.delivered });
    res.json({ success: true, data: { invoiceNumber: order.invoice_number, mail } });
  });

  router.get('/customers', requireAdmin(db, 'commerce:read'), (req, res) => {
    const page = parsePositiveInteger(req.query.page, 1, 100000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const params = search ? [`%${search}%`, `%${search}%`] : [];
    const where = search ? 'WHERE c.name LIKE ? OR c.phone LIKE ?' : '';
    const count = db.get<any>(`SELECT COUNT(*) count FROM customers c ${where}`, ...params)?.count || 0;
    const rows = db.all<any>(`SELECT c.*,COUNT(DISTINCT o.id) order_count,
      COALESCE(SUM(CASE WHEN o.status!='CANCELLED' THEN o.total_tnd ELSE 0 END),0) lifetime_value,
      MAX(a.id) account_id,MAX(a.email) account_email,MAX(a.phone_verified_at) phone_verified_at,MAX(a.last_login_at) account_last_login_at
      FROM customers c LEFT JOIN orders o ON o.customer_id=c.id LEFT JOIN customer_accounts a ON a.id=o.account_id
      ${where} GROUP BY c.id ORDER BY c.registered_at DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, (page - 1) * pageSize);
    res.json({ success: true, data: rows, pagination: { page, pageSize, total: Number(count), totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)) } });
  });

  router.get('/customers/:id', requireAdmin(db, 'commerce:read'), (req, res) => {
    const customer = db.get<any>('SELECT * FROM customers WHERE id=?', req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Client introuvable.' });
    const account = db.get<any>(`SELECT a.* FROM customer_accounts a JOIN orders o ON o.account_id=a.id
      WHERE o.customer_id=? ORDER BY o.created_at DESC LIMIT 1`, customer.id);
    res.json({ success: true, data: { ...customer, account: account || null, orders: db.all<any>('SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC', customer.id) } });
  });

  // ===== Comptes clients enregistrés (connexion Google/SMS) — visibles même avant toute commande =====

  router.get('/customer-accounts', requireAdmin(db, 'commerce:read'), (req, res) => {
    const page = parsePositiveInteger(req.query.page, 1, 100000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
    const where = search ? 'WHERE a.display_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ?' : '';
    const count = db.get<any>(`SELECT COUNT(*) count FROM customer_accounts a ${where}`, ...params)?.count || 0;
    const rows = db.all<any>(`SELECT a.id,a.display_name,a.email,a.phone,a.status,a.locale,a.marketing_opt_in,a.created_at,a.last_login_at,
      (a.phone_verified_at IS NOT NULL) phone_verified,(a.email_verified_at IS NOT NULL) email_verified,
      COUNT(DISTINCT o.id) order_count,COALESCE(SUM(CASE WHEN o.status!='CANCELLED' THEN o.total_tnd ELSE 0 END),0) lifetime_value
      FROM customer_accounts a LEFT JOIN orders o ON o.account_id=a.id
      ${where} GROUP BY a.id ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, (page - 1) * pageSize);
    res.json({ success: true, data: rows, pagination: { page, pageSize, total: Number(count), totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)) } });
  });

  router.get('/customer-accounts/:id', requireAdmin(db, 'commerce:read'), (req, res) => {
    const account = db.get<any>(`SELECT id,display_name,email,phone,avatar_url,status,locale,marketing_opt_in,
      email_verified_at,phone_verified_at,created_at,updated_at,last_login_at FROM customer_accounts WHERE id=?`, req.params.id);
    if (!account) return res.status(404).json({ success: false, error: 'Compte client introuvable.' });
    const orders = db.all<any>('SELECT id,order_number,status,payment_status,total_tnd,created_at FROM orders WHERE account_id=? ORDER BY created_at DESC', account.id);
    const addresses = db.all<any>('SELECT label,recipient_name,phone,governorate,city,address_line,postal_code,is_default FROM customer_addresses WHERE account_id=? ORDER BY is_default DESC,updated_at DESC', account.id);
    res.json({ success: true, data: { ...account, orders, addresses } });
  });

  router.put('/customer-accounts/:id/status', requireAdmin(db, 'orders:write'), (req, res) => {
    const status = String(req.body?.status || '').trim().toUpperCase();
    if (!['ACTIVE', 'BLOCKED'].includes(status)) return res.status(400).json({ success: false, error: 'Statut invalide (ACTIVE ou BLOCKED).' });
    const account = db.get<any>('SELECT id,status FROM customer_accounts WHERE id=?', req.params.id);
    if (!account) return res.status(404).json({ success: false, error: 'Compte client introuvable.' });
    db.run('UPDATE customer_accounts SET status=?,updated_at=? WHERE id=?', status, new Date().toISOString(), account.id);
    audit(db, req, 'UPDATE', 'CUSTOMER_ACCOUNT', account.id, { status: account.status }, { status });
    res.json({ success: true, data: { id: account.id, status } });
  });

  router.get('/pricing', requireAdmin(db, 'commerce:read'), (_req, res) => res.json({ success: true, data: db.getPricingRules() }));
  router.put('/pricing', requireAdmin(db, 'pricing:write'), (req, res) => {
    const current = db.getPricingRules();
    const fields: Record<string, string> = { rateEUR: 'rate_eur', rateUSD: 'rate_usd', rateGBP: 'rate_gbp', rateJPY: 'rate_jpy', customsFeePercent: 'customs_fee_percent', shippingFeeTND: 'shipping_fee_tnd', serviceFeePercent: 'service_fee_percent', minimumServiceFeeTND: 'minimum_service_fee_tnd', expressFeeTND: 'express_fee_tnd' };
    const payload: Record<string, number> = {};
    for (const [apiField, dbField] of Object.entries(fields)) {
      if (req.body?.[apiField] === undefined) continue;
      const value = Number(req.body[apiField]);
      if (!Number.isFinite(value) || value < 0 || (apiField.startsWith('rate') && value <= 0)) return res.status(400).json({ success: false, error: `Valeur invalide pour ${apiField}.` });
      payload[dbField] = value;
    }
    if (!Object.keys(payload).length) return res.status(400).json({ success: false, error: 'Aucun tarif reçu.' });
    let updated = current;
    db.transaction(() => {
      db.run(`UPDATE pricing_config SET ${Object.keys(payload).map((field) => `${field}=?`).join(',')},version=version+1,updated_at=?,updated_by=? WHERE id='default'`, ...Object.values(payload), new Date().toISOString(), admin(req).id);
      updated = db.getPricingRules();
      const products = db.all<any>('SELECT id,original_price,currency FROM products');
      for (const product of products) {
        const price = calculatePrice(updated, Number(product.original_price), String(product.currency));
        if (!price) throw new Error(`Tarification impossible pour le produit ${product.id}.`);
        db.run(`UPDATE products SET converted_price=?,customs_fee=?,shipping_fee=?,service_fee=?,final_price=?,updated_at=? WHERE id=?`,
          price.convertedPriceTND, price.customsFeeTND, price.shippingFeeTND, price.serviceFeeTND, price.totalTND, new Date().toISOString(), product.id);
      }
    });
    audit(db, req, 'UPDATE', 'PRICING', 'default', current, updated);
    res.json({ success: true, data: updated });
  });

  router.post('/pricing/preview', requireAdmin(db, 'commerce:read'), (req, res) => {
    const result = calculatePrice(db.getPricingRules(), Number(req.body?.originalPrice), String(req.body?.currency || ''), {
      quantity: Number(req.body?.quantity || 1), express: Boolean(req.body?.express), discountTND: Number(req.body?.discountTND || 0),
    });
    if (!result) return res.status(400).json({ success: false, error: 'Données de calcul invalides.' });
    res.json({ success: true, data: result });
  });

  router.get('/settings', requireAdmin(db, 'content:read'), (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const rows = category ? db.all<any>('SELECT * FROM settings WHERE category=? ORDER BY label', category) : db.all<any>('SELECT * FROM settings ORDER BY category,label');
    res.json({ success: true, data: rows.map((row) => ({ ...row, setting_value: row.value_type === 'JSON' ? JSON.parse(row.setting_value) : row.value_type === 'NUMBER' ? Number(row.setting_value) : row.value_type === 'BOOLEAN' ? row.setting_value === 'true' : row.setting_value })) });
  });

  router.put('/settings/:id', requireAdmin(db, 'settings:write'), (req, res) => {
    const current = db.get<any>('SELECT * FROM settings WHERE id=?', req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'Paramètre introuvable.' });
    const received = req.body?.value;
    if (current.setting_key === 'payment_methods') {
      if (!Array.isArray(received) || !received.length || received.some((method: unknown) => !['COD','D17','FLOUCI'].includes(String(method)))) {
        return res.status(400).json({ success: false, error: 'Les paiements autorisés sont COD, D17 et FLOUCI.' });
      }
    }
    if (current.setting_key === 'governorates') {
      if (!Array.isArray(received) || !received.length || received.length > 24 || received.some((name: unknown) => !String(name).trim() || String(name).length > 100)) {
        return res.status(400).json({ success: false, error: 'La liste des gouvernorats est invalide.' });
      }
    }
    const value = current.value_type === 'JSON' ? JSON.stringify(received) : String(received ?? '').trim().slice(0, 10000);
    db.run('UPDATE settings SET setting_value=?,updated_at=?,updated_by=? WHERE id=?', value, new Date().toISOString(), admin(req).id, current.id);
    audit(db, req, 'UPDATE', 'SETTINGS', current.id, current.setting_value, value);
    res.json({ success: true });
  });

  router.get('/users', requireAdmin(db, 'users:write'), (_req, res) => {
    res.json({ success: true, data: db.all<any>('SELECT id,email,name,role,active,last_login_at,created_at,updated_at FROM admin_users ORDER BY created_at') });
  });

  router.post('/users', requireAdmin(db, 'users:write'), (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim().slice(0, 100);
    const password = String(req.body?.password || '');
    const role = String(req.body?.role || '') as AdminRole;
    if (!/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 12 || !adminRoles.includes(role)) return res.status(400).json({ success: false, error: 'Nom, email, rôle ou mot de passe invalide (12 caractères minimum).' });
    try {
      const id = `admin_${randomUUID()}`;
      const now = new Date().toISOString();
      db.run('INSERT INTO admin_users (id,email,name,password_hash,role,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)', id, email, name, hashPassword(password), role, now, now);
      audit(db, req, 'CREATE', 'USERS', id, null, { email, name, role });
      res.status(201).json({ success: true, data: { id, email, name, role, active: 1 } });
    } catch { res.status(409).json({ success: false, error: 'Cet email existe déjà.' }); }
  });

  router.put('/users/:id', requireAdmin(db, 'users:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM admin_users WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    const payload: Record<string, any> = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim()) payload.name = req.body.name.trim().slice(0, 100);
    if (adminRoles.includes(req.body?.role)) payload.role = req.body.role;
    if (typeof req.body?.active === 'boolean') payload.active = req.body.active ? 1 : 0;
    if (typeof req.body?.password === 'string' && req.body.password) {
      if (req.body.password.length < 12) return res.status(400).json({ success: false, error: 'Mot de passe trop court.' });
      payload.password_hash = hashPassword(req.body.password);
    }
    if (existing.id === admin(req).id && (payload.active === 0 || (payload.role && payload.role !== 'SUPER_ADMIN'))) return res.status(400).json({ success: false, error: 'Vous ne pouvez pas désactiver ou rétrograder votre propre compte.' });
    if (!Object.keys(payload).length) return res.status(400).json({ success: false, error: 'Aucune modification reçue.' });
    db.run(`UPDATE admin_users SET ${Object.keys(payload).map((field) => `${field}=?`).join(',')},updated_at=? WHERE id=?`, ...Object.values(payload), new Date().toISOString(), existing.id);
    if (payload.active === 0 || payload.password_hash) db.run('DELETE FROM admin_sessions WHERE user_id=?', existing.id);
    audit(db, req, 'UPDATE', 'USERS', existing.id, { name: existing.name, role: existing.role, active: existing.active }, { ...payload, password_hash: payload.password_hash ? '[MODIFIÉ]' : undefined });
    res.json({ success: true });
  });

  router.get('/audit-logs', requireAdmin(db, 'audit:read'), (req, res) => {
    const page = parsePositiveInteger(req.query.page, 1, 100000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 30, 100);
    const module = String(req.query.module || '').trim().slice(0, 50);
    const where = module ? 'WHERE module=?' : '';
    const params = module ? [module] : [];
    const count = db.get<any>(`SELECT COUNT(*) count FROM audit_logs ${where}`, ...params)?.count || 0;
    const rows = db.all<any>(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize)
      .map((row) => ({ ...row, old_value: row.old_value ? JSON.parse(row.old_value) : null, new_value: row.new_value ? JSON.parse(row.new_value) : null }));
    res.json({ success: true, data: rows, pagination: { page, pageSize, total: Number(count), totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)) } });
  });

  router.post('/uploads', requireAdmin(db, 'content:write'), (req, res) => {
    const dataUrl = String(req.body?.dataUrl || '');
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) return res.status(400).json({ success: false, error: 'Image PNG, JPEG, WEBP ou GIF invalide.' });
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 4 * 1024 * 1024) return res.status(400).json({ success: false, error: 'L’image doit peser moins de 4 Mo.' });
    const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
    const directory = path.resolve(process.cwd(), 'data', 'uploads');
    fs.mkdirSync(directory, { recursive: true });
    const filename = `${Date.now()}-${randomUUID()}.${extension}`;
    fs.writeFileSync(path.join(directory, filename), buffer, { flag: 'wx' });
    const url = `/uploads/${filename}`;
    audit(db, req, 'UPLOAD', 'MEDIA', filename, null, { url, bytes: buffer.length });
    res.status(201).json({ success: true, data: { url, filename, size: buffer.length } });
  });

  router.get('/reports/orders.csv', requireAdmin(db, 'commerce:read'), (_req, res) => {
    const rows = db.all<any>(`SELECT o.order_number,c.name customer,c.phone,o.status,o.payment_status,o.payment_method,
      o.source,o.total_tnd,o.governorate,o.created_at FROM orders o JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 10000`);
    const headers = ['order_number','customer','phone','status','payment_status','payment_method','source','total_tnd','governorate','created_at'];
    const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ayrovi-orders.csv"');
    res.send(`\uFEFF${csv}`);
  });

  return router;
}
