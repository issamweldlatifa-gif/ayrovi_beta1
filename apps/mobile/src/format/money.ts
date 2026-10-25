/**
 * ZAYROVI — UNE SEULE FAÇON D'ÉCRIRE UN MONTANT.
 *
 * ── Le constat (audit du 25/10/2026) ─────────────────────────────────────────
 * 44 `toFixed(2)` dispersés dans 18 fichiers, et DEUX devises affichées :
 * `TND` dans la fiche produit, le panier et le paiement, `DT` dans les
 * commandes et les favoris. Un même montant s'écrivait donc « 89.00 TND » ici
 * et « 89.00 DT » deux écrans plus loin. Ce n'est pas un détail de style :
 * c'est la même donnée présentée comme deux choses différentes.
 *
 * ── La règle ────────────────────────────────────────────────────────────────
 * Un montant à l'écran passe TOUJOURS par `formatMoney` (devise comprise) ou
 * `formatAmount` (nombre seul, quand la devise est déjà dans le libellé).
 * Aucun écran ne rappelle `.toFixed(2)`.
 *
 * ── Ce que ce module NE fait pas ────────────────────────────────────────────
 * Il ne convertit rien et n'arrondit pas « au centime près » : la valeur
 * affichée est celle du serveur, arrondie à deux décimales — comme avant. Un
 * changement de règle d'arrondi est une décision commerciale, pas un refactor.
 */
export const CURRENCY = 'TND';

/** Nombre à deux décimales, sans devise : « 89.00 ». */
export function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Montant complet : « 89.00 TND ».
 *
 * `null` / `undefined` / `NaN` ⇒ chaîne vide : un montant inconnu ne s'écrit
 * pas « 0.00 TND » (ce serait un prix inventé).
 */
export function formatMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '';
  return `${formatAmount(amount)} ${CURRENCY}`;
}
