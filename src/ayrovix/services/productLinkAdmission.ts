import type { AyrovixCandidate } from '../types';
import type { SmartLinkScraper } from '../../scraper/scraper';
import { parsePublicHttpUrl } from '../../services/safeUrl';
import { analyzeAyWebsUrl, type AyWebsPageAnalysisOptions } from '../../aywebs/browser';
import { ayWebsHostnameMatches } from '../../../shared/aywebsStores';

/**
 * Lens discovery admission — le seul filtre entre SerpApi et une petite carte.
 *
 * Il ne visite AUCUNE page et ne scrape pas les résultats en lot. Une carte est
 * admise seulement quand deux familles de preuves se rejoignent :
 *   1. SerpApi fournit un titre et au moins une donnée produit (image ou prix) ;
 *   2. le registre/adaptateur AYWEBs reconnaît l'URL précise comme une fiche
 *      PRODUCT dans une boutique dont la lecture produit est déclarée.
 *
 * Cette vérification autorise l'OUVERTURE dans AYWEBs, pas l'achat. La page
 * réellement ouverte est reclassée après chaque navigation, puis la capture et
 * le devis existants restent les seules preuves de prix, variante et stock.
 */

export type LensProductLinkType =
  | 'PRODUCT'
  | 'CATEGORY'
  | 'SEARCH'
  | 'STORE_HOME'
  | 'SOCIAL_PROFILE'
  | 'SOCIAL_POST'
  | 'ARTICLE'
  | 'INVALID'
  | 'UNKNOWN';

export type LensDiscoveryDataStatus = 'TITLE_IMAGE_PRICE' | 'TITLE_IMAGE' | 'TITLE_PRICE' | 'TITLE_ONLY';

export interface LensProductLinkDecision {
  rawUrl: string;
  url: string;
  dedupKey: string;
  pageType: LensProductLinkType;
  accepted: boolean;
  verification: 'VERIFIED' | 'REJECTED' | 'UNKNOWN';
  reason: string;
  storeId: string | null;
  storeName: string | null;
}

export interface NormalizedLensProductLink {
  url: string;
  dedupKey: string;
}

/* Seuls des identifiants de tracking sans rôle produit connu sont retirés.
   En particulier, ref, th, psc, sku_id, goods_id, productId et les paramètres
   de variante restent intacts : les supprimer pourrait changer le produit. */
const TRACKING_PARAMETERS = new Set([
  'dclid', 'fbclid', 'gbraid', 'gclid', 'igshid', 'mc_cid', 'mc_eid',
  'msclkid', 'oly_anon_id', 'oly_enc_id', 'vero_conv', 'vero_id', 'wbraid',
]);

function isTrackingParameter(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.startsWith('utm_') || TRACKING_PARAMETERS.has(normalized);
}

function normalizeDedupKey(url: URL): string {
  const key = new URL(url.toString());
  key.hostname = key.hostname.toLowerCase().replace(/^www\./, '');
  key.hash = '';
  key.pathname = key.pathname.length > 1 ? key.pathname.replace(/\/+$/, '') : key.pathname;
  key.searchParams.sort();
  return key.toString();
}

/** Normalisation sûre, sans résolution réseau et sans inventer de destination. */
export function normalizeLensProductLink(raw: unknown): NormalizedLensProductLink | null {
  try {
    const url = parsePublicHttpUrl(raw);
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (isTrackingParameter(name)) url.searchParams.delete(name);
    }
    const normalized = url.toString();
    /* Le lecteur WebView existant borne son URL de capture à 600 caractères.
       Une fiche plus longue est refusée, jamais tronquée : tronquer la query
       pourrait changer la variante ou rendre la capture impossible à rattacher. */
    if (normalized.length > 600) return null;
    return { url: normalized, dedupKey: normalizeDedupKey(url) };
  } catch {
    return null;
  }
}

const SOCIAL_HOSTS = [
  'facebook.com', 'fb.com', 'instagram.com', 'threads.net', 'tiktok.com',
  'twitter.com', 'x.com', 'youtube.com', 'youtu.be', 'pinterest.com',
  'snapchat.com', 'linkedin.com',
] as const;

const REDIRECT_HOSTS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'cutt.ly', 'shorturl.at',
] as const;

