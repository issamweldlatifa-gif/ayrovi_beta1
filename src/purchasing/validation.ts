/**
 * AYROVI Purchasing (P2.3) — validation côté serveur, avant le moindre SQL.
 *
 * Même exigence que pour le stock : l'écran n'est pas l'autorité. Une quantité, un coût,
 * une devise, une qualité sont validés ici et refusés avec un code du module — jamais un
 * 500, jamais un arrondi silencieux, jamais une valeur « à peu près » stockée.
 *
 * Les primitives génériques (page, tri, identifiant, texte borné, forme `Check`) sont lues
 * dans `src/domain/query.ts`, la même source que le module Stock.
 */
import type { QatafoDatabase } from '../db/database';
import {
  Check, FieldIssue, integerField, isIdentifier, locationLabelField, paginationOf, pass,
  propagate as propagateWith, sortOf, textField as sharedTextField,
} from '../domain/query';
import {
  MAX_LINE_QUANTITY, MAX_UNIT_COST, PURCHASE_CURRENCIES, PURCHASING_ERRORS, RECEIPT_QUALITIES,
  type PurchaseCurrency, type ReceiptQuality,
} from './types';

export type { Check, FieldIssue };
export { isIdentifier, paginationOf, sortOf };

export function fail(code: string, message: string, details?: FieldIssue[]): Check<never> {
  return { ok: false, code, message, ...(details && details.length ? { details } : {}) };
}

/** Un refus de saisie, sans code à répéter à chaque ligne. */
export function invalid(message: string, details?: FieldIssue[]): Check<never> {
  return fail(PURCHASING_ERRORS.VALIDATION, message, details);
}

export function propagate<T>(check: Check<any>): Check<T> {
  return propagateWith<T>(check, PURCHASING_ERRORS.VALIDATION);
}

export function textField(value: unknown, field: string, max = 500): Check<string> {
  return sharedTextField(value, field, max, PURCHASING_ERRORS.VALIDATION);
}

/** Une quantité de commande ou de réception : entier strictement positif, borné. */
export function lineQuantityField(value: unknown, field = 'quantity'): Check<number> {
  return integerField(value, field, 1, MAX_LINE_QUANTITY, PURCHASING_ERRORS.VALIDATION);
}

/**
 * Coût unitaire en devise commande. Arrondi à 4 décimales — pas 2 : un coût d'import en EUR
 * vaut souvent 12,3456, et le réduire ici fausserait le total payé au fournisseur.
 */
export function unitCostField(value: unknown, field = 'unit_cost'): Check<number> {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return invalid(`« ${field} » doit être un nombre positif ou nul.`, [{ field, reason: 'NUMBER' }]);
  }
  if (number > MAX_UNIT_COST) {
    return invalid(`« ${field} » dépasse ${MAX_UNIT_COST.toLocaleString('fr-FR')} : vérifiez la saisie.`, [{ field, reason: 'RANGE' }]);
  }
  return pass(Math.round(number * 10000) / 10000);
}

/** Taux de change : il convertit une monnaie en une autre, il ne s'annule pas. */
export function exchangeRateField(value: unknown, field = 'exchange_rate'): Check<number> {
  const number = value === undefined || value === null || value === '' ? 1 : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100000) {
    return invalid(`« ${field} » doit être un nombre strictement positif.`, [{ field, reason: 'NUMBER' }]);
  }
  return pass(Math.round(number * 100000) / 100000);
}

export function currencyField(value: unknown, field = 'currency'): Check<PurchaseCurrency> {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return pass('TND');
  if (!(PURCHASE_CURRENCIES as readonly string[]).includes(raw)) {
    return invalid(`« ${field} » doit valoir ${PURCHASE_CURRENCIES.join(', ')}.`, [{ field, reason: 'ENUM' }]);
  }
  return pass(raw as PurchaseCurrency);
}

