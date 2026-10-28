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
import { formatAmount } from '@/format/money';
import { ayWebsSameAttribute as sameAttribute } from '@/features/aywebs/attributeKeys';

export type AvailabilityState = 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';

export interface SelectionQuote {
  /** Devis unitaire en dinars, `null` quand aucun prix ferme n'est publié. */
  unitTnd: number | null;
  /** Totaux exacts en dinars pour les quantités 1..10 (calculés par le serveur, incluant paliers et frais non linéaires). */
  quantityTotalsTnd?: number[] | null;
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
  /** Vignette propre à la combinaison, si publiée par la matrice. */
  image?: string | null;
  /** URL directe de la variante pour une lecture delta si son prix manque dans la matrice initiale. */
  missingVariantUrl?: string | null;
}

const normalize = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const sameSelection = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const left = Object.entries(a || {}).filter(([, value]) => String(value).trim());
  const right = Object.entries(b || {}).filter(([, value]) => String(value).trim());
  if (left.length !== right.length) return false;
  return left.every(([key, value]) => normalize(b[key]) === normalize(value));
};

/**
 * Ligne de la TABLE DES COMBINAISONS du serveur (`variant_details`) — la même
 * source que les cartes de variantes du WEB. `totalTnd` est calculé par le
 * serveur pour CETTE combinaison : le client ne fait que la retrouver.
 */
export interface QuoteCombination {
  attributes: Record<string, string>;
  totalTnd: number | null;
  quantityTotalsTnd?: number[] | null;
  quotedPrice?: number | null;
  quotedCurrency?: string;
  availability?: string;
  availabilityReason?: string;
  stock?: number | null;
  image?: string;
  variantUrl?: string | null;
}

export interface SelectionQuoteInput {
  /** Devis de la fiche (combinaison affichée par la page). */
  page: {
    selection: Record<string, string>;
    unitTnd: number | null;
    quantityTotalsTnd?: number[] | null;
    availability: AvailabilityState;
    stock: number | null;
    sourcePrice: number | null;
    sourceCurrency: string;
  } | null;
  /** Devis publiés par le serveur pour chaque valeur. */
  quotes: readonly AyWebsVariantQuote[];
  /**
   * Combinaisons publiées par le serveur (lecture serveur / `variant_details`).
   * Le web affiche SES cartes de variantes avec ce prix-là ; sans cette source,
   * l'application retombait sur « Prix en dinars calculé à l'ajout. » pour la
   * même fiche et le même choix (Zalando, 26/10/2026).
   */
  combinations?: readonly QuoteCombination[];
  selection: Record<string, string>;
}

/** La combinaison EXACTE choisie, si le serveur en publie une. */
function exactCombination(
  combinations: readonly QuoteCombination[] | undefined,
  selection: Record<string, string>,
): QuoteCombination | null {
  if (!combinations || !combinations.length) return null;
  const wanted = Object.entries(selection).filter(([, value]) => String(value).trim());
  if (!wanted.length) return null;
  for (const combination of combinations) {
    const attributes = combination.attributes || {};
    const keys = Object.keys(attributes).filter((key) => String(attributes[key]).trim());
    if (keys.length !== wanted.length) continue;
    const matches = wanted.every(([key, value]) => {
      const sameKey = keys.find((candidate) => candidate === key) ?? keys.find((candidate) => sameAttribute(candidate, key));
      return Boolean(sameKey) && normalize(attributes[sameKey as string]) === normalize(value);
    });
    if (matches) return combination;
  }
  return null;
}

