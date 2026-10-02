import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { QatafoDatabase } from '../db/database';
import { emitErpEvent, ensureEventsSchemaIfMissing } from '../erp-core/events';
import { notifyCustomerAccount, queueDelivery } from '../erp-core/notifications';
import { ensureAyWebsSchema } from './schema';
import { ayWebsOrderPath, ayWebsDeepLink, type AyWebsDomainEvent } from '../../shared/aywebsTypes';

/**
 * AYWEBs — Event system (§39) + Observability (§46).
 *
 * Trois destinations pour UN seul fait métier :
 *  1. `ayweb_domain_events` : la trace durable du domaine AYWEBs ;
 *  2. le bus ERP existant (`emitErpEvent`, module `aywebs`) : ce qui permet à
 *     Sonim, au CRM, à l'Admin, aux notifications et à l'analytics de consommer
 *     AYWEBs SANS couplage direct (§39) ;
 *  3. la notification client existante, pour les événements qui concernent le
 *     client (§37) — aucun second système de notification n'est créé.
 *
 * Un événement ne doit jamais casser une transaction métier : tout est
 * best-effort et journalisé.
 */

export const AYWEBS_MODULE_KEY = 'aywebs';

export interface AyWebsEventInput {
  event: AyWebsDomainEvent;
  resourceType: 'product' | 'cart' | 'cart_item' | 'order' | 'order_item' | 'purchase_request' | 'store_request' | 'package' | 'shipping';
  resourceId: string;
  accountId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  payload?: Record<string, unknown>;
}

/** Événements qui déclenchent une notification client (§37). */
const CUSTOMER_NOTIFICATIONS: Partial<Record<AyWebsDomainEvent, { type: string; titleFr: string; titleAr: string; bodyFr: string; bodyAr: string }>> = {
  AYWEB_PAYMENT_CONFIRMED: {
    type: 'AYWEBS_PAYMENT',
    titleFr: 'Paiement AyWebs confirmé', titleAr: 'تم تأكيد دفعة AyWebs',
    bodyFr: 'Votre paiement est confirmé. AYROVI lance l’achat auprès du marchand.',
    bodyAr: 'تم تأكيد دفعتك. ستبدأ AYROVI عملية الشراء من المتجر.',
  },
  AYWEB_PURCHASE_CONFIRMED: {
    type: 'AYWEBS_PURCHASE',
    titleFr: 'Achat confirmé auprès du marchand', titleAr: 'تم تأكيد الشراء من المتجر',
    bodyFr: 'Le produit a été acheté. Nous suivons l’expédition vers l’entrepôt AYROVI.',
    bodyAr: 'تم شراء المنتج. سنتابع شحنه إلى مستودع AYROVI.',
  },
  AYWEB_PURCHASE_FAILED: {
    type: 'AYWEBS_PURCHASE',
    titleFr: 'L’achat n’a pas abouti', titleAr: 'لم تكتمل عملية الشراء',
    bodyFr: 'Le marchand n’a pas pu confirmer cet article. Consultez la commande pour la raison et les options.',
    bodyAr: 'لم يتمكن المتجر من تأكيد هذا المنتج. اطّلع على الطلب لمعرفة السبب والخيارات.',
  },
  AYWEB_PRICE_CHANGED: {
    type: 'AYWEBS_PRICE',
    titleFr: 'Le prix a changé', titleAr: 'تغيّر السعر',
    bodyFr: 'Le prix marchand diffère de celui enregistré. Votre accord est nécessaire avant l’achat.',
    bodyAr: 'سعر المتجر يختلف عن السعر المسجّل. موافقتك مطلوبة قبل الشراء.',
  },
  AYWEB_VARIANT_UNAVAILABLE: {
    type: 'AYWEBS_VARIANT',
    titleFr: 'Version indisponible', titleAr: 'النسخة غير متوفرة',
    bodyFr: 'La version exacte choisie n’est plus disponible. Choisissez-en une autre.',
    bodyAr: 'النسخة التي اخترتها لم تعد متوفرة. يرجى اختيار نسخة أخرى.',
  },
  AYWEB_WAREHOUSE_RECEIVED: {
    type: 'AYWEBS_WAREHOUSE',
    titleFr: 'Colis reçu à l’entrepôt AYROVI', titleAr: 'وصلت الشحنة إلى مستودع AYROVI',
    bodyFr: 'Votre article est arrivé. Vous pouvez préparer le groupement et l’expédition.',
    bodyAr: 'وصل منتجك. يمكنك الآن تجهيز التجميع والشحن.',
  },
  AYWEB_CONSOLIDATION_COMPLETED: {
    type: 'AYWEBS_WAREHOUSE',
    titleFr: 'Groupement terminé', titleAr: 'اكتمل التجميع',
    bodyFr: 'Vos articles sont groupés dans un seul colis.',
    bodyAr: 'تم تجميع منتجاتك في شحنة واحدة.',
  },
  AYWEB_SHIPPING_READY: {
    type: 'AYWEBS_SHIPPING',
    titleFr: 'Devis d’expédition prêt', titleAr: 'عرض سعر الشحن جاهز',
    bodyFr: 'Votre devis d’expédition internationale est disponible.',
    bodyAr: 'عرض سعر الشحن الدولي متاح الآن.',
  },
  AYWEB_SHIPPING_PAID: {
    type: 'AYWEBS_SHIPPING',
    titleFr: 'Expédition payée', titleAr: 'تم دفع الشحن',
    bodyFr: 'L’expédition est payée. Le colis sera confié au transporteur.',
    bodyAr: 'تم دفع الشحن. ستُسلَّم الشحنة إلى شركة النقل.',
  },
  AYWEB_DISPATCHED: {
    type: 'AYWEBS_SHIPPING',
    titleFr: 'Colis expédié', titleAr: 'تم شحن الشحنة',
    bodyFr: 'Votre colis est en route. Le suivi est disponible dans la commande.',
    bodyAr: 'شحنتك في الطريق. التتبع متاح داخل الطلب.',
  },
  AYWEB_DELIVERED: {
    type: 'AYWEBS_SHIPPING',
    titleFr: 'Colis livré', titleAr: 'تم تسليم الشحنة',
    bodyFr: 'Votre commande AyWebs a été livrée.',
    bodyAr: 'تم تسليم طلب AyWebs الخاص بك.',
  },
};

