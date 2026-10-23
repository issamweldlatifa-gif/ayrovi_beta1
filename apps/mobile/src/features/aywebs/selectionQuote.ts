/**
 * Prix et disponibilité d'UN choix, à partir du devis serveur (23/10/2026).
 *
 * Le client ne calcule jamais un prix marchand : il lit ce que le serveur a
 * publié pour chaque valeur (`variant_quotes`), et pour la combinaison affichée
 * il lit le devis de la fiche (`ayrovi_pricing`). Ce module ne fait que
 * CHOISIR la bonne ligne — jamais une règle de trois, jamais une moyenne.
 *
 * Trois règles, et aucune autre :
 *   • la combinaison AFFICHÉE (celle que la page ouvre) → devis de la fiche ;
 *   • une autre combinaison → le devis de la ou des valeurs choisies, à
 *     condition qu'elles s'accordent sur un seul montant (deux montants
 *     différents = pas de prix, on ne choisit pas à la place du marchand) ;
 *   • « pas publié » n'est pas « disponible » : un état inconnu reste inconnu,
 *     et le bouton dira ce qu'il faut faire au lieu de promettre.
 */
import type { AyWebsVariantQuote } from '@/api/aywebs';

export type AvailabilityState = 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';

export interface SelectionQuote {
  /** Devis unitaire en dinars, `null` quand aucun prix ferme n'est publié. */
  unitTnd: number | null;
  /** Montant marchand de cette combinaison (devise de la fiche), s'il est publié. */
  sourcePrice: number | null;
  sourceCurrency: string;
  /** Le montant marchand est une entrée de gamme (« à partir de »). */
  priceFrom: boolean;
  availability: AvailabilityState;
  /** Pièces annoncées pour ce choix, `null` si la page n'en dit rien. */
  stock: number | null;
  /** `true` quand le prix vient de la valeur choisie et non de la page. */
  fromValue: boolean;
}

const normalize = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const sameSelection = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const left = Object.entries(a || {}).filter(([, value]) => String(value).trim());
  const right = Object.entries(b || {}).filter(([, value]) => String(value).trim());
  if (left.length !== right.length) return false;
  return left.every(([key, value]) => normalize(b[key]) === normalize(value));
};

export interface SelectionQuoteInput {
  /** Devis de la fiche (combinaison affichée par la page). */
  page: {
    selection: Record<string, string>;
    unitTnd: number | null;
    availability: AvailabilityState;
    stock: number | null;
    sourcePrice: number | null;
    sourceCurrency: string;
  } | null;
  /** Devis publiés par le serveur pour chaque valeur. */
  quotes: readonly AyWebsVariantQuote[];
  selection: Record<string, string>;
}

/** Ce qu'on peut afficher pour ce choix — et rien de plus. */
export function selectionQuote(input: SelectionQuoteInput): SelectionQuote {
  const selection = input.selection || {};
  const chosen = Object.entries(selection).filter(([, value]) => String(value).trim());
  const empty: SelectionQuote = {
    unitTnd: null, sourcePrice: null, sourceCurrency: '', priceFrom: false,
    availability: 'UNKNOWN', stock: null, fromValue: false,
  };
  if (!chosen.length) {
    if (!input.page) return empty;
    return {
      unitTnd: input.page.unitTnd,
      sourcePrice: input.page.sourcePrice,
      sourceCurrency: input.page.sourceCurrency,
      priceFrom: false,
      availability: input.page.availability,
      stock: input.page.stock,
      fromValue: false,
    };
  }
  /* 1. Le choix EST la combinaison affichée : le devis de la fiche la décrit. */
  if (input.page && sameSelection(input.page.selection, selection)) {
    return {
      unitTnd: input.page.unitTnd,
      sourcePrice: input.page.sourcePrice,
      sourceCurrency: input.page.sourceCurrency,
      priceFrom: false,
      availability: input.page.availability,
      stock: input.page.stock,
      fromValue: false,
    };
  }
  /* 2. Sinon : uniquement ce que la page publie pour CHAQUE valeur choisie. */
  const entries = chosen.map(([group, value]) => input.quotes.find((quote) =>
    normalize(quote.group) === normalize(group) && normalize(quote.value) === normalize(value)) ?? null);
  const known = entries.filter((entry): entry is AyWebsVariantQuote => entry != null);
  if (!known.length) return empty;

  const prices = known.filter((entry) => entry.totalTnd != null);
  const amounts = new Set(prices.map((entry) => `${(entry.totalTnd as number).toFixed(2)}`));
  const unitTnd = amounts.size === 1 ? prices[0]!.totalTnd : null;

  const merchant = known.filter((entry) => entry.sourcePrice != null);
  const currency = merchant[0]?.currency || '';
  const sameAmount = merchant.every((entry) =>
    Math.abs((entry.sourcePrice as number) - (merchant[0]!.sourcePrice as number)) < 0.005);
  const sourcePrice = merchant.length && sameAmount ? merchant[0]!.sourcePrice : null;

  const stocks = known.map((entry) => entry.stock).filter((value): value is number => typeof value === 'number' && value > 0);
  const stock = stocks.length ? Math.min(...stocks) : null;

  let availability: AvailabilityState;
  if (known.some((entry) => entry.availability === 'OUT_OF_STOCK')) availability = 'OUT_OF_STOCK';
  else if (known.length < chosen.length) availability = 'UNKNOWN';
  else if (known.every((entry) => entry.availability === 'AVAILABLE')) availability = stock != null ? 'LOW_STOCK' : 'AVAILABLE';
  else if (known.every((entry) => entry.availability === 'AVAILABLE' || entry.availability === 'LOW_STOCK')) {
    availability = 'LOW_STOCK';
  } else availability = 'UNKNOWN';

  return {
    unitTnd,
    sourcePrice,
    sourceCurrency: sourcePrice != null ? currency : '',
    priceFrom: known.some((entry) => entry.priceFrom),
    availability,
    stock,
    fromValue: true,
  };
}

/**
 * Combien de pièces on laisse commander — jamais plus que ce que la page
 * publie (23/10/2026, retour client : « le produit en a cinq, on peut en
 * mettre vingt »).
 *
 * Un stock inconnu ne plafonne pas la quantité (on ne sait pas, on ne
 * l'invente pas) ; un stock publié la plafonne, et le maximum de commande du
 * marchand (la liste « quantité » de sa fiche) plafonne aussi. Le plafond
 * d'interface (`cap`, 99) reste le dernier mot pour ne pas casser la fiche.
 */
export function quantityLimit(input: {
  stock: number | null;
  merchantMax?: number | null;
  cap?: number;
}): number {
  const ceilings: number[] = [];
  const cap = input.cap ?? 99;
  if (Number.isFinite(cap) && cap > 0) ceilings.push(cap);
  for (const value of [input.stock, input.merchantMax]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) ceilings.push(value);
  }
  return Math.max(1, Math.min(...ceilings.map((value) => Math.floor(value))));
}
