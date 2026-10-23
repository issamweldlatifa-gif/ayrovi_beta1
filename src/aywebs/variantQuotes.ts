import { calculatePrice, type PricingRules } from '../services/pricing';
import type { AyWebsCapturedVariantGroup } from '../../shared/aywebsCapture';
import { ayWebsSelectionEvidence, type AyWebsCapturedValueState } from './variantEvidence';

/**
 * AYWEBs — DEVIS PAR VALEUR (23/10/2026).
 *
 * Le client voit, dans la feuille, le prix en DINARS de chaque couleur / taille /
 * volume — et ce prix change quand il change de valeur. Deux règles le rendent
 * honnête :
 *
 *   1. **le montant marchand vient de la page** : c'est le prix publié sous la
 *      pastille de CETTE valeur (ou, pour la combinaison affichée, le prix de la
 *      fiche). Aucun prix n'est inventé pour une valeur qui n'en publie pas ;
 *   2. **la conversion est faite ICI**, par le moteur tarifaire partagé — jamais
 *      par l'application. Le client affiche un nombre qu'il n'a pas calculé.
 *
 * Un prix « à partir de » n'est pas un prix ferme : la valeur est publiée, mais
 * sans montant en dinars (`total_tnd: null`). Un prix écrit dans une autre devise
 * que celle prouvée par la page n'est pas retenu (le montant existe, il ne
 * s'applique pas). Et sans preuve de prix + devise, aucun devis n'est publié :
 * `total_tnd` reste `null` partout.
 */
export interface AyWebsVariantQuote {
  /** Nom du groupe tel que la page le publie (« Couleur », « Taille »…). */
  group: string;
  value: string;
  /** Ce que la page dit de CETTE valeur — `UNKNOWN` quand elle ne dit rien. */
  availability: AyWebsCapturedValueState;
  /** Pièces annoncées sur la pastille (« plus que 3 »), sinon `null`. */
  stock: number | null;
  /** Montant marchand de cette valeur, tel que lu (devise de la fiche). */
  source_price: number | null;
  /** Devise du montant — vide quand la page ne prouve pas sa devise. */
  currency: string;
  /** `true` quand le montant est une entrée de gamme (« à partir de »). */
  price_from: boolean;
  /** Devis ZAYROVI pour cette valeur (unité), calculé par le serveur. */
  total_tnd: number | null;
  pricing_version: number | null;
}

export interface AyWebsVariantQuoteInput {
  groups: readonly AyWebsCapturedVariantGroup[] | null | undefined;
  rules: PricingRules;
  /** Prix et devise marchands de la fiche, prouvés par la lecture. */
  product: { title: string; price: number; currency: string };
  /** La preuve de prix + devise est-elle complète ? Sinon : aucun devis. */
  quoteVerified: boolean;
}

/** Une entrée par valeur publiée, dans l'ordre de la page. */
export function ayWebsVariantQuotes(input: AyWebsVariantQuoteInput): AyWebsVariantQuote[] {
  const groups = Array.isArray(input.groups) ? input.groups : [];
  const currency = String(input.product.currency || '').trim().toUpperCase();
  const out: AyWebsVariantQuote[] = [];
  for (const group of groups) {
    if (!group || !Array.isArray(group.values)) continue;
    for (const value of group.values) {
      const label = String(value ?? '').trim();
      if (!label) continue;
      const evidence = ayWebsSelectionEvidence(groups, { [group.name]: label }, { currency }).attributes[0];
      if (!evidence) continue;
      const firmPrice = evidence.price != null && !evidence.priceFrom;
      const quote = input.quoteVerified && firmPrice && evidence.price! > 0 && currency
        ? calculatePrice(input.rules, evidence.price!, currency, { title: input.product.title })
        : null;
      const usable = quote && !quote.restricted && quote.totalTND > 0 ? quote : null;
      out.push({
        group: String(group.name || '').trim(),
        value: label,
        availability: evidence.state,
        stock: evidence.stock,
        source_price: evidence.price,
        currency: evidence.price != null ? currency : '',
        price_from: evidence.priceFrom,
        total_tnd: usable ? usable.totalTND : null,
        pricing_version: usable ? usable.pricingVersion : null,
      });
    }
  }
  return out;
}
