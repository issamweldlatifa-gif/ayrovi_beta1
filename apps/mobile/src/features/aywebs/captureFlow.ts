/**
 * AYWEBS — règles de la lecture au clic « Add to Cart » (portées de fc3cce38, 19/10/2026).
 *
 *  • Prix absent dans la capture ⇒ on relance la capture, au plus
 *    AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES fois, après un court délai (le marchand
 *    rend souvent le prix après le DOM initial).
 *  • Jamais de feuille d'options avec un prix nul, non vérifié par le serveur,
 *    ou une devise non ISO-3 : on affiche un échec explicite à la place.
 */
import {
  ayWebsAddReadiness,
  type AyWebsResolveOutcome,
  type AyWebsResolvedProduct,
  type AyWebsVariantGroup,
  type AyWebsVariantOption,
} from '@/api/aywebs';
import { ApiError } from '@/api/errors';
import { resolveWithCaptureFallback } from '@/features/aywebs/captureFallback';

export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES = 2;
export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS = 450;

/**
 * Filet de sécurité silencieux (20 s) sur `requestCapture` :
 * aucun compte à rebours ni minuteur visible à l'écran, mais si la WebView
 * ne renvoie jamais `postMessage`, le bouton ne reste pas bloqué indéfiniment.
 */
export const AYWEBS_CAPTURE_SAFETY_TIMEOUT_MS = 20_000;

export interface AyWebsPriceCandidate {
  text: string;
}

/** Extrait les candidats-prix de la capture (tableau `priceCandidates`, sinon vide). */
export function priceCandidatesOf(capture: Record<string, unknown>): AyWebsPriceCandidate[] {
  const raw = capture.priceCandidates;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is AyWebsPriceCandidate =>
      typeof entry === 'object' && entry !== null && typeof (entry as { text?: unknown }).text === 'string',
  );
}

export function hasAyWebsPriceCandidate(candidates: readonly AyWebsPriceCandidate[]): boolean {
  return candidates.some((candidate) => candidate.text.trim().length > 0);
}

/** Relance seulement si aucun texte de prix n'a été lu, et dans la limite. */
export function shouldRetryAyWebsCaptureForPrice(
  candidates: readonly AyWebsPriceCandidate[],
  retryCount: number,
): boolean {
  return Number.isInteger(retryCount)
    && retryCount >= 0
    && retryCount < AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES
    && !hasAyWebsPriceCandidate(candidates);
}

/** Vérifie que le serveur a validé le prix ET la devise, et qu'un devis signé existe. */
export function hasVerifiedAyWebsQuote(
  product: Pick<AyWebsResolvedProduct, 'price' | 'currency' | 'priceVerified' | 'currencyVerified'>,
  quoteToken: string,
): boolean {
  return product.price !== null
    && Number.isFinite(product.price)
    && product.price > 0
    && /^[A-Z]{3}$/.test(product.currency)
    && product.priceVerified
    && product.currencyVerified
    && Boolean(quoteToken.trim());
}

/**
 * Décision après résolution (19/10/2026) : ouvrir la feuille « Ajouter au panier » ou
 * expliquer pourquoi non. Une fiche sans prix/devise/titre vérifiés NE OUVRE PAS la
 * feuille, et l'erreur NOMME les champs manquants (`CAPTURE_INCOMPLETE`), au lieu du
 * message générique. Pur : aucune requête, aucune écriture de panier.
 */
export type AddToCartDecision =
  | { kind: 'sheet' }
  | { kind: 'refused'; error: ApiError };

export function addToCartDecision(outcome: AyWebsResolveOutcome): AddToCartDecision {
  if (hasVerifiedAyWebsQuote(outcome.product, outcome.quoteToken ?? '')) return { kind: 'sheet' };
  const missing = outcome.missing ?? [];
  if (missing.length) {
    return {
      kind: 'refused',
      error: new ApiError('http', 'Nous n’avons pas pu lire toutes les informations du produit.', {
        status: 422,
        code: 'CAPTURE_INCOMPLETE',
        missingFields: missing,
      }),
    };
  }
  return { kind: 'refused', error: new ApiError('http', 'Prix ou devise non vérifiés.', { code: 'PRICE_UNVERIFIED' }) };
}

/**
 * Délai accordé au bouton « Add to Cart » avant d'ouvrir la feuille (20/10/2026).
 * Tout compris : préparation du lecteur, attente de la page, lecture. Au-delà,
 * le bouton n'attend plus : il explique ce qui manque.
 */

/**
 * Âge maximal d'une lecture faite à l'ouverture de la page (20/10/2026). Au-delà, on relit
 * la page : le client a pu changer de taille ou de couleur sans que l'URL change.
 */
