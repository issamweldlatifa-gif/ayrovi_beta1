import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { validateQuoteSecret } from '../ayrovix/priceQuote';

/**
 * AYWEBs — DEVIS DE PRIX SIGNÉ (« Phase 1 », 06/10/2026).
 *
 * ── LE PROBLÈME MESURÉ ──────────────────────────────────────────────────────
 * `POST /cart/items` relisait SYSTÉMATIQUEMENT la fiche marchande
 * (`refresh: true`) avant d'écrire la ligne. Coût constaté en production le
 * 06/10/2026 : **15,8 s / 17,7 s / 17,9 s / 22,2 s** pour un simple « Ajouter
 * au panier » — pendant que `/product/resolve`, appelé juste avant par la même
 * feuille de variantes, venait de lire la MÊME page en 127 ms (cache) ou 28 s
 * (lecture froide). L'utilisateur payait donc deux fois la lecture du marchand.
 *
 * ── CE QUE FAIT CE MODULE ───────────────────────────────────────────────────
 * Au moment où le serveur a lui-même lu la fiche (et calculé son devis AYROVI),
 * il scelle un jeton HMAC-SHA256 contenant : produit, boutique, variante, prix
 * source, devise, état de stock, horodatage et expiration. Le client le renvoie
 * à l'ajout ; le panier l'accepte SANS relire le marchand, à trois conditions :
 *
 *   1. la signature est valide (le client ne peut pas fabriquer un prix) ;
 *   2. le jeton n'est pas expiré ;
 *   3. le prix/devise scellés correspondent EXACTEMENT à la ligne produit que
 *      le serveur a écrite — le panier ne facture jamais autre chose.
 *
 * Une relecture marchande reste déclenchée (comportement d'avant, intact) quand :
 *   • aucun jeton n'est fourni (clients plus anciens, appels directs) ;
 *   • le jeton est périmé, mal signé, ou ne correspond pas au produit/variante ;
 *   • le devis dépasse `AYWEBS_QUOTE_FRESH_MS` (défaut 5 min) ;
 *   • le montant dépasse `AYWEBS_QUOTE_REVERIFY_TND` (défaut 2 000 TND) ;
 *   • l'échantillon d'audit tombe (`AYWEBS_QUOTE_REVERIFY_SAMPLE`, défaut 5 %).
 *
 * ── SÉPARATION DES DOMAINES DE SIGNATURE ────────────────────────────────────
 * La clé est DÉRIVÉE par HKDF-SHA256 du secret de cotation AYROVIX avec une
 * étiquette propre à AYWEBs : un jeton de panier AYWEBs ne peut pas servir de
 * cotation AYROVIX, et inversement. Aucun secret nouveau n'est introduit.
 */

export interface AyWebsQuoteClaims {
  /** Version du format. */
  v: 1;
  /** Identifiant court du devis (audit, échantillonnage, journalisation). */
  qid: string;
  productId: string;
  storeId: string;
  /** Même clé de variante que `ayWebsVariantKey` ('' si aucune sélection). */
  variantKey: string;
  /** Prix source scellé (devise marchand). */
  price: number;
  /** Devise ISO VÉRIFIÉE (le devis n'existe pas sans preuve de devise). */
  currency: string;
  /** Empreinte d'évidence de la fiche au moment du devis. */
  evidenceHash: string;
  /** État de stock au moment du devis (AVAILABLE / LOW_STOCK). */
  availability: string;
  issuedAt: number;
  expiresAt: number;
}

export type AyWebsQuoteReverifyReason = 'FRESH' | 'STALE' | 'HIGH_VALUE' | 'SAMPLE' | 'NO_QUOTE';

const VERSION = 'aywq1';
const DEFAULT_TTL_MS = 10 * 60_000;
const MAX_TTL_MS = 30 * 60_000;
const MIN_TTL_MS = 30_000;
const DEFAULT_FRESH_MS = 5 * 60_000;
const DEFAULT_REVERIFY_TND = 2_000;
const DEFAULT_SAMPLE_RATE = 0.05;

function numberEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

export function ayWebsQuoteTtlMs(): number {
  return numberEnv('AYWEBS_QUOTE_TTL_MS', DEFAULT_TTL_MS, MIN_TTL_MS, MAX_TTL_MS);
}

/** Âge au-delà duquel un devis n'est plus considéré « frais » → relecture. */
export function ayWebsQuoteFreshMs(): number {
  return numberEnv('AYWEBS_QUOTE_FRESH_MS', DEFAULT_FRESH_MS, MIN_TTL_MS, ayWebsQuoteTtlMs());
}

