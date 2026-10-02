import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { parsePublicHttpUrl, UnsafeUrlError } from '../services/safeUrl';
import { AYWEBS_STORES, detectAyWebsStore, findAyWebsStore, type AyWebsStoreDefinition } from '../../shared/aywebsStores';
import type { AyWebsPageType } from '../../shared/aywebsTypes';
import { createAyWebsAdapter, resolveAyWebsAdapter } from './adapters/registry';
import { AyWebsCaptureError, type AyWebsPageClassification } from './adapters/contract';
import { AyWebsDomainError } from './errors';
import { ensureAyWebsSchema } from './schema';
import type { SmartLinkScraper } from '../scraper/scraper';

/**
 * AYWEBs — Store Browser & Product Detection Bridge (§9, §10).
 *
 * Le navigateur AYWEBs n'est pas un WebView muet : chaque URL ouverte passe par
 * ce pont, qui répond à trois questions avant tout affichage —
 *   1. quelle boutique ? (Store Registry)
 *   2. quel type de page ? (adaptateur : PRODUCT / SEARCH / CATEGORY / HOME /
 *      LOGIN / CHECKOUT / CAPTCHA / UNKNOWN / ERROR)
 *   3. que doit faire le client ? (rien, choisir, se connecter, passer une
 *      vérification marchand)
 *
 * Sécurité (§45) : le contenu des pages externes est non fiable. Aucune URL
 * n'atteint un adaptateur sans passer par `parsePublicHttpUrl` (allowlist
 * publique, protection SSRF, DNS pinning existants), et seul HTTPS est accepté
 * pour une résolution produit.
 */

export interface AyWebsPageAnalysis {
  url: string;
  normalizedUrl: string;
  storeId: string | null;
  storeName: string | null;
  integrationType: string | null;
  registered: boolean;
  browseAllowed: boolean;
  captureAllowed: boolean;
  pageType: AyWebsPageType;
  isProductPage: boolean;
  customerActionRequired: AyWebsPageClassification['customerActionRequired'];
  reason: string;
  /** Mode de navigation décidé par le registre, jamais par l'écran. */
  browserMode: 'embedded' | 'external';
  /** Piste de secours quand la boutique n'est pas intégrée (§23). */
  fallback: 'product_capture' | 'purchase_request' | 'store_request';
  analyzedAt: string;
}

export interface AyWebsPageAnalysisOptions {
  captureEnabled?: boolean;
  /** `null` = domaine absent du Store Registry : la garde répond « non » (§7). */
  storeCaptureEnabled?: (store: AyWebsStoreDefinition | null | undefined) => boolean;
}

/**
 * Analyse une URL SANS la charger : décision de navigation et de type de page.
 * C'est l'appel rapide qui permet à l'écran de réagir immédiatement (§52),
 * la résolution produit lourde venant ensuite en arrière-plan.
 */
export function analyzeAyWebsUrl(
  rawUrl: unknown,
  scraper: SmartLinkScraper,
  options: AyWebsPageAnalysisOptions = {},
): AyWebsPageAnalysis {
  const input = String(rawUrl ?? '').trim();
  const cleaned = input ? scraper.cleanPastedUrl(input) : '';
  const analyzedAt = new Date().toISOString();

  if (!cleaned || cleaned.length > 4096) {
    throw new AyWebsDomainError('INVALID_URL');
  }

  let url: URL;
  try {
    url = parsePublicHttpUrl(cleaned);
  } catch (error) {
    throw new AyWebsDomainError('INVALID_URL', {
      technicalMessage: error instanceof UnsafeUrlError ? error.message : 'url_hors_allowlist_publique',
    });
  }

  const store = detectAyWebsStore(url.toString());
  const captureEnabled = options.captureEnabled !== false;
  const storeCapture = options.storeCaptureEnabled ? options.storeCaptureEnabled(store) : Boolean(store?.captureSupported);
  const { adapter } = resolveAyWebsAdapter(url.toString(), scraper);
  const classification = adapter.classifyPage(url);

  const registered = Boolean(store?.enabled);
  const browseAllowed = registered && store?.capabilities.includes('browse') !== false;
  const captureAllowed = registered && captureEnabled && storeCapture && store?.capabilities.includes('product') === true;

  let fallback: AyWebsPageAnalysis['fallback'] = 'product_capture';
  if (!registered) fallback = 'purchase_request';
  else if (!captureAllowed) fallback = store?.integrationType === 'BLOCKED' ? 'store_request' : 'purchase_request';

  return {
    url: input,
    normalizedUrl: url.toString(),
    storeId: store?.id || null,
    storeName: store?.displayName || store?.name || null,
    integrationType: store?.integrationType || null,
    registered,
    browseAllowed,
    captureAllowed,
    pageType: classification.pageType,
    isProductPage: classification.isProductPage,
    customerActionRequired: classification.customerActionRequired,
    reason: classification.reason,
    browserMode: store?.browserMode || 'external',
    fallback,
    analyzedAt,
  };
}

