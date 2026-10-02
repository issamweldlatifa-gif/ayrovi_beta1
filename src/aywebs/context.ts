import type { NextFunction, Request, Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import type { AyWebsStoreDefinition } from '../../shared/aywebsStores';
import { customerFromRequest, optionalCustomer, resolveCustomer } from '../customer/auth';
import { AyWebsDomainError, ayWebsErrorHttpStatus, ayWebsErrorPayload, toAyWebsDomainError } from './errors';
import { ensureAyWebsSchema } from './schema';
import { recordAyWebsEvent, type AyWebsEvent } from './analytics';
import {
  assertAyWebsSessionId,
  readAyWebsSession,
  recordAyWebsStoreVisit,
  touchAyWebsSession,
} from './browser';
import { attachAyWebsCartToAccount } from './cart';
import type { AyWebsResolverDependencies } from './productResolver';

/**
 * AYWEBs — contexte d'exécution HTTP.
 *
 * Un seul endroit définit : les flags runtime, l'identité du client (session
 * anonyme OU compte authentifié, jamais un second système d'authentification),
 * le contexte de session AYWEBs (§26) et la traduction d'une erreur métier en
 * contrat HTTP (§44). Les routes restent fines : elles valident, appellent le
 * domaine, sérialisent.
 */

export interface AyWebsFeatureFlags {
  enabled: boolean;
  captureEnabled: boolean;
  ocrFallbackEnabled: boolean;
  aiExtractionEnabled: boolean;
  /** Achat marchand automatisé : non connecté aujourd'hui, et l'API le dit (§48). */
  purchaseIntegrationEnabled: boolean;
  /** Phases 6-8 : procurement, entrepôt, expédition. */
  warehouseEnabled: boolean;
  shippingEnabled: boolean;
}

export interface AyWebsContext {
  db: QatafoDatabase;
  scraper: SmartLinkScraper;
  /**
   * Drapeaux runtime RELUS À CHAQUE REQUÊTE (getter) : les basculer dans
   * l'environnement puis redémarrer la service suffit, sans reconstruire le
   * client — et un test peut les faire varier sans recréer le routeur.
   */
  readonly flags: AyWebsFeatureFlags;
  readonly resolver: AyWebsResolverDependencies;
  storeCaptureEnabled: (store: AyWebsStoreDefinition | null | undefined) => boolean;
}

export function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value.trim() === '') return fallback;
  return !['0', 'false', 'off', 'disabled'].includes(value.trim().toLowerCase());
}

export function ayWebsFeatureFlags(): AyWebsFeatureFlags {
  return {
    enabled: envFlag('AYWEBS_ENABLED', true),
    captureEnabled: envFlag('AYWEBS_CAPTURE_ENABLED', true),
    ocrFallbackEnabled: envFlag('AYWEBS_OCR_FALLBACK_ENABLED', true),
    aiExtractionEnabled: envFlag('AYWEBS_AI_EXTRACTION_ENABLED', false),
    purchaseIntegrationEnabled: envFlag('AYWEBS_PURCHASE_INTEGRATION_ENABLED', false),
    warehouseEnabled: envFlag('AYWEBS_WAREHOUSE_ENABLED', false),
    shippingEnabled: envFlag('AYWEBS_SHIPPING_ENABLED', false),
  };
}

/**
 * Porte de capture par boutique (§7, §45).
 *
 * `store` peut être `null` : un domaine absent du Store Registry est analysé
 * AVANT que l'erreur `DOMAIN_NOT_ALLOWED` ne soit levée, et la garde doit
 * répondre « non » au lieu de casser l'analyse de page (§10).
 */
export function createStoreCaptureGate(flags: AyWebsFeatureFlags) {
  return (store: AyWebsStoreDefinition | null | undefined): boolean => {
    if (!store) return false;
    const storeFlag = `AYWEBS_${store.id.toUpperCase()}_CAPTURE_ENABLED`;
    return store.captureSupported && flags.captureEnabled && envFlag(storeFlag, true);
  };
}

export function createAyWebsContext(db: QatafoDatabase, scraper: SmartLinkScraper): AyWebsContext {
  ensureAyWebsSchema(db);
  const context: AyWebsContext = {
    db,
    scraper,
    get flags(): AyWebsFeatureFlags {
      return ayWebsFeatureFlags();
    },
    get resolver(): AyWebsResolverDependencies {
      return {
        db,
        scraper,
        flags: {
          enabled: context.flags.enabled,
          captureEnabled: context.flags.captureEnabled,
          storeCaptureEnabled: context.storeCaptureEnabled,
        },
      };
    },
    storeCaptureEnabled: (store: AyWebsStoreDefinition | null | undefined): boolean =>
      createStoreCaptureGate(context.flags)(store),
  };
  return context;
}

/* ------------------------------------------------------------------ *
 * Identité de requête
 * ------------------------------------------------------------------ */

export interface AyWebsRequestIdentity {
  sessionId: string;
  accountId: string | null;
  authenticated: boolean;
  customerName: string;
}

export function readSessionId(req: Request): string {
  const candidate = req.headers['x-session-id'] || req.query.sessionId;
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(normalized) ? normalized : '';
}

