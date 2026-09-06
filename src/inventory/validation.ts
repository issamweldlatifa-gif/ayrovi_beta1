/**
 * AYROVI Inventory (P2.2) — validation côté serveur.
 *
 * Le back-office n'est pas l'autorité : toute règle qui protège l'intégrité du stock
 * (quantité entière positive, sens connu, motif connu, référence d'enregistrement valide,
 * emplacement court) est évaluée ici, avant le moindre SQL, et renvoie un code de refus
 * que la route traduit en réponse — jamais un 500, jamais un silence.
 *
 * La forme `Check<T>` est celle du catalogue (union discriminée inutilisable avec
 * `strict: false` dans ce dépôt) : on teste `ok`, puis on lit `value` ou on propage.
 */
import type { QatafoDatabase } from '../db/database';
import {
  INVENTORY_ERRORS, MAX_MOVEMENT_QUANTITY, MAX_REASON_LENGTH, MOVEMENT_DIRECTIONS,
  MOVEMENT_REASONS, STOCKTAKE_STATUSES, type MovementDirection, type MovementReason, type StocktakeStatus,
} from './types';

export interface FieldIssue { field: string; reason: string }

export interface Check<T> {
  ok: boolean;
  value?: T;
  code?: string;
  message?: string;
  details?: FieldIssue[];
}

export function fail(code: string, message: string, details?: FieldIssue[]): Check<never> {
  return { ok: false, code, message, ...(details && details.length ? { details } : {}) };
}

export function pass<T>(value: T): Check<T> {
  return { ok: true, value };
}

export function propagate<T>(check: Check<any>): Check<T> {
  return { ok: false, code: check.code ?? INVENTORY_ERRORS.VALIDATION, message: check.message || 'Requête de stock invalide.', details: check.details };
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

// `isIdentifier`, `paginationOf` et `sortOf` ne sont plus redéfinis ici : depuis P2.3, ces
// trois primitives — qui ne portent aucune règle propre au stock — vivent dans
// `src/domain/query.ts` et sont ré-exportées telles quelles (logique identique au caractère
// près, vérifiée à la reprise). Le module Achats, qui allait les recopier, les lit à la même
// source : une seule politique de pagination et de tri dans le dépôt.
import { isIdentifier, locationLabelField, paginationOf, sortOf } from '../domain/query';
export { isIdentifier, paginationOf, sortOf };

/**
 * Un emplacement est une étiquette courte (« MAIN », « TUNIS-1 »), pas du texte libre. Depuis
 * P2.3, la grammaire vit dans `domain/query.locationLabelField`, partagée avec le module Achats :
 * deux modules ne décrivent plus le même concept chacun de leur côté. Comportement identique à
 * la reprise (même regex, même repli, même majuscule en sortie), seul le chemin change.
 */
export function locationField(value: unknown, fallback = 'MAIN'): Check<string> {
  const raw = String(value ?? '').trim();
  if (!raw) return pass(fallback);
  return locationLabelField(raw, 'emplacement', INVENTORY_ERRORS.VALIDATION, fallback);
}

/**
 * Quantité d'un mouvement, entier et borné (une faute de frappe n'est pas un stock).
 * Pour une entrée ou une sortie elle est strictement positive — le sens est porté par
 * `direction`. Pour un ajustement elle est signée, parce que l'écart constaté peut aller
 * dans les deux sens et qu'un deuxième champ « augmentation/diminution » serait une
 * seconde source de vérité.
 */
export function quantityField(value: unknown, field = 'quantity', signed = false): Check<number> {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    return fail(INVENTORY_ERRORS.VALIDATION, `« ${field} » doit être un nombre entier.`, [{ field, reason: 'INTEGER' }]);
  }
  if (signed ? number === 0 : number <= 0) {
    return fail(INVENTORY_ERRORS.VALIDATION, signed
      ? `« ${field} » ne peut pas être nul : un ajustement à zéro n’a rien à tracer.`
      : `« ${field} » doit être strictement positif.`, [{ field, reason: signed ? 'NON_ZERO' : 'POSITIVE' }]);
  }
  if (Math.abs(number) > MAX_MOVEMENT_QUANTITY) {
    return fail(INVENTORY_ERRORS.VALIDATION, `« ${field} » dépasse ${MAX_MOVEMENT_QUANTITY.toLocaleString('fr-FR')} : vérifiez la saisie.`, [{ field, reason: 'RANGE' }]);
  }
  return pass(number);
}

/** Quantité comptée lors d'un inventaire : le zéro est une mesure, pas une absence. */
export function countedQuantityField(value: unknown): Check<number> {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0) {
    return fail(INVENTORY_ERRORS.VALIDATION, '« quantite_comptee » doit être un entier positif ou nul.', [{ field: 'counted_quantity', reason: 'NON_NEGATIVE_INTEGER' }]);
  }
  if (number > MAX_MOVEMENT_QUANTITY) return fail(INVENTORY_ERRORS.VALIDATION, '« quantite_comptee » est trop grande.', [{ field: 'counted_quantity', reason: 'RANGE' }]);
  return pass(number);
}

export function directionField(value: unknown): Check<MovementDirection> {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!(MOVEMENT_DIRECTIONS as readonly string[]).includes(raw)) {
    return fail(INVENTORY_ERRORS.VALIDATION, `« direction » doit valoir ${MOVEMENT_DIRECTIONS.join(', ')}.`, [{ field: 'direction', reason: 'ENUM' }]);
  }
  return pass(raw as MovementDirection);
}

export function reasonField(value: unknown): Check<MovementReason> {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!(MOVEMENT_REASONS as readonly string[]).includes(raw)) {
    return fail(INVENTORY_ERRORS.VALIDATION, '« motif » est inconnu du module de stock.', [{ field: 'reason', reason: 'ENUM' }]);
  }
  return pass(raw as MovementReason);
}