export const AYWEBS_PREFETCH_MAX_AGE_MS = 30_000;

export interface PrefetchEntry {
  url: string;
  at: number;
  status: 'reading' | 'ok' | 'failed';
}

/**
 * Faut-il réutiliser la lecture faite à l'ouverture (20/10/2026) ? Oui si elle est pour cette
 * page, et soit encore en cours, soit terminée depuis moins de `AYWEBS_PREFETCH_MAX_AGE_MS`.
 * Sinon (absente, en échec, périmée, autre page) : on relit au moment du clic.
 */
export function canReusePrefetch(entry: PrefetchEntry | null, pageUrl: string, now: number): boolean {
  if (!entry || entry.url !== pageUrl) return false;
  if (entry.status === 'reading') return true;
  return entry.status === 'ok' && now - entry.at < AYWEBS_PREFETCH_MAX_AGE_MS;
}

const BUDGET_EXCEEDED: unique symbol = Symbol('ayweb-add-budget-exceeded');

/** Course entre une promesse et le délai : rend la valeur, ou `BUDGET_EXCEEDED`. */
function withBudget<T>(promise: Promise<T>, ms: number): Promise<T | typeof BUDGET_EXCEEDED> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(BUDGET_EXCEEDED), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Refus clair quand la page n'a pas été lue à temps : nomme les deux champs. */
function captureRefusal(): ApiError {
  return new ApiError('http', 'Nous n’avons pas pu lire le titre ou le prix de ce produit.', {
    status: 422,
    code: 'CAPTURE_INCOMPLETE',
    missingFields: ['title', 'price'],
  });
}

/**
 * Parcours « Add to Cart » (20/10/2026, réécrit) :
 *
 *  1. la page est lue DANS le navigateur du client, jusqu'à la fin de la lecture
 *     (sans minuteur : `waitForCapture`). Le bouton reste en chargement ;
 *  2. lecture réussie ⇒ UNE résolution serveur AVEC cette lecture (vérification) ;
 *  3. lecture en échec ⇒ refus immédiat `CAPTURE_INCOMPLETE`,
 *     SANS lecture serveur de repli (elle prend 10 s et échoue sur Amazon) ;
 *  4. annulation (écran fermé, nouvel appui) ⇒ on propage, sans rien ouvrir.
 *
 * Sans `budgetMs`, l'ancien chemin (repli serveur) reste disponible pour les
 * appelants qui le demandent explicitement.
 */
export interface AddToCartFlowInput {
  readCapture?: () => Promise<unknown>;
  resolve: (capture: unknown | undefined) => Promise<AyWebsResolveOutcome>;
  signal?: AbortSignal;
  onPhase?: (phase: 'reading' | 'resolving' | 'server-fallback') => void;
  /** Délai de lecture (optionnel). Le bouton « Add » ne le passe PAS : il attend la lecture. */
  budgetMs?: number;
  /** Attendre la fin de la lecture, sans délai ni minuteur (succès ou échec seulement). */
  waitForCapture?: boolean;
  /** Appelé quand le délai expire, pour libérer la page en cours de lecture. */
  onBudgetExceeded?: () => void;
}

export interface AddToCartFlowResult {
  decision: AddToCartDecision;
  /** Absent quand la page n'a pas été lue (aucune résolution n'a eu lieu). */
  outcome: AyWebsResolveOutcome | undefined;
  capture: unknown | undefined;
}

export async function resolveAddToCart(input: AddToCartFlowInput): Promise<AddToCartFlowResult> {
  if ((input.budgetMs !== undefined || input.waitForCapture === true) && input.readCapture) {
    if (input.signal?.aborted) throw new ApiError('aborted', 'Requête interrompue.');
    input.onPhase?.('reading');
    let captured: unknown | typeof BUDGET_EXCEEDED;
    try {
      captured = input.budgetMs !== undefined
        ? await withBudget(input.readCapture(), input.budgetMs)
        : await input.readCapture();
    } catch (error) {
      if (input.signal?.aborted || (error instanceof ApiError && error.isAborted)) throw error;
      captured = undefined;
    }
    if (input.signal?.aborted) throw new ApiError('aborted', 'Requête interrompue.');
    if (captured === BUDGET_EXCEEDED) input.onBudgetExceeded?.();
    if (captured === BUDGET_EXCEEDED || captured === undefined) {
      return { decision: { kind: 'refused', error: captureRefusal() }, outcome: undefined, capture: undefined };
    }
    input.onPhase?.('resolving');
    const outcome = await input.resolve(captured);
    return { decision: addToCartDecision(outcome), outcome, capture: captured };
  }

  const { outcome, capture } = await resolveWithCaptureFallback<AyWebsResolveOutcome>(input);
  return { decision: addToCartDecision(outcome), outcome, capture };
}

