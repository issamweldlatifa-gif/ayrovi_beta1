import type { QatafoDatabase } from '../db/database';
import { recordMovement } from '../inventory/stock';

export class CatalogueSaleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
export const catalogId = (externalId?: string | null) =>
  externalId?.startsWith('catalog-') ? externalId.slice(8) : null;

/** Validate against the existing catalogue and inventory; never infer stock from an image. */
export function inspectCatalogueSale(
  db: QatafoDatabase,
  id: string,
  size = '',
  color = '',
  quantity = 1
) {
  const product = db.get<any>(
    "SELECT * FROM products WHERE id=? AND status='ACTIVE'",
    id
  );
  if (!product || !(product.final_price > 0))
    throw new CatalogueSaleError(
      'PRODUCT_UNAVAILABLE',
      'Produit indisponible.'
    );
  if (product.stock_status === 'OUT_OF_STOCK')
    throw new CatalogueSaleError('OUT_OF_STOCK', 'Produit épuisé.');
  const variants = db.all<any>(
    "SELECT * FROM catalogue_variants WHERE product_id=? AND status='ACTIVE'",
    id
  );
  let variant: any = null;
  if (variants.length) {
    for (const [key, value] of [
      ['size', size],
      ['color', color],
    ]) {
      const choices = new Set(variants.map((v) => v[key]).filter(Boolean));
      if (choices.size > 1 && !value)
        throw new CatalogueSaleError(
          'SELECTION_REQUIRED',
          'Choisissez la taille et la couleur disponibles.'
        );
    }
    variant = variants.find(
      (v) => (!size || v.size === size) && (!color || v.color === color)
    );
    if (!variant)
      throw new CatalogueSaleError(
        'VARIANT_UNAVAILABLE',
        'Cette taille ou couleur n’est pas disponible.'
      );
  } else if (size || color) {
    throw new CatalogueSaleError(
      'VARIANT_UNAVAILABLE',
      'Cette sélection n’est pas déclarée dans le catalogue.'
    );
  }
  const stocks = db.all<any>(
    "SELECT * FROM inventory_stock_items WHERE product_id=? AND variant_id IS ? AND status='ACTIVE' ORDER BY location,id",
    id,
    variant?.id || null
  );
  const available = stocks.length
    ? stocks.reduce((sum, row) => sum + row.quantity, 0)
    : id.startsWith('product_selection_')
    ? 0
    : null;
  if (available !== null && quantity > available)
    throw new CatalogueSaleError(
      'INSUFFICIENT_STOCK',
      `Quantité indisponible : ${available} pièce(s) restante(s) pour ce choix.`
    );
  return { product, variant, stocks, available };
}

/** Called inside the existing order transaction. OUT = reservation, not a paid/completed sale. */
export function reserveCatalogueSale(
  db: QatafoDatabase,
  item: {
    id?: string;
    externalId?: string | null;
    requestedSize?: string;
    requestedColor?: string;
    quantity: number;
  },
  orderId: string
) {
  const id = catalogId(item.externalId);
  if (!id) return;
  const sale = inspectCatalogueSale(
    db,
    id,
    item.requestedSize,
    item.requestedColor,
    item.quantity
  );
  let remaining = item.quantity;
  for (const stock of sale.stocks) {
    const quantity = Math.min(remaining, stock.quantity);
    if (!quantity) continue;
    const result = recordMovement(db, {
      itemId: stock.id,
      location: stock.location,
      direction: 'OUT',
      quantity,
      reason: 'OTHER',
      note: 'Réservation de commande en attente de paiement',
      referenceType: 'ORDER_RESERVATION',
      referenceId: orderId,
      idempotencyKey: `reserve:${orderId}:${item.id || id}:${stock.id}`,
      actor: { id: null, name: 'Commande catalogue' },
    });
    if (!result.ok)
      throw new CatalogueSaleError(
        'INSUFFICIENT_STOCK',
        'Stock modifié ; réessayez votre commande.'
      );
    remaining -= quantity;
    if (!remaining) break;
  }
  syncStockStatus(db, id);
}

/** Cancelling an order returns only its own recorded reservations, once. */
export function releaseCatalogueReservations(
  db: QatafoDatabase,
  orderId: string
) {
  const movements = db.all<any>(
    "SELECT * FROM inventory_stock_movements WHERE reference_type='ORDER_RESERVATION' AND reference_id=? AND direction='OUT'",
    orderId
  );
  for (const move of movements) {
    const result = recordMovement(db, {
      itemId: move.item_id,
      location: move.location,
      direction: 'IN',
      quantity: move.quantity,
      reason: 'RETURN',
      note: 'Libération de la réservation après annulation',
      referenceType: 'ORDER_CANCELLATION',
      referenceId: orderId,
      idempotencyKey: `release:${move.id}`,
      actor: { id: null, name: 'Annulation de commande' },
    });
    if (!result.ok) throw new Error('CATALOGUE_RESERVATION_RELEASE_FAILED');
    syncStockStatus(db, move.product_id);
  }
}
function syncStockStatus(db: QatafoDatabase, id: string) {
  const total = db.get<any>(
    "SELECT SUM(quantity) total FROM inventory_stock_items WHERE product_id=? AND status='ACTIVE'",
    id
  )?.total;
  if (total !== null && total !== undefined)
    db.run(
      'UPDATE products SET stock_status=? WHERE id=?',
      total > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
      id
    );
}
