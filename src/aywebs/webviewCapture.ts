/**
 * AYWEBs — VALIDATION D'UNE CAPTURE WebView (Phase 2.1, 06/10/2026).
 *
 * Ce module est le SEUL endroit où une donnée fournie par le client devient une
 * lecture exploitable. Il est donc écrit comme un filtre, pas comme un lecteur :
 * il ne « complète » jamais, il ne devine jamais, il refuse.
 *
 * Ce qu'il fait, dans l'ordre :
 *   1. forme et taille (bornes du contrat partagé) ;
 *   2. identité de la page : même hôte que l'URL demandée, horodatage plausible ;
 *   3. PRIX : chaque texte candidat passe par le verdict d'intégrité de la
 *      Phase 0 (`checkPriceText`) ; le meilleur candidat est retenu selon
 *      l'ordre de fiabilité JSON-LD > microdata > meta > DOM, et il n'est dit
 *      « corroboré » que si un JSON-LD le publie OU si deux sources
 *      indépendantes donnent le même montant ;
 *   4. DEVISE : prouvée par un code ISO explicite (même règle que le lecteur
 *      serveur : `/\b[A-Z]{3}\b/` sur l'évidence) — un symbole seul ne suffit pas ;
 *   5. DISPONIBILITÉ : traduite depuis une liste de formulations FERMÉE et
 *      documentée ; tout le reste vaut UNKNOWN (et le panier refusera — c'est
 *      voulu : on n'affirme pas un stock qu'on n'a pas lu) ;
 *   6. EMPREINTE : SHA-256 de l'évidence acceptée, pour l'audit, l'anti-rejeu et
 *      la comparaison avec une relecture serveur.
 *
 * Aucune valeur numérique de prix n'est acceptée telle quelle : même si le
 * client envoyait `price: 1`, ce champ n'existe pas dans le contrat, et le
 * montant ne peut sortir que du parseur du serveur. Les textes sont bornés,
 * normalisés (espaces insécables, longueur) et journalisés.
 */
import { createHash } from 'node:crypto';
import type { ScrapedProduct } from '../types';
import { checkPriceText } from '../scraper/priceIntegrity';
import { detectAyWebsStore } from '../../shared/aywebsStores';
import {
  AYWEBS_CAPTURE_LIMITS,
  AYWEBS_CAPTURE_VERSION,
  type AyWebsAmazonCaptureEvidence,
  type AyWebsCaptureSource,
  type AyWebsCaptureOutcome,
  type AyWebsCapturedPage,
  type AyWebsCapturedPriceCandidate,
} from '../../shared/aywebsCapture';
import type { AyWebsAvailabilityState } from '../../shared/aywebsTypes';

/** Ordre de fiabilité des sources de prix : machine d'abord, humain ensuite. */
const SOURCE_RANK: Record<AyWebsCaptureSource, number> = { json_ld: 0, microdata: 1, meta: 2, dom: 3 };

/**
 * PREUVE DE DEVISE PAR SYMBOLE — liste FERMÉE, boutique par boutique (07/10/2026).
 *
 * Pourquoi une liste et pas une heuristique : un symbole n'est PAS une devise.
 * `$` vaut USD, CAD, AUD, SGD, MXN ou BRL ; `£` vaut GBP — ou la livre
 * égyptienne (`E£`) ; `¥` vaut JPY — ou CNY. Une règle globale produirait des
 * montants libellés dans la mauvaise devise, exactement l'erreur que la Phase 0
 * a éliminée.
 *
 * Chaque entrée dit donc : pour CETTE boutique (registre), ce symbole prouve ce
 * code ISO — sauf sur les domaines listés, où le symbole désigne autre chose.
 *
 * Cas mesuré le 07/10/2026 : Amazon ne publie NI JSON-LD de prix NI code ISO ;
 * la seule preuve lisible est « $109.00 » dans la zone d'achat. Sans cette
 * table, la capture Amazon ne pouvait jamais prouver la devise — donc jamais de
 * devis.
 */
interface AyWebsSymbolCurrencyRule {
  iso: string;
  pattern: RegExp;
  /** Boutiques du registre où le symbole vaut ce code. */
  stores: readonly string[];
  /** Domaines (suffixes) où le symbole NE vaut PAS ce code. */
  hostsExcluded?: readonly string[];
}

