import type { QatafoDatabase } from '../db/database';
import type { AddToCartRequest } from '../types';
import { availableProductParams, availableProductSql } from './contentProducts';
import { CatalogueSaleError, catalogId, inspectCatalogueSale } from './localSale';

export class CartCatalogueError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

/** Canonical cart line builder and stock gate, shared by single and group adds. */
export function addCatalogueLine(db: QatafoDatabase, input: {
  sessionId: string; accountId: string | null; productId: string; now: string;
  quantity: number; requestedSize: string; requestedColor: string; customerNote: string; expectedPrice?: number;
}) {
  const { sessionId, accountId, productId, now, quantity, requestedSize, requestedColor, customerNote, expectedPrice } = input;
  const product = db.get<Record<string, any>>(
    `SELECT * FROM products WHERE id=? AND ${availableProductSql('products')}`, productId, ...availableProductParams(now),
  );
  if (!product) throw new CartCatalogueError(404, 'PRODUCT_NOT_FOUND', 'Produit introuvable.');
  const finalPrice = Number(product.final_price);
  if (!Number.isFinite(finalPrice) || finalPrice <= 0) throw new CartCatalogueError(409, 'NO_PRICE', 'Produit sans prix publié.');
  if (String(product.stock_status).toLowerCase() === 'out_of_stock') throw new CartCatalogueError(409, 'OUT_OF_STOCK', 'Produit épuisé.');
  if (expectedPrice !== undefined && Math.round(finalPrice * 1000) !== Math.round(expectedPrice * 1000)) {
    throw new CartCatalogueError(409, 'LOOK_PRICE_CHANGED', 'Le prix du look a changé.');
  }
  const choice = inspectCatalogueSale(db, productId, requestedSize, requestedColor, quantity);
  let totalQuantity = quantity;
  const existing = db.getItems(sessionId, accountId);
  for (const line of existing) {
    if (catalogId(line.externalId) !== productId) continue;
    const previous = inspectCatalogueSale(db, productId, line.requestedSize, line.requestedColor, 0);
    if (previous.variant?.id === choice.variant?.id) totalQuantity += line.quantity;
  }
  inspectCatalogueSale(db, productId, requestedSize, requestedColor, totalQuantity);
  const item: AddToCartRequest = {
    store: String(product.source_platform || 'zayrovi').toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'zayrovi',
    externalId: `catalog-${product.id}`,
    url: String(product.source_url || '').trim() || `https://catalog.local/${product.id}`,
    title: String(product.name || '').trim().slice(0, 500) || 'Produit',
    imageUrl: String(product.image || '').trim().slice(0, 4096),
    sourcePrice: Number(product.original_price) > 0 ? Number(product.original_price) : finalPrice,
    sourceCurrency: String(product.currency || 'TND').toUpperCase(),
    priceTND: finalPrice, requestedSize, requestedColor, customerNote,
    priceVerificationStatus: 'VERIFIED', quantity,
  };
  // The existing addItem merge keeps its old price. Do not promise a new price
  // and then increment a mismatched line; the buyer must reconcile it first.
  if (expectedPrice !== undefined) {
    const match = existing.find(line => line.store === item.store && line.externalId === item.externalId
      && line.sourceUrl === item.url && !line.variant && line.requestedSize === requestedSize && line.requestedColor === requestedColor && !line.customerNote);
    if (match && Math.round(match.priceTND * 1000) !== Math.round(finalPrice * 1000)) throw new CatalogueSaleError('LOOK_CART_PRICE_CHANGED', 'Vérifiez le prix du produit déjà dans votre panier.');
  }
  return db.addItem(sessionId, item, accountId);
}