export function requireAyWebsSession(req: Request, res: Response): string | null {
  const sessionId = readSessionId(req);
  if (sessionId) return sessionId;
  sendAyWebsError(res, new AyWebsDomainError('SESSION_REQUIRED'));
  return null;
}

/**
 * Résout l'identité : compte authentifié si présent, session anonyme sinon.
 * Un panier de session est rattaché au compte à la première requête authentifiée
 * (§26 : le contexte d'achat survit à la connexion).
 */
/**
 * Résout l'identité de la requête (§26).
 *
 * Le rattachement du panier de session au compte est EXÉCUTÉ À CHAQUE REQUÊTE
 * AUTHENTIFIÉE, y compris quand une garde (`requireCustomer`/`optionalCustomer`)
 * a déjà résolu le client : sans cela, un compte connecté ne verrait plus le
 * panier commencé en anonyme et `CART_EMPTY` tomberait sur une commande
 * parfaitement remplie. L'opération est idempotente.
 */
export function resolveAyWebsIdentity(db: QatafoDatabase, req: Request, sessionId: string): AyWebsRequestIdentity {
  const customer = (req as any).customer || resolveCustomer(db, req);
  const accountId = customer?.id ? String(customer.id) : null;
  if (accountId) {
    try {
      attachAyWebsCartToAccount(db, sessionId, accountId);
    } catch (error) {
      console.warn('[AyWebs] cart attach failed', error instanceof Error ? error.message : error);
    }
  }
  return {
    sessionId,
    accountId,
    authenticated: Boolean(accountId),
    customerName: String(customer?.displayName || ''),
  };
}

/** Garde d'authentification : opérations propriétaires (commande, paiement). */
export function requireAyWebsCustomer(db: QatafoDatabase) {
  return (req: Request, res: Response, next: NextFunction) => {
    const customer = resolveCustomer(db, req);
    if (!customer) {
      return sendAyWebsError(res, new AyWebsDomainError('AUTH_REQUIRED'), 401);
    }
    return optionalCustomer(db)(req, res, next);
  };
}

/** Garde souple : lecture possible en anonyme, écriture vérifiée CSRF si connecté. */
export function optionalAyWebsCustomer(db: QatafoDatabase) {
  return optionalCustomer(db);
}

export function ayWebsAccountId(req: Request): string | null {
  const customer = (req as any).customer;
  return customer?.id ? String(customer.id) : null;
}

export function ayWebsCustomerName(req: Request): string {
  try {
    return String(customerFromRequest(req)?.displayName || '');
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ *
 * Réponses
 * ------------------------------------------------------------------ */

/** Envoie le contrat d'erreur (§44) : jamais d'exception brute côté client. */
export function sendAyWebsError(res: Response, error: unknown, statusOverride?: number, extra: Record<string, unknown> = {}): Response {
  const domainError = toAyWebsDomainError(error);
  const status = statusOverride || httpStatusFor(domainError);
  return res.status(status).json(ayWebsErrorPayload(domainError, extra));
}

function httpStatusFor(error: AyWebsDomainError): number {
  return ayWebsErrorHttpStatus(error.code);
}

export function ayWebsOk(res: Response, data: unknown, extra: Record<string, unknown> = {}): Response {
  return res.json({ success: true, data, ...extra });
}

/* ------------------------------------------------------------------ *
 * Contexte de session (§26)
 * ------------------------------------------------------------------ */

export function readAyWebsRequestSession(ctx: AyWebsContext, req: Request, sessionId: string) {
  const identity = resolveAyWebsIdentity(ctx.db, req, sessionId);
  const session = readAyWebsSession(ctx.db, assertAyWebsSessionId(sessionId), identity.accountId);
  return { identity, session };
}

export function trackAyWebsNavigation(
  ctx: AyWebsContext,
  input: { sessionId: string; accountId: string | null; storeId?: string | null; url?: string | null; productId?: string | null; variant?: Record<string, unknown> | null },
): void {
  try {
    touchAyWebsSession(ctx.db, input.sessionId, input.accountId, {
      ...(input.storeId !== undefined ? { currentStoreId: input.storeId } : {}),
      ...(input.url !== undefined ? { currentUrl: input.url } : {}),
      ...(input.productId !== undefined ? { currentProductId: input.productId } : {}),
      ...(input.variant !== undefined ? { selectedVariant: input.variant } : {}),
    });
    if (input.storeId) {
      recordAyWebsStoreVisit(ctx.db, {
        sessionId: input.sessionId,
        accountId: input.accountId,
        storeId: input.storeId,
        visitedUrl: input.url || null,
      });
    }
  } catch (error) {
    console.warn('[AyWebs] session tracking failed', error instanceof Error ? error.message : error);
  }
}

export function trackAyWebsFunnel(ctx: AyWebsContext, event: AyWebsEvent, detail: Record<string, unknown> = {}, sessionId?: string): void {
  recordAyWebsEvent(ctx.db, event, {
    store: detail.store,
    captureId: detail.capture_id,
    code: detail.code,
    sessionId: sessionId || detail.sessionId,
  });
}

export { customerFromRequest, resolveCustomer } from '../customer/auth';
