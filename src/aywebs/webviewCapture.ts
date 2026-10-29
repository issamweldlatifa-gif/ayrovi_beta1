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
import type { AyWebsSourceProduct } from './adapters/contract';
import { checkPriceText } from '../scraper/priceIntegrity';
import { ayWebsComparableHost, detectAyWebsStore } from '../../shared/aywebsStores';
import { aliexpressItemId } from './adapters/aliexpress';
import { sheinGoodsId } from './adapters/shein';
import { temuGoodsId } from './adapters/temu';
import { ayWebsSameAttribute } from '../../shared/aywebsAttributes';
import {
  AYWEBS_CAPTURE_LIMITS,
  AYWEBS_CAPTURE_VERSION,
  type AyWebsCaptureSource,
  type AyWebsCapturedMatrixEntry,
  type AyWebsPageKind,
  type AyWebsPageSignals,
  type AyWebsCaptureOutcome,
  type AyWebsCapturedPage,
  type AyWebsCapturedPriceCandidate,
  type AyWebsCapturedVariantGroup,
  type AyWebsCapturedVariantValue,
} from '../../shared/aywebsCapture';
import type { AyWebsAvailabilityState, AyWebsErrorCode } from '../../shared/aywebsTypes';
import { detectAyWebsCatalogStore } from '../../shared/aywebsStoreCatalog';

/**
 * Ordre de fiabilité des sources de prix : la donnée machine du marchand d'abord,
 * le texte publié ensuite. `a11y_label` (chaîne complète écrite par la page) passe
 * avant `dom` (montant recomposé par nous depuis ses fragments).
 */
const SOURCE_RANK: Record<AyWebsCaptureSource, number> = {
  json_ld: 0, microdata: 1, embedded_json: 2, meta: 3, a11y_label: 4, dom: 5,
};

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
  /** Domaines (suffixes) où la règle ne s'applique QU'ici (ex. `$` = CAD sur amazon.ca). */
  hostsOnly?: readonly string[];
}

const AYWEBS_SYMBOL_CURRENCIES: readonly AyWebsSymbolCurrencyRule[] = [
  { iso: 'EUR', pattern: /€/, stores: ['amazon', 'shein', 'temu', 'aliexpress', 'primark'] },
  /* E£ (livre égyptienne) porte le même signe : amazon.eg est exclu. */
  { iso: 'GBP', pattern: /£/, stores: ['amazon', 'shein', 'temu', 'aliexpress', 'primark'], hostsExcluded: ['amazon.eg'] },
  /* ¥ = JPY sur amazon.co.jp, mais CNY ailleurs : réservé à Amazon. */
  { iso: 'JPY', pattern: /[¥￥]/, stores: ['amazon'] },
  { iso: 'TND', pattern: /د\.ت/, stores: ['amazon', 'shein', 'temu', 'aliexpress'] },
  /* `US$` est non ambigu quel que soit l'hôte (ex. `US$14.99` sur roe/ca.shein.com). */
  { iso: 'USD', pattern: /(?:^|[^A-Za-z])US\s?\$/i, stores: ['amazon', 'shein', 'temu', 'aliexpress', 'sephora'] },
  /* `$` nu non-USD : les domaines dont la devise nationale n'est pas l'USD sont exclus. */
  {
    iso: 'USD',
    pattern: /\$/,
    stores: ['amazon', 'shein', 'temu', 'aliexpress', 'sephora'],
    hostsExcluded: [
      'amazon.ca', 'amazon.com.au', 'amazon.sg', 'amazon.com.mx', 'amazon.com.br',
      'shein.ca', 'ca.shein.com', 'au.shein.com', 'sg.shein.com',
      'shein.com.mx', 'mx.shein.com', 'shein.com.br', 'br.shein.com',
    ],
  },
  /* Devises locales des domaines Amazon non-USD (19/10/2026). Chaque règle ne vaut
     que pour SON domaine et ne reconnaît que le symbole NON ambigu : un `$` nu reste
     ambigu (CAD, AUD, MXN…) et n'est prouvé que par un code ISO publié (golden amazon.ca). */
  { iso: 'CAD', pattern: /\bCA\$|C\$/, stores: ['amazon'], hostsOnly: ['amazon.ca'] },
  { iso: 'AUD', pattern: /\bAU\$|A\$/, stores: ['amazon'], hostsOnly: ['amazon.com.au'] },
  { iso: 'SGD', pattern: /\bSG\$|S\$/, stores: ['amazon'], hostsOnly: ['amazon.sg'] },
  { iso: 'MXN', pattern: /\bMX\$/, stores: ['amazon'], hostsOnly: ['amazon.com.mx'] },
  { iso: 'BRL', pattern: /R\$/, stores: ['amazon'], hostsOnly: ['amazon.com.br'] },
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
/** Mesure PAR BOUTIQUE : la seule façon de choisir entre adaptateur dédié et
 *  adaptateur collectif avec des chiffres, pas des impressions (23/10/2026). */
export interface AyWebsWebviewCaptureStoreStats {
  validated: number;
  accepted: number;
  rejected: number;
  /** Taux d'acceptation, arrondi à 3 décimales ; `null` tant qu'on n'a rien jugé. */
  acceptance_rate: number | null;
  /** Motifs de refus les plus fréquents (bornés). */
  rejections: Record<string, number>;
  /** Prix prouvé par UNE seule source : le signe d'une page mal balisée. */
  single_source: number;
  /** La page a-t-elle publié des groupes de variantes nommés ? */
  variant_groups_seen: number;
}

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
  /** Attribution par boutique — bornée, voir `storeKeyOf`. */
  by_store: Record<string, AyWebsWebviewCaptureStoreStats>;
}

const captureStats: AyWebsWebviewCaptureStats = {
  validated: 0, accepted: 0, rejected: 0,
  rejections: {}, price_sources: {},
  currency_published: 0, currency_symbol: 0, currency_unproven: 0, single_source: 0,
  by_store: {},
};

/**
 * Combien de boutiques on suit, et combien de motifs par boutique.
 *
 * Un compteur qui grandit avec le trafic est une fuite mémoire déguisée : le
 * domaine d'une capture vient du CLIENT. On borne donc les deux dimensions, et
 * au-delà on range sous `autres` — on perd le détail, jamais la mesure globale.
 */
const MAX_TRACKED_STORES = 64;
/** Exposé par `/health` : le client sait combien de boutiques sont suivies. */
export const AYWEBS_CAPTURE_TRACKED_STORES = MAX_TRACKED_STORES;
const MAX_TRACKED_REJECTIONS = 12;
const OTHER_STORE_KEY = 'autres';

/**
 * Clé d'attribution d'une capture (23/10/2026) : boutique du REGISTRE si le
 * domaine y est (boutique ouverte), sinon boutique du CATALOGUE (prévue mais
 * fermée — savoir qu'on la visite est ce qui décide de l'ouvrir), sinon
 * `external`. Le préfixe dit toujours dans quel monde on est :
 *   `registre:walmart` · `catalogue:ebay` · `external` · `url_invalide`.
 */