/** Émet le fait métier sur les trois canaux. Ne lève jamais d'exception. */
export function emitAyWebsEvent(db: QatafoDatabase, input: AyWebsEventInput): string {
  const id = `aywdev_${randomUUID()}`;
  const now = new Date().toISOString();
  const payload = JSON.stringify(input.payload ?? {}).slice(0, 20_000);

  try {
    ensureAyWebsSchema(db);
    db.run(
      `INSERT INTO ayweb_domain_events (id,event_name,resource_type,resource_id,account_id,order_id,payload,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      id, input.event, String(input.resourceType).slice(0, 40), String(input.resourceId).slice(0, 80),
      input.accountId || null, input.orderId || null, payload, now,
    );
  } catch (error) {
    console.warn('[AyWebs Events] persistence failed', error instanceof Error ? error.message : error);
  }

  try {
    ensureEventsSchemaIfMissing(db);
    emitErpEvent(db, {
      name: input.event,
      module: AYWEBS_MODULE_KEY,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      payload: { ...(input.payload ?? {}), ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}) },
      occurredAt: now,
    });
  } catch (error) {
    console.warn('[AyWebs Events] ERP bus failed', error instanceof Error ? error.message : error);
  }

  try {
    const template = CUSTOMER_NOTIFICATIONS[input.event];
    if (template && input.accountId) {
      const actionUrl = input.orderNumber ? ayWebsOrderPath(input.orderNumber) : '/aywebs/orders';
      notifyCustomerAccount(db, input.accountId, {
        type: template.type,
        // Libellé bilingue : le compte client affiche la langue du compte.
        title: `${template.titleFr} — ${template.titleAr}`,
        message: `${template.bodyFr} — ${template.bodyAr}`,
        actionUrl,
        data: { event: input.event, resourceType: input.resourceType, resourceId: input.resourceId, ...(input.payload ?? {}) },
        source: AYWEBS_MODULE_KEY,
      });
      queueDelivery(db, {
        recipientType: 'customer_account',
        recipientId: input.accountId,
        type: template.type,
        title: template.titleFr,
        message: template.bodyFr,
        data: { event: input.event, deepLink: input.orderNumber ? ayWebsDeepLink({ name: 'order', orderNumber: input.orderNumber }) : ayWebsDeepLink({ name: 'orders' }) },
      });
    }
  } catch (error) {
    console.warn('[AyWebs Events] notification failed', error instanceof Error ? error.message : error);
  }

  return id;
}

export function listAyWebsDomainEvents(db: QatafoDatabase, options: { limit?: number; eventName?: string; resourceId?: string } = {}) {
  ensureAyWebsSchema(db);
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
  if (options.eventName && options.resourceId) {
    return db.all<any>(
      `SELECT * FROM ayweb_domain_events WHERE event_name=? AND resource_id=? ORDER BY created_at DESC LIMIT ?`,
      options.eventName, options.resourceId, limit,
    );
  }
  if (options.eventName) {
    return db.all<any>(`SELECT * FROM ayweb_domain_events WHERE event_name=? ORDER BY created_at DESC LIMIT ?`, options.eventName, limit);
  }
  if (options.resourceId) {
    return db.all<any>(`SELECT * FROM ayweb_domain_events WHERE resource_id=? ORDER BY created_at DESC LIMIT ?`, options.resourceId, limit);
  }
  return db.all<any>(`SELECT * FROM ayweb_domain_events ORDER BY created_at DESC LIMIT ?`, limit);
}

/* ------------------------------------------------------------------ *
 * Audit (§45) — journal AYWEBs, séparé du journal ERP mais même discipline
 * ------------------------------------------------------------------ */

export interface AyWebsAuditInput {
  actorType?: 'customer' | 'admin' | 'system' | 'adapter';
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeState?: string | null;
  afterState?: string | null;
  detail?: Record<string, unknown>;
  requestId?: string | null;
}

export function writeAyWebsAudit(db: QatafoDatabase, input: AyWebsAuditInput): void {
  try {
    ensureAyWebsSchema(db);
    db.run(
      `INSERT INTO ayweb_audit_logs (id,actor_type,actor_id,action,resource_type,resource_id,before_state,after_state,detail,request_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      `aywaud_${randomUUID()}`,
      input.actorType || 'system',
      String(input.actorId || '').slice(0, 80),
      String(input.action).slice(0, 80),
      String(input.resourceType).slice(0, 40),
      String(input.resourceId).slice(0, 80),
      String(input.beforeState || '').slice(0, 40),
      String(input.afterState || '').slice(0, 40),
      JSON.stringify(input.detail ?? {}).slice(0, 8000),
      String(input.requestId || '').slice(0, 100),
      new Date().toISOString(),
    );
  } catch (error) {
    console.warn('[AyWebs Audit] failed', error instanceof Error ? error.message : error);
  }
}

export function listAyWebsAudit(db: QatafoDatabase, options: { limit?: number; resourceType?: string; resourceId?: string } = {}) {
  ensureAyWebsSchema(db);
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  if (options.resourceType && options.resourceId) {
    return db.all<any>(
      `SELECT * FROM ayweb_audit_logs WHERE resource_type=? AND resource_id=? ORDER BY created_at DESC LIMIT ?`,
      options.resourceType, options.resourceId, limit,
    );
  }
  if (options.resourceType) {
    return db.all<any>(`SELECT * FROM ayweb_audit_logs WHERE resource_type=? ORDER BY created_at DESC LIMIT ?`, options.resourceType, limit);
  }
  return db.all<any>(`SELECT * FROM ayweb_audit_logs ORDER BY created_at DESC LIMIT ?`, limit);
}

/* ------------------------------------------------------------------ *
 * Observability (§46) — logs structurés + métriques d'opération
 * ------------------------------------------------------------------ */

export interface AyWebsOperationLog {
  operation: string;
  storeId?: string | null;
  customerId?: string | null;
  sessionId?: string | null;
  productId?: string | null;
  orderId?: string | null;
  adapter?: string | null;
  durationMs?: number | null;
  result?: 'success' | 'failure' | 'skipped';
  errorCode?: string | null;
  requestId?: string | null;
}

/**
 * Une ligne JSON par opération : exploitable par un agrégateur de logs sans
 * ajouter de dépendance, et sans jamais exposer de secret ni de PII brute.
 */
export function logAyWebsOperation(input: AyWebsOperationLog): void {
  const entry: Record<string, unknown> = {
    module: AYWEBS_MODULE_KEY,
    operation: input.operation,
    result: input.result || 'success',
    at: new Date().toISOString(),
  };
  if (input.storeId) entry.storeId = input.storeId;
  if (input.customerId) entry.customerId = input.customerId;
  if (input.sessionId) entry.sessionId = input.sessionId;
  if (input.productId) entry.productId = input.productId;
  if (input.orderId) entry.orderId = input.orderId;
  if (input.adapter) entry.adapter = input.adapter;
  if (input.durationMs != null) entry.durationMs = Math.round(input.durationMs);
  if (input.errorCode) entry.errorCode = input.errorCode;
  if (input.requestId) entry.requestId = input.requestId;
  // stdout JSON : la collecte reste la responsabilité de la plateforme.
  console.log(JSON.stringify(entry));
}

/** Mesure une opération asynchrone et journalise le résultat, succès comme échec. */
export async function measureAyWebsOperation<T>(
  input: Omit<AyWebsOperationLog, 'durationMs' | 'result' | 'errorCode'>,
  work: () => Promise<T>,
  errorCodeOf: (error: unknown) => string = (error) => (error as any)?.code || (error as any)?.contract?.errorCode || 'INTERNAL_ERROR',
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await work();
    logAyWebsOperation({ ...input, durationMs: Date.now() - startedAt, result: 'success' });
    return result;
  } catch (error) {
    logAyWebsOperation({ ...input, durationMs: Date.now() - startedAt, result: 'failure', errorCode: errorCodeOf(error) });
    throw error;
  }
}