/** Montant (TND) au-delà duquel on relit le marchand même sur devis frais. */
export function ayWebsQuoteReverifyTnd(): number {
  return numberEnv('AYWEBS_QUOTE_REVERIFY_TND', DEFAULT_REVERIFY_TND, 0, 1_000_000);
}

/** Proportion d'ajouts relus pour audit (0 = jamais, 1 = toujours). */
export function ayWebsQuoteSampleRate(): number {
  return numberEnv('AYWEBS_QUOTE_REVERIFY_SAMPLE', DEFAULT_SAMPLE_RATE, 0, 1);
}

/** Clé de signature AYWEBs, dérivée du secret AYROVIX (domaine séparé). */
function quoteKey(): Buffer {
  return Buffer.from(hkdfSync(
    'sha256',
    validateQuoteSecret(),
    'ayrovi:aywebs-quote-salt:v1',
    'ayrovi:aywebs-quote:v1',
    32,
  ));
}

function sign(payload: string): string {
  return createHmac('sha256', quoteKey()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Émet un jeton scellé. Retourne `null` si les données ne permettent pas un
 * devis honnête (prix ≤ 0, devise non ISO) : on n'émet jamais de promesse vide.
 */
export function createAyWebsQuoteToken(
  claims: Omit<AyWebsQuoteClaims, 'v' | 'qid' | 'issuedAt' | 'expiresAt'>,
  ttlMs = ayWebsQuoteTtlMs(),
): string | null {
  if (!claims.productId || !claims.storeId) return null;
  if (!Number.isFinite(claims.price) || claims.price <= 0) return null;
  if (!/^[A-Z]{3}$/.test(claims.currency)) return null;
  const issuedAt = Date.now();
  const full: AyWebsQuoteClaims = {
    v: 1,
    qid: randomBytes(6).toString('hex'),
    productId: String(claims.productId).slice(0, 64),
    storeId: String(claims.storeId).slice(0, 40),
    variantKey: String(claims.variantKey || '').slice(0, 400),
    price: Math.round(claims.price * 100) / 100,
    currency: claims.currency,
    evidenceHash: String(claims.evidenceHash || '').slice(0, 128),
    availability: String(claims.availability || '').slice(0, 24),
    issuedAt,
    expiresAt: issuedAt + ttlMs,
  };
  const payload = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${VERSION}.${payload}.${sign(payload)}`;
}

/**
 * Vérifie signature + expiration + forme. Ne juge PAS la correspondance métier
 * (produit/variante/prix stockés) : c'est au panier de le faire, car lui seul
 * connaît la ligne réelle qu'il s'apprête à facturer.
 */
export function inspectAyWebsQuoteToken(token: unknown): AyWebsQuoteClaims | null {
  try {
    const raw = String(token || '').trim();
    if (!raw || raw.length > 4096) return null;
    const parts = raw.split('.');
    if (parts.length !== 3 || parts[0] !== VERSION) return null;
    const [, payload, signature] = parts;
    if (!payload || !signature) return null;
    if (!safeEqual(signature, sign(payload))) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AyWebsQuoteClaims;
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.productId !== 'string' || typeof parsed.storeId !== 'string') return null;
    if (!Number.isFinite(parsed.price) || parsed.price <= 0) return null;
    if (!/^[A-Z]{3}$/.test(String(parsed.currency))) return null;
    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Décide si la relecture marchande reste nécessaire malgré un jeton valide.
 * Échantillonnage DÉTERMINISTE à partir de (qid, graine) : rejouable en test,
 * et non manipulable par le client (le qid est signé par le serveur).
 */
export function shouldReverifyAyWebsQuote(
  claims: AyWebsQuoteClaims,
  context: { totalTND?: number; seed?: string },
): { reverify: boolean; reason: AyWebsQuoteReverifyReason } {
  const age = Date.now() - Number(claims.issuedAt || 0);
  if (!Number.isFinite(age) || age > ayWebsQuoteFreshMs()) return { reverify: true, reason: 'STALE' };
  const threshold = ayWebsQuoteReverifyTnd();
  if (threshold > 0 && Number(context.totalTND || 0) > threshold) return { reverify: true, reason: 'HIGH_VALUE' };
  const rate = ayWebsQuoteSampleRate();
  if (rate > 0) {
    const digest = createHmac('sha256', 'ayrovi:aywebs-quote-sample:v1')
      .update(`${claims.qid}|${String(context.seed || '')}`)
      .digest();
    const draw = digest.readUInt32BE(0) / 0x1_0000_0000;
    if (draw < rate) return { reverify: true, reason: 'SAMPLE' };
  }
  return { reverify: false, reason: 'FRESH' };
}
