/**
 * Logique pure de la file « Achats AYWEBs » (sans React) — testable seule.
 */

export interface AyWebsAddress { name?: string; phone?: string; city?: string; line?: string }

export interface AyWebsQueueItem {
  id: string;
  title: string;
  storeName: string;
  sourceUrl: string;
  quantity: number;
  variantLabel: string;
  lineTotalTnd: number;
}

export interface AyWebsQueueOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  purchaseDueAt: string | null;
  shippingAddress: AyWebsAddress;
  items: AyWebsQueueItem[];
  totals: { payableTnd: number };
}

/** Lien sûr uniquement : http(s). Tout autre schéma reste inerte. */
export function safeStoreLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Texte prêt à coller : nom, téléphone, ville, adresse, référence. */
export function customerCopyText(order: AyWebsQueueOrder): string {
  const a = order.shippingAddress || {};
  return [a.name, a.phone, a.city, a.line, `Réf. ${order.orderNumber}`].filter(Boolean).join('\n');
}

