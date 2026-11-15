/**
 * Nombre d'articles affiché sur TOUTES les icônes panier (15/11 : « كل أيقونة
 * سلة … فيها عدد المنتجات »). Logique pure.
 *
 * Le total suit ce que la page Panier montre : les lignes du panier ZAYROVI
 * plus les articles AYWEBs encore en attente de liaison. Rien n'est inventé :
 * une valeur absente ou invalide compte pour zéro, et le badge disparaît à 0.
 */
import type { AyWebsCartItem } from '@/api/aywebs';
import { pendingAyWebsUnits } from '@/features/aywebs/storeShopping';

const safeCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

export function totalCartUnits(
  ayroviUnits: number | null | undefined,
  aywebsItems: readonly AyWebsCartItem[] | null | undefined,
): number {
  return safeCount(ayroviUnits) + safeCount(pendingAyWebsUnits(aywebsItems ?? []));
}

/** Texte du badge : rien à 0, « 99+ » au-delà de 99. */
export function cartBadgeText(count: number): string {
  const units = safeCount(count);
  if (units === 0) return '';
  return units > 99 ? '99+' : String(units);
}
