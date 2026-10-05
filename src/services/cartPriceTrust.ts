import type { QatafoDatabase } from '../db/database';
import { inspectAyrovixPriceToken, verifyAyrovixPriceToken } from '../ayrovix/priceQuote';
import type { CartItem } from '../types';

/**
 * CONFIANCE DU PRIX AU MOMENT DE LA COMMANDE (05/10/2026).
 *
 * Le défaut fermé ici : le panier mémorisait `priceVerificationStatus` mais pas
 * la preuve signée du prix. La commande faisait donc confiance à un statut —
 * une chaîne de caractères — et un prix attesté il y a trois semaines devenait
 * un montant encaissable sans qu'aucune source ne soit relue.
 *
 * Règle désormais : une ligne `VERIFIED` doit présenter, AU MOMENT de la
 * commande, le jeton signé par le serveur (`createAyrovixPriceToken`) pour
 * exactement le prix, la devise, le titre et le lien de la ligne. Le jeton porte
 * sa propre expiration (30 minutes par défaut, comme la cotation Lens). Passé
 * ce délai, la ligne est `STALE` : la commande est refusée avec la raison, et
 * rien n'est créé — pas de commande bloquée, pas de montant périmé encaissé.
 *
 * Le chemin manuel historique n'est PAS modifié : une ligne `PENDING_MANUAL`
 * suit la revue humaine existante (contrat de variante, confirmation AYROVI).
 */

/** Durée de vie de la cotation Lens ; le jeton signé la porte lui-même. */
export const CART_QUOTE_TTL_MS = 30 * 60_000;

/**
 * Fenêtre accordée aux lignes écrites AVANT la persistance des jetons : leur
 * ajout a bien été vérifié par le serveur, mais la preuve n'a pas été gardée.
 * On accepte une ligne récente, jamais une ligne ancienne.
 */
export const CART_QUOTE_LEGACY_GRACE_MS = 30 * 60_000;

export type CartLinePriceTrustStatus = 'FRESH' | 'MANUAL' | 'STALE';

export interface CartLinePriceTrust {
  itemId: string;
  status: CartLinePriceTrustStatus;
  reason: string;
  /** Expiration de la cotation signée, quand elle existe et est authentique. */
  expiresAt: string | null;
}

export interface CartPriceTrustReport {
  lines: CartLinePriceTrust[];
  /** Lignes qui interdisent la création de la commande. */
  blocking: CartLinePriceTrust[];
  byId: Record<string, CartLinePriceTrust>;
}

function lineTrust(db: QatafoDatabase, item: CartItem, proofs: Record<string, string>, now: number): CartLinePriceTrust {
  const itemId = String(item.id);
  if (item.priceVerificationStatus === 'PENDING_MANUAL') {
    return { itemId, status: 'MANUAL', reason: 'MANUAL_REVIEW_PATH', expiresAt: null };
  }
  const token = proofs[itemId] || '';
  if (token) {
    const claims = inspectAyrovixPriceToken(token);
    const expiresAt = claims ? new Date(claims.expiresAt).toISOString() : null;
    const valid = verifyAyrovixPriceToken(token, {
      price: Number(item.sourcePrice),
      currency: String(item.sourceCurrency || ''),
      title: String(item.title || ''),
      referenceUrl: String(item.referenceUrl || ''),
      status: 'VERIFIED',
    }, now);
    return valid
      ? { itemId, status: 'FRESH', reason: 'TOKEN_VALID', expiresAt }
      : { itemId, status: 'STALE', reason: 'TOKEN_EXPIRED_OR_ALTERED', expiresAt };
  }
  // Ligne antérieure à la persistance des jetons : seule la fraîcheur de la
  // ligne elle-même peut attester d'un ajout récent.
  const addedAt = Date.parse(String(item.updatedAt || ''));
  const recent = Number.isFinite(addedAt) && now - addedAt >= -60_000 && now - addedAt <= CART_QUOTE_LEGACY_GRACE_MS;
  return recent
    ? { itemId, status: 'FRESH', reason: 'LEGACY_RECENT', expiresAt: new Date(addedAt + CART_QUOTE_LEGACY_GRACE_MS).toISOString() }
    : { itemId, status: 'STALE', reason: 'TOKEN_MISSING', expiresAt: null };
}

/** One decision shared by the cart read (display) and the checkout gate. */
export function verifyCartPriceTrust(db: QatafoDatabase, items: CartItem[], now = Date.now()): CartPriceTrustReport {
  const proofs = db.getCartLinePriceTokens(items.map((item) => String(item.id)));
  const lines = items.map((item) => lineTrust(db, item, proofs, now));
  const byId: Record<string, CartLinePriceTrust> = {};
  for (const line of lines) byId[line.itemId] = line;
  return { lines, blocking: lines.filter((line) => line.status === 'STALE'), byId };
}

/** Message porté au client : la raison exacte, jamais un refus anonyme. */
export const CART_PRICE_TRUST_MESSAGE =
  'Le prix vérifié d’un article du panier a expiré. Relancez la vérification du prix (Lens) pour cet article, puis validez la commande.';
