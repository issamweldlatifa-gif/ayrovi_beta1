import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { QatafoDatabase } from '../db/database';
import multer from 'multer';
import {
  deleteHeroVisualFiles,
  invalidateHeroVisualCache,
  newHeroVisualId,
  normalizeSchedule,
  resolveActiveHeroVisual,
  storeHeroImage,
} from '../services/heroVisual';
import { normalizeUploadedImage } from '../services/imageValidation';
import { parsePublicHttpUrl } from '../services/safeUrl';
import { runLensPipeline, hashImage } from '../ayrovix/services/lensPipeline';
import { analyzeOcrText } from '../ayrovix/services/ocrPrices';
import { ocrRecognize } from '../services/vision';
import { discoveryAggregates, recordLensEvaluation } from '../assistant/learning';
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
import {
  GenerateMagazineInput,
  MagazineAgentProviderError,
  MagazineAgentUnavailableError,
  deleteMagazineDraft,
  generateMagazineContent,
  getMagazineDraft,
  listMagazineDrafts,
  magazineAgentCapabilities,
  prepareMagazineDraft,
} from '../magazine/service';

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
    fields: ['category','media_type','media_url','secondary_images','title','description','cta','target_url','product_id','arrival_id','promotion_id','publish_at','expires_at','priority','status'],
    required: ['media_type','media_url','title','publish_at','status'], searchable: ['title','description','cta'],
    sortable: ['title','media_type','publish_at','expires_at','priority','status','created_at'], defaultSort: 'priority',
    jsonFields: ['secondary_images'],
    enums: { category: ['ARRIVAGE','NEW','STYLE','INFO','PROMO'], media_type: ['IMAGE','VIDEO'], status: ['DRAFT','SCHEDULED','PUBLISHED','EXPIRED'] },
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
  announcements: {
    table: 'announcement_messages', module: 'ANNOUNCEMENTS', prefix: 'announcement', permission: 'content:write',
    fields: ['text','display_order','active'], required: ['text'],
    searchable: ['text'], sortable: ['text','display_order','active','created_at'], defaultSort: 'display_order',
    softDelete: { active: 0 },
  },
  'ai-knowledge': {
    table: 'ai_knowledge', module: 'AI_KNOWLEDGE', prefix: 'knowledge', permission: 'settings:write',
    fields: ['category','question','answer','keywords','priority','active'], required: ['category','answer'],
    searchable: ['question','answer','category'], sortable: ['category','priority','active','created_at'], defaultSort: 'priority',
    jsonFields: ['keywords'], enums: { category: ['FAQ','PREDEFINED_RESPONSE','DELIVERY','PAYMENT','BRAND','ARRIVAL','PROMOTION','GENERAL'] }, softDelete: { active: 0 },
  },
};