export function ayWebsCaptureStoreKey(requestUrl: string): string {
  try {
    const url = new URL(String(requestUrl || '').trim());
    const registered = detectAyWebsStore(url.toString());
    if (registered) return `registre:${registered.id}`;
    const planned = detectAyWebsCatalogStore(url.toString());
    if (planned) return `catalogue:${planned.id}`;
    return 'external';
  } catch {
    return 'url_invalide';
  }
}

function storeBucket(key: string): AyWebsWebviewCaptureStoreStats {
  const existing = captureStats.by_store[key];
  if (existing) return existing;
  const known = Object.keys(captureStats.by_store);
  /* Une place est réservée à `autres` : le plafond est un plafond de MÉMOIRE
     (nombre de seaux), pas un plafond de boutiques nommées. */
  const target = known.length >= MAX_TRACKED_STORES - 1 ? OTHER_STORE_KEY : key;
  if (!captureStats.by_store[target]) {
    captureStats.by_store[target] = {
      validated: 0, accepted: 0, rejected: 0, acceptance_rate: null,
      rejections: {}, single_source: 0, variant_groups_seen: 0,
    };
  }
  return captureStats.by_store[target];
}

function finishStoreBucket(bucket: AyWebsWebviewCaptureStoreStats): void {
  bucket.acceptance_rate = bucket.validated ? Math.round((bucket.accepted / bucket.validated) * 1000) / 1000 : null;
}

function bump(target: Record<string, number>, key: string): void {
  if (!key) return;
  target[key] = (target[key] || 0) + 1;
}

export function ayWebsWebviewCaptureStats(): AyWebsWebviewCaptureStats {
  const byStore: Record<string, AyWebsWebviewCaptureStoreStats> = {};
  for (const [key, bucket] of Object.entries(captureStats.by_store)) {
    finishStoreBucket(bucket);
    byStore[key] = { ...bucket, rejections: { ...bucket.rejections } };
  }
  return {
    ...captureStats,
    rejections: { ...captureStats.rejections },
    price_sources: { ...captureStats.price_sources },
    by_store: byStore,
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
  captureStats.by_store = {};
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
      /rupture|épuis|epuis|indisponible|non\s+disponible/i,
      /ausverkauft|nicht\s+verfügbar|agotad[oa]|esgotad[oa]|esaurit[oa]/i,
      /can'?t\s+ship\s+to|cannot\s+be\s+shipped|does\s+not\s+ship|livraison\s+indisponible|ne\s+peut\s+pas\s+être\s+livr|no\s+se\s+puede\s+enviar/i,
      /غير\s+متوفر|نفد(?:ت\s*الكمية)?|انتهى\s*المخزون|لا\s*يمكن\s*الشحن/i,
    ],
  },
  {
    state: 'LOW_STOCK', reason: 'merchant_limited_stock',
    patterns: [
      /limitedavailability|limited\s*stock|low\s*stock|only\s*\d+\s*left|hurry\s*only\s*\d+|almost\s*sold\s*out|plus\s+que\s*\d+/i,
      /derniers?\s+exemplaires?|nur\s*noch\s*\d+|solo\s*quedan?\s*\d+|بقي\s*\d+|متبقي\s*\d+/i,
    ],
  },
  {
    state: 'AVAILABLE', reason: 'merchant_in_stock',
    patterns: [
      /instock|in\s*stock|available|add\s*to\s*(?:cart|basket|bag|my\s*picks|picks|bundle)|buy\s*now/i,
      /en\s+stock|ajouter\s+(?:au\s+)?(?:panier|sac|lot)|ajouter\s+à\s+(?:ma\s+s[ée]lection|mes\s+choix)|acheter/i,
      /in\s+den\s+warenkorb|in\s+die\s+einkaufstasche|zu\s+meiner\s+auswahl|auf\s+lager|lieferbar/i,
      /a(?:ñ|n)adir\s+(?:a\s+la\s+(?:bolsa|cesta)|al\s+carrito|a\s+mi\s+selecci[óo]n)|aggiungi\s+(?:al\s+carrello|alla\s+borsa|alla\s+mia\s+selezione)|adicionar\s+(?:ao\s+carrinho|às?\s+minhas?\s+escolhas?)|comprar\s+agora/i,
      /\b\d+\s*(?:pieces?|pcs|pi[eè]ces?|unidades?|pe[cç]as?|stück|قطعة|قطع|حبة)(?:\s*(?:available|disponibles?|dispon[ií]ve(?:l|is)|verfügbar|متوفرة?))?/i,
      /(?:أضف|إضافة)\s*(?:إلى\s*|لـ?\s*)?(?:السلة|العربة|الحقيبة|حقيبة\s*التسوق|مختاراتي)|اشترِ?(?:\s*الآن)?|متوفر/i,
    ],
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

/**
 * Groupes de variantes : bornes, dédoublonnage, et refus des libellés qui ne
 * sont pas des noms d'option (index numériques, « choisir », navigation).
 * Une entrée mal formée est écartée en silence ; elle ne fait jamais échouer la
 * capture, car un groupe absent n'invalide pas un prix corroboré.
 */
const NOT_A_VARIANT_GROUP = /^(sort|sort by|sortby|trier|tri|order by|orderby|quantit\w*|quantity|qty|nombre|view|view by|affichage|filter|filtre|page|pages|lang|langue|language|devise|currency|pays|country|region|région|per page|items per page|afficher)\b/i;

function cleanVariantGroups(raw: unknown): AyWebsCapturedVariantGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: AyWebsCapturedVariantGroup[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (out.length >= AYWEBS_CAPTURE_LIMITS.maxVariantGroups) break;
    if (!entry || typeof entry !== 'object') continue;
    const name = collapse((entry as { name?: unknown }).name, 60);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    /* Tri, quantité, filtre, langue… ne sont pas des variantes : les publier
       ferait exiger une sélection que la page n'a jamais présentée comme choix. */
    if (NOT_A_VARIANT_GROUP.test(name)) continue;
    /* Un nombre seul est un INDEX de pagination… sauf dans un groupe de TAILLE :
       une pointure « 36 » (ou une taille enfant « 8 ») est un choix publié, pas
       un indice. Mesuré le 26/10/2026 : toutes les pointures entières étaient
       écartées, la feuille Zalando ne proposait que « 35.5 », « 51.5 »… et le
       client ne pouvait pas choisir sa taille. */
    const sizeGroup = /(size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس|length|longueur|voltage|watt|capacity|capacit|pieces|pcs|pack|lot|pin|port|gauge|calibre)/i.test(name);
    const values = cleanTextArray((entry as { values?: unknown }).values, AYWEBS_CAPTURE_LIMITS.maxVariantGroupValues, 60)
      .filter((value) => sizeGroup || !/^\d{1,3}$/.test(value));
    if (values.length < 1) continue;
    const selected = cleanTextArray((entry as { selected?: unknown }).selected, AYWEBS_CAPTURE_LIMITS.maxVariantGroupValues, 60)
      .filter((value) => values.some((known) => known.toLowerCase() === value.toLowerCase()));
    /* On conserve le groupe même sans sélection prouvée : ses `values` sont les
       choix que la page publie, donc ceux que la feuille mobile doit proposer
       (un picker Zalando en <input checkbox> dans un label n'expose parfois
       aucun aria-checked). L'honnêteté de la preuve est ailleurs — `selected`
       reste vide et aucune `option` d'état/prix n'est fabriquée, donc une
       combinaison non observée ne peut jamais être tenue pour vérifiée. */
    /* États/prix PAR VALEUR (23/10/2026). Une valeur inconnue n'est jamais
       ajoutée ; un état `null` reste `null` (la page n'a rien dit). */
    const options: AyWebsCapturedVariantValue[] = [];
    const rawOptions = (entry as { options?: unknown }).options;
    if (Array.isArray(rawOptions)) {
      for (const option of rawOptions) {
        if (options.length >= AYWEBS_CAPTURE_LIMITS.maxVariantGroupValues) break;
        if (!option || typeof option !== 'object') continue;
        const record = option as Record<string, unknown>;
        const value = collapse(record.value, 60);
        if (!value || !values.some((known) => known.toLowerCase() === value.toLowerCase())) continue;
        if (options.some((known) => known.value.toLowerCase() === value.toLowerCase())) continue;
        const priceText = collapse(record.price, AYWEBS_CAPTURE_LIMITS.maxVariantValuePriceLength);
        const stockNumber = Math.floor(Number(record.stock));
        const available = record.available === true ? true : record.available === false ? false : null;
        const price = priceText && /[0-9]/.test(priceText) ? priceText : null;
        const stock = Number.isFinite(stockNumber) && stockNumber > 0 && stockNumber <= 999 ? stockNumber : null;
        const rawImage = collapse(record.image, 600);
        const image = /^https?:\/\//i.test(rawImage) ? rawImage : null;
        const rawGoodsId = collapse(record.goodsId, 32).replace(/^SHEIN-/i, '');
        const goodsId = /^\d{5,16}$/.test(rawGoodsId) ? rawGoodsId : null;
        const rawSkuId = collapse(record.skuId, 32).replace(/^ae:/i, '');
        const skuId = /^\d{5,24}$/.test(rawSkuId) ? rawSkuId : null;
        /* Une ligne sans état, sans prix, sans stock, sans image et sans identité
           n'apprend rien : elle est écartée (le groupe garde ses libellés). */
        if (available === null && !price && stock === null && !image && !goodsId && !skuId) continue;
        options.push({
          value,
          available,
          price,
          priceFrom: record.priceFrom === true,
          stock,
          ...(image ? { image } : {}),
          ...(goodsId ? { goodsId } : {}),
          ...(skuId ? { skuId } : {}),
        });
      }
    }
    seen.add(key);
    out.push({ name, values, selected: selected.slice(0, 1), ...(options.length ? { options } : {}) });
  }
  return out;
}