const AYWEBS_SYMBOL_CURRENCIES: readonly AyWebsSymbolCurrencyRule[] = [
  { iso: 'EUR', pattern: /€/, stores: ['amazon', 'shein', 'temu', 'aliexpress'] },
  /* E£ (livre égyptienne) porte le même signe : amazon.eg est exclu. */
  { iso: 'GBP', pattern: /£/, stores: ['amazon', 'shein', 'temu', 'aliexpress'], hostsExcluded: ['amazon.eg'] },
  /* ¥ = JPY sur amazon.co.jp, mais CNY ailleurs : réservé à Amazon. */
  { iso: 'JPY', pattern: /[¥￥]/, stores: ['amazon'] },
  { iso: 'TND', pattern: /د\.ت/, stores: ['amazon', 'shein', 'temu', 'aliexpress'] },
  /* `$` non-USD : les domaines Amazon dont la devise nationale n'est pas l'USD. */
  {
    iso: 'USD',
    pattern: /\$|US\s?\$/,
    stores: ['amazon', 'shein', 'temu', 'aliexpress'],
    hostsExcluded: ['amazon.ca', 'amazon.com.au', 'amazon.sg', 'amazon.com.mx', 'amazon.com.br'],
  },
];

function hostMatchesAny(host: string, suffixes: readonly string[] | undefined): boolean {
  if (!suffixes?.length) return false;
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/* ── COMPTEURS (exposés par `/health`, jamais de contenu) ────────────────────
   Que mesure-t-on : combien de captures sont jugées, acceptées, refusées et
   pourquoi ; d'où vient le prix retenu ; comment la devise a été prouvée. Ces
   compteurs sont la seule façon de voir en production si la règle « symbole »
   travaille (et si la capture WebView sert vraiment à quelque chose). */
interface AyWebsWebviewCaptureStats {
  validated: number;
  accepted: number;
  rejected: number;
  rejections: Record<string, number>;
  price_sources: Record<string, number>;
  currency_published: number;
  currency_symbol: number;
  currency_unproven: number;
  single_source: number;
}

const captureStats: AyWebsWebviewCaptureStats = {
  validated: 0, accepted: 0, rejected: 0,
  rejections: {}, price_sources: {},
  currency_published: 0, currency_symbol: 0, currency_unproven: 0, single_source: 0,
};

function bump(target: Record<string, number>, key: string): void {
  if (!key) return;
  target[key] = (target[key] || 0) + 1;
}

export function ayWebsWebviewCaptureStats(): AyWebsWebviewCaptureStats {
  return {
    ...captureStats,
    rejections: { ...captureStats.rejections },
    price_sources: { ...captureStats.price_sources },
  };
}

/** Remise à zéro — réservée aux tests (les compteurs de production ne se remettent pas). */
export function resetAyWebsWebviewCaptureStats(): void {
  captureStats.validated = 0;
  captureStats.accepted = 0;
  captureStats.rejected = 0;
  captureStats.rejections = {};
  captureStats.price_sources = {};
  captureStats.currency_published = 0;
  captureStats.currency_symbol = 0;
  captureStats.currency_unproven = 0;
  captureStats.single_source = 0;
}

/**
 * Disponibilité — vocabulaire FERMÉ. Chaque entrée est une formulation
 * réellement publiée par les marchands (JSON-LD schema.org en anglais, ou texte
 * du bouton d'achat en fr/en/ar). Rien d'autre n'est interprété.
 */
const AVAILABILITY_VOCABULARY: Array<{ state: AyWebsAvailabilityState; reason: string; patterns: RegExp[] }> = [
  {
    state: 'OUT_OF_STOCK', reason: 'merchant_out_of_stock',
    patterns: [
      /outofstock|sold\s*out|out\s*of\s*stock|unavailable|currently\s+unavailable/i,
      /rupture|épuis|indisponible|non\s+disponible/i,
      /غير\s+متوفر|نفد/i,
    ],
  },
  {
    state: 'LOW_STOCK', reason: 'merchant_limited_stock',
    patterns: [/limitedavailability|limited\s*stock|low\s*stock|only\s*\d+\s*left|plus\s+que\s*\d+/i, /derniers?\s+exemplaires?/i],
  },
  {
    state: 'AVAILABLE', reason: 'merchant_in_stock',
    patterns: [/instock|in\s*stock|available|add\s*to\s*(?:cart|basket|bag)|buy\s*now|add\s*to\s*cart/i, /en\s+stock|ajouter\s+au\s+panier|acheter/i, /أضف\s+إلى\s+السلة|متوفر/i],
  },
];

/** Condition (neuf/occasion) — mêmes règles que le lecteur serveur : jamais déduit. */
const CONDITION_PATTERNS: Array<{ value: 'new' | 'used' | 'refurbished'; patterns: RegExp[] }> = [
  { value: 'refurbished', patterns: [/refurb|reconditionn?|مُجدَّد/i] },
  { value: 'used', patterns: [/usedcondition|^used$|second\s*hand|occasion|مستعمل/i] },
  { value: 'new', patterns: [/newcondition|^new$|neuf|nouveau|جديد/i] },
];

function collapse(raw: unknown, max: number): string {
  const text = String(raw ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, max);
}

function cleanTextArray(raw: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const text = collapse(item, maxLength);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function cleanImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const text = collapse(item, 600);
    if (!/^https?:\/\//i.test(text)) continue;
    if (out.includes(text)) continue;
    out.push(text);
    if (out.length >= AYWEBS_CAPTURE_LIMITS.maxImages) break;
  }
  return out;
}

function hostOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

const AMAZON_ASIN_RE = /^[A-Z0-9]{10}$/;
const AMAZON_VARIANT_SOURCES = new Set(['dimensionValuesDisplayData', 'asinVariationValues', 'twister_dom']);

function cleanAmazonEvidence(raw: unknown, requestHost: string, pageUrl: string): AyWebsAmazonCaptureEvidence | null {
  if (!/^amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(requestHost) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  if (Number(input.readerVersion) !== 2) return null;
  const pageAsinRaw = collapse(input.pageAsin, 10).toUpperCase();
  const selectedAsinRaw = collapse(input.selectedAsin, 10).toUpperCase();
  const pageAsin = AMAZON_ASIN_RE.test(pageAsinRaw) ? pageAsinRaw : null;
  if (!pageAsin) return null;
  let urlAsin: string | null = null;
  try {
    const path = new URL(pageUrl).pathname;
    const match = path.match(/\/(?:dp|gp\/(?:product|aw\/d)|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    if (match) urlAsin = match[1].toUpperCase();
  } catch { /* page URL was host-validated earlier */ }
  if (urlAsin && urlAsin !== pageAsin) return null;

  const variants: AyWebsAmazonCaptureEvidence['variants'] = [];
  const rawVariants = Array.isArray(input.variants) ? input.variants.slice(0, 40) : [];
  for (const item of rawVariants) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const variant = item as Record<string, unknown>;
    const asin = collapse(variant.asin, 10).toUpperCase();
    const source = String(variant.source || '');
    if (!AMAZON_ASIN_RE.test(asin) || !AMAZON_VARIANT_SOURCES.has(source) || !Array.isArray(variant.dimensions)) continue;
    const dimensions: Array<{ name: string; value: string }> = [];
    for (const dimensionRaw of variant.dimensions.slice(0, 6)) {
      if (!dimensionRaw || typeof dimensionRaw !== 'object' || Array.isArray(dimensionRaw)) continue;
      const dimension = dimensionRaw as Record<string, unknown>;
      const name = collapse(dimension.name, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const value = collapse(dimension.value, 60);
      if (!name || !value || dimensions.some((entry) => entry.name === name)) continue;
      dimensions.push({ name, value });
    }
    if (dimensions.length) variants.push({
      asin,
      dimensions,
      source: source as AyWebsAmazonCaptureEvidence['variants'][number]['source'],
      selected: variant.selected === true,
    });
  }
  const selectedAsin = AMAZON_ASIN_RE.test(selectedAsinRaw) && variants.some((variant) => variant.asin === selectedAsinRaw)
    ? selectedAsinRaw
    : null;
  const options: AyWebsAmazonCaptureEvidence['options'] = [];
  const rawOptions = Array.isArray(input.options) ? input.options.slice(0, 60) : [];
  for (const item of rawOptions) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const option = item as Record<string, unknown>;
    const dimension = collapse(option.dimension, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const value = collapse(option.value, 60);
    const asinValue = collapse(option.asin, 10).toUpperCase();
    const asin = AMAZON_ASIN_RE.test(asinValue) ? asinValue : null;
    const state = option.availabilityEvidence === 'available' || option.availabilityEvidence === 'unavailable'
      ? option.availabilityEvidence
      : 'unknown';
    if (!dimension || !value) continue;
    options.push({
      dimension, value, asin, selected: option.selected === true,
      availabilityEvidence: state,
      source: 'twister_dom',
    });
  }
  const selectedPriceEvidence: AyWebsAmazonCaptureEvidence['selectedPriceEvidence'] = [];
  if (Array.isArray(input.selectedPriceEvidence)) {
    for (const item of input.selectedPriceEvidence.slice(0, 4)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const candidate = item as Record<string, unknown>;
      const text = collapse(candidate.text, AYWEBS_CAPTURE_LIMITS.maxTextLength);
      const source = String(candidate.source || '');
      if (!text || !['json_ld', 'embedded_json', 'microdata', 'meta', 'dom'].includes(source)) continue;
      selectedPriceEvidence.push({ text, source: source as AyWebsCaptureSource });
    }
  }
  return { readerVersion: 2, pageAsin, selectedAsin, selectedPriceEvidence, options, variants };
}

export interface AyWebsCaptureValidation {
  ok: boolean;
  rejection: string | null;
  /** Produit prêt pour le normaliseur AYWEBs — jamais un prix inventé. */
  scraped: ScrapedProduct | null;
  price: number;
  currency: string;
  priceVerified: boolean;
  currencyVerified: boolean;
  availability: AyWebsAvailabilityState;
  availabilityReason: string;
  condition: 'new' | 'used' | 'refurbished' | null;
  fingerprint: string;
  priceSource: AyWebsCaptureSource | null;
  corroborated: boolean;
  /** Options que le CLIENT avait choisies sur la page (libellés bruts bornés). */
  selectedVariantTexts: string[];
  /** Amazon-only ASIN/variant evidence, normalized and host-bound. */
  amazonEvidence: AyWebsAmazonCaptureEvidence | null;
  /** Piste d'audit lisible : quels candidats ont été vus, lesquels ont gagné. */
  notes: string[];
  outcome: AyWebsCaptureOutcome;
}

function fingerprintOf(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function rejected(rejection: string, fingerprint = '', notes: string[] = []): AyWebsCaptureValidation {
  captureStats.rejected += 1;
  bump(captureStats.rejections, rejection);
  return {
    ok: false, rejection, scraped: null, price: 0, currency: '',
    priceVerified: false, currencyVerified: false,
    availability: 'UNKNOWN', availabilityReason: `capture_rejected:${rejection}`,
    condition: null, fingerprint, priceSource: null, corroborated: false, selectedVariantTexts: [], amazonEvidence: null, notes,
    outcome: { used: false, fingerprint: fingerprint || null, priceSource: null, corroborated: false, rejection },
  };
}

/**
 * Valide une capture et, si elle est exploitable, produit le `ScrapedProduct`
 * que le reste d'AYWEBs consomme déjà (mêmes règles de prix, même normaliseur).
 * `requestUrl` : l'URL demandée par le client — la capture doit porter le même hôte.
 */
/** Options du crible : le seuil monte pour un domaine HORS registre (2.1). */
export interface AyWebsCaptureValidationOptions {
  /**
   * Exige un prix corroboré (JSON-LD du marchand, ou ≥ 2 sources d'accord).
   * Utilisé pour un domaine absent du Store Registry : là, il n'existe aucune
   * connaissance marchande pour rattraper une lecture solitaire.
   */
  requireCorroboration?: boolean;
}

export function validateAyWebsCapturedPage(
  raw: unknown,
  requestUrl: string,
  options: AyWebsCaptureValidationOptions = {},
): AyWebsCaptureValidation {
  captureStats.validated += 1;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return rejected('NOT_AN_OBJECT');
  const payload = raw as AyWebsCapturedPage;

  if (Number(payload.v) !== AYWEBS_CAPTURE_VERSION) return rejected('BAD_VERSION');

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return rejected('NOT_AN_OBJECT');
  }
  if (Buffer.byteLength(serialized, 'utf8') > AYWEBS_CAPTURE_LIMITS.maxBytes) return rejected('TOO_LARGE');

  const pageUrl = collapse(payload.url, 600);
  const requestHost = hostOf(requestUrl);
  const pageHost = hostOf(pageUrl);
  if (!pageHost || !requestHost || pageHost !== requestHost) return rejected('URL_HOST_MISMATCH');

  const canonicalUrl = collapse(payload.canonicalUrl, 600);
  if (canonicalUrl) {
    const canonicalHost = hostOf(canonicalUrl);
    if (!canonicalHost || canonicalHost !== requestHost) return rejected('CANONICAL_HOST_MISMATCH');
  }

  const capturedAtMs = Date.parse(String(payload.capturedAt || ''));
  if (!Number.isFinite(capturedAtMs)) return rejected('STALE_CAPTURE');
  const now = Date.now();
  if (now - capturedAtMs > AYWEBS_CAPTURE_LIMITS.maxAgeMs) return rejected('STALE_CAPTURE');
  if (capturedAtMs - now > AYWEBS_CAPTURE_LIMITS.maxClockSkewMs) return rejected('FUTURE_CAPTURE');

  /* ── PRIX ────────────────────────────────────────────────────────────────
     Chaque candidat est jugé par le verdict de la Phase 0. Le classement suit
     la fiabilité de la source ; à fiabilité égale, l'ordre d'arrivée. */
  const notes: string[] = [];
  const candidates: Array<{ text: string; source: AyWebsCaptureSource; value: number; rank: number; index: number; hints: string[] }> = [];
  const rawCandidates = Array.isArray(payload.priceCandidates) ? payload.priceCandidates.slice(0, AYWEBS_CAPTURE_LIMITS.maxPriceCandidates) : [];
  rawCandidates.forEach((candidate: AyWebsCapturedPriceCandidate, index: number) => {
    const text = collapse(candidate?.text, AYWEBS_CAPTURE_LIMITS.maxTextLength);
    const source = (candidate?.source || 'dom') as AyWebsCaptureSource;
    if (!text) return;
    const check = checkPriceText(text);
    if (!check.ok) {
      notes.push(`candidate_rejected:${source}:${check.reason}`);
      return;
    }
    notes.push(`candidate_ok:${source}:${check.value}`);
    /* `currencyHints` : les devises que le TEXTE peut désigner, selon la table de
       marqueurs de la Phase 0 (`$` ⇒ USD/CAD/AUD…, `€` ⇒ EUR, `¥` ⇒ JPY/CNY).
       Sert à détecter une CONTRADICTION avec un code ISO publié — pas à deviner. */
    candidates.push({ text, source, value: check.value, rank: SOURCE_RANK[source] ?? SOURCE_RANK.dom, index, hints: check.currencyHints });
  });

  if (!candidates.length) {
    // Distinguer « aucun texte » de « textes tous refusés » : le support doit
    // savoir si la page n'a rien affiché ou si quelque chose a été écarté.
    return rejected(rawCandidates.length ? 'PRICE_REJECTED' : 'NO_PRICE_TEXT', '', notes);
  }

  candidates.sort((a, b) => (a.rank - b.rank) || (a.index - b.index));
  const primary = candidates[0];
  const sameValue = candidates.filter((candidate) => Math.abs(candidate.value - primary.value) < 0.005);

  /* Corroboration : un JSON-LD suffit (donnée machine publiée par le marchand) ;
     sinon il faut DEUX sources indépendantes d'accord sur le même montant. */
  const distinctSources = new Set(sameValue.map((candidate) => candidate.source));
  const corroborated = primary.source === 'json_ld' || distinctSources.size >= 2;

  /* Un désaccord entre sources n'est pas « ambigu » au sens du refus : le
     JSON-LD fait foi et l'écart est noté. Mais s'il n'y a PAS de JSON-LD et que
     deux sources divergent, on refuse : c'est exactement le cas « prix d'une
     publicité à côté du prix réel » qui a motivé la Phase 0. */
  if (primary.source !== 'json_ld' && candidates.length >= 2 && !corroborated) {
    return rejected('AMBIGUOUS_PRICE', '', notes);
  }

  /* Hors registre : la source unique ne passe pas. Le motif est distinct du
     « ambigu » — le montant est clair, il est simplement trop peu étayé pour
     fonder un devis sur un marchand que nous ne connaissons pas. */
  if (options.requireCorroboration === true && !corroborated) {
    notes.push('corroboration_required_for_unknown_merchant');
    return rejected('PRICE_NOT_CORROBORATED', '', notes);
  }

  const price = primary.value;
  if (!(price > 0)) return rejected('PRICE_REJECTED', '', notes);

  /* ── DEVISE ───────────────────────────────────────────────────────────────
     1. Un code ISO publié par la page (JSON-LD `priceCurrency`, meta, ou le texte
        même du montant) fait foi — comme avant.
     2. Sinon, pour une boutique DU REGISTRE, un SYMBOLE de la liste fermée
        ci-dessus prouve la devise de la zone d'achat (constat du 07/10/2026 :
        Amazon ne publie aucun code ISO ; « $109.00 » est la seule preuve lisible).
     3. CONTRADICTION (symbole incompatible avec le code publié, ou deux codes
        publiés différents) ⇒ AUCUNE devise n'est prouvée : on ne choisit pas
        entre deux devises, et le devis n'est pas publié. */
  const currencyEvidence = collapse(payload.currencyText, 60);
  const candidateCurrencyEvidence = sameValue.map((candidate) => candidate.text).join(' ');
  const currencyTexts = `${currencyEvidence} ${candidateCurrencyEvidence}`;
  const publishedIsos = new Set<string>();
  (currencyEvidence.toUpperCase().match(/\b[A-Z]{3}\b/g) || []).forEach((code) => publishedIsos.add(code));
  (candidateCurrencyEvidence.match(/\b(?:EUR|USD|GBP|JPY|TND)\b/g) || []).forEach((code) => publishedIsos.add(code));
  const publishedIso = [...publishedIsos][0] || '';
  /* Devises que le texte du montant peut désigner (table de la Phase 0). */
  const hintSet = new Set<string>();
  sameValue.forEach((candidate) => candidate.hints.forEach((hint) => hintSet.add(hint)));
  const symbolSeen = AYWEBS_SYMBOL_CURRENCIES.some((entry) => entry.pattern.test(currencyTexts));
  let contradiction = publishedIsos.size > 1;
  if (!contradiction && publishedIso && symbolSeen) {
    /* Le symbole et le code publié doivent désigner la même devise. */
    contradiction = !(hintSet.size > 0 && hintSet.has(publishedIso));
    if (contradiction) notes.push(`currency_symbol_contradicts_published:${publishedIso}`);
  }
  let symbolIso = '';
  if (!contradiction && !publishedIso) {
    const store = detectAyWebsStore(requestUrl);
    if (store) {
      for (const entry of AYWEBS_SYMBOL_CURRENCIES) {
        if (!entry.stores.includes(store.id)) continue;
        if (!entry.pattern.test(currencyTexts)) continue;
        if (hostMatchesAny(requestHost, entry.hostsExcluded)) {
          notes.push(`currency_symbol_host_ambiguous:${entry.iso}`);
          continue;
        }
        symbolIso = entry.iso;
        notes.push(`currency_symbol_registered_store:${entry.iso}`);
        break;
      }
    } else if (symbolSeen) {
      notes.push('currency_symbol_unregistered_store');
    }
  }
  const currency = contradiction ? '' : (publishedIso || symbolIso);
  const currencyVerified = !contradiction && Boolean(currency);

  /* ── DISPONIBILITÉ : vocabulaire fermé, sinon UNKNOWN ──────────────────── */
  const availabilityEvidence = [
    collapse(payload.availabilityText, AYWEBS_CAPTURE_LIMITS.maxTextLength),
    collapse(payload.addToCartText, AYWEBS_CAPTURE_LIMITS.maxTextLength),
  ].filter(Boolean).join(' | ');
  let availability: AyWebsAvailabilityState = 'UNKNOWN';
  let availabilityReason = 'capture_stock_unspecified';
  /* Le client annote un contrôle d'achat DÉSACTIVÉ avec « [disabled] ». Un
     bouton désactivé ne prouve pas un stock : il prouve qu'on ne peut pas
     acheter MAINTENANT (option manquante, rupture, région bloquée). On répond
     UNKNOWN — jamais AVAILABLE — et on dit pourquoi. */
  if (/\[disabled\]/i.test(availabilityEvidence)) {
    availability = 'UNKNOWN';
    availabilityReason = 'capture_add_control_disabled';
    notes.push('add_control_disabled');
  } else if (availabilityEvidence) {
    const match = AVAILABILITY_VOCABULARY.find((entry) => entry.patterns.some((pattern) => pattern.test(availabilityEvidence)));
    if (match) {
      availability = match.state;
      availabilityReason = `${match.reason}_capture`;
    } else {
      availabilityReason = 'capture_stock_wording_unrecognized';
      notes.push('availability_wording_unrecognized');
    }
  } else {
    notes.push('availability_evidence_absent');
  }

  /* ── CONDITION : publiée ou rien ───────────────────────────────────────── */
  const conditionEvidence = collapse(payload.conditionText, 120);
  let condition: 'new' | 'used' | 'refurbished' | null = null;
  if (conditionEvidence) {
    const match = CONDITION_PATTERNS.find((entry) => entry.patterns.some((pattern) => pattern.test(conditionEvidence)));
    condition = match?.value ?? null;
    if (!match) notes.push('condition_wording_unrecognized');
  }

  const title = collapse(payload.title, AYWEBS_CAPTURE_LIMITS.maxTitleLength);
  const brand = collapse(payload.brand, 120) || null;
  const images = cleanImageUrls(payload.images);
  const selectedVariantTexts = cleanTextArray(
    payload.selectedVariantTexts, AYWEBS_CAPTURE_LIMITS.maxSelectedVariantTexts, 60,
  );
  const variantTexts = cleanTextArray(payload.variantTexts, AYWEBS_CAPTURE_LIMITS.maxVariantTexts, 60);
  let amazonEvidence = cleanAmazonEvidence(payload.amazon, requestHost, pageUrl);
  if (payload.amazon && !amazonEvidence) notes.push('amazon_evidence_rejected');
  if (amazonEvidence?.selectedAsin) {
    const selectedVariant = amazonEvidence.variants.find((variant) => variant.asin === amazonEvidence?.selectedAsin);
    const observedLabels = selectedVariantTexts.map((value) => value.toLowerCase());
    const optionEvidenceBacked = Boolean(selectedVariant?.dimensions.length)
      && Boolean(selectedVariant?.selected)
      && selectedVariant!.dimensions.every((dimension) => amazonEvidence!.options.some((option) =>
        option.selected
        && option.dimension === dimension.name
        && option.value.toLowerCase() === dimension.value.toLowerCase()
        && (!option.asin || option.asin === selectedVariant!.asin)));
    const legacyTextBacked = Boolean(selectedVariant?.dimensions.length)
      && Boolean(selectedVariant?.selected)
      && selectedVariant!.dimensions.every((dimension) => observedLabels.some((label) => label.includes(dimension.value.toLowerCase())));
    const selectionBacked = optionEvidenceBacked || legacyTextBacked;
    if (!selectionBacked) {
      amazonEvidence = {
        ...amazonEvidence,
        selectedAsin: null,
        selectedPriceEvidence: [],
        variants: amazonEvidence.variants.map((variant) => ({ ...variant, selected: false })),
      };
      notes.push('amazon_selected_asin_not_backed_by_visible_dimensions');
    }
  }

  const amazonDetails = amazonEvidence?.variants.map((variant) => {
    const attributes: Record<string, string> = {};
    let size: string | null = null;
    let color: string | null = null;
    for (const dimension of variant.dimensions) {
      if (dimension.name === 'size') size = dimension.value;
      else if (dimension.name === 'color' || dimension.name === 'colour') color = dimension.value;
      else attributes[dimension.name] = dimension.value;
    }
    const isSelected = variant.asin === amazonEvidence.selectedAsin;
    const stock = isSelected
      ? availability === 'AVAILABLE' || availability === 'LOW_STOCK' ? true
        : availability === 'OUT_OF_STOCK' ? false : null
      : null;
    return {
      id: variant.asin,
      label: [color, size, ...Object.values(attributes)].filter(Boolean).join(' · ') || variant.asin,
      size,
      color,
      attributes,
      available: true,
      stock,
      price: isSelected && price > 0 ? price : null,
    };
  }) || [];

  const fingerprint = fingerprintOf({
    url: pageUrl,
    canonical: canonicalUrl,
    price: price,
    priceSource: primary.source,
    priceText: primary.text,
    currency: currency,
    currencyEvidence,
    availability,
    availabilityEvidence,
    condition,
    selectedVariantTexts,
    amazon: amazonEvidence ? {
      pageAsin: amazonEvidence.pageAsin,
      selectedAsin: amazonEvidence.selectedAsin,
      variants: amazonEvidence.variants,
    } : null,
    capturedAt: String(payload.capturedAt),
  });

  const summary = condition && selectedVariantTexts.length
    ? `${title} — ${condition} — ${selectedVariantTexts.join(' / ')}`
    : title;

  /* Le `ScrapedProduct` produit ici est le MÊME objet que celui du lecteur
     serveur : le reste d'AYWEBs (normaliseur, disponibilité, panier) ne sait
     même pas que la lecture vient du client. `verificationProvider` le dit. */
  const scraped: ScrapedProduct = {
    id: `webview_${pageHost}`,
    store: pageHost,
    storeName: pageHost,
    url: pageUrl || requestUrl,
    externalId: null,
    title,
    description: summary || title,
    images,
    mainImage: images[0] || '',
    sourcePrice: price,
    sourceCurrency: currency,
    convertedPriceTND: 0,
    estimatedShippingTND: 0,
    serviceFeeTND: 0,
    totalPriceTND: 0,
    /* Seules les combinaisons Amazon liées explicitement à un child ASIN entrent
       dans details. Le stock et le prix du buybox ne sont appliqués qu'au child
       actuellement affiché ; les autres restent UNKNOWN / sans prix. */
    variants: { colors: [], sizes: [], details: amazonDetails },
    availability: availability === 'AVAILABLE' ? 'in_stock'
      : availability === 'LOW_STOCK' ? 'limited'
        : availability === 'OUT_OF_STOCK' ? 'out_of_stock'
          : 'unknown',
    condition: condition ?? undefined,
    brand: brand ?? undefined,
    priceVerified: corroborated,
    currencyVerified,
    verificationProvider: 'webview_client',
    verificationMethod: primary.source === 'json_ld' ? 'json_ld' : 'dom',
    verificationFailureCode: corroborated ? null : 'WEBVIEW_PRICE_SINGLE_SOURCE',
    scrapedAt: new Date(capturedAtMs).toISOString(),
  };

  notes.push(`price_source:${primary.source}`, corroborated ? 'corroborated' : 'single_source');
  if (variantTexts.length) notes.push(`variants_published:${variantTexts.slice(0, 8).join('|')}`);
  if (selectedVariantTexts.length) notes.push(`selection_observed:${selectedVariantTexts.join('|')}`);

  /* Compteurs d'exploitation : ce qui a été jugé, et comment. */
  captureStats.accepted += 1;
  bump(captureStats.price_sources, primary.source);
  if (currencyVerified) {
    if (publishedIso) captureStats.currency_published += 1;
    else if (symbolIso) captureStats.currency_symbol += 1;
  } else {
    captureStats.currency_unproven += 1;
  }
  if (!corroborated) captureStats.single_source += 1;

  return {
    ok: true,
    rejection: null,
    scraped,
    price,
    currency,
    priceVerified: corroborated,
    currencyVerified,
    availability,
    availabilityReason,
    condition,
    fingerprint,
    priceSource: primary.source,
    corroborated,
    selectedVariantTexts,
    amazonEvidence,
    notes,
    outcome: {
      used: true,
      fingerprint,
      priceSource: primary.source,
      corroborated,
      rejection: null,
    },
  };
}

/**
 * Re-vérification d'arrière-plan (§ vérification par échantillon).
 *
 * Une capture WebView est une lecture client : le serveur l'accepte parce
 * qu'elle est structurée et corroborée, mais il ne renonce pas à vérifier. Sur
 * un échantillon déterministe (`AYWEBS_WEBVIEW_VERIFY_SAMPLE`, défaut 10 %), il
 * RELIT la page depuis ses propres moyens et compare. Le tirage dépend de
 * l'empreinte : le même fait est jugé de la même façon, et un audit est
 * reproductible.
 */
export function ayWebsWebviewVerifySample(): number {
  const raw = Number(process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE);
  if (!Number.isFinite(raw)) return 0.1;
  return Math.min(1, Math.max(0, raw));
}

export function shouldVerifyWebviewCaptureInBackground(fingerprint: string, seed = ''): boolean {
  const rate = ayWebsWebviewVerifySample();
  if (rate <= 0) return false;
  const digest = createHash('sha256').update(`ayrovi:aywebs-webview-verify:v1|${fingerprint}|${seed}`).digest();
  const draw = digest.readUInt32BE(0) / 0x1_0000_0000;
  return draw < rate;
}

/** Comparaison capture ↔ relecture serveur : écart significatif ou devise différente. */
export function webviewCaptureDivergence(
  capture: { price: number; currency: string; availability: AyWebsAvailabilityState },
  server: { price: number; currency: string; availability: AyWebsAvailabilityState },
): { diverged: boolean; reason: string | null; deltaPercent: number } {
  if (!(server.price > 0)) return { diverged: false, reason: null, deltaPercent: 0 };
  const delta = Math.abs(server.price - capture.price);
  const deltaPercent = capture.price > 0 ? Math.round((delta / capture.price) * 10_000) / 100 : 0;
  if (delta > 0.005) return { diverged: true, reason: 'PRICE_DIVERGED', deltaPercent };
  if (String(server.currency || '').toUpperCase() !== String(capture.currency || '').toUpperCase()) {
    return { diverged: true, reason: 'CURRENCY_DIVERGED', deltaPercent };
  }
  if (capture.availability === 'AVAILABLE' && server.availability === 'OUT_OF_STOCK') {
    return { diverged: true, reason: 'AVAILABILITY_DIVERGED', deltaPercent };
  }
  return { diverged: false, reason: null, deltaPercent };
}