/**
 * Analyse avec classification côté adaptateur enregistré uniquement : utilisé
 * par `POST /page/analyze`, qui doit refuser une résolution sur un domaine hors
 * registre sans pour autant empêcher le chemin « Order with URL ».
 */
export function analyzeRegisteredAyWebsPage(
  rawUrl: unknown,
  scraper: SmartLinkScraper,
  options: AyWebsPageAnalysisOptions = {},
): AyWebsPageAnalysis {
  const analysis = analyzeAyWebsUrl(rawUrl, scraper, options);
  if (!analysis.registered) {
    throw new AyWebsDomainError('DOMAIN_NOT_ALLOWED', {
      technicalMessage: `domaine ${new URL(analysis.normalizedUrl).hostname} absent du Store Registry`,
    });
  }
  return analysis;
}

/**
 * Garde d'entrée de la résolution produit : HTTPS obligatoire, domaine du
 * registre obligatoire, fiche produit obligatoire (§10, §45).
 */
export function assertAyWebsProductPage(
  rawUrl: unknown,
  scraper: SmartLinkScraper,
  options: AyWebsPageAnalysisOptions = {},
): { analysis: AyWebsPageAnalysis; store: AyWebsStoreDefinition; url: URL } {
  const analysis = analyzeAyWebsUrl(rawUrl, scraper, options);
  const url = new URL(analysis.normalizedUrl);

  if (url.protocol !== 'https:') throw new AyWebsDomainError('HTTPS_REQUIRED');
  if (!analysis.registered) throw new AyWebsDomainError('DOMAIN_NOT_ALLOWED');

  const store = findAyWebsStore(analysis.storeId);
  if (!store) throw new AyWebsDomainError('STORE_UNKNOWN');
  if (store.integrationType === 'BLOCKED') {
    throw new AyWebsDomainError('STORE_CAPTURE_UNSUPPORTED', {
      technicalMessage: 'integrationType=BLOCKED dans le Store Registry',
    });
  }
  if (!analysis.captureAllowed) {
    throw new AyWebsDomainError('STORE_CAPTURE_UNSUPPORTED', {
      technicalMessage: `capture désactivée pour ${store.id} (flag runtime ou capacité absente)`,
    });
  }

  const adapter = createAyWebsAdapter(store, scraper);
  const classification = adapter.classifyPage(url);

  // Une page LOGIN/CAPTCHA/2FA n'est JAMAIS contournée (§27) : le client agit.
  if (classification.pageType === 'CAPTCHA') {
    throw new AyWebsDomainError('CAPTCHA_REQUIRED', { technicalMessage: `classification CAPTCHA sur ${url.hostname}` });
  }
  if (classification.pageType === 'LOGIN') {
    throw new AyWebsDomainError('AUTH_REQUIRED', {
      userMessage: 'La boutique demande une connexion. Connectez-vous dans le navigateur, puis revenez.',
      technicalMessage: `classification LOGIN sur ${url.hostname}`,
    });
  }
  if (classification.customerActionRequired !== 'NONE' && classification.customerActionRequired !== 'LOGIN') {
    throw new AyWebsDomainError('CUSTOMER_ACTION_REQUIRED', {
      technicalMessage: `action client requise : ${classification.customerActionRequired}`,
    });
  }

  // Le panier/checkout du MARCHAND n'est pas le panier AYWEBs (§4) : on ne lit
  // rien là-dedans, on renvoie le client vers la fiche produit.
  if (classification.pageType === 'CHECKOUT') {
    throw new AyWebsDomainError('PRODUCT_PAGE_REQUIRED', {
      userMessage: 'Cette page est le panier de la boutique. Ouvrez la fiche du produit, puis copiez son lien.',
      technicalMessage: 'pageType=CHECKOUT : le panier marchand n\'est pas une source AYWEBs',
    });
  }

  if (!classification.isProductPage) {
    throw new AyWebsDomainError('PRODUCT_PAGE_REQUIRED', {
      technicalMessage: `pageType=${classification.pageType} — aucune identité produit exploitable`,
    });
  }

  return { analysis, store, url };
}