const orderStatuses = ['CREATED','AWAITING_DEPOSIT','AWAITING_PAYMENT_VERIFICATION','CONFIRMED','PREPARING','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
const paymentStatuses = ['PENDING','PENDING_VERIFICATION','PAID','PARTIALLY_PAID','FAILED','REJECTED','REFUNDED'];
const deliveryStatuses = ['PENDING','PREPARING','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED'];
const adminRoles: AdminRole[] = ['SUPER_ADMIN','ADMIN','CONTENT_MANAGER','ORDER_MANAGER'];
const ayrovixReviewStatuses: AyrovixReviewStatus[] = ['PENDING','IN_REVIEW','QUOTED','REJECTED','CANCELLED'];
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const magazineGenerationInFlight = new Set<string>();

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

function normalizePublicationLifecycle(resource: string, payload: Record<string, any>, existing?: Record<string, any>) {
  if (resource !== 'news') return;
  const status = String(payload.status ?? existing?.status ?? '');
  const publication = String(payload.published_at ?? existing?.published_at ?? '');
  const publicationTime = new Date(publication).getTime();
  const now = Date.now();
  if (status === 'SCHEDULED' && (!Number.isFinite(publicationTime) || publicationTime <= now)) {
    throw new Error('Pour programmer la publication, choisissez une date future. Pour publier immédiatement, utilisez le statut PUBLISHED.');
  }
  // PUBLISHED signifie explicitement «publier maintenant». Une date future avec ce statut
  // produisait auparavant une fausse pastille «Publié» tout en restant invisible au public.
  if (status === 'PUBLISHED' && Number.isFinite(publicationTime) && publicationTime > now) {
    payload.published_at = new Date(now).toISOString();
  }
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
  if (resource === 'news' && result.published_at) {
    const future = new Date(result.published_at).getTime() > Date.now();
    // توافق مع السجلات القديمة التي كانت تستخدم PUBLISHED للجدولة المستقبلية.
    if (result.status === 'PUBLISHED' && future) result.status = 'SCHEDULED';
    else if (result.status === 'SCHEDULED' && !future) result.status = 'PUBLISHED';
  }
  return result;
}

function recomputeProductPricing(db: QatafoDatabase, payload: Record<string, any>, existing?: any) {
  const originalPrice = payload.original_price ?? existing?.original_price;
  const currency = payload.currency ?? existing?.currency;
  if (originalPrice === undefined || !currency) return;
  const breakdown = calculatePrice(db.getPricingRules(), Number(originalPrice), String(currency), {
    express: false, title: String(payload.name || existing?.name || ''),
  });
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


  /* ==================== TRUST BAR — إدارة كاملة للمحتوى، التصميم محكوم بالهوية ==================== */
  const TRUST_BAR_ICONS = new Set(['ShieldCheck', 'Truck', 'Lock', 'Zap', 'MessageCircle', 'PackageCheck', 'Phone', 'CreditCard', 'MapPin', 'Star', 'CheckCircle2', 'RefreshCw', 'Bell', 'Globe2']);
  const trustItemRow = (row: any) => ({
    id: row.id, title: row.title, description: row.description, icon: row.icon,
    enabled: Boolean(row.enabled), sortOrder: row.sort_order,
    titleColor: row.title_color, descriptionColor: row.description_color, iconColor: row.icon_color,
    createdAt: row.created_at, updatedAt: row.updated_at,
  });
  const validColor = (value: unknown, fallback: string): string => {
    const text = String(value || '').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(text) || /^rgba?\([^)]+\)$/.test(text)) return text.slice(0, 60);
    return fallback;
  };

  router.get('/trust-bar', requireAdmin(db, 'content:read'), (_req, res) => {
    const settings = db.get<any>(`SELECT * FROM trust_bar_settings WHERE id='global'`);
    const items = db.all<any>('SELECT * FROM trust_bar_items ORDER BY sort_order,id');
    res.json({ success: true, data: { items: items.map(trustItemRow), settings } });
  });

  router.post('/trust-bar/items', requireAdmin(db, 'content:write'), (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 80);
    const description = String(req.body?.description || '').trim().slice(0, 160);
    const icon = String(req.body?.icon || 'ShieldCheck');
    if (title.length < 2) return res.status(400).json({ success: false, error: 'Titre requis.' });
    if (!TRUST_BAR_ICONS.has(icon)) return res.status(400).json({ success: false, error: 'Icône non autorisée — choisissez dans la bibliothèque.' });
    const now = new Date().toISOString();
    const id = `trust_${randomUUID()}`;
    const nextOrder = Number(db.get<any>('SELECT MAX(sort_order) maxOrder FROM trust_bar_items')?.maxOrder || 0) + 1;
    db.run(`INSERT INTO trust_bar_items (id,title,description,icon,enabled,sort_order,title_color,description_color,icon_color,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, title, description, icon, req.body?.enabled === false ? 0 : 1, Math.min(999, Math.max(1, Number(req.body?.sortOrder) || nextOrder)),
      validColor(req.body?.titleColor, ''), validColor(req.body?.descriptionColor, ''), validColor(req.body?.iconColor, ''), now, now);
    audit(db, req, 'CREATE', 'TRUST_BAR', id, null, { title });
    res.json({ success: true, data: trustItemRow(db.get<any>('SELECT * FROM trust_bar_items WHERE id=?', id)) });
  });

  router.put('/trust-bar/items/:id', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM trust_bar_items WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Élément introuvable.' });
    const icon = String(req.body?.icon ?? existing.icon);
    if (!TRUST_BAR_ICONS.has(icon)) return res.status(400).json({ success: false, error: 'Icône non autorisée.' });
    db.run(`UPDATE trust_bar_items SET title=?,description=?,icon=?,enabled=?,sort_order=?,title_color=?,description_color=?,icon_color=?,updated_at=? WHERE id=?`,
      String(req.body?.title ?? existing.title).trim().slice(0, 80) || existing.title,
      String(req.body?.description ?? existing.description).trim().slice(0, 160),
      icon,
      req.body?.enabled === undefined ? existing.enabled : (req.body.enabled ? 1 : 0),
      req.body?.sortOrder === undefined ? existing.sort_order : Math.min(999, Math.max(1, Number(req.body.sortOrder) || existing.sort_order)),
      req.body?.titleColor === undefined ? existing.title_color : validColor(req.body.titleColor, ''),
      req.body?.descriptionColor === undefined ? existing.description_color : validColor(req.body.descriptionColor, ''),
      req.body?.iconColor === undefined ? existing.icon_color : validColor(req.body.iconColor, ''),
      new Date().toISOString(), existing.id);
    audit(db, req, 'UPDATE', 'TRUST_BAR', existing.id, trustItemRow(existing), trustItemRow(db.get<any>('SELECT * FROM trust_bar_items WHERE id=?', existing.id)));
    res.json({ success: true, data: trustItemRow(db.get<any>('SELECT * FROM trust_bar_items WHERE id=?', existing.id)) });
  });

  router.delete('/trust-bar/items/:id', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM trust_bar_items WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Élément introuvable.' });
    db.run('DELETE FROM trust_bar_items WHERE id=?', existing.id);
    audit(db, req, 'DELETE', 'TRUST_BAR', existing.id, trustItemRow(existing), null);
    res.json({ success: true });
  });

  router.put('/trust-bar/reorder', requireAdmin(db, 'content:write'), (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 20) : [];
    if (!ids.length) return res.status(400).json({ success: false, error: 'Liste d’ordre vide.' });
    const now = new Date().toISOString();
    db.transaction(() => {
      ids.forEach((id, index) => db.run('UPDATE trust_bar_items SET sort_order=?,updated_at=? WHERE id=?', index + 1, now, id));
    });
    audit(db, req, 'UPDATE', 'TRUST_BAR', 'reorder', null, { ids });
    res.json({ success: true });
  });

  router.put('/trust-bar/settings', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>(`SELECT * FROM trust_bar_settings WHERE id='global'`);
    db.run(`UPDATE trust_bar_settings SET background_color=?,title_color=?,description_color=?,accent_color=?,divider_color=?,enabled=?,updated_at=? WHERE id='global'`,
      validColor(req.body?.backgroundColor, existing?.background_color || '#111217'),
      validColor(req.body?.titleColor, existing?.title_color || '#FFFFFF'),
      validColor(req.body?.descriptionColor, existing?.description_color || 'rgba(255,255,255,0.68)'),
      validColor(req.body?.accentColor, existing?.accent_color || '#FF7A00'),
      validColor(req.body?.dividerColor, existing?.divider_color || 'rgba(255,255,255,0.15)'),
      req.body?.enabled === undefined ? (existing?.enabled ?? 1) : (req.body.enabled ? 1 : 0),
      new Date().toISOString());
    audit(db, req, 'UPDATE', 'TRUST_BAR', 'settings', null, null);
    res.json({ success: true, data: db.get<any>(`SELECT * FROM trust_bar_settings WHERE id='global'`) });
  });

  /* ==================== HERO MANAGEMENT — Visual واحد نشط، محتوى الـ Hero غير قابل للتعديل ==================== */
  const heroUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 2 } });

  /* ==================== LENS SECTION — إدارة كاملة للمحتوى (Dashboard = source of truth) ==================== */
  const LENS_ELEMENT_ORDER = ['eyebrow', 'title', 'description', 'cta', 'proof'] as const;
  const HERO_ELEMENT_ORDER = ['eyebrow', 'title', 'description', 'cta'] as const;

  /** ترتيب العناصر: يُحافظ على القيم المعروفة ويُلحق الناقصة في النهاية (لا يُفقد أي عنصر) */
  const normalizeElementOrder = (value: unknown, allowed: readonly string[], fallback: string): string => {
    const requested = String(value ?? '').split(',').map((token) => token.trim().toLowerCase()).filter(Boolean);
    const kept = requested.filter((token, index) => allowed.includes(token as never) && requested.indexOf(token) === index);
    allowed.forEach((token) => { if (!kept.includes(token)) kept.push(token); });
    return kept.length ? kept.join(',') : fallback;
  };

  /** رابط CTA: مسار داخلي، anchor، أو URL http(s) عامة آمنة — javascript: وغيرها مرفوضة */
  const normalizeCtaUrl = (value: unknown): string => {
    if (value === undefined) return '';
    const raw = String(value ?? '').trim().slice(0, 500);
    if (!raw) return '';
    if (raw.startsWith('#')) return raw;
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return parsePublicHttpUrl(raw).toString();
  };

  const lensUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 2 } });

  const lensRowForApi = (row: any) => (row ? {
    eyebrow: row.eyebrow, title: row.title, description: row.description,
    ctaLabel: row.cta_label, ctaUrl: row.cta_url || '', proofLine: row.proof_line || '',
    accentColor: row.accent_color || '#FF7A00', elementOrder: row.element_order || LENS_ELEMENT_ORDER.join(','),
    bgType: row.bg_type, bgColor: row.bg_color, bgImage: row.bg_image,
    overlayStrength: row.overlay_strength, focalX: row.focal_x, focalY: row.focal_y,
    phoneEnabled: Boolean(row.phone_enabled), enabled: Boolean(row.enabled), sortOrder: Number(row.sort_order ?? 40),
    phone: {
      image: row.phone_image || '', statusLabel: row.phone_status_label || '', resultLabel: row.phone_result_label || '',
      productName: row.phone_product_name || '', priceChip: row.phone_price_chip || '', metaChip: row.phone_meta_chip || '',
      stockChip: row.phone_stock_chip || '', ctaLabel: row.phone_cta_label || '',
    },
    updatedAt: row.updated_at,
  } : null);

  router.get('/lens-hero', requireAdmin(db, 'content:read'), (_req, res) => {
    res.json({ success: true, data: lensRowForApi(db.get<any>("SELECT * FROM lens_hero_settings WHERE id='global'")) });
  });

  router.put('/lens-hero', requireAdmin(db, 'content:write'), lensUpload.fields([{ name: 'bgImage', maxCount: 1 }, { name: 'phoneImage', maxCount: 1 }]), async (req, res) => {
    const existing = db.get<any>("SELECT * FROM lens_hero_settings WHERE id='global'");
    if (!existing) return res.status(404).json({ success: false, error: 'Paramètres LENS introuvables.' });
    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    let bgImage = req.body.bgImage !== undefined ? String(req.body.bgImage) : existing.bg_image;
    let phoneImage = req.body.phoneImage !== undefined ? String(req.body.phoneImage) : existing.phone_image;
    const storeUpload = async (file: Express.Multer.File | undefined, role: 'desktop' | 'mobile') => {
      if (!file) return null;
      try { return (await storeHeroImage(file, `lens_${randomUUID().slice(0, 8)}`, role)).url; }
      catch (error: any) { throw new Error(`${role === 'desktop' ? 'Image de fond' : 'Visuel du mockup'} — ${error?.message || 'invalide'}`); }
    };
    try {
      const storedBg = await storeUpload(files.bgImage?.[0], 'desktop');
      if (storedBg) bgImage = storedBg;
      const storedPhone = await storeUpload(files.phoneImage?.[0], 'mobile');
      if (storedPhone) phoneImage = storedPhone;
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Image invalide.' });
    }
    if (req.body.removeImage === 'true' || req.body.removeImage === true) bgImage = '';
    if (req.body.removePhoneImage === 'true' || req.body.removePhoneImage === true) phoneImage = '';

    let ctaUrl = existing.cta_url || '';
    if (req.body.ctaUrl !== undefined) {
      try { ctaUrl = normalizeCtaUrl(req.body.ctaUrl); }
      catch { return res.status(400).json({ success: false, error: 'Lien CTA invalide — utilisez une URL https:// ou un chemin interne /…' }); }
    }

    const bgType = req.body.bgType === 'IMAGE' ? 'IMAGE' : 'COLOR';
    const validColor = (value: unknown, fallback: string) => (/^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? String(value) : fallback);
    const clamp = (value: unknown, fallback: number) => Math.min(1, Math.max(0, Number(value ?? fallback) || 0));
    const text = (value: unknown, fallback: string, max: number) => String(value ?? fallback).slice(0, max);
    db.run(`UPDATE lens_hero_settings SET eyebrow=?,title=?,description=?,cta_label=?,cta_url=?,proof_line=?,accent_color=?,element_order=?,
      bg_type=?,bg_color=?,bg_image=?,overlay_strength=?,focal_x=?,focal_y=?,phone_enabled=?,enabled=?,sort_order=?,
      phone_image=?,phone_status_label=?,phone_result_label=?,phone_product_name=?,phone_price_chip=?,phone_meta_chip=?,phone_stock_chip=?,phone_cta_label=?,
      updated_at=? WHERE id='global'`,
      text(req.body.eyebrow, existing.eyebrow, 40) || 'LENS',
      text(req.body.title, existing.title, 160) || existing.title,
      text(req.body.description, existing.description, 400),
      text(req.body.ctaLabel, existing.cta_label, 40) || 'Ouvrir LENS',
      ctaUrl,
      text(req.body.proofLine, existing.proof_line, 120),
      validColor(req.body.accentColor, existing.accent_color || '#FF7A00'),
      normalizeElementOrder(req.body.elementOrder, LENS_ELEMENT_ORDER, LENS_ELEMENT_ORDER.join(',')),
      bgType,
      validColor(req.body.bgColor, existing.bg_color),
      bgImage,
      clamp(req.body.overlayStrength, existing.overlay_strength),
      clamp(req.body.focalX, existing.focal_x),
      clamp(req.body.focalY, existing.focal_y),
      req.body.phoneEnabled === undefined ? existing.phone_enabled : (req.body.phoneEnabled ? 1 : 0),
      req.body.enabled === undefined ? existing.enabled : (req.body.enabled ? 1 : 0),
      Math.min(999, Math.max(0, Number(req.body.sortOrder ?? existing.sort_order) || 0)),
      phoneImage,
      text(req.body.phone?.statusLabel ?? req.body.phoneStatusLabel, existing.phone_status_label, 40),
      text(req.body.phone?.resultLabel ?? req.body.phoneResultLabel, existing.phone_result_label, 40),
      text(req.body.phone?.productName ?? req.body.phoneProductName, existing.phone_product_name, 80),
      text(req.body.phone?.priceChip ?? req.body.phonePriceChip, existing.phone_price_chip, 40),
      text(req.body.phone?.metaChip ?? req.body.phoneMetaChip, existing.phone_meta_chip, 40),
      text(req.body.phone?.stockChip ?? req.body.phoneStockChip, existing.phone_stock_chip, 40),
      text(req.body.phone?.ctaLabel ?? req.body.phoneCtaLabel, existing.phone_cta_label, 40),
      new Date().toISOString());
    audit(db, req, 'UPDATE', 'LENS_HERO', 'global', null, null);
    res.json({ success: true, data: lensRowForApi(db.get<any>("SELECT * FROM lens_hero_settings WHERE id='global'")) });
  });

  /* ==================== HERO CONTENT — العنوان/الوصف/CTA من الـ Dashboard ==================== */
  const heroContentRowForApi = (row: any) => (row ? {
    eyebrow: row.eyebrow, title: row.title, highlight: row.highlight, description: row.description,
    ctaLabel: row.cta_label, ctaUrl: row.cta_url, accentColor: row.accent_color,
    elementOrder: row.element_order, enabled: Boolean(row.enabled), sortOrder: Number(row.sort_order ?? 10),
    updatedAt: row.updated_at,
  } : null);

  router.get('/hero-content', requireAdmin(db, 'content:read'), (_req, res) => {
    res.json({ success: true, data: heroContentRowForApi(db.get<any>("SELECT * FROM hero_content_settings WHERE id='global'")) });
  });

  router.put('/hero-content', requireAdmin(db, 'content:write'), async (req, res) => {
    const existing = db.get<any>("SELECT * FROM hero_content_settings WHERE id='global'");
    if (!existing) return res.status(404).json({ success: false, error: 'Contenu Hero introuvable.' });
    let ctaUrl = existing.cta_url || '';
    if (req.body.ctaUrl !== undefined) {
      try { ctaUrl = normalizeCtaUrl(req.body.ctaUrl); }
      catch { return res.status(400).json({ success: false, error: 'Lien CTA invalide — utilisez une URL https:// ou un chemin interne /…' }); }
    }
    const title = String(req.body.title ?? existing.title).replace(/\r\n/g, '\n').slice(0, 200);
    if (!title.trim()) return res.status(400).json({ success: false, error: 'Le titre du Hero est obligatoire.' });
    const validColor = (value: unknown, fallback: string) => (/^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? String(value) : fallback);
    db.run(`UPDATE hero_content_settings SET eyebrow=?,title=?,highlight=?,description=?,cta_label=?,cta_url=?,accent_color=?,element_order=?,enabled=?,sort_order=?,updated_at=? WHERE id='global'`,
      String(req.body.eyebrow ?? existing.eyebrow).slice(0, 40),
      title,
      String(req.body.highlight ?? existing.highlight).slice(0, 40),
      String(req.body.description ?? existing.description).slice(0, 400),
      String(req.body.ctaLabel ?? existing.cta_label).slice(0, 40),
      ctaUrl,
      validColor(req.body.accentColor, existing.accent_color),
      normalizeElementOrder(req.body.elementOrder, HERO_ELEMENT_ORDER, HERO_ELEMENT_ORDER.join(',')),
      req.body.enabled === undefined ? existing.enabled : (req.body.enabled ? 1 : 0),
      Math.min(999, Math.max(0, Number(req.body.sortOrder ?? existing.sort_order) || 0)),
      new Date().toISOString());
    invalidateHeroVisualCache();
    audit(db, req, 'UPDATE', 'HERO_CONTENT', 'global', null, null);
    res.json({ success: true, data: heroContentRowForApi(db.get<any>("SELECT * FROM hero_content_settings WHERE id='global'")) });
  });

  /* ==================== HOME BLOCKS — ترتيب وإظهار كتل الصفحة الرئيسية ==================== */
  const HOME_BLOCK_IDS = ['transition', 'discovery', 'brands', 'lens', 'lens-features'] as const;

  router.get('/home-blocks', requireAdmin(db, 'content:read'), (_req, res) => {
    const rows = db.all<any>('SELECT id,sort_order sortOrder,visible FROM home_blocks ORDER BY sort_order,id');
    res.json({ success: true, data: rows.map((row) => ({ id: row.id, sortOrder: row.sortOrder, visible: Boolean(row.visible) })) });
  });

  router.put('/home-blocks', requireAdmin(db, 'content:write'), (req, res) => {
    const incoming = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    if (!incoming.length) return res.status(400).json({ success: false, error: 'Aucun bloc reçu.' });
    const now = new Date().toISOString();
    incoming.forEach((block: any, index: number) => {
      const id = String(block?.id || '');
      if (!HOME_BLOCK_IDS.includes(id as never)) return;
      const existing = db.get<any>('SELECT id FROM home_blocks WHERE id=?', id);
      if (existing) db.run('UPDATE home_blocks SET sort_order=?,visible=?,updated_at=? WHERE id=?', index, block?.visible === false ? 0 : 1, now, id);
      else db.run('INSERT INTO home_blocks (id,sort_order,visible,updated_at) VALUES (?,?,?,?)', id, index, block?.visible === false ? 0 : 1, now);
    });
    audit(db, req, 'UPDATE', 'HOME_BLOCKS', 'all', null, null);
    const rows = db.all<any>('SELECT id,sort_order sortOrder,visible FROM home_blocks ORDER BY sort_order,id');
    res.json({ success: true, data: rows.map((row) => ({ id: row.id, sortOrder: row.sortOrder, visible: Boolean(row.visible) })) });
  });

  const heroRowForAdmin = (row: any) => ({
    id: row.id, imageUrl: row.image_url, imageWidth: row.image_width, imageHeight: row.image_height,
    mobileImageUrl: row.mobile_image_url, altText: row.alt_text, focalX: row.focal_x, focalY: row.focal_y,
    mobileFocalX: row.mobile_focal_x ?? 0.5, mobileFocalY: row.mobile_focal_y ?? 0.5,
    overlayMode: row.overlay_mode === 'MANUAL' ? 'MANUAL' : 'AUTO', overlayStrength: row.overlay_strength, analysis: row.analysis_json || '',
    orientationOverride: row.orientation_override || 'AUTO',
    status: row.status, startDate: row.start_date, endDate: row.end_date, priority: row.priority,
    createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at,
  });

  router.get('/hero-visuals', requireAdmin(db, 'content:read'), (_req, res) => {
    const rows = db.all<any>(`SELECT * FROM hero_visuals WHERE status!='ARCHIVED' ORDER BY created_at DESC`);
    res.json({ success: true, data: rows.map(heroRowForAdmin), active: resolveActiveHeroVisual(db) });
  });

  router.post('/hero-visuals', requireAdmin(db, 'content:write'), heroUpload.fields([
    { name: 'image', maxCount: 1 }, { name: 'mobileImage', maxCount: 1 },
  ]), async (req, res) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const imageFile = files?.image?.[0];
      if (!imageFile) return res.status(400).json({ success: false, error: 'Image principale requise.' });
      const id = newHeroVisualId();
      const stored = await storeHeroImage(imageFile, id, 'desktop');
      let mobileStored: Awaited<ReturnType<typeof storeHeroImage>> | null = null;
      if (files?.mobileImage?.[0]) {
        try { mobileStored = await storeHeroImage(files.mobileImage[0], id, 'mobile'); }
        catch (error: any) { return res.status(400).json({ success: false, error: `Image mobile — ${error?.message || 'invalide'}` }); }
      }
      const { startDate, endDate } = normalizeSchedule(req.body.startDate, req.body.endDate);
      const now = new Date().toISOString();
      const priority = Math.min(999, Math.max(0, Number(req.body.priority) || 0));
      const orientationOverride = ['AUTO', 'LANDSCAPE', 'PORTRAIT'].includes(String(req.body.orientationOverride)) ? String(req.body.orientationOverride) : 'AUTO';
      const overlayMode = req.body.overlayMode === 'MANUAL' ? 'MANUAL' : 'AUTO';
      const overlayStrength = req.body.overlayStrength === undefined || req.body.overlayStrength === '' || req.body.overlayStrength === null
        ? null : Math.min(1, Math.max(0, Number(req.body.overlayStrength)));
      const analysisJson = JSON.stringify(stored.analysis || null);
      db.run(`INSERT INTO hero_visuals
        (id,image_url,image_width,image_height,mobile_image_url,alt_text,focal_x,focal_y,mobile_focal_x,mobile_focal_y,overlay_mode,overlay_strength,analysis_json,orientation_override,status,start_date,end_date,priority,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?,?)`,
        id, stored.url, stored.width, stored.height, mobileStored?.url || '', String(req.body.altText || '').slice(0, 200),
        Math.min(1, Math.max(0, Number(req.body.focalX ?? 0.5))), Math.min(1, Math.max(0, Number(req.body.focalY ?? 0.5))),
        Math.min(1, Math.max(0, Number(req.body.mobileFocalX ?? 0.5))), Math.min(1, Math.max(0, Number(req.body.mobileFocalY ?? 0.5))),
        overlayMode, overlayStrength, analysisJson, orientationOverride,
        startDate, endDate, priority, now, now);
      audit(db, req, 'CREATE', 'HERO', id, null, { image_url: stored.url });
      const row = db.get<any>('SELECT * FROM hero_visuals WHERE id=?', id);
      return res.json({ success: true, data: heroRowForAdmin(row), meta: { desktop: stored, mobile: mobileStored } });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Téléversement invalide.' });
    }
  });

  router.put('/hero-visuals/:id', requireAdmin(db, 'content:write'), heroUpload.fields([
    { name: 'image', maxCount: 1 }, { name: 'mobileImage', maxCount: 1 },
  ]), async (req, res) => {
    const existing = db.get<any>('SELECT * FROM hero_visuals WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Visual introuvable.' });
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      let imageUrl = existing.image_url;
      let imageWidth = existing.image_width;
      let imageHeight = existing.image_height;
      let newAnalysis: string | null = null;
      if (files?.image?.[0]) {
        const stored = await storeHeroImage(files.image[0], existing.id, 'desktop');
        imageUrl = stored.url; imageWidth = stored.width; imageHeight = stored.height;
        if (stored.analysis) newAnalysis = JSON.stringify(stored.analysis);
        deleteHeroVisualFiles(existing.image_url, '');
      }
      let mobileImageUrl = req.body.mobileImageUrl !== undefined ? String(req.body.mobileImageUrl) : existing.mobile_image_url;
      if (files?.mobileImage?.[0]) {
        const stored = await storeHeroImage(files.mobileImage[0], existing.id, 'mobile');
        mobileImageUrl = stored.url;
        deleteHeroVisualFiles('', existing.mobile_image_url);
      }
      const { startDate, endDate } = normalizeSchedule(
        req.body.startDate !== undefined ? req.body.startDate : existing.start_date,
        req.body.endDate !== undefined ? req.body.endDate : existing.end_date,
      );
      const now = new Date().toISOString();
      const nextOverlayMode = req.body.overlayMode === 'MANUAL' ? 'MANUAL' : req.body.overlayMode === 'AUTO' ? 'AUTO' : (existing.overlay_mode || 'AUTO');
      const nextOrientationOverride = ['AUTO', 'LANDSCAPE', 'PORTRAIT'].includes(String(req.body.orientationOverride))
        ? String(req.body.orientationOverride)
        : (req.body.orientationOverride === undefined ? (existing.orientation_override || 'AUTO') : 'AUTO');
      const nextOverlayStrength = req.body.overlayStrength === undefined ? existing.overlay_strength : (req.body.overlayStrength === '' || req.body.overlayStrength === null ? null : Math.min(1, Math.max(0, Number(req.body.overlayStrength))));
      const analysisJson = newAnalysis ?? (existing.analysis_json || '');
      db.run(`UPDATE hero_visuals SET image_url=?,image_width=?,image_height=?,mobile_image_url=?,alt_text=?,focal_x=?,focal_y=?,mobile_focal_x=?,mobile_focal_y=?,overlay_mode=?,overlay_strength=?,analysis_json=?,orientation_override=?,
        start_date=?,end_date=?,priority=?,updated_at=? WHERE id=?`,
        imageUrl, imageWidth, imageHeight, mobileImageUrl,
        String(req.body.altText !== undefined ? req.body.altText : existing.alt_text).slice(0, 200),
        Math.min(1, Math.max(0, Number(req.body.focalX !== undefined ? req.body.focalX : existing.focal_x))),
        Math.min(1, Math.max(0, Number(req.body.focalY !== undefined ? req.body.focalY : existing.focal_y))),
        Math.min(1, Math.max(0, Number(req.body.mobileFocalX !== undefined ? req.body.mobileFocalX : existing.mobile_focal_x ?? 0.5))),
        Math.min(1, Math.max(0, Number(req.body.mobileFocalY !== undefined ? req.body.mobileFocalY : existing.mobile_focal_y ?? 0.5))),
        nextOverlayMode, nextOverlayStrength, analysisJson, nextOrientationOverride,
        startDate, endDate,
        Math.min(999, Math.max(0, Number(req.body.priority !== undefined ? req.body.priority : existing.priority))),
        now, existing.id);
      invalidateHeroVisualCache();
      audit(db, req, 'UPDATE', 'HERO', existing.id, heroRowForAdmin(existing), heroRowForAdmin(db.get<any>('SELECT * FROM hero_visuals WHERE id=?', existing.id)));
      return res.json({ success: true, data: heroRowForAdmin(db.get<any>('SELECT * FROM hero_visuals WHERE id=?', existing.id)) });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Mise à jour invalide.' });
    }
  });

  router.post('/hero-visuals/:id/publish', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM hero_visuals WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Visual introuvable.' });
    const now = new Date().toISOString();
    db.run(`UPDATE hero_visuals SET status='PUBLISHED', published_at=?, updated_at=? WHERE id=?`, now, now, existing.id);
    invalidateHeroVisualCache();
    audit(db, req, 'PUBLISH', 'HERO', existing.id, null, null);
    res.json({ success: true, data: heroRowForAdmin(db.get<any>('SELECT * FROM hero_visuals WHERE id=?', existing.id)), active: resolveActiveHeroVisual(db) });
  });

  router.post('/hero-visuals/:id/unpublish', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM hero_visuals WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Visual introuvable.' });
    db.run(`UPDATE hero_visuals SET status='DRAFT', published_at=NULL, updated_at=? WHERE id=?`, new Date().toISOString(), existing.id);
    invalidateHeroVisualCache();
    audit(db, req, 'UNPUBLISH', 'HERO', existing.id, null, null);
    res.json({ success: true, data: heroRowForAdmin(db.get<any>('SELECT * FROM hero_visuals WHERE id=?', existing.id)), active: resolveActiveHeroVisual(db) });
  });

  router.delete('/hero-visuals/:id', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM hero_visuals WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Visual introuvable.' });
    deleteHeroVisualFiles(existing.image_url, existing.mobile_image_url);
    db.run('DELETE FROM hero_visuals WHERE id=?', existing.id);
    invalidateHeroVisualCache();
    audit(db, req, 'DELETE', 'HERO', existing.id, heroRowForAdmin(existing), null);
    res.json({ success: true, active: resolveActiveHeroVisual(db) });
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

  /* ===== AYROVI Lens Test Lab + AI Discovery (évaluation humaine, aucun auto-changement) ===== */
  const labUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });

  router.post('/lens-lab/run', requireAdmin(db, 'settings:write'), labUpload.single('image'), async (req, res) => {
    const file = req.file;
    if (!file?.buffer?.length) return res.status(400).json({ success: false, error: 'Image requise.' });
    try {
      const normalized = await normalizeUploadedImage(file.buffer, file.mimetype);
      const started = Date.now();
      const lens = await runLensPipeline(db, normalized.buffer, normalized.mimeType);
      const ocrText = await ocrRecognize(normalized.buffer).catch(() => '');
      const ocr = ocrText ? analyzeOcrText(ocrText) : null;
      const durationMs = Date.now() - started;
      const id = `lab_${randomUUID()}`;
      db.run(`INSERT INTO lens_lab_runs (id,image_hash,question,result_json,duration_ms,created_at) VALUES (?,?,?,?,?,?)`,
        id, hashImage(normalized.buffer), String(req.body?.question || '').slice(0, 300),
        JSON.stringify({ lens, ocr }).slice(0, 20000), durationMs, new Date().toISOString());
      res.json({ success: true, data: { id, lens, ocr, durationMs } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'Analyse impossible.' });
    }
  });

  router.get('/lens-lab/history', requireAdmin(db, 'reports:read'), (req, res) => {
    const rows = db.all<any>(`SELECT id,image_hash,question,duration_ms,created_at,result_json FROM lens_lab_runs ORDER BY created_at DESC LIMIT 30`);
    res.json({ success: true, data: rows.map((row) => {
      let pricing = null; let confidence = 0; let verified = false;
      try { const parsed = JSON.parse(row.result_json); pricing = parsed?.lens?.pricing || null; confidence = parsed?.lens?.confidence || 0; verified = Boolean(parsed?.lens?.verified); } catch { /* */ }
      return { id: row.id, imageHash: row.image_hash, question: row.question, durationMs: row.duration_ms, createdAt: row.created_at, pricing, confidence, verified };
    }) });
  });

  router.post('/lens-lab/:id/evaluate', requireAdmin(db, 'settings:write'), (req, res) => {
    const run = db.get<any>(`SELECT * FROM lens_lab_runs WHERE id=?`, req.params.id);
    if (!run) return res.status(404).json({ success: false, error: 'Run introuvable.' });
    const expectedPrice = Number(req.body?.expectedPrice);
    if (!Number.isFinite(expectedPrice) || expectedPrice <= 0) return res.status(400).json({ success: false, error: 'Prix attendu invalide.' });
    const expectedCurrency = /^[A-Z]{3}$/.test(String(req.body?.expectedCurrency || '').toUpperCase()) ? String(req.body.expectedCurrency).toUpperCase() : null;
    let actual: any = {};
    try { actual = JSON.parse(run.result_json)?.lens || {}; } catch { /* */ }
    const detected = actual?.pricing?.sale_price ?? actual?.pricing?.total_price ?? null;
    const errorType = String(req.body?.errorType || '').trim() || (detected == null ? 'PRICE_MISSED' : 'NONE');
    recordLensEvaluation(db, {
      imageHash: run.image_hash,
      expected: { price: expectedPrice, currency: expectedCurrency },
      actual: { price: detected, currency: actual?.pricing?.currency || null, confidence: actual?.confidence || 0 },
      errorType, note: String(req.body?.note || '').slice(0, 500), source: 'lab',
    });
    res.json({ success: true, data: { errorType } });
  });

  /* ===== Social : Publications & Reels (cahier des charges) ===== */
  const socialList = (table: string, res: Response) => {
    res.json({ success: true, data: db.all<any>(`SELECT * FROM ${table} ORDER BY publish_at DESC`) });
  };

  router.get('/publications', requireAdmin(db, 'content:read'), (_req, res) => socialList('publications', res));
  router.post('/publications', requireAdmin(db, 'content:write'), (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 150);
    const channelId = String(req.body?.channel_id || '');
    const imageUrl = String(req.body?.image_url || '').slice(0, 500);
    if (!title || !imageUrl || !db.get('SELECT id FROM story_publishers WHERE id=?', channelId)) {
      return res.status(400).json({ success: false, error: 'Titre, image et canal obligatoires.' });
    }
    const now = new Date().toISOString();
    const id = `publication_${randomUUID()}`;
    db.run(`INSERT INTO publications (id,title,subtitle,channel_id,image_url,remark,publish_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id, title, String(req.body?.subtitle || '').slice(0, 150), channelId, imageUrl, String(req.body?.remark || ''),
      req.body?.publish_at ? String(req.body.publish_at) : now, ['brouillon','publie','archive'].includes(req.body?.status) ? req.body.status : 'brouillon', now, now);
    res.status(201).json({ success: true, data: { id } });
  });
  router.put('/publications/:id', requireAdmin(db, 'content:write'), (req, res) => {
    const row = db.get<any>(`SELECT * FROM publications WHERE id=?`, req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Publication introuvable.' });
    db.run(`UPDATE publications SET title=?, subtitle=?, image_url=?, remark=?, publish_at=?, status=?, updated_at=? WHERE id=?`,
      String(req.body?.title ?? row.title).slice(0, 150), String(req.body?.subtitle ?? row.subtitle).slice(0, 150),
      String(req.body?.image_url ?? row.image_url).slice(0, 500), String(req.body?.remark ?? row.remark),
      req.body?.publish_at ? String(req.body.publish_at) : row.publish_at,
      ['brouillon','publie','archive'].includes(req.body?.status) ? req.body.status : row.status,
      new Date().toISOString(), req.params.id);
    res.json({ success: true });
  });
  router.delete('/publications/:id', requireAdmin(db, 'content:write'), (req, res) => {
    db.run(`DELETE FROM publications WHERE id=?`, req.params.id);
    res.json({ success: true });
  });

  router.get('/reels', requireAdmin(db, 'content:read'), (_req, res) => socialList('reels', res));
  router.post('/reels', requireAdmin(db, 'content:write'), (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 150);
    const channelId = String(req.body?.channel_id || '');
    const videoUrl = String(req.body?.video_url || '').slice(0, 500);
    if (!title || !videoUrl || !db.get('SELECT id FROM story_publishers WHERE id=?', channelId)) {
      return res.status(400).json({ success: false, error: 'Titre, vidéo et canal obligatoires.' });
    }
    const now = new Date().toISOString();
    const id = `reel_${randomUUID()}`;
    db.run(`INSERT INTO reels (id,title,channel_id,description,video_url,duration_seconds,publish_at,status,views,likes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,?,?)`,
      id, title, channelId, String(req.body?.description || ''), videoUrl,
      Number.isFinite(Number(req.body?.duration_seconds)) ? Math.max(0, Math.round(Number(req.body.duration_seconds))) : 0,
      req.body?.publish_at ? String(req.body.publish_at) : now, ['brouillon','publie','archive'].includes(req.body?.status) ? req.body.status : 'brouillon', now, now);
    res.status(201).json({ success: true, data: { id } });
  });
  router.put('/reels/:id', requireAdmin(db, 'content:write'), (req, res) => {
    const row = db.get<any>(`SELECT * FROM reels WHERE id=?`, req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Reel introuvable.' });
    db.run(`UPDATE reels SET title=?, description=?, video_url=?, duration_seconds=?, publish_at=?, status=?, updated_at=? WHERE id=?`,
      String(req.body?.title ?? row.title).slice(0, 150), String(req.body?.description ?? row.description),
      String(req.body?.video_url ?? row.video_url).slice(0, 500),
      Number.isFinite(Number(req.body?.duration_seconds)) ? Math.max(0, Math.round(Number(req.body.duration_seconds))) : row.duration_seconds,
      req.body?.publish_at ? String(req.body.publish_at) : row.publish_at,
      ['brouillon','publie','archive'].includes(req.body?.status) ? req.body.status : row.status,
      new Date().toISOString(), req.params.id);
    res.json({ success: true });
  });
  router.delete('/reels/:id', requireAdmin(db, 'content:write'), (req, res) => {
    db.run(`DELETE FROM reels WHERE id=?`, req.params.id);
    res.json({ success: true });
  });

  router.get('/story-publishers', requireAdmin(db, 'content:read'), (_req, res) => {
    res.json({ success: true, data: db.all<any>(`SELECT * FROM story_publishers ORDER BY official DESC, name`) });
  });

  router.post('/story-publishers', requireAdmin(db, 'content:write'), (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (name.length < 2) return res.status(400).json({ success: false, error: 'Nom requis.' });
    const slug = String(req.body?.slug || name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40) || 'CANAL';
    const now = new Date().toISOString();
    const id = `pub_${randomUUID().slice(0, 8)}`;
    try {
      db.run(`INSERT INTO story_publishers (id,slug,name,subtitle,avatar,official,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)`,
        id, slug, name, String(req.body?.subtitle || '').slice(0, 60), String(req.body?.avatar || '').slice(0, 500), now, now);
      res.status(201).json({ success: true, data: { id } });
    } catch { res.status(409).json({ success: false, error: 'Ce canal existe déjà.' }); }
  });

  router.put('/story-publishers/:id', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>(`SELECT * FROM story_publishers WHERE id=?`, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Canal introuvable.' });
    const name = String(req.body?.name ?? existing.name).trim().slice(0, 60);
    db.run(`UPDATE story_publishers SET name=?, subtitle=?, avatar=?, updated_at=? WHERE id=?`,
      name || existing.name, String(req.body?.subtitle ?? existing.subtitle).slice(0, 60),
      String(req.body?.avatar ?? existing.avatar).slice(0, 500), new Date().toISOString(), req.params.id);
    res.json({ success: true });
  });

  router.delete('/story-publishers/:id', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>(`SELECT * FROM story_publishers WHERE id=?`, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Canal introuvable.' });
    if (existing.official) return res.status(400).json({ success: false, error: 'Le canal officiel ne peut pas être supprimé.' });
    db.run(`DELETE FROM story_publishers WHERE id=?`, req.params.id);
    res.json({ success: true });
  });

  router.get('/stories-stats', requireAdmin(db, 'content:read'), (_req, res) => {
    const rows = db.all<any>(`SELECT target_id, type, COUNT(*) n FROM story_interactions GROUP BY target_id, type`);
    const stats: Record<string, any> = {};
    for (const row of rows) {
      stats[row.target_id] = stats[row.target_id] || { views: 0, likes: 0, comments: 0, shares: 0 };
      stats[row.target_id][`${row.type}s`] = Number(row.n);
    }
    res.json({ success: true, data: stats });
  });

  /* ===== وكيل مجلتي — محرر Claude داخل الأدمين فقط ===== */
  router.get('/magazine-agent/status', requireAdmin(db, 'content:read'), (_req, res) => {
    const counts = db.get<any>(`SELECT COUNT(*) total,
      SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) drafts,
      SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) scheduled
      FROM magazine_drafts`);
    res.json({ success: true, data: { capabilities: magazineAgentCapabilities(), counts: {
      total: Number(counts?.total || 0), drafts: Number(counts?.drafts || 0), scheduled: Number(counts?.scheduled || 0),
    } } });
  });

  router.get('/magazine-drafts', requireAdmin(db, 'content:read'), (req, res) => {
    const data = listMagazineDrafts(db, {
      status: String(req.query.status || ''), type: String(req.query.type || ''),
      limit: parsePositiveInteger(req.query.limit, 80, 200),
    });
    res.json({ success: true, data });
  });

  router.get('/magazine-drafts/:id', requireAdmin(db, 'content:read'), (req, res) => {
    const draft = getMagazineDraft(db, req.params.id);
    if (!draft) return res.status(404).json({ success: false, error: 'مسودة مجلتي غير موجودة.' });
    res.json({ success: true, data: draft });
  });

  router.post('/magazine-agent/generate', requireAdmin(db, 'content:write'), async (req, res) => {
    const actor = admin(req);
    const lockKey = actor.id;
    if (magazineGenerationInFlight.has(lockKey)) {
      return res.status(409).json({ success: false, code: 'MAGAZINE_GENERATION_IN_PROGRESS', error: 'يوجد توليد جارٍ لهذا المحرر. انتظر اكتماله.' });
    }
    const command = typeof req.body?.command === 'string' ? req.body.command.trim().slice(0, 1200) : '';
    if (command.length < 3) return res.status(400).json({ success: false, error: 'اكتب أمرًا واضحًا لوكيل مجلتي.' });
    const conversationId = typeof req.body?.conversationId === 'string' && /^[A-Za-z0-9._:-]{8,160}$/.test(req.body.conversationId)
      ? req.body.conversationId : `mag_conversation_${randomUUID()}`;
    const batchTotal = Math.max(1, Math.min(10, Number(req.body?.batchTotal) || 1));
    const batchIndex = Math.max(1, Math.min(batchTotal, Number(req.body?.batchIndex) || 1));
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8).map((line: any) => ({
      role: line?.role === 'assistant' ? 'assistant' as const : 'user' as const,
      text: String(line?.text || '').slice(0, 1000),
    })).filter((line: any) => line.text.trim()) : [];
    const previousTopics = Array.isArray(req.body?.previousTopics)
      ? req.body.previousTopics.map((topic: any) => String(topic || '').trim().slice(0, 180)).filter(Boolean).slice(-20) : [];
    const input: GenerateMagazineInput = {
      command, conversationId,
      batchId: typeof req.body?.batchId === 'string' ? req.body.batchId.slice(0, 160) : undefined,
      batchIndex, batchTotal, history, previousTopics, adminId: actor.id,
    };
    magazineGenerationInFlight.add(lockKey);
    try {
      const result = await generateMagazineContent(db, input);
      if (!result.needsClarification) {
        audit(db, req, 'GENERATE', 'MAGAZINE_AGENT', result.batchId, null, {
          command: command.slice(0, 300), batchIndex, batchTotal,
          topic: result.output?.topic || '', draftIds: result.drafts.map((draft: any) => draft.id), model: result.model,
        });
      }
      res.status(result.needsClarification ? 200 : 201).json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Magazine Agent]', error?.message || error);
      if (error instanceof MagazineAgentUnavailableError) return res.status(503).json({ success: false, code: error.code, error: error.message });
      if (error instanceof MagazineAgentProviderError) return res.status(502).json({ success: false, code: error.code, error: error.message });
      if (error?.message === 'MAGAZINE_COMMAND_REQUIRED') return res.status(400).json({ success: false, error: 'اكتب أمرًا واضحًا لوكيل مجلتي.' });
      res.status(500).json({ success: false, code: 'MAGAZINE_GENERATION_FAILED', error: 'تعذر إنشاء المحتوى وحفظه. لم تُحفظ نتيجة ناقصة.' });
    } finally {
      magazineGenerationInFlight.delete(lockKey);
    }
  });

  router.put('/magazine-drafts/:id/save', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM magazine_drafts WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'مسودة مجلتي غير موجودة.' });
    let draft: any;
    if (existing.target_id) {
      // إلغاء أي جدولة سابقة داخل CMS أيضًا، لا مجرد تغيير شارة البطاقة.
      draft = prepareMagazineDraft(db, existing.id, { status: 'draft', category: existing.category });
    } else {
      const now = new Date().toISOString();
      db.run(`UPDATE magazine_drafts SET status='draft',scheduled_at=NULL,updated_at=? WHERE id=?`, now, existing.id);
      draft = getMagazineDraft(db, existing.id);
    }
    audit(db, req, 'SAVE_DRAFT', 'MAGAZINE_AGENT', existing.id, { status: existing.status }, { status: 'draft' });
    res.json({ success: true, data: draft });
  });

  router.put('/magazine-drafts/:id/prepare', requireAdmin(db, 'content:write'), (req, res) => {
    const status = req.body?.status === 'scheduled' ? 'scheduled' as const
      : req.body?.status === 'published' ? 'published' as const : 'draft' as const;
    try {
      const draft = prepareMagazineDraft(db, req.params.id, {
        status,
        category: typeof req.body?.category === 'string' ? req.body.category.slice(0, 80) : 'AYROVI',
        scheduledAt: typeof req.body?.scheduledAt === 'string' ? req.body.scheduledAt : null,
      });
      audit(db, req, 'TRANSFER_TO_CMS', 'MAGAZINE_AGENT', draft.id, null, {
        status: draft.status, category: draft.category, scheduledAt: draft.scheduled_at,
        targetResource: draft.target_resource, targetId: draft.target_id,
      });
      res.json({ success: true, data: draft });
    } catch (error: any) {
      if (error?.message === 'MAGAZINE_DRAFT_NOT_FOUND') return res.status(404).json({ success: false, error: 'مسودة مجلتي غير موجودة.' });
      if (error?.message === 'MAGAZINE_SCHEDULE_INVALID') return res.status(400).json({ success: false, error: 'اختر تاريخ نشر مستقبليًا صالحًا.' });
      if (error?.message === 'MAGAZINE_MEDIA_REQUIRED') return res.status(400).json({ success: false, error: 'لا يمكن جدولة هذا المحتوى قبل اختيار صورة مملوكة أو فيديو Pexels/Pixabay مرخص. احفظه كمسودة وأضف الوسيط من التبويب المناسب.' });
      console.error('[Magazine transfer]', error?.message || error);
      res.status(500).json({ success: false, error: 'تعذر نقل المسودة إلى مجلتي.' });
    }
  });

  router.delete('/magazine-drafts/:id', requireAdmin(db, 'content:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM magazine_drafts WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'مسودة مجلتي غير موجودة.' });
    deleteMagazineDraft(db, existing.id);
    audit(db, req, 'DELETE', 'MAGAZINE_AGENT', existing.id, { title: existing.title, contentType: existing.content_type, status: existing.status, targetResource: existing.target_resource, targetId: existing.target_id }, null);
    res.json({ success: true });
  });

  router.get('/ai-discovery', requireAdmin(db, 'reports:read'), (_req, res) => {
    res.json({ success: true, data: discoveryAggregates(db) });
  });

  // Apprentissage approuvé : une suggestion de knowledge gap devient une entrée
  // vérifiée de la base de connaissance uniquement par décision humaine.
  router.post('/ai-suggestions/approve', requireAdmin(db, 'settings:write'), (req, res) => {
    const question = String(req.body?.question || '').trim().slice(0, 240);
    const answer = String(req.body?.answer || '').trim().slice(0, 1200);
    const category = ['FAQ','DELIVERY','PAYMENT','BRAND','ARRIVAL','PROMOTION','GENERAL'].includes(String(req.body?.category)) ? String(req.body.category) : 'GENERAL';
    if (question.length < 8 || answer.length < 8) return res.status(400).json({ success: false, error: 'Question et réponse requises.' });
    const id = `ai_know_${randomUUID()}`;
    const now = new Date().toISOString();
    db.run(`INSERT INTO ai_knowledge (id,category,question,answer,keywords,priority,active,created_at,updated_at)
      VALUES (?,?,?,?,?,50,1,?,?)`, id, category, question, answer, JSON.stringify(question.toLowerCase().split(/\s+/).slice(0, 8)), now, now);
    res.status(201).json({ success: true, data: { id } });
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
        normalizePublicationLifecycle(resource, payload);
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
        normalizePublicationLifecycle(resource, payload, existing);
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
      transactions: db.all<any>('SELECT * FROM payment_transactions WHERE order_id=? ORDER BY created_at DESC', order.id),
      proofs: db.all<any>(`SELECT id,original_name,mime_type,size_bytes,transfer_reference,status,submitted_at,reviewed_at,reviewed_by,rejection_reason
        FROM payment_proofs WHERE order_id=? ORDER BY submitted_at DESC`, order.id),
      invoice: db.get<any>('SELECT * FROM invoices WHERE order_id=?', order.id) || null,
      delivery: db.get<any>('SELECT * FROM deliveries WHERE order_id=?', order.id),
    } });
  });

  router.put('/orders/:id/status', requireAdmin(db, 'orders:write'), (req, res) => {
    const status = String(req.body?.status || '');
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (!orderStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Statut de commande invalide.' });
    const existing = db.get<any>('SELECT * FROM orders WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Commande introuvable.' });
    if (status === existing.status) return res.json({ success: true, data: existing });
    const transitions: Record<string, string[]> = {
      CREATED: ['AWAITING_DEPOSIT','CANCELLED'],
      AWAITING_DEPOSIT: ['CANCELLED'],
      AWAITING_PAYMENT_VERIFICATION: ['CANCELLED'],
      CONFIRMED: ['PREPARING','CANCELLED'],
      PREPARING: ['CANCELLED'], // SHIPPED requires carrier/tracking through /delivery.
      SHIPPED: ['IN_TRANSIT','CANCELLED'],
      IN_TRANSIT: ['OUT_FOR_DELIVERY','CANCELLED'],
      OUT_FOR_DELIVERY: ['DELIVERED','CANCELLED'],
      DELIVERED: [], CANCELLED: [],
    };
    if (!(transitions[String(existing.status)] || []).includes(status)) {
      return res.status(409).json({ success: false, error: status === 'SHIPPED'
        ? 'Renseignez le transporteur et le numéro de suivi dans la livraison pour expédier.'
        : 'Transition refusée : terminez d’abord l’étape précédente.' });
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      db.run('UPDATE orders SET status=?,updated_at=? WHERE id=?', status, now, existing.id);
      db.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at) VALUES (?,?,?,?,?,?,?)`,
        `history_${randomUUID()}`, existing.id, existing.status, status, note, admin(req).id, now);
      if (status === 'IN_TRANSIT') db.run("UPDATE deliveries SET status='IN_TRANSIT',updated_at=? WHERE order_id=?", now, existing.id);
      if (status === 'OUT_FOR_DELIVERY') db.run("UPDATE deliveries SET status='OUT_FOR_DELIVERY',updated_at=? WHERE order_id=?", now, existing.id);
      if (status === 'DELIVERED') db.run("UPDATE deliveries SET status='DELIVERED',delivered_at=?,updated_at=? WHERE order_id=?", now, now, existing.id);
      // Cancellation never fabricates a refund or payment failure: payment state remains independent.
      if (existing.account_id) db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,'ORDER','Mise à jour de commande',?,?,?)`, `notification_${randomUUID()}`, existing.account_id,
      `La commande ${existing.order_number} est maintenant au statut ${status}.`, `/compte/commandes/${existing.id}`, now);
    });
    audit(db, req, 'STATUS_CHANGE', 'ORDERS', existing.id, { status: existing.status }, { status, note });
    res.json({ success: true, data: db.get<any>('SELECT * FROM orders WHERE id=?', existing.id) });
  });

  router.put('/orders/:id/payment', requireAdmin(db, 'payments:write'), (req, res) => {
    const status = String(req.body?.status || '');
    if (!paymentStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Statut de paiement invalide.' });
    const payment = db.get<any>('SELECT id FROM payments WHERE order_id=?', req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: 'Paiement introuvable.' });
    return res.status(409).json({ success: false, error: 'Le statut est géré uniquement par la vérification Konnect ou la révision du justificatif; aucun paiement/remboursement manuel n’est enregistré ici.' });
  });

  // ===== Manual-transfer proof files (admin only, path never exposed) =====
  const sendProofFile = (proof: any, res: any) => {
    if (!proof?.file_path || !fs.existsSync(String(proof.file_path))) return res.status(404).json({ success: false, error: 'Justificatif indisponible.' });
    const absolute = path.resolve(String(proof.file_path));
    const safeRoot = path.resolve(uploadsDir('deposits'));
    if (!absolute.startsWith(safeRoot + path.sep)) return res.status(403).json({ success: false, error: 'Chemin de justificatif invalide.' });
    res.setHeader('Content-Type', String(proof.mime_type || 'application/octet-stream'));
    res.setHeader('Cache-Control', 'private, no-store');
    return fs.createReadStream(absolute).pipe(res);
  };
  router.get('/orders/:id/deposit-proof', requireAdmin(db, 'commerce:read'), (req, res) => {
    const proof = db.get<any>('SELECT * FROM payment_proofs WHERE order_id=? ORDER BY submitted_at DESC LIMIT 1', req.params.id);
    return sendProofFile(proof, res);
  });
  router.get('/payment-proofs/:id/file', requireAdmin(db, 'commerce:read'), (req, res) => {
    const proof = db.get<any>('SELECT * FROM payment_proofs WHERE id=?', req.params.id);
    return sendProofFile(proof, res);
  });

  router.get('/payment-proofs/pending', requireAdmin(db, 'commerce:read'), (_req, res) => {
    const rows = db.all<any>(`SELECT pr.id,pr.order_id,pr.original_name,pr.mime_type,pr.size_bytes,pr.transfer_reference,
      pr.status,pr.submitted_at,o.order_number,o.deposit_amount_tnd,p.payment_number,p.method,c.name customer_name
      FROM payment_proofs pr JOIN orders o ON o.id=pr.order_id JOIN payments p ON p.id=pr.payment_id
      JOIN customers c ON c.id=o.customer_id WHERE pr.status='PENDING_VERIFICATION' ORDER BY pr.submitted_at ASC`);
    res.json({ success: true, data: rows });
  });

  // Admin validates/rejects manual transfers only. Card confirmation is gateway-only.
  router.post('/orders/:id/deposit/review', requireAdmin(db, 'payments:write'), (req, res) => {
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ success: false, error: 'Décision invalide (approve/reject).' });
    const before = db.get<any>('SELECT * FROM orders WHERE id=?', req.params.id);
    if (!before) return res.status(404).json({ success: false, error: 'Commande introuvable.' });
    if (before.payment_method === 'CARD') return res.status(409).json({ success: false, error: 'Un paiement carte ne peut pas être validé manuellement.' });
    try {
      const order = decision === 'approve'
        ? db.confirmOrderDeposit(req.params.id, admin(req).id, note)
        : db.rejectOrderDeposit(req.params.id, admin(req).id, note);
      audit(db, req, decision === 'approve' ? 'DEPOSIT_APPROVED' : 'DEPOSIT_REJECTED', 'PAYMENT_PROOFS', order.id,
        { payment_status: before.payment_status }, { payment_status: order.payment_status, note });
      return res.json({ success: true, data: { paymentStatus: order.payment_status, orderStatus: order.status } });
    } catch (error: any) {
      if (error?.message === 'REJECTION_REASON_REQUIRED') return res.status(400).json({ success: false, error: 'Le motif du refus est obligatoire.' });
      return res.status(error?.message === 'DEPOSIT_NOT_REVIEWABLE' ? 409 : 500)
        .json({ success: false, error: 'Ce justificatif ne peut plus être révisé.' });
    }
  });

  router.put('/orders/:id/delivery', requireAdmin(db, 'orders:write'), (req, res) => {
    const existing = db.get<any>('SELECT * FROM deliveries WHERE order_id=?', req.params.id);
    const order = db.get<any>('SELECT * FROM orders WHERE id=?', req.params.id);
    if (!existing || !order) return res.status(404).json({ success: false, error: 'Livraison introuvable.' });
    const allowed = ['governorate','address','phone','status','expected_at','notes','carrier','tracking_number','tracking_url'];
    const payload: Record<string, any> = {};
    for (const field of allowed) if (req.body?.[field] !== undefined) payload[field] = typeof req.body[field] === 'string' ? req.body[field].trim().slice(0, 1000) : req.body[field];
    if (payload.status && !deliveryStatuses.includes(payload.status)) return res.status(400).json({ success: false, error: 'Statut de livraison invalide.' });
    if (payload.expected_at && Number.isNaN(new Date(payload.expected_at).getTime())) return res.status(400).json({ success: false, error: 'Date prévue invalide.' });
    if (payload.tracking_url && !/^https:\/\/[\w.-]+(?:[/:?#][^\s]*)?$/i.test(payload.tracking_url)) return res.status(400).json({ success: false, error: 'URL de suivi HTTPS invalide.' });
    if (!Object.keys(payload).length) return res.status(400).json({ success: false, error: 'Aucune modification reçue.' });
    const now = new Date().toISOString();
    const nextStatus = String(payload.status || existing.status);
    const carrier = String(payload.carrier ?? existing.carrier ?? '').trim();
    const trackingNumber = String(payload.tracking_number ?? existing.tracking_number ?? '').trim();
    if (nextStatus === 'SHIPPED') {
      if (order.status !== 'PREPARING') return res.status(409).json({ success: false, error: 'La commande doit être en préparation avant l’expédition.' });
      if (!carrier || !trackingNumber) return res.status(400).json({ success: false, error: 'Transporteur et numéro de suivi sont obligatoires pour expédier.' });
      payload.shipped_at = now;
    }
    const orderStatusForDelivery: Record<string, string> = {
      SHIPPED: 'SHIPPED', IN_TRANSIT: 'IN_TRANSIT', OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY', DELIVERED: 'DELIVERED',
    };
    const expectedOrderStatus: Record<string, string[]> = {
      IN_TRANSIT: ['SHIPPED'], OUT_FOR_DELIVERY: ['IN_TRANSIT'], DELIVERED: ['OUT_FOR_DELIVERY'],
    };
    if (expectedOrderStatus[nextStatus] && !expectedOrderStatus[nextStatus].includes(String(order.status))) {
      return res.status(409).json({ success: false, error: 'Terminez l’étape de livraison précédente.' });
    }
    if (nextStatus === 'DELIVERED') payload.delivered_at = now;
    db.transaction(() => {
      db.run(`UPDATE deliveries SET ${Object.keys(payload).map((key) => `${key}=?`).join(',')},updated_at=? WHERE order_id=?`, ...Object.values(payload), now, req.params.id);
      const nextOrderStatus = orderStatusForDelivery[nextStatus];
      if (nextOrderStatus && nextOrderStatus !== order.status) {
        db.run('UPDATE orders SET status=?,tracking_code=?,updated_at=? WHERE id=?', nextOrderStatus, trackingNumber, now, order.id);
        db.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at) VALUES (?,?,?,?,?,?,?)`,
          `history_${randomUUID()}`, order.id, order.status, nextOrderStatus,
          nextOrderStatus === 'SHIPPED' ? `Expédiée par ${carrier} — suivi ${trackingNumber}.` : `Livraison : ${nextOrderStatus}.`, admin(req).id, now);
        if (order.account_id) db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
          VALUES (?,?,'SHIPPING','Mise à jour de livraison',?,?,?)`, `notification_${randomUUID()}`, order.account_id,
        nextOrderStatus === 'SHIPPED' ? `La commande ${order.order_number} est expédiée par ${carrier}. Suivi : ${trackingNumber}.`
          : `La livraison de ${order.order_number} est maintenant ${nextOrderStatus}.`, `/compte/suivi`, now);
      }
    });
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

  // Invoice issuance is an explicit admin event, independent from payment approval.
  router.post('/orders/:id/invoice/issue', requireAdmin(db, 'payments:write'), async (req, res) => {
    try {
      const invoice = db.issueOrderInvoice(req.params.id, admin(req).id);
      await generateInvoicePdf(db, req.params.id);
      const issued = db.get<any>('SELECT * FROM invoices WHERE id=?', invoice.id);
      audit(db, req, 'INVOICE_ISSUED', 'INVOICES', issued.id, null, { invoice_number: issued.invoice_number });
      return res.status(201).json({ success: true, data: { invoiceNumber: issued.invoice_number, issuedAt: issued.issued_at } });
    } catch (error: any) {
      if (error?.message === 'ORDER_NOT_FOUND') return res.status(404).json({ success: false, error: 'Commande introuvable.' });
      if (error?.message === 'INVOICE_NOT_ISSUABLE') return res.status(409).json({ success: false, error: 'La facture nécessite un acompte payé et une commande confirmée.' });
      console.error('[Invoice issue]', error);
      return res.status(500).json({ success: false, error: 'La facture n’a pas pu être émise.' });
    }
  });

  // ===== إعادة توليد/إرسال الفاتورة يدويًا عند الحاجة =====
  router.post('/orders/:id/invoice/resend', requireAdmin(db, 'payments:write'), async (req, res) => {
    const order = db.get<any>('SELECT * FROM orders WHERE id=?', req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Commande introuvable.' });
    const invoiceEntity = db.get<any>("SELECT * FROM invoices WHERE order_id=? AND status='ISSUED'", order.id);
    if (!invoiceEntity) return res.status(409).json({ success: false, error: 'Aucune facture émise — utilisez d’abord « Émettre la facture ».' });
    try {
      await generateInvoicePdf(db, order.id);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'La facture n’a pas pu être régénérée.' });
    }
    const account = order.account_id ? db.get<any>('SELECT email,display_name FROM customer_accounts WHERE id=?', order.account_id) : null;
    const deliveryEmail = String(order.contact_email || account?.email || '');
    let mail: { delivered: boolean; provider: string } = { delivered: false, provider: 'no-email' };
    if (deliveryEmail) {
      const updated = db.get<any>('SELECT * FROM orders WHERE id=?', order.id);
      const total = Number(order.total_tnd), dep = Number(order.deposit_amount_tnd);
      const balance = Math.max(0, Math.round((total - dep) * 1000) / 1000);
      const result = await sendMail({
        to: deliveryEmail,
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

  router.get('/pricing', requireAdmin(db, 'commerce:read'), (_req, res) => {
    res.json({ success: true, data: { ...db.getPricingRules(), depositPercent: db.getDepositPercent() } });
  });
  router.put('/pricing', requireAdmin(db, 'pricing:write'), (req, res) => {
    const current = db.getPricingRules();
    const currentDeposit = db.getDepositPercent();
    const fields: Record<string, string> = {
      rateEUR: 'rate_eur', rateUSD: 'rate_usd', rateGBP: 'rate_gbp', rateJPY: 'rate_jpy',
      exchangeBufferPercent: 'exchange_buffer_percent', freightPerKgTND: 'freight_per_kg_tnd',
      localDeliveryTND: 'local_delivery_tnd', commissionPercent: 'commission_percent',
      minimumCommissionTND: 'minimum_commission_tnd', rpdPercent: 'rpd_percent',
      rpdMinimumTND: 'rpd_minimum_tnd', defaultTvaRate: 'default_tva_rate',
      expressFeeTND: 'express_fee_tnd',
    };
    const payload: Record<string, number> = {};
    for (const [apiField, dbField] of Object.entries(fields)) {
      if (req.body?.[apiField] === undefined) continue;
      const value = Number(req.body[apiField]);
      if (!Number.isFinite(value) || value < 0 || (apiField.startsWith('rate') && value <= 0)) return res.status(400).json({ success: false, error: `Valeur invalide pour ${apiField}.` });
      payload[dbField] = value;
    }
    const hasCategories = Array.isArray(req.body?.categories);
    let nextDeposit: number | undefined;
    if (req.body?.depositPercent !== undefined) {
      const value = Number(req.body.depositPercent);
      if (!Number.isFinite(value) || value < 1 || value > 100) return res.status(400).json({ success: false, error: 'L’acompte doit être entre 1 et 100 %.' });
      nextDeposit = Math.round(value);
    }
    if (!Object.keys(payload).length && !hasCategories && nextDeposit === undefined) {
      return res.status(400).json({ success: false, error: 'Aucun tarif reçu.' });
    }
    try {
      let updated = current;
      db.transaction(() => {
        if (hasCategories) db.updateCustomsCategories(req.body.categories);
        if (Object.keys(payload).length) {
          db.run(`UPDATE pricing_config SET ${Object.keys(payload).map((field) => `${field}=?`).join(',')},version=version+1,updated_at=?,updated_by=? WHERE id='default'`,
            ...Object.values(payload), new Date().toISOString(), admin(req).id);
        } else if (hasCategories) {
          db.run(`UPDATE pricing_config SET version=version+1,updated_at=?,updated_by=? WHERE id='default'`, new Date().toISOString(), admin(req).id);
        }
        if (nextDeposit !== undefined) db.setDepositPercent(nextDeposit);
        updated = db.getPricingRules();
        if (Object.keys(payload).length || hasCategories) {
          const products = db.all<any>('SELECT id,original_price,currency,name FROM products');
          for (const product of products) {
            const price = calculatePrice(updated, Number(product.original_price), String(product.currency), { title: String(product.name || '') });
            if (!price) throw new Error(`Tarification impossible pour le produit ${product.id}.`);
            db.run(`UPDATE products SET converted_price=?,customs_fee=?,shipping_fee=?,service_fee=?,final_price=?,updated_at=? WHERE id=?`,
              price.convertedPriceTND, price.customsFeeTND, price.shippingFeeTND, price.serviceFeeTND, price.totalTND, new Date().toISOString(), product.id);
          }
        }
      });
      const desk = { ...db.getPricingRules(), depositPercent: db.getDepositPercent() };
      audit(db, req, 'UPDATE', 'PRICING', 'default', { ...current, depositPercent: currentDeposit }, desk);
      res.json({ success: true, data: desk });
    } catch (error: any) {
      const code = String(error?.message || '');
      if (code.startsWith('CATEGORY_') || code === 'CATEGORIES_INVALID' || code === 'DEPOSIT_PERCENT_INVALID') {
        return res.status(400).json({ success: false, error: 'Catégorie ou acompte invalide. Les identifiants inconnus sont refusés.' });
      }
      throw error;
    }
  });

  router.post('/pricing/preview', requireAdmin(db, 'commerce:read'), (req, res) => {
    const result = calculatePrice(db.getPricingRules(), Number(req.body?.originalPrice), String(req.body?.currency || ''), {
      quantity: Number(req.body?.quantity || 1), express: Boolean(req.body?.express), discountTND: Number(req.body?.discountTND || 0),
      title: String(req.body?.title || ''), categoryId: String(req.body?.categoryId || ''),
      weightKg: req.body?.weightKg == null || req.body?.weightKg === '' ? undefined : Number(req.body.weightKg),
    });
    if (!result) return res.status(400).json({ success: false, error: 'Données de calcul invalides.' });
    const depositPercent = db.getDepositPercent();
    res.json({ success: true, data: {
      ...result,
      depositPercent,
      depositTND: Math.round(result.totalTND * depositPercent * 10) / 1000,
    } });
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
    if (current.setting_key === 'interface_config') {
      const sectionIds = new Set(['hero', 'cms', 'brands', 'about', 'footer']);
      const sections = received && typeof received === 'object' && !Array.isArray(received) ? received.sections : null;
      const encoded = JSON.stringify(received);
      if (!Array.isArray(sections) || sections.length !== sectionIds.size
        || new Set(sections.map((section: any) => section?.id)).size !== sectionIds.size
        || sections.some((section: any) => !sectionIds.has(String(section?.id)))
        || encoded.length > 50_000) {
        return res.status(400).json({ success: false, error: 'La configuration واجهتي est invalide ou trop volumineuse.' });
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

  router.post('/uploads', requireAdmin(db, 'content:write'), async (req, res) => {
    const dataUrl = String(req.body?.dataUrl || '');
    const img = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const vid = /^data:video\/(mp4|webm|ogg|x-m4v|quicktime);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const match = img || vid;
    if (!match) return res.status(400).json({ success: false, error: 'Format non supporté. Images : PNG/JPEG/WEBP/GIF · Vidéos : MP4/WEBM/OGG/M4V.' });
    const input = Buffer.from(match[2], 'base64');
    const isVideo = Boolean(vid);
    const maxBytes = isVideo ? 10 * 1024 * 1024 : 4 * 1024 * 1024;
    if (!input.length || input.length > maxBytes) return res.status(400).json({ success: false, error: isVideo ? 'La vidéo doit peser moins de 10 Mo.' : 'L’image doit peser moins de 4 Mo.' });

    let output: Buffer<ArrayBufferLike> = input;
    let extension = match[1] === 'jpeg' ? 'jpg' : match[1] === 'x-m4v' ? 'm4v' : match[1] === 'quicktime' ? 'mov' : match[1];
    try {
      if (img && match[1] !== 'gif') {
        const normalized = await normalizeUploadedImage(input, `image/${match[1]}`);
        output = normalized.buffer;
        extension = normalized.mimeType === 'image/jpeg' ? 'jpg' : normalized.mimeType.split('/')[1];
      } else if (img) {
        const signature = input.length >= 6 ? input.toString('ascii', 0, 6) : '';
        if (!['GIF87a', 'GIF89a'].includes(signature)) throw new Error('INVALID_MEDIA_SIGNATURE');
      } else {
        const kind = match[1];
        const valid = kind === 'webm'
          ? input.length >= 4 && input.readUInt32BE(0) === 0x1a45dfa3
          : kind === 'ogg'
            ? input.length >= 4 && input.toString('ascii', 0, 4) === 'OggS'
            : input.length >= 12 && input.toString('ascii', 4, 8) === 'ftyp';
        if (!valid) throw new Error('INVALID_MEDIA_SIGNATURE');
      }
    } catch {
      return res.status(415).json({ success: false, code: 'INVALID_MEDIA', error: 'Le contenu du fichier ne correspond pas au format annoncé.' });
    }

    try {
      const directory = path.resolve(process.cwd(), 'data', 'uploads');
      fs.mkdirSync(directory, { recursive: true });
      const filename = `${Date.now()}-${randomUUID()}.${extension}`;
      fs.writeFileSync(path.join(directory, filename), output, { flag: 'wx' });
      const url = `/uploads/${filename}`;
      audit(db, req, 'UPLOAD', 'MEDIA', filename, null, { url, bytes: output.length });
      res.status(201).json({ success: true, data: { url, filename, size: output.length } });
    } catch (error: any) {
      console.error('[Admin media upload]', error?.message || error);
      res.status(500).json({ success: false, code: 'MEDIA_WRITE_FAILED', error: 'Le média n’a pas pu être enregistré.' });
    }
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