/**
 * Métriques d'exploitation (§46) : taux de résolution produit/variante/stock,
 * réussite d'ajout au panier, réussite et échecs d'achat, changements de prix,
 * URL non supportées. Lecture agrégée, aucun identifiant visiteur renvoyé.
 */
export interface AyWebsMetrics {
  days: number;
  operations: Record<string, { total: number; failures: number; successRate: number | null }>;
  errorCodes: Array<{ code: string; count: number }>;
  averages: { resolutionMs: number | null };
}

const metricsStore: Array<AyWebsOperationLog & { at: number }> = [];
const METRICS_MAX_ROWS = 5_000;

/** En mémoire pour les métriques d'exploitation courtes ; la trace durable reste aywebs_events. */
export function recordAyWebsMetric(input: AyWebsOperationLog): void {
  metricsStore.push({ ...input, at: Date.now() });
  if (metricsStore.length > METRICS_MAX_ROWS) metricsStore.splice(0, metricsStore.length - METRICS_MAX_ROWS);
}

export function ayWebsMetrics(days = 1): AyWebsMetrics {
  const since = Date.now() - Math.max(1, Math.min(90, Number(days) || 1)) * 24 * 60 * 60 * 1000;
  const rows = metricsStore.filter((row) => row.at >= since);
  const operations: AyWebsMetrics['operations'] = {};
  const codes = new Map<string, number>();
  let durationSum = 0;
  let durationCount = 0;
  for (const row of rows) {
    const bucket = operations[row.operation] || (operations[row.operation] = { total: 0, failures: 0, successRate: null });
    bucket.total += 1;
    if (row.result === 'failure') {
      bucket.failures += 1;
      const code = row.errorCode || 'UNKNOWN';
      codes.set(code, (codes.get(code) || 0) + 1);
    }
    if (typeof row.durationMs === 'number' && Number.isFinite(row.durationMs)) {
      durationSum += row.durationMs;
      durationCount += 1;
    }
  }
  for (const bucket of Object.values(operations)) {
    bucket.successRate = bucket.total > 0 ? Math.round(((bucket.total - bucket.failures) / bucket.total) * 10_000) / 100 : null;
  }
  return {
    days: Math.max(1, Math.min(90, Number(days) || 1)),
    operations,
    errorCodes: [...codes.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 12),
    averages: { resolutionMs: durationCount > 0 ? Math.round(durationSum / durationCount) : null },
  };
}

export function ayWebsRequestId(req: Request): string {
  return String((req as any).requestId || '');
}