function socialPageType(url: URL): 'SOCIAL_PROFILE' | 'SOCIAL_POST' | null {
  if (!ayWebsHostnameMatches(url.hostname, SOCIAL_HOSTS)) return null;
  const path = url.pathname.toLowerCase();
  const post = ayWebsHostnameMatches(url.hostname, ['instagram.com'])
      ? /^\/(?:p|reel|reels|tv|stories)\//.test(path)
    : ayWebsHostnameMatches(url.hostname, ['tiktok.com'])
      ? /^\/@[^/]+\/(?:video|photo)\//.test(path)
      : ayWebsHostnameMatches(url.hostname, ['youtube.com', 'youtu.be'])
        ? path === '/watch' || /^\/(?:shorts|live)\//.test(path) || ayWebsHostnameMatches(url.hostname, ['youtu.be'])
        : ayWebsHostnameMatches(url.hostname, ['pinterest.com'])
          ? /^\/pin\//.test(path)
          : ayWebsHostnameMatches(url.hostname, ['twitter.com', 'x.com'])
            ? /^\/[^/]+\/status\//.test(path)
            : ayWebsHostnameMatches(url.hostname, ['facebook.com', 'fb.com'])
              ? /^\/(?:marketplace\/item|[^/]+\/(?:posts|videos|photos)|watch|reel|share)\b/.test(path)
              : /^\/(?:p|post|posts|status)\//.test(path);
  return post ? 'SOCIAL_POST' : 'SOCIAL_PROFILE';
}

function generalPageType(pathname: string, search: URLSearchParams): 'CATEGORY' | 'SEARCH' | 'ARTICLE' | 'STORE_HOME' | null {
  const path = pathname.toLowerCase();
  if (/^\/(?:[a-z]{2}(?:[-_][a-z]{2})?)?\/?$/i.test(path)) return 'STORE_HOME';
  if (/^\/(?:blog|blogs|article|articles|news|review|reviews|guide|guides|magazine|editorial|story|stories)(?:\/|$)/.test(path)) {
    return 'ARTICLE';
  }
  if (/^\/(?:s|search|recherche|catalogsearch\/result|pdsearch|wholesale|search_result\.html)(?:\/|$|\?)/.test(path)) {
    return 'SEARCH';
  }
  for (const name of ['q', 'k', 'query', 'keyword', 'search', 'search_key', 'searchtext', 'text']) {
    if (search.has(name)) return 'SEARCH';
  }
  if (/^\/(?:c|category|categories|categorie|collection|collections|rayon|shop|browse|department|dept|b)(?:\/|$)/.test(path)) {
    return 'CATEGORY';
  }
  return null;
}

function rejected(
  rawUrl: string,
  normalized: NormalizedLensProductLink | null,
  pageType: LensProductLinkType,
  reason: string,
  storeId: string | null = null,
  storeName: string | null = null,
): LensProductLinkDecision {
  return {
    rawUrl,
    url: normalized?.url ?? '',
    dedupKey: normalized?.dedupKey ?? '',
    pageType,
    accepted: false,
    verification: pageType === 'UNKNOWN' ? 'UNKNOWN' : 'REJECTED',
    reason,
    storeId,
    storeName,
  };
}

function hasProviderProductEvidence(candidate: Pick<AyrovixCandidate, 'title' | 'image' | 'images' | 'price' | 'currency'>): boolean {
  if (candidate.title.trim().length < 4) return false;
  const hasImage = discoveryImages(candidate).length > 0;
  const hasPrice = Number.isFinite(candidate.price)
    && Number(candidate.price) > 0
    && typeof candidate.currency === 'string'
    && /^[A-Z]{3}$/.test(candidate.currency.toUpperCase());
  return hasImage || hasPrice;
}

function discoveryImages(candidate: Pick<AyrovixCandidate, 'image' | 'images'>): string[] {
  const images: string[] = [];
  for (const raw of [candidate.image, ...(candidate.images || [])]) {
    try {
      const url = parsePublicHttpUrl(raw);
      if (url.protocol !== 'https:') continue;
      const normalized = url.toString();
      if (!images.includes(normalized)) images.push(normalized);
    } catch { /* Une vignette invalide n'invalide pas une fiche déjà prouvée. */ }
    if (images.length >= 12) break;
  }
  return images;
}

