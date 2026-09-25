import type { CartItem } from '../types';
import { millimes, HEAVY_CARGO_KG_THRESHOLD, type PriceBreakdown } from '../services/pricing';

/** A canonical cart line is a signed unit-price snapshot. Never read the current
 * search results or recalculate it against today's FX/promotion rules. Quantity
 * multiplication happens in ONE place, shared by cart and checkout.
 */
export function snapshotLinePrice(item: CartItem): PriceBreakdown | null {
  const unit = item.priceSnapshot?.unit;
  if (!unit) return null;
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 ||
    !Number.isFinite(unit.totalTND) || unit.totalTND <= 0 ||
    unit.totalTND !== item.priceTND || unit.currency !== item.sourceCurrency ||
    !Number.isFinite(unit.originalPrice) || unit.originalPrice !== item.sourcePrice) {
    throw new Error('INVALID_CART_SNAPSHOT');
  }
  const scale = (value: number): number => millimes(value * item.quantity);
  return {
    ...unit,
    originalPrice: scale(unit.originalPrice),
    convertedPriceTND: scale(unit.convertedPriceTND),
    freightTND: scale(unit.freightTND),
    cifTND: scale(unit.cifTND),
    dutyTND: scale(unit.dutyTND),
    tvaTND: scale(unit.tvaTND),
    rpdTND: scale(unit.rpdTND),
    customsFeeTND: scale(unit.customsFeeTND),
    shippingFeeTND: scale(unit.shippingFeeTND),
    serviceFeeTND: scale(unit.serviceFeeTND),
    expressFeeTND: scale(unit.expressFeeTND),
    discountTND: scale(unit.discountTND),
    weightKg: scale(unit.weightKg),
    requiresWeightValidation: scale(unit.weightKg) > HEAVY_CARGO_KG_THRESHOLD,
    totalTND: scale(unit.totalTND),
  };
}