/** État publié par le serveur → état d'affichage (jamais une promotion). */
function stateOf(value: string | undefined): AvailabilityState {
  return value === 'AVAILABLE' || value === 'LOW_STOCK' || value === 'OUT_OF_STOCK' ? value : 'UNKNOWN';
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
  const combination = exactCombination(input.combinations, selection);
  const combinationState: AvailabilityState = combination ? stateOf(combination.availability) : 'UNKNOWN';
  const comboStockMatch = combination?.availabilityReason?.match(/:(\d{1,3})$/);
  const combinationStock = combination?.stock ?? (comboStockMatch ? Number(comboStockMatch[1]) : null);
  const combinationProvenInStock = combinationState === 'AVAILABLE' || combinationState === 'LOW_STOCK';

  /* 1. Si la MATRICE DE VARIANTES (`combinations` / `variant_details`) possède la
     combinaison exacte avec un prix ferme (ou un épuisement explicite), elle prime
     immédiatement (0 ms, sans jamais hériter du prix de base ni trébucher sur un
     conflit 1D entre axes Couleur et Taille). */
  if (combination && (combination.totalTnd != null || combinationState === 'OUT_OF_STOCK')) {
    const outOfStock = combinationState === 'OUT_OF_STOCK';
    const effAvail: AvailabilityState = outOfStock
      ? 'OUT_OF_STOCK'
      : combinationProvenInStock
        ? (combinationStock != null && combinationStock <= 5 ? 'LOW_STOCK' : combinationState)
        : (input.page && sameSelection(input.page.selection, selection) ? input.page.availability : 'AVAILABLE');
    return {
      unitTnd: outOfStock ? null : combination.totalTnd,
      ...(!outOfStock && combination.quantityTotalsTnd ? { quantityTotalsTnd: combination.quantityTotalsTnd } : {}),
      sourcePrice: outOfStock ? null : (combination.quotedPrice ?? null),
      sourceCurrency: !outOfStock && combination.quotedPrice != null ? (combination.quotedCurrency || '') : '',
      priceFrom: false,
      availability: effAvail,
      stock: outOfStock ? null : (combinationStock ?? (input.page && sameSelection(input.page.selection, selection) ? input.page.stock : null)),
      fromValue: false,
      ...(combination.image ? { image: combination.image } : {}),
    };
  }

  /* 2. Le choix EST la combinaison affichée : le devis de la fiche la décrit. */
  if (input.page && sameSelection(input.page.selection, selection)) {
    return {
      unitTnd: input.page.unitTnd,
      ...(input.page.quantityTotalsTnd ? { quantityTotalsTnd: input.page.quantityTotalsTnd } : {}),
      sourcePrice: input.page.sourcePrice,
      sourceCurrency: input.page.sourceCurrency,
      priceFrom: false,
      availability: input.page.availability,
      stock: input.page.stock,
      fromValue: false,
      ...(combination?.image ? { image: combination.image } : {}),
    };
  }
  /* 3. Sinon : uniquement ce que la page publie pour CHAQUE valeur choisie. */
  const entries = chosen.map(([group, value]) => input.quotes.find((quote) =>
    sameAttribute(quote.group, group) && normalize(quote.value) === normalize(value)) ?? null);
  const known = entries.filter((entry): entry is AyWebsVariantQuote => entry != null);
  if (!known.length) {
    if (!combination || combinationState === 'UNKNOWN') {
      return combination?.variantUrl
        ? {
          ...empty,
          missingVariantUrl: combination.variantUrl,
          ...(combination.image ? { image: combination.image } : {}),
        }
        : empty;
    }
    return {
      unitTnd: null,
      sourcePrice: null,
      sourceCurrency: '',
      priceFrom: false,
      availability: combinationState,
      stock: combinationState === 'OUT_OF_STOCK' ? null : combinationStock,
      fromValue: false,
      ...(combination.image ? { image: combination.image } : {}),
      ...(combination.variantUrl ? { missingVariantUrl: combination.variantUrl } : {}),
    };
  }

  const prices = known.filter((entry) => entry.totalTnd != null);
  const amounts = new Set(prices.map((entry) => formatAmount(entry.totalTnd as number)));
  /* Devis par valeur seulement si TOUTES les dimensions choisies sont
     couvertes : un prix de taille ne prouve pas le prix d'une couleur manquante. */
  const completeValueEvidence = known.length === chosen.length;
  const fromMarginalValue = completeValueEvidence && amounts.size === 1 && !known.some((entry) => entry.priceFrom);
  const rawUnitTnd = fromMarginalValue
    ? prices[0]!.totalTnd
    : (combination?.totalTnd ?? (completeValueEvidence && amounts.size === 1 ? prices[0]!.totalTnd : null));
  const rawQtyTotalsTnd = fromMarginalValue
    ? (prices[0]!.quantityTotalsTnd ?? null)
    : (combination?.quantityTotalsTnd ?? null);

  const merchant = known.filter((entry) => entry.sourcePrice != null && !entry.priceFrom);
  const currency = merchant[0]?.currency || '';
  const sameAmount = merchant.every((entry) =>
    Math.abs((entry.sourcePrice as number) - (merchant[0]!.sourcePrice as number)) < 0.005);
  const marginalSourcePrice = merchant.length && sameAmount ? merchant[0]!.sourcePrice : null;
  const rawSourcePrice = fromMarginalValue && marginalSourcePrice != null
    ? marginalSourcePrice
    : (combination?.quotedPrice ?? marginalSourcePrice);
  const rawSourceCurrency = fromMarginalValue && marginalSourcePrice != null
    ? currency
    : (combination?.quotedPrice != null ? (combination.quotedCurrency || currency) : (marginalSourcePrice != null ? currency : ''));

  const stocks = known.map((entry) => entry.stock).filter((value): value is number => typeof value === 'number' && value > 0);
  const marginalStock = stocks.length ? Math.min(...stocks) : null;

  let availability: AvailabilityState;
  if (combinationState === 'OUT_OF_STOCK' || (!combinationProvenInStock && known.some((entry) => entry.availability === 'OUT_OF_STOCK'))) {
    availability = 'OUT_OF_STOCK';
  } else if (combinationProvenInStock) {
    availability = combinationStock != null && combinationStock <= 5 ? 'LOW_STOCK' : combinationState;
  } else if (known.length < chosen.length) {
    availability = 'UNKNOWN';
  } else if (known.every((entry) => entry.availability === 'AVAILABLE')) {
    availability = marginalStock != null ? 'LOW_STOCK' : 'AVAILABLE';
  } else if (known.every((entry) => entry.availability === 'AVAILABLE' || entry.availability === 'LOW_STOCK')) {
    availability = 'LOW_STOCK';
  } else {
    availability = 'UNKNOWN';
  }

  const effectiveStock = availability === 'OUT_OF_STOCK' ? null : (combinationStock ?? marginalStock);
  const usedExactCombination = combination != null && (combination.totalTnd != null || combinationState !== 'UNKNOWN');

  const effectiveQtyTotals = availability === 'OUT_OF_STOCK' || rawUnitTnd == null ? null : rawQtyTotalsTnd;
  const missingUrl = rawUnitTnd == null ? (combination?.variantUrl ?? null) : null;

  return {
    unitTnd: availability === 'OUT_OF_STOCK' ? null : rawUnitTnd,
    ...(effectiveQtyTotals ? { quantityTotalsTnd: effectiveQtyTotals } : {}),
    sourcePrice: availability === 'OUT_OF_STOCK' ? null : rawSourcePrice,
    sourceCurrency: availability === 'OUT_OF_STOCK' || rawSourcePrice == null ? '' : rawSourceCurrency,
    priceFrom: usedExactCombination ? false : known.some((entry) => entry.priceFrom),
    availability,
    stock: effectiveStock,
    fromValue: !usedExactCombination || fromMarginalValue,
    ...(combination?.image ? { image: combination.image } : {}),
    ...(missingUrl ? { missingVariantUrl: missingUrl } : {}),
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