export function stocktakeStatusField(value: unknown): Check<StocktakeStatus> {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!(STOCKTAKE_STATUSES as readonly string[]).includes(raw)) {
    return fail(INVENTORY_ERRORS.VALIDATION, '« statut » d’inventaire inconnu.', [{ field: 'status', reason: 'ENUM' }]);
  }
  return pass(raw as StocktakeStatus);
}

/** Note / motif libre : borné, vidé de ses blancs, jamais coupé silencieusement. */
export function textField(value: unknown, field: string, max = MAX_REASON_LENGTH): Check<string> {
  const text = String(value ?? '').trim();
  if (text.length > max) return fail(INVENTORY_ERRORS.VALIDATION, `« ${field} » dépasse ${max} caractères.`, [{ field, reason: 'LENGTH' }]);
  return pass(text);
}

export interface MovementInput {
  itemId?: string;
  productCode?: string;
  productId?: string;
  variantId?: string | null;
  location: string;
  direction: MovementDirection;
  quantity: number;
  reason: MovementReason;
  note: string;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
}

/**
 * Payload de mouvement. La ligne de stock est visée soit par son id, soit par
 * (code produit ou id produit)+emplacement : les deux chemins sont validés, aucun ne
 * laisse passer un identifiant arbitraire dans le SQL.
 */
export function parseMovement(db: QatafoDatabase, body: Record<string, any> = {}): Check<MovementInput> {
  const hasItemId = isIdentifier(body.itemId ?? body.item_id);
  const hasProductRef = isIdentifier(body.productId ?? body.product_id) || String(body.productCode ?? body.product_code ?? '').trim().length > 0;
  if (!hasItemId && !hasProductRef) {
    return fail(INVENTORY_ERRORS.VALIDATION, 'Un mouvement doit viser une ligne de stock (`item_id`) ou un produit (`product_id` / `product_code`).', [{ field: 'item_id', reason: 'REQUIRED' }]);
  }
  const location = locationField(body.location);
  if (!location.ok) return propagate(location);
  const direction = directionField(body.direction);
  if (!direction.ok) return propagate(direction);
  const quantity = quantityField(body.quantity, 'quantity', direction.value === 'ADJUST');
  if (!quantity.ok) return propagate(quantity);
  const reason = reasonField(body.reason);
  if (!reason.ok) return propagate(reason);
  // Un ajustement sans explication n'est pas un ajustement : le motif libre est obligatoire
  // dès que le mouvement n'est ni une entrée ni une sortie (c'est ce qui rend le journal utile).
  const note = textField(body.note, 'note');
  if (!note.ok) return propagate(note);
  if (direction.value === 'ADJUST' && !note.value) {
    return fail(INVENTORY_ERRORS.VALIDATION, 'Un mouvement d’ajustement exige une note : sans raison écrite, l’écart n’est pas auditable.', [{ field: 'note', reason: 'REQUIRED' }]);
  }
  const referenceType = body.reference_type ? textField(body.reference_type, 'reference_type', 40) : pass<string | null>(null);
  if (!referenceType.ok) return propagate(referenceType);
  const referenceId = body.reference_id
    ? (isIdentifier(body.reference_id) ? pass<string | null>(String(body.reference_id).trim())
      : fail(INVENTORY_ERRORS.VALIDATION, '« reference_id » n’est pas un identifiant valide.', [{ field: 'reference_id', reason: 'FORMAT' }]))
    : pass<string | null>(null);
  if (!referenceId.ok) return propagate(referenceId);
  const idempotencyKey = body.idempotency_key
    ? (ID_RE.test(String(body.idempotency_key).trim()) ? pass<string | null>(String(body.idempotency_key).trim())
      : fail(INVENTORY_ERRORS.VALIDATION, '« idempotency_key » n’est pas une clé valide.', [{ field: 'idempotency_key', reason: 'FORMAT' }]))
    : pass<string | null>(null);
  if (!idempotencyKey.ok) return propagate(idempotencyKey);
  const variantId = body.variant_id ?? body.variantId;
  if (variantId != null && variantId !== '' && !isIdentifier(variantId)) {
    return fail(INVENTORY_ERRORS.VALIDATION, '« variant_id » n’est pas un identifiant valide.', [{ field: 'variant_id', reason: 'FORMAT' }]);
  }
  return pass({
    itemId: hasItemId ? String(body.itemId ?? body.item_id).trim() : undefined,
    productId: isIdentifier(body.productId ?? body.product_id) ? String(body.productId ?? body.product_id).trim() : undefined,
    productCode: String(body.productCode ?? body.product_code ?? '').trim() || undefined,
    variantId: variantId ? String(variantId).trim() : null,
    location: location.value!,
    direction: direction.value!,
    quantity: quantity.value!,
    reason: reason.value!,
    note: note.value!,
    referenceType: referenceType.value ?? null,
    referenceId: referenceId.value ?? null,
    idempotencyKey: idempotencyKey.value ?? null,
  });
}

/** `db` n'est pas lu ici, mais reste dans la signature pour que les règles futures
 *  (produit existant, variante rattachée) s'ajoutent sans changer les appelants. */
export function assertProductResolvable(db: QatafoDatabase, productId: string): Check<{ id: string }> {
  const found = db.get<{ id: string }>('SELECT id FROM products WHERE id=?', productId);
  if (!found) return fail(INVENTORY_ERRORS.PRODUCT_NOT_FOUND, 'Produit introuvable : le stock ne crée pas de fiche produit.');
  return pass({ id: found.id });
}
