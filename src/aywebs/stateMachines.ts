import {
  AYWEBS_CUSTOMER_TIMELINE,
  AYWEBS_MASTER_FLOW,
  type AyWebsCartStatus,
  type AyWebsCustomerTimelineKey,
  type AyWebsExceptionState,
  type AyWebsMasterStage,
  type AyWebsOrderStatus,
  type AyWebsPackageState,
  type AyWebsPurchaseRequestStatus,
  type AyWebsPurchaseStatus,
  type AyWebsWarehouseState,
} from '../../shared/aywebsTypes';

/**
 * AYWEBs — Master state machine (§54) et machines dérivées.
 *
 * Une seule source de vérité pour « quel état peut suivre quel état ». Aucun
 * service ni écran ne décide d'une transition : on demande à cette machine, et
 * un refus est une erreur métier (`ORDER_STATE_INVALID`), jamais un saut
 * silencieux. Les branches d'exception sont des états RÉELS avec une raison
 * obligatoire — jamais un succès déguisé (§48).
 */

export interface StateMachineResult<S extends string> {
  allowed: boolean;
  from: S;
  to: S;
  /** Pourquoi le refus, lisible par un ingénieur. */
  reason: string;
}

function buildMachine<S extends string>(transitions: Record<string, readonly S[]>) {
  return {
    can(from: S, to: S): boolean {
      if (from === to) return true;
      return (transitions[from] || []).includes(to);
    },
    assert(from: S, to: S): StateMachineResult<S> {
      if (from === to) return { allowed: true, from, to, reason: 'no-op' };
      const allowed = (transitions[from] || []).includes(to);
      return {
        allowed,
        from,
        to,
        reason: allowed ? 'allowed' : `transition refusée : ${from} → ${to}`,
      };
    },
    next(from: S): readonly S[] {
      return transitions[from] || [];
    },
    states(): readonly string[] {
      return Object.keys(transitions);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Master flow (§54)
 * ------------------------------------------------------------------ */

const MASTER_TRANSITIONS: Record<string, readonly AyWebsMasterStage[]> = {
  DISCOVERY: ['STORE_SELECTED'],
  STORE_SELECTED: ['BROWSING', 'DISCOVERY'],
  BROWSING: ['PRODUCT_DETECTED', 'STORE_SELECTED'],
  PRODUCT_DETECTED: ['PRODUCT_RESOLVED', 'BROWSING'],
  PRODUCT_RESOLVED: ['VARIANT_REQUIRED', 'AVAILABILITY_CONFIRMED', 'BROWSING'],
  VARIANT_REQUIRED: ['VARIANT_SELECTED', 'PRODUCT_RESOLVED'],
  VARIANT_SELECTED: ['AVAILABILITY_CONFIRMED', 'VARIANT_REQUIRED'],
  AVAILABILITY_CONFIRMED: ['CART', 'VARIANT_SELECTED'],
  CART: ['CHECKOUT', 'BROWSING'],
  CHECKOUT: ['PAYMENT_PENDING', 'CART'],
  PAYMENT_PENDING: ['PAID', 'CHECKOUT'],
  PAID: ['PURCHASE_PENDING'],
  PURCHASE_PENDING: ['PURCHASING'],
  PURCHASING: ['PURCHASED'],
  PURCHASED: ['SUPPLIER_SHIPPED'],
  SUPPLIER_SHIPPED: ['WAREHOUSE_RECEIVED'],
  WAREHOUSE_RECEIVED: ['CONSOLIDATION'],
  CONSOLIDATION: ['PACKED'],
  PACKED: ['SHIPPING_PAYMENT'],
  SHIPPING_PAYMENT: ['DISPATCHED'],
  DISPATCHED: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
};

export const ayWebsMasterMachine = buildMachine<AyWebsMasterStage>(MASTER_TRANSITIONS);

/**
 * Le parcours nominal ne suffit pas : chaque étape peut basculer sur une
 * exception. Cette table dit OÙ une exception est légitime — une exception
 * hors contexte est un bug, pas un état.
 */
const MASTER_EXCEPTIONS: Record<string, readonly AyWebsExceptionState[]> = {
  PRODUCT_DETECTED: ['AUTH_REQUIRED', 'CAPTCHA_REQUIRED', 'CUSTOMER_ACTION_REQUIRED', 'NOT_IMPLEMENTED'],
  PRODUCT_RESOLVED: ['PRICE_CHANGED', 'OUT_OF_STOCK', 'CUSTOMER_ACTION_REQUIRED', 'PENDING_INTEGRATION', 'NOT_IMPLEMENTED'],
  VARIANT_REQUIRED: ['VARIANT_UNAVAILABLE', 'OUT_OF_STOCK', 'CUSTOMER_ACTION_REQUIRED'],
  VARIANT_SELECTED: ['VARIANT_UNAVAILABLE', 'OUT_OF_STOCK', 'PRICE_CHANGED'],
  AVAILABILITY_CONFIRMED: ['OUT_OF_STOCK', 'PRICE_CHANGED'],
  CART: ['PRICE_CHANGED', 'VARIANT_UNAVAILABLE', 'OUT_OF_STOCK'],
  CHECKOUT: ['PRICE_CHANGED', 'VARIANT_UNAVAILABLE', 'OUT_OF_STOCK'],
  PAYMENT_PENDING: ['PAYMENT_FAILED'],
  PAID: ['PENDING_INTEGRATION'],
  PURCHASE_PENDING: ['PENDING_INTEGRATION', 'PURCHASE_FAILED'],
  PURCHASING: ['PRICE_CHANGED', 'VARIANT_UNAVAILABLE', 'OUT_OF_STOCK', 'PURCHASE_FAILED', 'CAPTCHA_REQUIRED', 'AUTH_REQUIRED'],
  PURCHASED: ['PURCHASE_FAILED'],
  SUPPLIER_SHIPPED: ['PURCHASE_FAILED'],
  PACKED: ['SHIPPING_FAILED'],
  SHIPPING_PAYMENT: ['SHIPPING_FAILED', 'PAYMENT_FAILED'],
  DISPATCHED: ['SHIPPING_FAILED'],
  IN_TRANSIT: ['SHIPPING_FAILED'],
};

export function ayWebsExceptionAllowed(stage: AyWebsMasterStage, exception: AyWebsExceptionState): boolean {
  return (MASTER_EXCEPTIONS[stage] || []).includes(exception);
}

export function ayWebsExceptionsFor(stage: AyWebsMasterStage): readonly AyWebsExceptionState[] {
  return MASTER_EXCEPTIONS[stage] || [];
}

/**
 * Projection client (§36). Le client ne voit JAMAIS les états techniques :
 * cette fonction traduit l'état métier en étapes compréhensibles, avec
 * `done` / `current` / `pending`.
 */
export interface AyWebsTimelineStep {
  key: AyWebsCustomerTimelineKey;
  state: 'done' | 'current' | 'pending';
}

export function ayWebsCustomerTimeline(status: AyWebsOrderStatus): AyWebsTimelineStep[] {
  const flowIndex = AYWEBS_MASTER_FLOW.indexOf(status as AyWebsMasterStage);
  const cancelled = status === 'CANCELLED';
  return AYWEBS_CUSTOMER_TIMELINE.map((step) => {
    const stepIndexes = step.stages
      .map((stage) => AYWEBS_MASTER_FLOW.indexOf(stage))
      .filter((index) => index >= 0);
    const firstIndex = stepIndexes.length ? Math.min(...stepIndexes) : Number.POSITIVE_INFINITY;
    const lastIndex = stepIndexes.length ? Math.max(...stepIndexes) : Number.NEGATIVE_INFINITY;
    let state: AyWebsTimelineStep['state'] = 'pending';
    if (cancelled) state = 'pending';
    else if (flowIndex < 0) state = 'pending';
    else if (flowIndex > lastIndex) state = 'done';
    else if (flowIndex >= firstIndex) state = 'current';
    return { key: step.key, state };
  });
}

/* ------------------------------------------------------------------ *
 * Order status (§21, §22, §33-35)
 * ------------------------------------------------------------------ */

const ORDER_TRANSITIONS: Record<string, readonly AyWebsOrderStatus[]> = {
  DRAFT: ['CHECKOUT', 'CANCELLED'],
  CHECKOUT: ['PAYMENT_PENDING', 'DRAFT', 'CANCELLED'],
  PAYMENT_PENDING: ['PAID', 'CHECKOUT', 'CANCELLED'],
  PAID: ['PURCHASE_PENDING', 'CANCELLED'],
  PURCHASE_PENDING: ['PURCHASING', 'CANCELLED'],
  PURCHASING: ['PURCHASED', 'CANCELLED'],
  PURCHASED: ['SUPPLIER_SHIPPED'],
  SUPPLIER_SHIPPED: ['WAREHOUSE_RECEIVED'],
  WAREHOUSE_RECEIVED: ['CONSOLIDATION'],
  CONSOLIDATION: ['PACKED'],
  PACKED: ['SHIPPING_PAYMENT'],
  SHIPPING_PAYMENT: ['DISPATCHED'],
  DISPATCHED: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const ayWebsOrderMachine = buildMachine<AyWebsOrderStatus>(ORDER_TRANSITIONS);

/* ------------------------------------------------------------------ *
 * Purchase engine (§22) — chaque échec porte une raison
 * ------------------------------------------------------------------ */

const PURCHASE_TRANSITIONS: Record<string, readonly AyWebsPurchaseStatus[]> = {
  PURCHASE_PENDING: ['PURCHASING', 'PENDING_INTEGRATION', 'MANUAL_REVIEW'],
  PURCHASING: ['PURCHASED', 'PRICE_CHANGED', 'VARIANT_UNAVAILABLE', 'OUT_OF_STOCK', 'PURCHASE_FAILED', 'REQUIRES_REVIEW'],
  PRICE_CHANGED: ['PURCHASING', 'PURCHASE_FAILED'],
  VARIANT_UNAVAILABLE: ['PURCHASING', 'PURCHASE_FAILED'],
  OUT_OF_STOCK: ['PURCHASE_FAILED'],
  REQUIRES_REVIEW: ['PURCHASING', 'MANUAL_REVIEW', 'PURCHASE_FAILED'],
  PENDING_INTEGRATION: ['MANUAL_REVIEW', 'PURCHASE_FAILED'],
  MANUAL_REVIEW: ['PURCHASING', 'PURCHASE_FAILED'],
  PURCHASE_FAILED: [],
  PURCHASED: [],
};

export const ayWebsPurchaseMachine = buildMachine<AyWebsPurchaseStatus>(PURCHASE_TRANSITIONS);

export const AYWEBS_PURCHASE_FAILURE_STATES: readonly AyWebsPurchaseStatus[] = [
  'PRICE_CHANGED', 'VARIANT_UNAVAILABLE', 'OUT_OF_STOCK', 'PURCHASE_FAILED', 'REQUIRES_REVIEW',
] as const;

/** Un état d'échec sans raison est interdit (§22 : no silent failure). */
export function ayWebsPurchaseFailureRequiresReason(status: AyWebsPurchaseStatus): boolean {
  return AYWEBS_PURCHASE_FAILURE_STATES.includes(status);
}

/* ------------------------------------------------------------------ *
 * Purchase requests (§23)
 * ------------------------------------------------------------------ */

const PURCHASE_REQUEST_TRANSITIONS: Record<string, readonly AyWebsPurchaseRequestStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['ORDER_READY', 'REJECTED'],
  REJECTED: [],
  ORDER_READY: [],
};

export const ayWebsPurchaseRequestMachine = buildMachine<AyWebsPurchaseRequestStatus>(PURCHASE_REQUEST_TRANSITIONS);

/* ------------------------------------------------------------------ *
 * Cart (§16)
 * ------------------------------------------------------------------ */

const CART_TRANSITIONS: Record<string, readonly AyWebsCartStatus[]> = {
  ACTIVE: ['CHECKOUT', 'ABANDONED'],
  CHECKOUT: ['ORDERED', 'ACTIVE'],
  ORDERED: [],
  ABANDONED: ['ACTIVE'],
};

export const ayWebsCartMachine = buildMachine<AyWebsCartStatus>(CART_TRANSITIONS);

/* ------------------------------------------------------------------ *
 * Warehouse & packages (§33, §34, §35)
 * ------------------------------------------------------------------ */

const WAREHOUSE_TRANSITIONS: Record<string, readonly AyWebsWarehouseState[]> = {
  WAITING_SUPPLIER: ['IN_TRANSIT'],
  IN_TRANSIT: ['RECEIVED'],
  RECEIVED: ['INSPECTING', 'READY_TO_CONSOLIDATE'],
  INSPECTING: ['READY_TO_CONSOLIDATE'],
  READY_TO_CONSOLIDATE: ['CONSOLIDATED'],
  CONSOLIDATED: ['PACKED'],
  PACKED: [],
};

export const ayWebsWarehouseMachine = buildMachine<AyWebsWarehouseState>(WAREHOUSE_TRANSITIONS);

const PACKAGE_TRANSITIONS: Record<string, readonly AyWebsPackageState[]> = {
  OPEN: ['CONSOLIDATED'],
  CONSOLIDATED: ['PACKED', 'OPEN'],
  PACKED: ['READY_TO_SHIP'],
  READY_TO_SHIP: ['SHIPPING_QUOTE'],
  SHIPPING_QUOTE: ['AWAITING_PAYMENT'],
  AWAITING_PAYMENT: ['PAID', 'SHIPPING_QUOTE'],
  PAID: ['DISPATCHED'],
  DISPATCHED: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
};

export const ayWebsPackageMachine = buildMachine<AyWebsPackageState>(PACKAGE_TRANSITIONS);