export function qualityField(value: unknown, field = 'quality'): Check<ReceiptQuality> {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return pass('GOOD');
  if (!(RECEIPT_QUALITIES as readonly string[]).includes(raw)) {
    return invalid(`« ${field} » doit valoir ${RECEIPT_QUALITIES.join(', ')}.`, [{ field, reason: 'ENUM' }]);
  }
  return pass(raw as ReceiptQuality);
}

export function supplierStatusField(value: unknown, field = 'status'): Check<'ACTIVE' | 'INACTIVE'> {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return pass('ACTIVE');
  if (raw !== 'ACTIVE' && raw !== 'INACTIVE') {
    return invalid(`« ${field} » doit valoir ACTIVE ou INACTIVE.`, [{ field, reason: 'ENUM' }]);
  }
  return pass(raw as 'ACTIVE' | 'INACTIVE');
}

/**
 * Une ligne d'achat vise obligatoirement une fiche du Product master : le module achats ne
 * crée jamais de produit (règle P2.1). Une ligne sans produit serait un montant sans objet.
 */
export function assertProductInCatalogue(db: QatafoDatabase, productId: string): Check<{ id: string }> {
  const trimmed = String(productId ?? '').trim();
  if (!isIdentifier(trimmed)) return invalid('« product_id » est un identifiant requis.', [{ field: 'product_id', reason: 'REQUIRED' }]);
  const found = db.get<{ id: string }>('SELECT id FROM products WHERE id=?', trimmed);
  if (!found) return fail(PURCHASING_ERRORS.PRODUCT_NOT_FOUND, 'Produit introuvable : la commande d’achat ne crée pas de fiche produit.', [{ field: 'product_id', reason: 'FK' }]);
  return pass({ id: trimmed });
}

/** Un arrivage cité doit exister ; la colonne est une lecture du CRM, jamais une écriture. */
export function assertArrivalExists(db: QatafoDatabase, arrivalId: string): Check<{ id: string }> {
  const trimmed = String(arrivalId ?? '').trim();
  if (!isIdentifier(trimmed)) return invalid('« arrival_id » est un identifiant requis.', [{ field: 'arrival_id', reason: 'REQUIRED' }]);
  const found = db.get<{ id: string }>('SELECT id FROM crm_arrivals WHERE id=?', trimmed);
  if (!found) return fail(PURCHASING_ERRORS.ARRIVAL_NOT_FOUND, 'Arrivage introuvable côté CRM.', [{ field: 'arrival_id', reason: 'FK' }]);
  return pass({ id: trimmed });
}

/** Délai fournisseur, en jours : borne haute = une erreur de colonne, pas un planning. */
export function leadTimeField(value: unknown, field = 'lead_time_days'): Check<number> {
  if (value === undefined || value === null || value === '') return pass(7);
  return integerField(value, field, 0, 3650, PURCHASING_ERRORS.VALIDATION);
}

/** Emplacement de réception : même grammaire que le stock, code d'erreur du module achats. */
export function receiptLocationField(value: unknown, field = 'location'): Check<string> {
  return locationLabelField(value, field, PURCHASING_ERRORS.VALIDATION, 'MAIN');
}

/** Un identifiant de ressource dans une route : même grammaire que partout dans l'ERP. */
export function requireId(value: unknown, field: string): Check<string> {
  const raw = String(value ?? '').trim();
  if (!isIdentifier(raw)) return invalid(`« ${field} » est un identifiant requis.`, [{ field, reason: 'FORMAT' }]);
  return pass(raw);
}

/** Une clé d'Idempotence est un jeton court : elle ne transporte pas de texte libre. */
export function idempotencyKeyField(value: unknown, field = 'idempotency_key'): Check<string | null> {
  if (value === undefined || value === null || String(value).trim() === '') return pass(null);
  const raw = String(value).trim();
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(raw)) {
    return invalid(`« ${field} » n’est pas une clé valide (lettres, chiffres, . _ : -).`, [{ field, reason: 'FORMAT' }]);
  }
  return pass(raw);
}
