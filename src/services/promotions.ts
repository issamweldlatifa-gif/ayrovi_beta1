/**
 * AYROVI · Moteur de promotions (décisions management 23/09/2026).
 *
 * Trois portées, par précédence : PRODUIT > CATÉGORIE > JOUR de la semaine.
 * La grille « jour » est le socle (léchelle légère approuvée par Issam :
 * 1-2 % en semaine, 3-4 % le week-end) ; les règles produit/catégorie
 * surchargent ponctuellement.
 *
 * MARGE — la règle d'or (audit du moteur) : la remise s'applique sur le
 * PRIX PRODUIT CONVERTI (la base de notre commission), JAMAIS sur le total
 * CIF complet — 7 % sur le total fashion dépasseraient toute la commission
 * (perte sèche). Un plancher garantit en plus que la commission effective
 * ne descend jamais sous MIN_COMMISSION_FLOOR_PERCENT (3 %), quel que soit
 * le réglage admin.
 *
 * FUSEAU : le « jour » client est le jour tunisien (Africa/Tunis, UTC+1 fixe,
 * pas d'heure d'été) — le serveur Render tourne en UTC.
 */
import type { QatafoDatabase } from '../db/database';

export type PromoScope = 'DAY' | 'CATEGORY' | 'PRODUCT';

export interface PromoRule {
  id: string;
  scope: PromoScope;
  target: string;
  percent: number;
  label: string;
  active: boolean;
  starts_at: string;
  ends_at: string;
  updated_at: string;
}

export interface ResolvedPromo {
  percent: number;
  label: string;
  source: PromoScope;
  ruleId: string;
}

/** Plancher de commission : une promo ne peut jamais descendre en dessous. */
export const MIN_COMMISSION_FLOOR_PERCENT = 3;

/** Grille « jour » par défaut (décision Issam — échelle légère), lundi → dimanche. */
export const DEFAULT_DAY_LADDER: number[] = [1, 1, 2, 2, 2, 3, 4];

const DAY_LABELS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Jour tunisien ISO (1 = lundi … 7 = dimanche) — Africa/Tunis = UTC+1 fixe. */
export function tunisIsoDay(now: Date = new Date()): number {
  const tunisian = new Date(now.getTime() + 3_600_000);
  const day = tunisian.getUTCDay();
  return day === 0 ? 7 : day;
}

export function dayLabelFr(isoDay: number): string {
  return DAY_LABELS_FR[Math.min(6, Math.max(0, isoDay - 1))];
}

function ruleWindowOpen(rule: PromoRule, nowIso: string): boolean {
  if (!rule.active) return false;
  if (rule.percent <= 0) return false;
  if (rule.starts_at && nowIso < rule.starts_at) return false;
  if (rule.ends_at && nowIso > rule.ends_at) return false;
  return true;
}

/**
 * Résout la promo applicable : PRODUIT > CATÉGORIE > JOUR. Pure et synchrone
 * (testable sans base) ; les règles viennent de promo_rules via getPromoRules().
 */
export function resolvePromo(
  rules: PromoRule[],
  context: { now?: Date; categoryId?: string | null; productId?: string | null } = {},
): ResolvedPromo | null {
  const now = context.now ?? new Date();
  const nowIso = now.toISOString();
  const open = rules.filter((rule) => ruleWindowOpen(rule, nowIso));
  const pick = (scope: PromoScope, target: string | null | undefined): PromoRule | null => {
    if (target == null || target === '') return null;
    return open.find((rule) => rule.scope === scope && rule.target === String(target)) || null;
  };
  const rule =
    pick('PRODUCT', context.productId)
    || pick('CATEGORY', context.categoryId)
    || pick('DAY', String(tunisIsoDay(now)));
  if (!rule) return null;
  return {
    percent: Number(rule.percent),
    label: String(rule.label || ''),
    source: rule.scope,
    ruleId: rule.id,
  };
}

/**
 * Garde-fou marge : la remise effective est plafonnée à
 * (commission − plancher). Ex. commission 10 %, plancher 3 % → remise max 7 %,
 * même si l'admin saisit 20 %.
 */
export function capPromoPercent(percent: number, commissionPercent: number): number {
  const max = Math.max(0, Number(commissionPercent) - MIN_COMMISSION_FLOOR_PERCENT);
  return Math.max(0, Math.min(Number(percent) || 0, max));
}

/** Montant de remise (millimes) sur la base convertie — prix produit × %. */
export function promoDiscountTnd(convertedPriceTND: number, percent: number, millimes: (v: number) => number): number {
  return millimes(convertedPriceTND * (Number(percent) || 0) / 100);
}

/** Résolution raccourcie pour un devis (catégorie connue après calcul). */
export function resolvePromoForQuote(
  db: QatafoDatabase,
  context: { categoryId?: string | null; productId?: string | null } = {},
): ResolvedPromo | null {
  const resolved = resolvePromo(db.getPromoRules(), context);
  if (!resolved) return null;
  const percent = capPromoPercent(resolved.percent, db.getPricingRules().commissionPercent);
  return percent > 0 ? { ...resolved, percent } : null;
}