export function lensDiscoveryDataStatus(candidate: Pick<AyrovixCandidate, 'image' | 'images' | 'price' | 'currency'>): LensDiscoveryDataStatus {
  const hasImage = Boolean(candidate.image || (candidate.images || []).length);
  const hasPrice = Number.isFinite(candidate.price) && Number(candidate.price) > 0 && Boolean(candidate.currency);
  if (hasImage && hasPrice) return 'TITLE_IMAGE_PRICE';
  if (hasImage) return 'TITLE_IMAGE';
  return hasPrice ? 'TITLE_PRICE' : 'TITLE_ONLY';
}

export function classifyLensProductLink(
  candidate: Pick<AyrovixCandidate, 'sourceUrl' | 'title' | 'image' | 'images' | 'price' | 'currency'>,
  scraper: SmartLinkScraper,
  options: AyWebsPageAnalysisOptions = {},
): LensProductLinkDecision {
  const rawUrl = String(candidate.sourceUrl || '').trim();
  const normalized = normalizeLensProductLink(rawUrl);
  if (!normalized) return rejected(rawUrl, null, 'INVALID', 'INVALID_OR_UNSAFE_DESTINATION');

  let url: URL;
  try { url = new URL(normalized.url); } catch { return rejected(rawUrl, null, 'INVALID', 'INVALID_OR_UNSAFE_DESTINATION'); }

  const social = socialPageType(url);
  if (social) return rejected(rawUrl, normalized, social, 'SOCIAL_RESULT_NOT_PURCHASABLE');
  if (ayWebsHostnameMatches(url.hostname, REDIRECT_HOSTS) || /^\/(?:url|redirect|out|go)(?:\/|$)/i.test(url.pathname)) {
    return rejected(rawUrl, normalized, 'UNKNOWN', 'UNVERIFIED_REDIRECT');
  }

  try {
    const analysis = analyzeAyWebsUrl(normalized.url, scraper, options);
    const storeId = analysis.storeId;
    const storeName = analysis.storeName;
    if (analysis.isProductPage && analysis.pageType === 'PRODUCT') {
      if (!analysis.registered || !analysis.browseAllowed || !analysis.captureAllowed) {
        return rejected(rawUrl, normalized, 'UNKNOWN', 'PRODUCT_CAPTURE_NOT_DECLARED', storeId, storeName);
      }
      if (!hasProviderProductEvidence(candidate)) {
        return rejected(rawUrl, normalized, 'UNKNOWN', 'INSUFFICIENT_PROVIDER_PRODUCT_EVIDENCE', storeId, storeName);
      }
      return {
        rawUrl,
        url: normalized.url,
        dedupKey: normalized.dedupKey,
        pageType: 'PRODUCT',
        accepted: true,
        verification: 'VERIFIED',
        reason: 'PROVIDER_PRODUCT_EVIDENCE_AND_REGISTERED_PRODUCT_URL',
        storeId,
        storeName,
      };
    }

    const mapped = analysis.pageType === 'HOME' ? 'STORE_HOME'
      : analysis.pageType === 'ERROR' ? 'INVALID'
        : analysis.pageType === 'CATEGORY' || analysis.pageType === 'SEARCH' ? analysis.pageType
          : null;
    if (mapped) return rejected(rawUrl, normalized, mapped, `AYWEBS_${mapped}`, storeId, storeName);
    const general = generalPageType(url.pathname, url.searchParams);
    if (general) return rejected(rawUrl, normalized, general, `NON_PRODUCT_${general}`, storeId, storeName);
    return rejected(rawUrl, normalized, 'UNKNOWN', 'PRODUCT_PAGE_NOT_RECOGNIZED', storeId, storeName);
  } catch {
    return rejected(rawUrl, normalized, 'INVALID', 'INVALID_OR_UNSAFE_DESTINATION');
  }
}

export interface LensAdmissionResult {
  candidates: AyrovixCandidate[];
  decisions: LensProductLinkDecision[];
  excluded: { count: number; reasons: Record<string, number> };
}

/**
 * Filtre → déduplique par URL normalisée → ordonne par pertinence. Aucun
 * regroupement par titre/marque : deux URLs de produits distincts restent deux
 * produits, même si leurs titres se ressemblent.
 */