function hostOf(raw: string): string | null {
  try {
    const clean = ayWebsComparableHost(new URL(raw).hostname);
    if (!clean) return null;
    /* AliExpress redirige librement entre sous-domaines régionaux/mobiles
       (`www.`, `fr.`, `m.`, `ar.`, `a.aliexpress.com`) pour la même fiche. */
    const aeRoot = /(?:^|\.)(aliexpress\.(?:com|us|ru))$/.exec(clean);
    if (aeRoot) return aeRoot[1];
    return clean;
  } catch {
    return null;
  }
}

function sameCaptureHost(hostA: string | null, hostB: string | null): boolean {
  if (!hostA || !hostB) return false;
  if (hostA === hostB) return true;
  /* SHEIN et TEMU redirigent librement entre sous-domaines régionaux et mobiles
     (`fr.shein.com` <-> `m.shein.com/fr/…` <-> `www.shein.com`, `m.temu.com` <->
     `www.temu.com`), tout en gardant `requestHost` intact pour le contrôle de devise. */
  if ((hostA === 'shein.com' || hostA.endsWith('.shein.com'))
    && (hostB === 'shein.com' || hostB.endsWith('.shein.com'))) {
    return true;
  }
  if ((hostA === 'temu.com' || hostA.endsWith('.temu.com'))
    && (hostB === 'temu.com' || hostB.endsWith('.temu.com'))) {
    return true;
  }
  return false;
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
  /**
   * Groupes de variantes NOMMÉS lus sur la page (23/10/2026) :
   * `[{ name: 'Taille', values: ['S','M','L'], selected: ['M'] }, …]`.
   *
   * Ils servent à MONTRER la combinaison affichée, pas à promettre un stock par
   * combinaison : la capture prouve l'état d'achat de la page TELLE QU'ELLE EST.
   * Le résolveur ne publie donc que la valeur sélectionnée de chaque groupe.
   */
  variantGroups: AyWebsCapturedVariantGroup[];
  /**
   * Matrice vérifiée de combinaisons multi-axes (ex. AliExpress Couleur × Prise × Expédié depuis) :
   * chaque ligne ne contient QUE des dimensions présentes dans `variantGroups`, avec
   * prix et devise validés par `checkPriceText`.
   */
  skuCombinations: AyWebsSourceProduct['variants'];
  /** Piste d'audit lisible : quels candidats ont été vus, lesquels ont gagné. */
  notes: string[];
  outcome: AyWebsCaptureOutcome;
}