/**
 * Fenêtre pendant laquelle une fiche DÉJÀ vérifiée par le serveur (au chargement de la page)
 * sert à ouvrir la feuille. Alignée sur la validité de la facture serveur (10 min par défaut).
 * Passé ce délai, « Add » relance la vérification (le bouton tourne).
 */
export const AYWEBS_VERIFIED_REUSE_MS = 10 * 60_000;

export function canReuseVerified(entry: { url: string; at: number } | null | undefined, url: string, now: number): boolean {
  if (!entry || entry.url !== url) return false;
  const age = now - entry.at;
  return age >= 0 && age < AYWEBS_VERIFIED_REUSE_MS;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeAttributeKey = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || value.trim().toLowerCase();

export interface LocalCaptureEntry {
  url: string;
  status: 'pending' | 'ok' | 'failed';
  capture?: unknown;
}

/**
 * Une capture locale déjà lue pour cette `url` est directement réutilisable
 * pour ouvrir la feuille sans appel serveur.
 */
export function canReuseLocalCapture(
  entry: LocalCaptureEntry | null | undefined,
  pageUrl: string,
): entry is LocalCaptureEntry & { status: 'ok'; capture: Record<string, unknown> } {
  if (!entry || entry.url !== pageUrl || entry.status !== 'ok') return false;
  return canOpenLocalSheetFromCapture(entry.capture);
}

/**
 * Vérifie que la capture locale contient assez de matière (titre ou candidat-prix)
 * pour ouvrir la feuille locale.
 */
export function canOpenLocalSheetFromCapture(capture: unknown): capture is Record<string, unknown> {
  if (!isRecord(capture)) return false;
  const title = typeof capture.title === 'string' ? capture.title.trim() : '';
  const hasPrice = hasAyWebsPriceCandidate(priceCandidatesOf(capture));
  return Boolean(title && hasPrice);
}

export interface LocalCaptureSheetData {
  title: string;
  url: string;
  images: string[];
  groups: AyWebsVariantGroup[];
  options: AyWebsVariantOption[];
  initialSelection: Record<string, string>;
}

/**
 * Extrait localement de la capture WebView :
 *  - le titre et l'URL de la fiche,
 *  - les groupes de variantes (tailles, couleurs, options Amazon ou génériques),
 *  - la disponibilité connue de chaque option,
 *  - la sélection initiale (options marquées `selected` sur la page ou groupe à valeur unique).
 * Aucun appel serveur.
 */
export function extractCaptureSheetData(capture: unknown): LocalCaptureSheetData {
  if (!isRecord(capture)) {
    return { title: '', url: '', images: [], groups: [], options: [], initialSelection: {} };
  }
  const title = typeof capture.title === 'string' ? capture.title.trim() : '';
  const url = typeof capture.url === 'string' ? capture.url.trim() : '';
  const images = Array.isArray(capture.images)
    ? capture.images.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  const groupMap = new Map<string, AyWebsVariantGroup>();
  const options: AyWebsVariantOption[] = [];
  const initialSelection: Record<string, string> = {};

  const addGroupValue = (rawAttr: string, rawVal: string): string => {
    const key = normalizeAttributeKey(rawAttr);
    const val = rawVal.trim();
    if (!key || !val) return '';
    let group = groupMap.get(key);
    if (!group) {
      group = { attribute: key, values: [] };
      groupMap.set(key, group);
    }
    const existing = group.values.find((entry) => entry.toLowerCase() === val.toLowerCase());
    if (existing) return existing;
    group.values.push(val);
    return val;
  };

  if (isRecord(capture.amazon)) {
    const amazon = capture.amazon;
    const selectedAsin = typeof amazon.selectedAsin === 'string' ? amazon.selectedAsin.trim() : '';

    if (Array.isArray(amazon.options)) {
      for (const item of amazon.options) {
        if (!isRecord(item)) continue;
        const rawDim = typeof item.dimension === 'string' ? item.dimension : '';
        const rawVal = typeof item.value === 'string' ? item.value : '';
        const dimKey = normalizeAttributeKey(rawDim);
        const canonicalVal = addGroupValue(rawDim, rawVal);
        if (!dimKey || !canonicalVal) continue;
        const asin = typeof item.asin === 'string' ? item.asin.trim() : '';
        const selected = item.selected === true;
        const evidence = typeof item.availabilityEvidence === 'string' ? item.availabilityEvidence : 'unknown';
        const availability = evidence === 'unavailable'
          ? 'OUT_OF_STOCK'
          : evidence === 'available'
            ? 'AVAILABLE'
            : 'UNKNOWN';
        options.push({
          sourceVariantId: asin || `${dimKey}:${canonicalVal}`,
          attributes: { [dimKey]: canonicalVal },
          label: canonicalVal,
          price: null,
          currency: '',
          quotedPrice: null,
          quotedCurrency: '',
          priceSource: 'UNKNOWN',
          availability,
          availabilityReason: `amazon_option_${evidence}`,
          image: '',
          totalTnd: null,
        });
        if (selected && evidence !== 'unavailable' && !initialSelection[dimKey]) {
          initialSelection[dimKey] = canonicalVal;
        }
      }
    }

    if (Array.isArray(amazon.variants)) {
      for (const item of amazon.variants) {
        if (!isRecord(item)) continue;
        const asin = typeof item.asin === 'string' ? item.asin.trim() : '';
        const selected = item.selected === true || (Boolean(selectedAsin) && asin === selectedAsin);
        const dims = Array.isArray(item.dimensions) ? item.dimensions : [];
        const attrs: Record<string, string> = {};
        for (const dim of dims) {
          if (!isRecord(dim)) continue;
          const rawName = typeof dim.name === 'string' ? dim.name : '';
          const rawVal = typeof dim.value === 'string' ? dim.value : '';
          const dimKey = normalizeAttributeKey(rawName);
          const canonicalVal = addGroupValue(rawName, rawVal);
          if (!dimKey || !canonicalVal) continue;
          attrs[dimKey] = canonicalVal;
          if (selected && !initialSelection[dimKey]) {
            initialSelection[dimKey] = canonicalVal;
          }
        }
        if (Object.keys(attrs).length > 0 && !options.some((opt) =>
          Object.keys(attrs).every((k) => opt.attributes[k]?.toLowerCase() === attrs[k]?.toLowerCase())
          && Object.keys(opt.attributes).length === Object.keys(attrs).length,
        )) {
          options.push({
            sourceVariantId: asin || Object.entries(attrs).map(([k, v]) => `${k}:${v}`).join('|'),
            attributes: attrs,
            label: Object.values(attrs).join(' / '),
            price: null,
            currency: '',
            quotedPrice: null,
            quotedCurrency: '',
            priceSource: 'UNKNOWN',
            availability: selected ? 'AVAILABLE' : 'UNKNOWN',
            availabilityReason: selected ? 'amazon_selected_variant' : 'amazon_variant',
            image: '',
            totalTnd: null,
          });
        }
      }
    }
  }

  if (Array.isArray(capture.variantGroups)) {
    for (const group of capture.variantGroups) {
      if (!isRecord(group) || typeof group.attribute !== 'string' || !Array.isArray(group.values)) continue;
      for (const value of group.values) {
        if (typeof value === 'string') addGroupValue(group.attribute, value);
      }
    }
  }

  if (Array.isArray(capture.sizes)) {
    for (const value of capture.sizes) {
      if (typeof value === 'string') addGroupValue('size', value);
    }
  }
  if (Array.isArray(capture.colors)) {
    for (const value of capture.colors) {
      if (typeof value === 'string') addGroupValue('color', value);
    }
  }
  if (isRecord(capture.variants)) {
    if (Array.isArray(capture.variants.sizes)) {
      for (const value of capture.variants.sizes) {
        if (typeof value === 'string') addGroupValue('size', value);
      }
    }
    if (Array.isArray(capture.variants.colors)) {
      for (const value of capture.variants.colors) {
        if (typeof value === 'string') addGroupValue('color', value);
      }
    }
  }

  const variantTexts = Array.isArray(capture.variantTexts)
    ? capture.variantTexts.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const selectedVariantTexts = Array.isArray(capture.selectedVariantTexts)
    ? capture.selectedVariantTexts.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  if (groupMap.size === 0 && variantTexts.length > 0) {
    for (const text of variantTexts) {
      addGroupValue('option', text);
    }
  }

  const groups = Array.from(groupMap.values()).filter((group) => group.values.length > 0);
  for (const group of groups) {
    if (initialSelection[group.attribute]) continue;
    if (group.values.length === 1) {
      initialSelection[group.attribute] = group.values[0]!;
      continue;
    }
    if (selectedVariantTexts.length > 0) {
      const matched = group.values.find((val) =>
        selectedVariantTexts.some((sel) => sel.trim().toLowerCase() === val.toLowerCase()),
      );
      if (matched) initialSelection[group.attribute] = matched;
    }
  }

  return {
    title,
    url,
    images,
    groups,
    options,
    initialSelection,
  };
}

export type ConfirmValidationCode =
  | 'OUT_OF_STOCK'
  | 'VARIANT_NOT_PROVEN'
  | 'VARIANT_UNAVAILABLE'
  | 'VARIANT_REQUIRED'
  | 'PRICE_CHANGED'
  | 'CAPTURE_INCOMPLETE'
  | 'STOCK_UNKNOWN'
  | 'PRICE_UNAVAILABLE';

export type ConfirmValidationDecision =
  | { ok: true }
  | { ok: false; code: ConfirmValidationCode; missingFields?: string[] };

/**
 * Valide le verdict serveur (`/product/resolve`) au clic sur le bouton de
 * confirmation de la feuille, AVANT tout appel à `addAyWebsCartItem` :
 *  - `OUT_OF_STOCK` ou `UNKNOWN` ne va jamais au panier ;
 *  - `VARIANT_NOT_PROVEN` bloque si la variante choisie n'est pas prouvée ;
 *  - `PRICE_CHANGED` bloque en cas de rejet/changement de prix ;
 *  - aucun ajout sans devis serveur signé valide (`quoteToken` + `totalTnd > 0`).
 */
export function validateConfirmResolution(
  outcome: AyWebsResolveOutcome,
  chosenVariant: Record<string, string> | null,
): ConfirmValidationDecision {
  if (outcome.capture && !outcome.capture.used) {
    const rejection = outcome.capture.rejection;
    if (rejection === 'OUT_OF_STOCK') return { ok: false, code: 'OUT_OF_STOCK' };
    if (rejection === 'VARIANT_NOT_PROVEN') return { ok: false, code: 'VARIANT_NOT_PROVEN' };
    if (
      rejection === 'AMBIGUOUS_PRICE'
      || rejection === 'PRICE_REJECTED'
      || rejection === 'BUYBOX_ASIN_MISMATCH'
      || rejection === 'PRICE_NOT_CORROBORATED'
    ) {
      return { ok: false, code: 'PRICE_CHANGED' };
    }
    return {
      ok: false,
      code: 'CAPTURE_INCOMPLETE',
      missingFields: outcome.missing.length ? outcome.missing : ['title', 'price'],
    };
  }

  if (outcome.priceRejection) {
    return { ok: false, code: 'PRICE_CHANGED' };
  }

  const availState = outcome.product.availability.state;
  const availReason = outcome.product.availability.reason || '';
  if (availState === 'OUT_OF_STOCK') {
    return { ok: false, code: 'OUT_OF_STOCK' };
  }
  if (availState !== 'AVAILABLE' && availState !== 'LOW_STOCK') {
    if (
      availReason.startsWith('selection_not_verified_by_capture')
      || availReason.includes('variant')
      || (chosenVariant && Object.keys(chosenVariant).length > 0)
    ) {
      return { ok: false, code: 'VARIANT_NOT_PROVEN' };
    }
    return { ok: false, code: 'STOCK_UNKNOWN' };
  }

  if (
    !hasVerifiedAyWebsQuote(outcome.product, outcome.quoteToken ?? '')
    || !(outcome.product.ayroviPricing?.totalTnd && outcome.product.ayroviPricing.totalTnd > 0)
  ) {
    if (outcome.missing?.length) {
      return { ok: false, code: 'CAPTURE_INCOMPLETE', missingFields: outcome.missing };
    }
    return { ok: false, code: 'PRICE_UNAVAILABLE' };
  }

  if (outcome.product.variantGroups.length > 0) {
    const sel = chosenVariant ?? {};
    for (const group of outcome.product.variantGroups) {
      if (!group.values.length) continue;
      const key = normalizeAttributeKey(group.attribute);
      const picked = sel[key] ?? sel[group.attribute] ?? '';
      if (!picked.trim()) {
        return { ok: false, code: 'VARIANT_REQUIRED' };
      }
    }
  }

  if (outcome.product.variantDetails.length > 0) {
    const readiness = ayWebsAddReadiness({
      groups: outcome.product.variantGroups,
      options: outcome.product.variantDetails,
      productAvailability: outcome.product.availability.state,
      productQuotedTnd: outcome.product.ayroviPricing?.totalTnd ?? null,
      selection: chosenVariant ?? {},
    });
    if (!readiness.ready && readiness.code) {
      return {
        ok: false,
        code: readiness.code === 'VARIANT_UNKNOWN' ? 'VARIANT_NOT_PROVEN' : readiness.code,
      };
    }
  }

  return { ok: true };
}