export function admitLensProductCandidates(
  candidates: readonly AyrovixCandidate[],
  scraper: SmartLinkScraper,
  limit = 24,
  options: AyWebsPageAnalysisOptions = {},
): LensAdmissionResult {
  const decisions: LensProductLinkDecision[] = [];
  const excludedReasons: Record<string, number> = {};
  const admitted = new Map<string, { candidate: AyrovixCandidate; index: number }>();
  const usablePrice = (candidate: AyrovixCandidate) => Number.isFinite(candidate.price)
    && Number(candidate.price) > 0
    && typeof candidate.currency === 'string'
    && /^[A-Z]{3}$/.test(candidate.currency.toUpperCase());

  candidates.forEach((candidate, index) => {
    if (candidate.kind !== 'external') {
      excludedReasons.NON_EXTERNAL_DISCOVERY = (excludedReasons.NON_EXTERNAL_DISCOVERY || 0) + 1;
      return;
    }
    const decision = classifyLensProductLink(candidate, scraper, options);
    decisions.push(decision);
    if (!decision.accepted || !decision.dedupKey) {
      excludedReasons[decision.reason] = (excludedReasons[decision.reason] || 0) + 1;
      return;
    }

    const hasPrice = usablePrice(candidate);
    const images = discoveryImages(candidate);
    const discoveryBase = { ...candidate, image: images[0] || '', images };
    const incoming: AyrovixCandidate = {
      ...discoveryBase,
      source: decision.storeName || candidate.source,
      sourceUrl: decision.url,
      productPageType: 'PRODUCT',
      productLinkStatus: 'VERIFIED',
      productLinkVerification: 'PROVIDER_PRODUCT_EVIDENCE_AND_REGISTERED_PRODUCT_URL',
      discoveryDataStatus: lensDiscoveryDataStatus(discoveryBase),
      price: hasPrice ? candidate.price : null,
      currency: hasPrice ? candidate.currency : null,
      priceTnd: hasPrice ? candidate.priceTnd : null,
      promo: hasPrice ? candidate.promo : null,
      // Un indice SerpApi n'est jamais une preuve de stock de la page ouverte.
      availability: 'unknown',
      sourceRead: null,
      priceOrigin: hasPrice ? 'search' : undefined,
      priceVerificationStatus: 'PENDING_MANUAL',
      priceToken: null,
    };
    const existing = admitted.get(decision.dedupKey);
    if (existing) {
      excludedReasons.DUPLICATE_PRODUCT_URL = (excludedReasons.DUPLICATE_PRODUCT_URL || 0) + 1;
      const winner = incoming.match > existing.candidate.match ? incoming : existing.candidate;
      const other = winner === incoming ? existing.candidate : incoming;
      const priceSource = usablePrice(winner) ? winner : usablePrice(other) ? other : null;
      const images = [...new Set([
        winner.image, ...(winner.images || []), other.image, ...(other.images || []),
      ].filter((image): image is string => /^https:\/\//i.test(String(image || '').trim())))].slice(0, 12);
      const merged: AyrovixCandidate = {
        ...winner,
        description: winner.description || other.description || null,
        image: winner.image || images[0] || '',
        images,
        match: Math.max(winner.match, other.match),
        price: priceSource?.price ?? null,
        currency: priceSource?.currency ?? null,
        priceTnd: priceSource?.priceTnd ?? null,
        promo: priceSource?.promo ?? null,
        priceOrigin: priceSource ? 'search' : undefined,
        discoveryDataStatus: lensDiscoveryDataStatus({ ...winner, ...(priceSource ? { price: priceSource.price, currency: priceSource.currency } : { price: null, currency: null }), image: winner.image || images[0] || '', images }),
      };
      admitted.set(decision.dedupKey, { candidate: merged, index: Math.min(existing.index, index) });
      return;
    }
    admitted.set(decision.dedupKey, { candidate: incoming, index });
  });

  const ordered = [...admitted.values()]
    .sort((left, right) => right.candidate.match - left.candidate.match || left.index - right.index);
  return {
    candidates: ordered.slice(0, Math.max(0, limit)).map(({ candidate }) => candidate),
    decisions,
    excluded: {
      count: Object.values(excludedReasons).reduce((sum, count) => sum + count, 0),
      reasons: excludedReasons,
    },
  };
}