function fingerprintOf(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/** Texte de disponibilité qui déclare la fiche en rupture (EN/FR). Lu seulement depuis l'élément de disponibilité. */
const OUT_OF_STOCK_TEXT = /currently unavailable|temporarily out of stock|out of stock|we don'?t know when or if this item will be back|actuellement indisponible|en rupture de stock|épuisé/i;
function isOutOfStockText(value: unknown): boolean {
  return typeof value === 'string' && OUT_OF_STOCK_TEXT.test(value);
}

/** Drapeau du contrat de variantes Amazon (désactivé par défaut : activation après test sur appareil). */
export function variantContractEnabled(): boolean {
  return process.env.AYWEBS_AMAZON_VARIANT_CONTRACT === '1';
}

function isAmazonHost(requestUrl: string): boolean {
  const host = hostOf(requestUrl) || '';
  return /(^|\.)amazon\.[a-z.]+$/.test(host);
}

const AMAZON_ASIN_SHAPE = /^[A-Z0-9]{10}$/;

/**
 * Raison de refus du contrat de variantes, ou null si l'option choisie est prouvée.
 * - Fiche simple (aucune alternative) : rien à prouver.
 * - Fiche à variantes : l'ASIN choisi doit exister dans les variantes, être l'ASIN de la
 *   fiche ouverte, et avoir une disponibilité PROUVÉE (évidence de l'option ou texte de
 *   disponibilité en stock). « Présence d'un nom d'option » n'est jamais une preuve de stock.
 */
function amazonVariantRefusal(payload: AyWebsCapturedPage): string | null {
  const amazon = payload.amazon;
  const variants = Array.isArray(amazon?.variants)
    ? amazon!.variants!.filter((v) => v && typeof v.asin === 'string' && AMAZON_ASIN_SHAPE.test(v.asin))
    : [];
  const options = Array.isArray(amazon?.options) ? amazon!.options! : [];
  const pageAsin = typeof amazon?.pageAsin === 'string' ? amazon.pageAsin : null;
  const selectedAsin = typeof amazon?.selectedAsin === 'string' ? amazon.selectedAsin : null;

  if (variants.length <= 1 && options.length <= 1) {
    if (variants.length === 1 && pageAsin && variants[0].asin !== pageAsin) return 'page_variant_mismatch';
    return null;
  }
  if (!selectedAsin) return 'selected_unproven';
  if (!variants.some((v) => v.asin === selectedAsin)) return 'selected_not_in_variants';
  if (pageAsin !== selectedAsin) return 'selected_not_page';

  // L'option CHOISIE est celle dont l'ASIN est l'ASIN choisi (une fiche peut avoir couleur ET taille).
  const selectedValues = (Array.isArray(amazon?.selectedValues) ? amazon!.selectedValues! : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const selectedOption = options.find((o) => o && o.selected === true && o.asin === selectedAsin)
    || options.find((o) => o && o.selected === true)
    /* Le twister ne marque pas toujours l'option choisie : les valeurs
       AFFICHÉES comme choisies (`selectedValues`) la désignent alors. */
    || options.find((o) => o && selectedValues.includes(String(o.value || '').trim().toLowerCase()));
  if (!selectedOption) return 'selected_option_unproven';
  if (selectedOption.availabilityEvidence === 'unavailable') return 'selected_unavailable';
  /* Preuve POSITIVE par valeur (23/10/2026) : la carte de ce choix annonce un
     nombre de pièces. Un stock publié n'est pas une déduction — c'est un fait. */
  const optionStock = Number(selectedOption.stock);
  const optionStockProven = Number.isFinite(optionStock) && optionStock > 0;
  const pageSaysInStock = /in stock|en stock|disponible|auf lager/i.test(String(payload.availabilityText || ''));
  if (selectedOption.availabilityEvidence !== 'available' && !optionStockProven && !pageSaysInStock) {
    return 'selected_availability_unproven';
  }
  return null;
}

function captureRejected(
  storeKey: string,
  rejection: string,
  fingerprint = '',
  notes: string[] = [],
): AyWebsCaptureValidation {
  captureStats.rejected += 1;
  bump(captureStats.rejections, rejection);
  const bucket = storeBucket(storeKey);
  /* `validated` est déjà compté à l'entrée de `validateAyWebsCapturedPage` :
     on n'ajoute ici que le refus, sinon une capture refusée compterait double. */
  bucket.rejected += 1;
  if (Object.keys(bucket.rejections).length < MAX_TRACKED_REJECTIONS || bucket.rejections[rejection]) {
    bump(bucket.rejections, rejection);
  } else {
    bump(bucket.rejections, 'autre');
  }
  return {
    ok: false, rejection, scraped: null, price: 0, currency: '',
    priceVerified: false, currencyVerified: false,
    availability: 'UNKNOWN', availabilityReason: `capture_rejected:${rejection}`,
    condition: null, fingerprint, priceSource: null, corroborated: false, selectedVariantTexts: [], variantGroups: [], skuCombinations: [], notes,
    outcome: { used: false, fingerprint: fingerprint || null, priceSource: null, corroborated: false, rejection },
  };
}

/**
 * GROUPES DEPUIS LES OPTIONS AMAZON (23/10/2026).
 *
 * Sur Amazon, la rangée de pastilles est lue par le lecteur DÉDIÉ (ASIN, prix et
 * stock SUR la carte, état de disponibilité par valeur) et non par le lecteur
 * générique : `payload.variantGroups` reste donc vide. Sans cette conversion, le
 * serveur ne voyait que la valeur affichée alors que la capture publiait déjà
 * tout — c'est la cause du « choix non confirmé » quand le client changeait de
 * couleur dans la feuille.
 *
 * On ne fabrique rien : chaque valeur vient de `amazon.options`, avec SON état,
 * SON prix et SON stock. Une dimension sans valeur lisible est ignorée.
 */
function variantGroupsFromAmazonOptions(
  amazon: AyWebsCapturedPage['amazon'],
): AyWebsCapturedVariantGroup[] {
  const options = Array.isArray(amazon?.options) ? amazon!.options! : [];
  if (!options.length) return [];
  const groups: AyWebsCapturedVariantGroup[] = [];
  const byName = new Map<string, AyWebsCapturedVariantGroup>();
  for (const option of options) {
    if (!option || typeof option !== 'object') continue;
    const name = collapse(option.dimension, 60);
    const value = collapse(option.value, 60);
    if (!name || !value || NOT_A_VARIANT_GROUP.test(name)) continue;
    if (groups.length >= AYWEBS_CAPTURE_LIMITS.maxVariantGroups && !byName.has(name.toLowerCase())) break;
    let group = byName.get(name.toLowerCase());
    if (!group) {
      group = { name, values: [], selected: [] };
      byName.set(name.toLowerCase(), group);
      groups.push(group);
    }
    if (group.values.some((known) => known.toLowerCase() === value.toLowerCase())) continue;
    if (group.values.length >= AYWEBS_CAPTURE_LIMITS.maxVariantGroupValues) continue;
    group.values.push(value);
  }
  /* Valeurs affichées comme choisies : la donnée du twister, jamais l'ordre. */
  const selectedValues = (Array.isArray(amazon?.selectedValues) ? amazon!.selectedValues! : [])
    .map((value) => collapse(value, 60).toLowerCase())
    .filter(Boolean);
  for (const option of options) {
    const name = collapse(option?.dimension, 60);
    const value = collapse(option?.value, 60);
    if (!name || !value) continue;
    const group = byName.get(name.toLowerCase());
    if (!group) continue;
    if (!(option!.selected === true || selectedValues.includes(value.toLowerCase()))) continue;
    const published = group.values.find((known) => known.toLowerCase() === value.toLowerCase());
    if (published && !group.selected!.length) group.selected!.push(published);
  }
  /* États/prix par valeur — même contrat que le lecteur générique. */
  for (const option of options) {
    const name = collapse(option?.dimension, 60);
    const value = collapse(option?.value, 60);
    if (!name || !value) continue;
    const group = byName.get(name.toLowerCase());
    if (!group) continue;
    const published = group.values.find((known) => known.toLowerCase() === value.toLowerCase());
    if (!published) continue;
    const priceText = collapse(option?.price, AYWEBS_CAPTURE_LIMITS.maxVariantValuePriceLength);
    const price = priceText && /[0-9]/.test(priceText) ? priceText : null;
    const stockNumber = Math.floor(Number(option?.stock));
    const stock = Number.isFinite(stockNumber) && stockNumber > 0 && stockNumber <= 999 ? stockNumber : null;
    const evidence = option?.availabilityEvidence;
    const available = evidence === 'available' ? true : evidence === 'unavailable' ? false : null;
    if (available === null && !price && stock === null) continue;
    const bucket = group.options ?? (group.options = []);
    if (bucket.some((known) => known.value.toLowerCase() === published.toLowerCase())) continue;
    bucket.push({ value: published, available, price, priceFrom: option?.priceFrom === true, stock });
  }
  /* On garde les groupes même quand ils ne publient que des libellés : la
     feuille a besoin de leurs valeurs, et le résolveur saura dire « pas publié »
     plutôt que d'inventer un état. */
  return groups;
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
  /**
   * Exige que la capture décrive une FICHE (23/10/2026). Utilisé quand l'URL ne
   * peut pas le prouver : boutique sans motif (`capture`) ou domaine inconnu —
   * c'est-à-dire exactement les cas où le client injecte « à la demande ». Un
   * prix sur une bannière n'est pas un article : refus `NOT_A_PRODUCT_PAGE`.
   */
  requireProductPage?: boolean;
}

/**
 * Nature de la PAGE, décidée ici et nulle part ailleurs (23/10/2026).
 *
 * Le constat : sur Zalando, le lecteur partait sur « Zalando is available in
 * Austria » — une page de magasin — et le journal disait trois fois « capture
 * valide ». Une capture « valide » n'est pas une fiche : sans un article
 * identifié et un repère de vente, il n'y a rien à ajouter au panier.
 *
 * Règle fermée, positive seulement :
 *   • un prix + une identité (`hasTitle`) ⇒ fiche, ou bannière si l'identité
 *     manque — un prix sans titre n'est pas un article ;
 *   • une coquille produit (Amazon : `#dp`/ASIN) ou une commande d'achat ou des
 *     variantes ⇒ fiche, même quand le prix est illisible (rupture, prix caché) ;
 *   • sinon ⇒ page de magasin.
 */
export function classifyAyWebsCapturedPage(signals: AyWebsPageSignals): { kind: AyWebsPageKind; reason: string } {
  const selling = signals.hasPurchaseControl || signals.hasVariants || signals.hasProductShell;
  if (signals.hasPrice && signals.hasTitle) return { kind: 'PRODUCT_CARD', reason: 'prix_et_titre' };
  if (selling && signals.hasTitle) return { kind: 'PRODUCT_CARD', reason: signals.hasProductShell ? 'coquille_produit' : 'commande_ou_variantes' };
  if (signals.hasPrice) return { kind: 'AD', reason: 'prix_sans_identite' };
  if (signals.hasProductShell && signals.hasImages) return { kind: 'PRODUCT_CARD', reason: 'coquille_produit_sans_titre' };
  return { kind: 'STOREFRONT', reason: 'aucun_repere_de_fiche' };
}

/** Signaux d'une capture — bornés, jamais de texte de page. */
export function ayWebsPageSignalsOf(payload: AyWebsCapturedPage): AyWebsPageSignals {
  const title = collapse(payload?.title, AYWEBS_CAPTURE_LIMITS.maxTitleLength);
  const amazon = payload?.amazon;
  const shein = payload?.shein;
  const aliexpress = payload?.aliexpress;
  return {
    hasTitle: Boolean(title),
    hasPrice: Array.isArray(payload?.priceCandidates)
      ? payload.priceCandidates.some((candidate) => Boolean(collapse(candidate?.text, AYWEBS_CAPTURE_LIMITS.maxTextLength)))
      : false,
    hasPurchaseControl: Boolean(collapse(payload?.addToCartText, AYWEBS_CAPTURE_LIMITS.maxTextLength)),
    hasVariants: (Array.isArray(payload?.variantGroups) && payload.variantGroups.length > 0)
      || (Array.isArray(amazon?.variants) && amazon.variants.length > 0)
      || (Array.isArray(amazon?.options) && amazon.options.length > 0)
      || (Array.isArray(aliexpress?.skus) && aliexpress.skus.length > 0),
    hasImages: Array.isArray(payload?.images) && payload.images.length > 0,
    hasProductShell: Boolean(
      (amazon && typeof amazon.pageAsin === 'string' && AMAZON_ASIN_SHAPE.test(amazon.pageAsin))
      || (shein && typeof shein.pageGoodsId === 'string' && /^\d{5,16}$/.test(shein.pageGoodsId))
      || (aliexpress && typeof aliexpress.pageItemId === 'string' && /^\d{6,20}$/.test(aliexpress.pageItemId)),
    ),
  };
}

export function validateAyWebsCapturedPage(
  raw: unknown,
  requestUrl: string,
  options: AyWebsCaptureValidationOptions = {},
): AyWebsCaptureValidation {
  captureStats.validated += 1;
  /* Attribution AVANT toute lecture : même une capture illisible est comptée
     pour la boutique qu'on regardait — sinon les refus les plus fréquents
     (`NOT_AN_OBJECT`, `BAD_VERSION`) disparaîtraient de la mesure. */
  const storeKey = ayWebsCaptureStoreKey(requestUrl);
  const bucket = storeBucket(storeKey);
  bucket.validated += 1;
  const rejected = (rejection: string, fingerprint = '', notes: string[] = []) =>
    captureRejected(storeKey, rejection, fingerprint, notes);
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
  if (!pageHost || !requestHost || !sameCaptureHost(pageHost, requestHost)) return rejected('URL_HOST_MISMATCH');

  const canonicalUrl = collapse(payload.canonicalUrl, 600);
  if (canonicalUrl) {
    const canonicalHost = hostOf(canonicalUrl);
    if (!canonicalHost || !sameCaptureHost(canonicalHost, requestHost)) return rejected('CANONICAL_HOST_MISMATCH');
  }

  const capturedAtMs = Date.parse(String(payload.capturedAt || ''));
  if (!Number.isFinite(capturedAtMs)) return rejected('STALE_CAPTURE');
  const now = Date.now();
  if (now - capturedAtMs > AYWEBS_CAPTURE_LIMITS.maxAgeMs) return rejected('STALE_CAPTURE');
  if (capturedAtMs - now > AYWEBS_CAPTURE_LIMITS.maxClockSkewMs) return rejected('FUTURE_CAPTURE');

  /* ── NATURE DE LA PAGE ─────────────────────────────────────────────────────
     Avant le prix : une capture de page d'accueil ne doit pas être jugée
     « prix illisible », elle doit être dite « pas une fiche ». Le refus est donc
     distinct et arrive en premier — c'est ce que l'écran affichera. */
  const pageSignals = ayWebsPageSignalsOf(payload);
  const pageKind = classifyAyWebsCapturedPage(pageSignals);
  if (options.requireProductPage === true && pageKind.kind !== 'PRODUCT_CARD') {
    return rejected('NOT_A_PRODUCT_PAGE', '', [`page_kind:${pageKind.kind}`, `page_reason:${pageKind.reason}`]);
  }

  /* ── VARIANTE AMAZON (contrat Phase 1 — derrière AYWEBS_AMAZON_VARIANT_CONTRACT=1) ──
     Quand la fiche a plusieurs variantes, le prix de la zone d'achat ne vaut que pour
     l'option CHOISIE. On la refuse si elle n'est pas prouvée. */
  if (variantContractEnabled() && isAmazonHost(requestUrl)) {
    const variantRefusal = amazonVariantRefusal(payload);
    if (variantRefusal) return rejected('VARIANT_NOT_PROVEN', '', [`variant:${variantRefusal}`]);
  }

  /* ── IDENTITÉ FICHE ALIEXPRESS (anti-état SPA périmé) ──────────────────── */
  if (payload.aliexpress && typeof payload.aliexpress === 'object') {
    const claimedItemId = collapse(payload.aliexpress.pageItemId, 32).replace(/^AE-/i, '');
    if (claimedItemId && /^\d{6,20}$/.test(claimedItemId)) {
      let urlItemId: string | null = null;
      try { urlItemId = aliexpressItemId(new URL(pageUrl || requestUrl)); } catch { urlItemId = null; }
      if (urlItemId && urlItemId !== claimedItemId) {
        return rejected('PRODUCT_IDENTITY_MISMATCH', '', [`ae_item_mismatch:${claimedItemId}!=${urlItemId}`]);
      }
    }
  }

  /* ── PRIX ────────────────────────────────────────────────────────────────
     Chaque candidat est jugé par le verdict de la Phase 0. Le classement suit
     la fiabilité de la source ; à fiabilité égale, l'ordre d'arrivée. */
  const notes: string[] = [];
  /* Diagnostics du lecteur : codes courts seulement (pas de texte de page). */
  const clientDiagnostics = Array.isArray(payload.diagnostics)
    ? payload.diagnostics
      .slice(0, 12)
      .map((entry) => collapse(entry, 60))
      .filter((entry) => /^[a-z0-9_:.,=-]+$/i.test(entry))
    : [];
  clientDiagnostics.forEach((code) => notes.push(`client:${code}`));
  const storeForPrice = detectAyWebsStore(requestUrl);
  const isAmazon = storeForPrice?.id === 'amazon';
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
    // La zone d'achat a tranché avant nous : deux prix (AMBIGUOUS) ou un autre article (ASIN).
    if (clientDiagnostics.includes('price:buybox_asin_mismatch')) return rejected('BUYBOX_ASIN_MISMATCH', '', notes);
    if (clientDiagnostics.some((code) => code.startsWith('price:ambiguous_buybox'))) return rejected('AMBIGUOUS_PRICE', '', notes);
    // Distinguer « aucun texte » de « textes tous refusés » : le support doit
    // savoir si la page n'a rien affiché ou si quelque chose a été écarté.
    // Page en rupture : l'élément de disponibilité le dit, et aucun prix n'est publié.
    // On garde le refus (jamais de panier) mais la cause réelle est OUT_OF_STOCK, pas « pas de prix ».
    if (!rawCandidates.length && isOutOfStockText(payload.availabilityText)) return rejected('OUT_OF_STOCK', '', notes);
    return rejected(rawCandidates.length ? 'PRICE_REJECTED' : 'NO_PRICE_TEXT', '', notes);
  }

  /* Amazon : un prix publié (JSON-LD) qui ne concorde pas avec la zone d'achat
     est un CONFLIT, pas une source qui fait foi. On refuse plutôt que de choisir. */
  if (isAmazon && new Set(candidates.map((candidate) => candidate.value.toFixed(2))).size > 1) {
    notes.push('amazon_price_sources_disagree');
    return rejected('AMBIGUOUS_PRICE', '', notes);
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
  for (const match of candidateCurrencyEvidence.matchAll(/(?:^|[^A-Za-z])(EUR|USD|GBP|JPY|TND|MAD|SAR|AED|CAD|AUD|SGD|BRL|MXN|PLN|TRY|CHF|SEK)(?=$|[^A-Za-z])/g)) {
    publishedIsos.add(match[1]);
  }
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
    let effectivePath = '';
    try { effectivePath = new URL(pageUrl || requestUrl).pathname.toLowerCase(); } catch { effectivePath = ''; }
    const sheinMobileNonUsdLocale = store?.id === 'shein' && /^\/(?:ca|au|sg|mx|br)(?:\/|$)/.test(effectivePath);
    if (store) {
      for (const entry of AYWEBS_SYMBOL_CURRENCIES) {
        if (!entry.stores.includes(store.id)) continue;
        if (!entry.pattern.test(currencyTexts)) continue;
        if (entry.hostsOnly && !hostMatchesAny(requestHost, entry.hostsOnly)) continue;
        if (hostMatchesAny(requestHost, entry.hostsExcluded)
          || (sheinMobileNonUsdLocale && entry.iso === 'USD' && entry.pattern.source === '\\$')) {
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
  /* Deux lecteurs, un seul contrat : le générique (boutiques sans adaptateur) et
     le dédié Amazon (pastilles + ASIN). Les groupes génériques gagnent ; ceux
     d'Amazon complètent les dimensions qu'ils n'ont pas nommées. */
  const genericGroups = cleanVariantGroups(payload.variantGroups);
  const amazonGroups = variantGroupsFromAmazonOptions(payload.amazon);
  const variantGroups = [...genericGroups];
  for (const group of amazonGroups) {
    if (variantGroups.some((known) => known.name.toLowerCase() === group.name.toLowerCase())) continue;
    variantGroups.push(group);
  }
  variantGroups.splice(AYWEBS_CAPTURE_LIMITS.maxVariantGroups);

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
    capturedAt: String(payload.capturedAt),
  });

  const summary = condition && selectedVariantTexts.length
    ? `${title} — ${condition} — ${selectedVariantTexts.join(' / ')}`
    : title;

  let externalId: string | null = null;
  if (storeForPrice?.id === 'shein') {
    const rawSheinId = collapse(payload.shein?.pageGoodsId, 32).replace(/^SHEIN-/i, '');
    let urlSheinId: string | null = null;
    try { urlSheinId = sheinGoodsId(new URL(pageUrl || requestUrl)); } catch { urlSheinId = null; }
    const resolvedGoodsId = /^\d{5,16}$/.test(rawSheinId) ? rawSheinId : urlSheinId;
    if (resolvedGoodsId) externalId = `SHEIN-${resolvedGoodsId}`;
  } else if (storeForPrice?.id === 'aliexpress') {
    const rawAeId = collapse(payload.aliexpress?.pageItemId, 32).replace(/^AE-/i, '');
    let urlAeId: string | null = null;
    try { urlAeId = aliexpressItemId(new URL(pageUrl || requestUrl)); } catch { urlAeId = null; }
    const resolvedAeId = /^\d{6,20}$/.test(rawAeId) ? rawAeId : urlAeId;
    if (resolvedAeId) externalId = `AE-${resolvedAeId}`;
  } else if (storeForPrice?.id === 'temu') {
    let urlTemuId: string | null = null;
    try { urlTemuId = temuGoodsId(new URL(pageUrl || requestUrl)); } catch { urlTemuId = null; }
    if (urlTemuId) externalId = `TEMU-${urlTemuId}`;
  }

  /* Validation serveur de la MATRICE DE VARIANTES universelle (`variantMatrix` + `aliexpress.skus`) :
     chaque entrée couvre les `variantGroups` multi-valeurs retenus, et son prix
     (ainsi que ses éventuels paliers de quantité `quantityTiers`) passe par
     `checkPriceText` avec une devise cohérente avec celle prouvée sur la fiche.
     Aucun prix de base n'est jamais extrapolé aux combinaisons sans prix (`price: null`). */
  const skuCombinations: AyWebsSourceProduct['variants'] = [];
  const parseMatrixPriceForPage = (rawPriceInput: unknown, isPriceFrom: boolean): { price: number; currency: string } | null => {
    if (isPriceFrom) return null;
    const rawText = collapse(rawPriceInput, AYWEBS_CAPTURE_LIMITS.maxVariantValuePriceLength);
    if (!rawText) return null;
    const verdict = checkPriceText(rawText);
    if (!verdict.ok || !(verdict.value > 0)) return null;
    const explicitIsoMatch = rawText.toUpperCase().match(/(?:^|[^A-Z])(EUR|USD|GBP|JPY|TND|MAD|SAR|AED|CAD|AUD|SGD|BRL|MXN|PLN|TRY|CHF|SEK)(?=$|[^A-Z])/);
    const explicitIso = explicitIsoMatch ? explicitIsoMatch[1] : null;
    if (explicitIso) {
      if (!currencyVerified || explicitIso === currency) {
        return { price: verdict.value, currency: explicitIso };
      }
      return null;
    }
    if (!currencyVerified || !currency) return null;
    /* Symbole marchand ou indices de devise de `checkPriceText` compatibles avec `currency` prouvée */
    if (verdict.currencyHints.length > 0) {
      if (storeForPrice?.id === 'aliexpress') {
        const symHit = AYWEBS_SYMBOL_CURRENCIES.find((entry) =>
          entry.stores.includes('aliexpress')
          && entry.pattern.test(rawText)
          && (!entry.hostsOnly || hostMatchesAny(requestHost, entry.hostsOnly))
          && !hostMatchesAny(requestHost, entry.hostsExcluded),
        );
        if (symHit && symHit.iso === currency) return { price: verdict.value, currency };
        return null;
      }
      if (verdict.currencyHints.includes(currency)) {
        return { price: verdict.value, currency };
      }
    }
    return null;
  };

  if (variantGroups.length > 0) {
    const rawEntries: AyWebsCapturedMatrixEntry[] = [];
    if (Array.isArray(payload.variantMatrix)) {
      for (const item of payload.variantMatrix.slice(0, AYWEBS_CAPTURE_LIMITS.maxMatrixEntries)) {
        if (item && typeof item === 'object') rawEntries.push(item as AyWebsCapturedMatrixEntry);
      }
    }
    if (storeForPrice?.id === 'aliexpress' && Array.isArray(payload.aliexpress?.skus)) {
      for (const aeSku of payload.aliexpress!.skus!.slice(0, 60)) {
        if (!aeSku || typeof aeSku !== 'object') continue;
        rawEntries.push({
          variantId: aeSku.skuId ? `ae:${collapse(aeSku.skuId, 32).replace(/^ae:/i, '')}` : null,
          attributes: (aeSku.attributes && typeof aeSku.attributes === 'object') ? aeSku.attributes : {},
          price: aeSku.price ?? null,
          priceFrom: false,
          available: aeSku.available ?? null,
          stock: aeSku.stock ?? null,
          image: aeSku.image ?? null,
          evidenceSource: 'embedded_json',
        });
      }
    }

    const multiGroups = variantGroups.filter((g) => g.values.length >= 2);
    const targetGroups = multiGroups.length > 0 ? multiGroups : variantGroups;
    const seenComboKeys = new Set<string>();

    for (const rawEntry of rawEntries) {
      const rawAttrs = (rawEntry as { attributes?: unknown }).attributes;
      if (!rawAttrs || typeof rawAttrs !== 'object' || Array.isArray(rawAttrs)) continue;
      const rawAttrEntries = Object.entries(rawAttrs as Record<string, unknown>);
      const alignedAttrs: Record<string, string> = {};
      let allMatched = true;
      for (const group of targetGroups) {
        const hit = rawAttrEntries.find(([k]) => {
          const cleanK = collapse(k, 60);
          return cleanK.toLowerCase() === group.name.toLowerCase() || ayWebsSameAttribute(cleanK, group.name);
        });
        if (!hit) { allMatched = false; break; }
        const valText = collapse(hit[1], 60);
        const canonicalVal = group.values.find((v) => v.toLowerCase() === valText.toLowerCase());
        if (!canonicalVal) { allMatched = false; break; }
        alignedAttrs[group.name] = canonicalVal;
      }
      if (!allMatched) continue;
      /* Pour conserver la parité avec les groupes à valeur unique éventuels (ex. AliExpress), on ajoute aussi les groupes mono-valeur présents. */
      for (const group of variantGroups) {
        if (alignedAttrs[group.name]) continue;
        if (group.values.length === 1) alignedAttrs[group.name] = group.values[0];
      }
      const comboKey = targetGroups.map((g) => `${g.name.toLowerCase()}=${alignedAttrs[g.name].toLowerCase()}`).join('|');
      if (seenComboKeys.has(comboKey)) continue;
      seenComboKeys.add(comboKey);

      const rawAvail = (rawEntry as { available?: unknown }).available;
      const stockNum = Math.floor(Number((rawEntry as { stock?: unknown }).stock));
      const validStock = Number.isFinite(stockNum) && stockNum > 0 && stockNum <= 999 ? stockNum : null;
      const skuAvailable: boolean | null = rawAvail === true ? true : rawAvail === false ? false : null;
      const skuAvailability: AyWebsAvailabilityState =
        skuAvailable === false ? 'OUT_OF_STOCK'
          : skuAvailable === true ? (validStock !== null && validStock <= 5 ? 'LOW_STOCK' : 'AVAILABLE')
            : 'UNKNOWN';
      const skuAvailabilityReason =
        skuAvailability === 'OUT_OF_STOCK' ? 'sku_out_of_stock_capture'
          : skuAvailability === 'LOW_STOCK' ? `sku_low_stock_capture:${validStock}`
            : skuAvailability === 'AVAILABLE' ? (validStock !== null ? `sku_in_stock_capture:${validStock}` : 'sku_in_stock_capture')
              : 'sku_stock_unspecified_capture';

      const parsedPrice = skuAvailability !== 'OUT_OF_STOCK'
        ? parseMatrixPriceForPage((rawEntry as { price?: unknown }).price, (rawEntry as { priceFrom?: unknown }).priceFrom === true)
        : null;
      const skuPrice = parsedPrice ? parsedPrice.price : null;
      const skuCurrency = parsedPrice ? parsedPrice.currency : null;

      /* Paliers de quantité éventuels publiés par le marchand */
      const validatedTiers: Array<{ minQuantity: number; unitPrice: number }> = [];
      const rawTiers = (rawEntry as { quantityTiers?: unknown }).quantityTiers;
      if (skuAvailability !== 'OUT_OF_STOCK' && Array.isArray(rawTiers)) {
        for (const rawTier of rawTiers.slice(0, 6)) {
          if (!rawTier || typeof rawTier !== 'object') continue;
          const minQ = Math.floor(Number((rawTier as { minQuantity?: unknown }).minQuantity));
          if (!Number.isFinite(minQ) || minQ < 2 || minQ > 100) continue;
          const parsedTier = parseMatrixPriceForPage((rawTier as { unitPrice?: unknown }).unitPrice, false);
          if (parsedTier && (!skuCurrency || parsedTier.currency === skuCurrency)) {
            validatedTiers.push({ minQuantity: minQ, unitPrice: parsedTier.price });
          }
        }
        validatedTiers.sort((a, b) => a.minQuantity - b.minQuantity);
      }

      const rawVarId = collapse((rawEntry as { variantId?: unknown }).variantId ?? (rawEntry as { skuId?: unknown }).skuId, 80);
      let cleanId: string | null = null;
      if (rawVarId) {
        if (/^ae:\d{5,24}$/i.test(rawVarId)) cleanId = `ae:${rawVarId.slice(3)}`;
        else if (storeForPrice?.id === 'aliexpress' && /^\d{5,24}$/.test(rawVarId)) cleanId = `ae:${rawVarId}`;
        else if (/^(?:asin|shein|matrix):[A-Za-z0-9:_-]{2,64}$/i.test(rawVarId)) cleanId = rawVarId;
        else if (/^[A-Za-z0-9:_-]{2,64}$/.test(rawVarId)) cleanId = `matrix:${rawVarId}`;
      } else {
        cleanId = `matrix:${comboKey.slice(0, 64)}`;
      }

      let cleanVariantUrl: string | null = null;
      const rawVarUrl = collapse((rawEntry as { variantUrl?: unknown }).variantUrl, 600);
      if (rawVarUrl && /^https?:\/\//i.test(rawVarUrl)) {
        const varHost = hostOf(rawVarUrl);
        if (varHost) {
          const sameStore = storeForPrice ? hostMatchesAny(varHost, storeForPrice.domains) : varHost === requestHost;
          if (sameStore) cleanVariantUrl = rawVarUrl;
        }
      }

      const rawSkuImg = collapse((rawEntry as { image?: unknown }).image, 600);
      const cleanImg = /^https?:\/\//i.test(rawSkuImg) ? rawSkuImg : null;
      const rawEvSrc = collapse((rawEntry as { evidenceSource?: unknown }).evidenceSource, 24);
      const cleanEvSrc = ['embedded_json', 'json_ld', 'preloaded_state', 'network_cache', 'dom'].includes(rawEvSrc)
        ? rawEvSrc
        : 'embedded_json';

      skuCombinations.push({
        sourceVariantId: cleanId,
        attributes: alignedAttrs,
        label: targetGroups.map((g) => alignedAttrs[g.name]).join(' / '),
        price: skuPrice,
        currency: skuCurrency,
        available: skuAvailable,
        availability: skuAvailability,
        availabilityReason: skuAvailabilityReason,
        image: cleanImg,
        variantUrl: cleanVariantUrl,
        stock: validStock,
        evidenceSource: cleanEvSrc,
        ...(validatedTiers.length > 0 ? { quantityTiers: validatedTiers } : {}),
      });
    }
  }

  const colorImages: Record<string, string[]> = {};
  for (const group of variantGroups) {
    if (!/(color|colour|couleur|farbe|colore|kleur|لون)/i.test(group.name)) continue;
    for (const option of group.options || []) {
      if (option.image && /^https?:\/\//i.test(option.image)) {
        const colorKey = option.value.toLowerCase();
        colorImages[colorKey] = [...new Set([...(colorImages[colorKey] || []), option.image])];
      }
    }
  }

  /* Le `ScrapedProduct` produit ici est le MÊME objet que celui du lecteur
     serveur : le reste d'AYWEBs (normaliseur, disponibilité, panier) ne sait
     même pas que la lecture vient du client. `verificationProvider` le dit. */
  const scraped: ScrapedProduct = {
    id: `webview_${pageHost}`,
    store: pageHost,
    storeName: pageHost,
    url: pageUrl || requestUrl,
    externalId,
    title,
    description: summary || title,
    images,
    mainImage: images[0] || '',
    ...(Object.keys(colorImages).length ? { colorImages } : {}),
    sourcePrice: price,
    sourceCurrency: currency,
    convertedPriceTND: 0,
    estimatedShippingTND: 0,
    serviceFeeTND: 0,
    totalPriceTND: 0,
    /* AUCUNE variante publiée : la capture prouve un prix et l'état du bouton
       d'achat POUR LA COMBINAISON AFFICHÉE, pas le stock de chaque combinaison.
       Exposer des options sans stock par option ferait exiger une sélection que
       le serveur serait ensuite incapable de vérifier (blocage honnête mais
       inutile). Les libellés publiés restent dans la piste d'audit. */
    variants: { colors: [], sizes: [], details: [] },
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
    verificationFailureCode: corroborated ? undefined : 'WEBVIEW_PRICE_SINGLE_SOURCE',
    scrapedAt: new Date(capturedAtMs).toISOString(),
  };

  notes.push(`price_source:${primary.source}`, corroborated ? 'corroborated' : 'single_source');
  if (variantTexts.length) notes.push(`variants_published:${variantTexts.slice(0, 8).join('|')}`);
  /* Les groupes sont consignés un par un : on peut relire après coup ce que la
     page proposait, sans jamais s'en servir pour promettre un stock. */
  for (const group of variantGroups) {
    notes.push(`variant_group:${group.name}=${group.values.slice(0, 8).join(',')}${group.selected?.length ? `#${group.selected[0]}` : ''}`);
  }
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
  bucket.accepted += 1;
  if (!corroborated) bucket.single_source += 1;
  if (variantGroups.length) bucket.variant_groups_seen += 1;

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
    variantGroups,
    skuCombinations,
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

/**
 * Traduction d'un motif de refus de capture WebView vers le code d'erreur
 * metier AYWEBS qui porte la meme signification pour le client.
 *
 * Une capture refusee n'est PAS bloquante quand la boutique sait se lire cote
 * serveur (un adaptateur dedie reprend la main). En revanche, pour une boutique
 * "catalogue" (aucune lecture serveur possible — CatalogueStoreAdapter), ce
 * code devient la SEULE reponse honnete : il nomme ce que la capture n'a pas su
 * prouver au lieu d'un generique "ouvrez la fiche" qui cache la vraie cause
 * (prix non corrobore, capture perimee, rupture…).
 */
export function ayWebsCaptureRejectionErrorCode(rejection: string | null | undefined): AyWebsErrorCode {
  switch (rejection) {
    case 'OUT_OF_STOCK':
      return 'OUT_OF_STOCK';
    case 'NO_PRICE_TEXT':
    case 'PRICE_REJECTED':
      return 'PRICE_UNAVAILABLE';
    case 'PRICE_NOT_CORROBORATED':
    case 'AMBIGUOUS_PRICE':
    case 'BUYBOX_ASIN_MISMATCH':
      return 'PRICE_AMBIGUOUS';
    case 'NOT_A_PRODUCT_PAGE':
      return 'PRODUCT_PAGE_REQUIRED';
    case 'VARIANT_NOT_PROVEN':
      return 'VARIANT_UNKNOWN';
    case 'STALE_CAPTURE':
    case 'FUTURE_CAPTURE':
    case 'URL_HOST_MISMATCH':
    case 'CANONICAL_HOST_MISMATCH':
    case 'PRODUCT_IDENTITY_MISMATCH':
    case 'BAD_VERSION':
    case 'NOT_AN_OBJECT':
    case 'TOO_LARGE':
    default:
      return 'CAPTURE_INCOMPLETE';
  }
}