/* ------------------------------------------------------------------ *
 * Session context (§26) — le contexte d'achat ne disparaît pas entre écrans
 * ------------------------------------------------------------------ */

export interface AyWebsSessionState {
  sessionId: string;
  accountId: string | null;
  currentStoreId: string | null;
  currentUrl: string | null;
  currentProductId: string | null;
  selectedVariant: Record<string, unknown> | null;
  cartId: string | null;
  cartItemCount: number;
  updatedAt: string;
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

export function assertAyWebsSessionId(rawSessionId: unknown): string {
  const sessionId = String(rawSessionId || '').trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new AyWebsDomainError('SESSION_REQUIRED');
  return sessionId;
}

/** Lit (ou crée) le contexte de session AYWEBs. */
export function readAyWebsSession(db: QatafoDatabase, sessionId: string, accountId: string | null): AyWebsSessionState {
  ensureAyWebsSchema(db);
  const now = new Date().toISOString();
  const row = db.get<any>(`SELECT * FROM ayweb_sessions WHERE session_id=?`, sessionId);
  if (row) {
    if (accountId && String(row.account_id || '') !== accountId) {
      db.run(`UPDATE ayweb_sessions SET account_id=?, updated_at=? WHERE session_id=?`, accountId, now, sessionId);
      row.account_id = accountId;
    }
    return hydrateSession(row, db);
  }
  db.run(
    `INSERT INTO ayweb_sessions (session_id,account_id,current_store_id,current_url,current_product_id,selected_variant,cart_id,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    sessionId, accountId, '', '', '', 'null', null, now,
  );
  return {
    sessionId,
    accountId,
    currentStoreId: null,
    currentUrl: null,
    currentProductId: null,
    selectedVariant: null,
    cartId: null,
    cartItemCount: 0,
    updatedAt: now,
  };
}

function hydrateSession(row: any, db: QatafoDatabase): AyWebsSessionState {
  let selectedVariant: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(row.selected_variant || 'null');
    if (parsed && typeof parsed === 'object') selectedVariant = parsed;
  } catch { selectedVariant = null; }
  const cartId = row.cart_id ? String(row.cart_id) : null;
  const cartItemCount = cartId
    ? Number(db.get<{ count: number }>(
        `SELECT COALESCE(SUM(quantity),0) AS count FROM ayweb_cart_items WHERE cart_id=? AND status!='REMOVED'`, cartId,
      )?.count || 0)
    : 0;
  return {
    sessionId: String(row.session_id),
    accountId: row.account_id ? String(row.account_id) : null,
    currentStoreId: String(row.current_store_id || '') || null,
    currentUrl: String(row.current_url || '') || null,
    currentProductId: String(row.current_product_id || '') || null,
    selectedVariant,
    cartId,
    cartItemCount,
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

/** Mémorise le contexte de navigation (boutique, URL, produit, variante). */
export function touchAyWebsSession(
  db: QatafoDatabase,
  sessionId: string,
  accountId: string | null,
  patch: Partial<Pick<AyWebsSessionState, 'currentStoreId' | 'currentUrl' | 'currentProductId' | 'selectedVariant' | 'cartId'>>,
): AyWebsSessionState {
  ensureAyWebsSchema(db);
  const current = readAyWebsSession(db, sessionId, accountId);
  const next = {
    currentStoreId: patch.currentStoreId !== undefined ? patch.currentStoreId : current.currentStoreId,
    currentUrl: patch.currentUrl !== undefined ? patch.currentUrl : current.currentUrl,
    currentProductId: patch.currentProductId !== undefined ? patch.currentProductId : current.currentProductId,
    selectedVariant: patch.selectedVariant !== undefined ? patch.selectedVariant : current.selectedVariant,
    cartId: patch.cartId !== undefined ? patch.cartId : current.cartId,
  };
  db.run(
    `UPDATE ayweb_sessions SET account_id=?, current_store_id=?, current_url=?, current_product_id=?, selected_variant=?, cart_id=?, updated_at=?
     WHERE session_id=?`,
    accountId, next.currentStoreId || '', next.currentUrl || '', next.currentProductId || '',
    JSON.stringify(next.selectedVariant ?? null), next.cartId || null, new Date().toISOString(), sessionId,
  );
  return readAyWebsSession(db, sessionId, accountId);
}

/* ------------------------------------------------------------------ *
 * Recently visited (§6) — survit à la fermeture de l'app (§51)
 * ------------------------------------------------------------------ */

export interface AyWebsRecentStore {
  storeId: string;
  storeName: string;
  visitedUrl: string;
  visitCount: number;
  lastVisitedAt: string;
}

export function recordAyWebsStoreVisit(
  db: QatafoDatabase,
  input: { sessionId: string; accountId: string | null; storeId: string; visitedUrl?: string | null },
): void {
  if (!input.storeId) return;
  ensureAyWebsSchema(db);
  const now = new Date().toISOString();
  const id = `aywrec_${randomUUID()}`;
  const visitedUrl = String(input.visitedUrl || '').slice(0, 4096);
  try {
    db.run(
      `INSERT INTO ayweb_recent_stores (id,session_id,account_id,store_id,visited_url,visit_count,last_visited_at)
       VALUES (?,?,?,?,?,1,?)
       ON CONFLICT(session_id, account_id, store_id) DO UPDATE SET
         visit_count = visit_count + 1,
         visited_url = CASE WHEN excluded.visited_url <> '' THEN excluded.visited_url ELSE ayweb_recent_stores.visited_url END,
         last_visited_at = excluded.last_visited_at`,
      id, input.sessionId, input.accountId, input.storeId, visitedUrl, now,
    );
  } catch (error) {
    // Le contexte récent est un confort : il ne doit jamais bloquer la navigation.
    console.warn('[AyWebs Session] recent store failed', error instanceof Error ? error.message : error);
  }
}

export function listAyWebsRecentStores(db: QatafoDatabase, sessionId: string, accountId: string | null, limit = 6): AyWebsRecentStore[] {
  ensureAyWebsSchema(db);
  const cap = Math.max(1, Math.min(20, Number(limit) || 6));
  const rows = db.all<any>(
    `SELECT * FROM ayweb_recent_stores
     WHERE session_id=? OR (account_id IS NOT NULL AND account_id=?)
     ORDER BY last_visited_at DESC LIMIT ?`,
    sessionId, accountId, cap,
  );
  return rows.map((row) => {
    const store = findAyWebsStore(row.store_id);
    return {
      storeId: String(row.store_id),
      storeName: store?.displayName || store?.name || String(row.store_id),
      visitedUrl: String(row.visited_url || ''),
      visitCount: Number(row.visit_count) || 1,
      lastVisitedAt: String(row.last_visited_at),
    };
  });
}

/** Boutiques populaires du registre (§6) — données, pas une liste codée dans l'écran. */
export function listAyWebsPopularStores(): AyWebsStoreDefinition[] {
  return AYWEBS_STORES.filter((store) => store.enabled && store.popular);
}

export { AyWebsCaptureError };
