import { allowsMerchantVariantChoice, reportedVariantStock } from '../../shared/variantPolicy';
import { JSDOM, VirtualConsole } from 'jsdom';
import type { ProductVariantDetail, ProductVariants, StoreType } from '../types';

export interface ParsedProductPage {
  title: string;
  brand?: string;
  description?: string;
  price: number;
  currency: string;
  referencePrice?: number | null;
  rating?: number | null;
  reviewsCount?: number | null;
  images: string[];
  /** Images PAR COULEUR (24/09/2026) : chaque variante de couleur possède son propre
   *  jeu de photos (référence Zalando). Clé = nom de couleur en minuscules. */
  colorImages: Record<string, string[]>;
  externalId: string;
  variants: ProductVariants;
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  priceSource: 'json_ld' | 'meta' | 'dom' | 'embedded_variant' | 'context_regex' | 'none';
}

const SIZE_NAME = /(?:^|\b)(?:size|sizes|taille|tailles|pointure|pointures|größe|shoe size)(?:\b|$)/i;
const COLOR_NAME = /(?:^|\b)(?:colou?r|couleur|couleurs|farbe)(?:\b|$)/i;
const PLACEHOLDER = /^(?:select|choose|choisir|sélectionner|selectionner|taille|size|couleur|color|default title|please select|—|-)?$/i;
const UNAVAILABLE = /(?:sold\s*out|out\s*of\s*stock|épuis|indisponible|unavailable|rupture)/i;

function cleanLabel(raw: unknown): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*(?:sold\s*out|out\s*of\s*stock|épuisé|indisponible).*$/i, '')
    .replace(/\s+48\s*h(?:eures?)?$/i, '')
    .trim()
    .slice(0, 80);
}

function unique(values: Array<string | null | undefined>, limit = 40): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = cleanLabel(raw);
    const key = value.toLocaleLowerCase('fr');
    if (!value || PLACEHOLDER.test(value) || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function parsePrice(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 && raw < 1_000_000 ? raw : 0;
  let normalized = String(raw || '').replace(/[\s\u00a0]/g, '').replace(/[^0-9,.-]/g, '');
  if (!normalized) return 0;
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimalMark = comma > dot ? ',' : '.';
    const thousandsMark = decimalMark === ',' ? /\./g : /,/g;
    normalized = normalized.replace(thousandsMark, '').replace(decimalMark, '.');
  } else {
    const mark = comma >= 0 ? ',' : dot >= 0 ? '.' : '';
    if (mark) {
      const parts = normalized.split(mark);
      const decimalDigits = parts[parts.length - 1].length;
      normalized = decimalDigits === 3 && parts.length <= 2
        ? parts.join('')
        : `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`;
    }
  }
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 && value < 1_000_000 ? value : 0;
}


/**
 * NETTOYAGE DE DESCRIPTION (fix 24/09/2026 — captures client) : le DOM d'une
 * fiche marchand déborde de bruit — scripts inline (gaDataLayer/GTM…), URLs,
 * libellés d'interface (Ajouter au panier, Guide des tailles, Qté…), phrases
 * répétées. La fiche ne doit JAMAIS afficher ça : on retire scripts/styles du
 * document AVANT extraction (voir plus bas) et on passe chaque description au
 * peigne fin ici — filtrage ligne à ligne (JS, UI, URLs, prix, Réf.), puis
 * déduplication des phrases, longueur bornée.
 */
const NOISE_LINES: RegExp[] = [
  /https?:\/\/|www\./i,
  /(?:=>|\bfunction\b|\bconst\b|\blet\b|\bvar\b|\breturn\b|\btypeof\b|window\.|document\.|dataLayer|gaDataLayer|\bGTM\b|gtag\s*\(|\)\s*\(\)|\}\)\s*\(\))/,
  /(?:ajouter\s+au\s+panier|s[ée]lectionnez\s+une\s+taille|choisissez\s+votre\s+taille|guide\s+des\s+tailles|quelle?s?\s+est\s+ma\s+taille|quelle?s?\s+est\s+ma\s+correspondance|m['’]alerter|r[ée]server\s+en\s+boutique|enregistrer\s+ma\s+taille|recalculer\s+ma\s+taille|mes\s+pr[ée]f[ée]rences\s+cookie|pr[ée]f[ée]rences\s+de\s+cookies|qt[ée]\s*:|livraison\s+[àa]\s+domicile|livraison\s+estim[ée]e|disponibilit[ée]\s+en\s+boutique|prend?ez\s+vos\s+mesures|m[èe]tre\s+ruban|tour\s+de\s+(bassin|poitrine|taille)\s*:|saisissez\s+votre\s+taille|[ée]quivalence\s+en\s+t\d|bons\s+plans|ajouter\s+à\s+la\s+sélection|المستعمل|أضف\s+إلى\s+السلة|اختر\s+مقاسك|دليل\s+المقاسات|التوصيل)/i,
  /^\s*(?:r[ée]f\.?|réf)\s*[:.]?\s*\w{4,}\s*$/i,
  /\d+(?:[.,]\d{1,2})?\s*(?:€|\$|£|EUR|USD|GBP|TND|DT)/i,
  /^\s*(?:\d+[.,]\d+|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\s*$/,
];
const MIN_SENTENCE = 12;

export function cleanDescription(raw: string, maxLength = 1400): string {
  const lines = String(raw || '').split(/\r?\n|(?<=[.!?؟])\s{2,}/);
  const survivors = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return !NOISE_LINES.some((pattern) => pattern.test(trimmed));
  });
  // Phrases : déduplication insensible à la casse/espaces, on garde l'ordre.
  const sentences = survivors.join(' ').split(/(?<=[.!?؟。])\s+|\s*[|·]\s*/);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const candidate of sentences) {
    const trimmed = candidate.replace(/\s+/g, ' ').trim();
    if (trimmed.length < MIN_SENTENCE) continue;
    if (NOISE_LINES.some((pattern) => pattern.test(trimmed))) continue;
    const key = trimmed.toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(trimmed);
  }
  const joined = kept.join(' ').replace(/\s+([,.!?؟])/g, '$1').trim();
  if (!joined) return '';
  return joined.length <= maxLength ? joined : `${joined.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

function currencyCode(raw: string): string {
  const value = raw.toUpperCase();
  if (value.includes('€') || value.includes('EUR')) return 'EUR';
  if (value.includes('£') || value.includes('GBP')) return 'GBP';
  if (value.includes('د.ت') || value.includes('TND') || value.includes('DT')) return 'TND';
  if (value.includes('¥') || value.includes('JPY')) return 'JPY';
  if (value.includes('$') || value.includes('USD')) return 'USD';
  return '';
}

function contextualPrice(bodyText: string): { price: number; currency: string } | null {
  const text = bodyText.replace(/\s+/g, ' ').slice(0, 500_000);
  const patterns = [
    /(?:prix|price|sale\s*price|our\s*price|prezzo|preis|السعر)\s*[:\-]?\s*(?:from|à\s*partir\s*de)?\s*([€$£¥]|EUR|USD|GBP|JPY|TND|DT|د\.ت)?\s*([0-9][0-9\s.,]{0,14})\s*([€$£¥]|EUR|USD|GBP|JPY|TND|DT|د\.ت)?/gi,
    /([€$£¥]|EUR|USD|GBP|JPY|TND|DT|د\.ت)\s*([0-9][0-9\s.,]{0,14})\s*(?:prix|price)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const context = text.slice(Math.max(0, Number(match.index) - 35), Number(match.index) + match[0].length + 20);
      if (/(?:old|ancien|regular|list\s*price|was|before|barr[ée]|économisez|save\s+\d)/i.test(context)) continue;
      const price = parsePrice(match[2]);
      const currency = currencyCode(`${match[1] || ''} ${match[3] || ''}`);
      if (price > 0 && currency) return { price, currency };
    }
  }
  return null;
}

function moneyValue(raw: any, shopifyCents = false): number {
  if (raw && typeof raw === 'object') {
    return parsePrice(raw.amount ?? raw.value ?? raw.current?.value ?? raw.current?.amount);
  }
  const value = parsePrice(raw);
  if (shopifyCents && Number.isInteger(value) && value >= 1_000) return value / 100;
  return value;
}

function flattenJsonLd(raw: any, output: any[] = []): any[] {
  if (!raw) return output;
  if (Array.isArray(raw)) {
    for (const item of raw) flattenJsonLd(item, output);
  } else if (typeof raw === 'object') {
    if (Array.isArray(raw['@graph'])) flattenJsonLd(raw['@graph'], output);
    else output.push(raw);
  }
  return output;
}

function isProductNode(node: any): boolean {
  const type = node?.['@type'];
  return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
}

function collectEmbeddedProducts(root: any, output: any[], seen: Set<any>, budget: { value: number }, depth = 0): void {
  if (!root || typeof root !== 'object' || depth > 8 || budget.value <= 0 || seen.has(root)) return;
  seen.add(root);
  budget.value -= 1;
  if (Array.isArray(root)) {
    for (const item of root.slice(0, 300)) collectEmbeddedProducts(item, output, seen, budget, depth + 1);
    return;
  }
  if (Array.isArray(root.variants) && root.variants.length && (root.title || root.name || root.handle || root.options)) {
    output.push(root);
  }
  for (const [key, value] of Object.entries(root)) {
    if (key === 'variants' && root === value) continue;
    if (value && typeof value === 'object') collectEmbeddedProducts(value, output, seen, budget, depth + 1);
  }
}

function parseBalancedJsonObject(script: string, marker: string): any | null {
  const markerIndex = script.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = script.indexOf('{', markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < script.length; index += 1) {
    const char = script[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(script.slice(start, index + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function optionNames(product: any): string[] {
  if (!Array.isArray(product?.options)) return [];
  return product.options.map((option: any) => cleanLabel(typeof option === 'string' ? option : option?.name)).filter(Boolean);
}

function rawVariantValues(variant: any): string[] {
  if (Array.isArray(variant?.options)) return variant.options.map(cleanLabel).filter(Boolean);
  const explicit = [variant?.option1, variant?.option2, variant?.option3].map(cleanLabel).filter(Boolean);
  if (explicit.length) return explicit;
  const fallback = cleanLabel(variant?.public_title ?? variant?.title ?? variant?.name);
  return fallback && !PLACEHOLDER.test(fallback) ? [fallback] : [];
}

function variantPrice(variant: any): number {
  const shopifyCents = typeof variant?.price === 'number'
    && ('requires_shipping' in (variant || {}) || 'public_title' in (variant || {}));
  return moneyValue(variant?.price ?? variant?.productPrice ?? variant?.salePrice, shopifyCents);
}

function variantsFromProduct(product: any): ProductVariantDetail[] {
  if (!Array.isArray(product?.variants)) return [];
  const names = optionNames(product);
  const details: ProductVariantDetail[] = [];
  for (const variant of product.variants.slice(0, 300)) {
    const values = rawVariantValues(variant);
    if (!values.length) continue;
    const attributes: Record<string, string> = {};
    let size: string | null = null;
    let color: string | null = null;
    values.forEach((value, index) => {
      const name = names[index];
      if (name) {
        attributes[name] = value; // source label, never assume storage/RAM means color
        if (SIZE_NAME.test(name)) size = value;
        if (COLOR_NAME.test(name)) color = value;
      } else { attributes[`Option ${index + 1}`] = value; } // No merchant group name = unknown meaning, not a guessed shoe/clothing size.
    });
    if (!Object.keys(attributes).length) continue;
    const price = variantPrice(variant);
    details.push({
      id: String(variant.id ?? variant.sku ?? '').trim() || null,
      label: Object.values(attributes).join(' · '),
      size, color, attributes,
      available: allowsMerchantVariantChoice(variant),
      stockStatus: reportedVariantStock(variant),
      price: price || null,
    });
  }
  const seen = new Set<string>();
  return details.filter(detail => {
    const key = JSON.stringify([detail.id, detail.attributes, detail.price]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 120);
}

function collectNamedStrings(root: any, matcher: RegExp, output: string[], depth = 0, seen = new Set<any>()): void {
  if (!root || typeof root !== 'object' || depth > 5 || seen.has(root) || output.length >= 40) return;
  seen.add(root);
  for (const [key, value] of Object.entries(root)) {
    if (matcher.test(key)) {
      if (typeof value === 'string' || typeof value === 'number') output.push(cleanLabel(value));
      else if (Array.isArray(value)) {
        for (const item of value.slice(0, 40)) {
          if (typeof item === 'string' || typeof item === 'number') output.push(cleanLabel(item));
        }
      }
    }
    if (value && typeof value === 'object' && key !== 'variants') {
      collectNamedStrings(value, matcher, output, depth + 1, seen);
    }
  }
}

function absoluteImages(values: unknown[], baseUrl: string): string[] {
  // UN FICHIER = UNE IMAGE (fix 24/09/2026) : les marchands (Zalando, Shopify…)
  // servent le MÊME fichier sous plusieurs largeurs (?imwidth=156/762/1000…).
  // On dédoublonne par chemin en gardant la plus grande déclinaison — la galerie
  // contient alors TOUTES les photos du produit, jamais N fois la même.
  const output: string[] = [];
  const seenPath = new Map<string, { index: number; width: number }>();
  let base: URL | null = null;
  try { base = new URL(baseUrl); } catch { base = null; }
  for (const raw of values.flatMap((value: any) => Array.isArray(value) ? value : [value])) {
    const candidate = typeof raw === 'object' ? raw?.url ?? raw?.src ?? raw?.contentUrl : raw;
    // An empty candidate must never resolve to the page URL itself.
    const value = String(candidate ?? '').trim();
    if (!value) continue;
    try {
      const url = new URL(value, baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      // The product page (or any HTML document) is not a product image.
      if (base && url.hostname === base.hostname && url.pathname === base.pathname) continue;
      if (/\.(html?|xhtml|php|aspx?|jsp|cfm)$/i.test(url.pathname)) continue;
      if (/\.(svg|ico|gif)$/i.test(url.pathname)) continue;
      if (/(?:favicon|sprite|loader|spinner|placeholder|1x1|tracking|pixel)/i.test(url.href)) continue;
      const width = Number(url.searchParams.get('imwidth') || url.searchParams.get('width') || 0) || 0;
      // Shopify & co encodent AUSSI la taille dans le chemin (_1200x1200.jpg,
      // _3000x.jpg, _grande.jpg…) : la clé normalisée retire ces suffixes —
      // un même fichier servi en 3 tailles = UNE photo, on garde la plus
      // grande (l'original sans suffixe l'emporte toujours).
      const sizeInPath = url.pathname.match(/_(\d{2,4})(?:x\d{0,4})?(?:@2x)?(?=\.[a-z]{3,4}$)/i);
      const namedSize = url.pathname.match(/_(?:grande|large|medium|small|compact|thumbnail|pico|icon)(?=\.[a-z]{3,4}$)/i);
      const pathWidth = sizeInPath ? Math.max(Number(sizeInPath[1]), Number(sizeInPath[2] || 0)) : namedSize ? 600 : 99_999;
      const key = url.pathname
        .replace(/_(?:\d{2,4}(?:x\d{0,4})?@2x|\d{2,4}(?:x\d{0,4})?|grande|large|medium|small|compact|thumbnail|pico|icon)(?=\.[a-z]{3,4}$)/i, '')
        .toLowerCase();
      const existing = seenPath.get(key);
      if (existing) {
        if (Math.max(width, pathWidth) > existing.width) output[existing.index] = url.toString();
        continue;
      }
      seenPath.set(key, { index: output.length, width: Math.max(width, pathWidth) });
      output.push(url.toString());
      if (output.length >= 48) break;
    } catch { /* invalid merchant image */ }
  }
  return output;
}

function availabilityFrom(productLd: any, embeddedProduct: any): ParsedProductPage['availability'] {
  // An extracted size/color is a manual choice, not positive stock evidence.
  const variants = Array.isArray(embeddedProduct?.variants) ? embeddedProduct.variants : [];
  const flags = variants.slice(0, 300).map(reportedVariantStock);
  const variantStock = flags.includes(true) ? 'in_stock'
    : flags.length && variants.length <= 300 && flags.every(flag => flag === false) ? 'out_of_stock' : 'unknown';
  const offers = Array.isArray(productLd?.offers) ? productLd.offers : productLd?.offers ? [productLd.offers] : [];
  if (offers.length > 300) return 'unknown'; // No certainty from a partial oversized offer collection.
  const known = new Set<ParsedProductPage['availability']>();
  let unreportedOffer = false;
  for (const offer of offers) {
    const raw = typeof offer?.availability === 'string' ? offer.availability.trim() : '';
    const match = /^(?:https?:\/\/schema\.org\/)?(InStock|OutOfStock|LimitedAvailability)$/i.exec(raw);
    if (!match) unreportedOffer = true;
    if (match) known.add(match[1].toLowerCase() === 'instock' ? 'in_stock' : match[1].toLowerCase() === 'outofstock' ? 'out_of_stock' : 'limited');
  }
  if (known.size > 1 || (known.size > 0 && unreportedOffer)) return 'unknown'; // Mixed offers must not be flattened into a promise.
  const schemaStock = [...known][0];
  if (!schemaStock) return variantStock;
  if (variantStock !== 'unknown' && (variantStock === 'out_of_stock') !== (schemaStock === 'out_of_stock')) return 'unknown';
  return schemaStock; // In particular, keep an explicit limited-stock report.
}

export function parseProductPageHtml(html: string, baseUrl: string, storeType: StoreType): ParsedProductPage {
  const virtualConsole = new VirtualConsole();
  // Merchant CSS can contain browser-only syntax that jsdom does not parse.
  // It is irrelevant to metadata extraction and must not flood production logs.
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new JSDOM(html, { url: baseUrl, virtualConsole });
  try {
    const document = dom.window.document;
    const meta = (selector: string) => document.querySelector(selector)?.getAttribute('content')?.trim() || '';
    const text = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';

    const jsonLd: any[] = [];
    for (const node of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 30)) {
      try { flattenJsonLd(JSON.parse(node.textContent || 'null'), jsonLd); } catch { /* malformed merchant JSON-LD */ }
    }
    const productLd = jsonLd.find(isProductNode) || {};

    const embeddedProducts: any[] = [];
    for (const node of Array.from(document.querySelectorAll('script[type="application/json"]')).slice(0, 40)) {
      const raw = node.textContent || '';
      if (!raw || raw.length > 1_800_000) continue;
      try { collectEmbeddedProducts(JSON.parse(raw), embeddedProducts, new Set(), { value: 20_000 }); } catch { /* non-product state */ }
    }
    // Shopify and several storefront themes embed the current product in an
    // inline JavaScript object instead of application/json.
    const inlineMarkers = ['productData:', 'var meta =', 'window.meta =', 'window.__PRODUCT__ ='];
    for (const node of Array.from(document.querySelectorAll('script:not([type="application/ld+json"]):not([type="application/json"])')).slice(0, 100)) {
      const raw = node.textContent || '';
      if (!raw || raw.length > 1_800_000 || !/(?:productData:|var meta\s*=|window\.(?:meta|__PRODUCT__)\s*=)/.test(raw)) continue;
      for (const marker of inlineMarkers) {
        const parsed = parseBalancedJsonObject(raw, marker);
        if (parsed) collectEmbeddedProducts(parsed, embeddedProducts, new Set(), { value: 20_000 });
      }
    }
    const embeddedProduct = embeddedProducts.sort((a, b) => {
      const score = (item: any) => (item?.title || item?.name ? 10 : 0) + Math.min(20, item?.variants?.length || 0) + (item?.options ? 5 : 0);
      return score(b) - score(a);
    })[0] || null;

    // HYGIÈNE DOM (fix 24/09/2026) : les <script>/<style> inline polluent tout
    // textContent (gaDataLayer, GTM…) — purgés APRÈS l'extraction des données
    // embarquées ci-dessus, AVANT titre/prix/description/texte contextuel.
    for (const noisy of document.querySelectorAll(
      // Les scripts-DATA (application/json, ld+json) restent : ce sont des
      // galeries/fiches embarquées, pas du code exécuté par la page.
      'script:not([type="application/json"]):not([type="application/ld+json"]), style, noscript, template, iframe',
    )) noisy.remove();

    let title = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]')
      || text('#productTitle, h1.product-title-word-break, h1, [class*="product-intro__name"], [class*="goods-name"]')
      || String(productLd?.name || embeddedProduct?.title || embeddedProduct?.name || document.title || '');
    title = title.replace(/\s*\|\s*(SHEIN|Amazon|TEMU|AliExpress).*$/i, '')
      .replace(/\s*:\s*Amazon\.[a-z.]+/i, '').trim();

    const ldBrand = productLd?.brand?.name || (typeof productLd?.brand === 'string' ? productLd.brand : '') || embeddedProduct?.vendor || embeddedProduct?.brand || '';
    const metaBrand = meta('meta[property="product:brand"]') || meta('meta[name="brand"]') || meta('meta[property="og:brand"]');
    let brand = cleanLabel(ldBrand || metaBrand);

    const offers = Array.isArray(productLd?.offers) ? productLd.offers[0] : productLd?.offers;
    const selectorPrice = storeType === 'amazon'
      ? text('.apexPriceToPay .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen, #priceblock_dealprice, #newBuyBoxPrice')
      : storeType === 'shein'
        ? text('[class*="price"]:not([style*="line-through"])')
        : text('[itemprop="price"], [data-price], [class*="price"]');
    const details = variantsFromProduct(embeddedProduct);
    const detailPrices = details.map((detail) => detail.price || 0).filter((value) => value > 0);
    const jsonLdPrice = parsePrice(offers?.price || offers?.lowPrice);
    const metaPrice = parsePrice(
      meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]') || meta('meta[itemprop="price"]'),
    );
    const domPrice = parsePrice(selectorPrice);
    const variantFloor = detailPrices.length ? Math.min(...detailPrices) : 0;
    const regexPrice = contextualPrice(document.body?.textContent || '');
    const price = jsonLdPrice || metaPrice || domPrice || variantFloor || regexPrice?.price || 0;
    const compareAt = embeddedProduct?.compare_at_price ?? embeddedProduct?.compareAtPrice;
    const compareCents = typeof compareAt === 'number' && compareAt >= 1000
      && Array.isArray(embeddedProduct?.variants) && embeddedProduct.variants.some((variant: any) => variant?.requires_shipping === true);
    const referenceCandidate = parsePrice(offers?.priceSpecification?.price ?? meta('meta[property="product:original_price:amount"]'))
      || (compareCents ? Number(compareAt) / 100 : parsePrice(compareAt));
    const referencePrice = referenceCandidate > price && price > 0 ? referenceCandidate : null;
    const merchantRating = parsePrice(productLd?.aggregateRating?.ratingValue ?? meta('meta[itemprop="ratingValue"]'));
    const rating = merchantRating > 0 && merchantRating <= 5 ? merchantRating : null;
    const rawCount = productLd?.aggregateRating?.reviewCount ?? productLd?.aggregateRating?.ratingCount ?? meta('meta[itemprop="reviewCount"]');
    const reviewsCount = typeof rawCount === 'number' || typeof rawCount === 'string'
      ? Number(String(rawCount).replace(/[\s,]/g, '')) : NaN;
    const priceSource: ParsedProductPage['priceSource'] = jsonLdPrice ? 'json_ld'
      : metaPrice ? 'meta'
        : domPrice ? 'dom'
          : variantFloor ? 'embedded_variant'
            : regexPrice ? 'context_regex'
              : 'none';
    const metaCurrency = meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]');
    const currencyBySource: Record<ParsedProductPage['priceSource'], string> = {
      json_ld: String(offers?.priceCurrency || metaCurrency || ''),
      meta: String(metaCurrency || offers?.priceCurrency || ''),
      dom: String(currencyCode(selectorPrice) || metaCurrency || offers?.priceCurrency || ''),
      embedded_variant: String(embeddedProduct?.currency || metaCurrency || offers?.priceCurrency || ''),
      context_regex: String(regexPrice?.currency || metaCurrency || offers?.priceCurrency || ''),
      none: String(metaCurrency || offers?.priceCurrency || embeddedProduct?.currency || ''),
    };
    const currency = currencyCode(currencyBySource[priceSource]) || String(currencyBySource[priceSource]).trim().toUpperCase();

    const domSizes = Array.from(document.querySelectorAll(
      'select[name*="size" i] option, select[name*="taille" i] option, select[data-id*="size" i] option, #variation_size_name option, [data-testid*="size" i] button',
    )).filter((node: any) => !node.disabled && !UNAVAILABLE.test(node.textContent || ''))
      .map((node: any) => cleanLabel(node.getAttribute?.('data-value') || node.value || node.textContent));
    const domColors = Array.from(document.querySelectorAll(
      'select[name*="color" i] option, select[name*="colour" i] option, select[name*="couleur" i] option, #variation_color_name option, [data-testid*="color" i] button, [data-color], input[type="radio"][name*="color" i], input[type="radio"][name*="couleur" i], [class*="swatch" i] [aria-label], [class*="swatch" i] [title]',
    )).filter((node: any) => !node.disabled && !UNAVAILABLE.test(node.textContent || '') && !UNAVAILABLE.test(node.getAttribute?.('aria-label') || ''))
      .map((node: any) => cleanLabel(node.getAttribute?.('data-color') || node.getAttribute?.('data-value') || node.getAttribute?.('aria-label') || node.getAttribute?.('title') || node.value || node.textContent));

    const namedSizes: string[] = [];
    const namedColors: string[] = [];
    collectNamedStrings(productLd, /^(?:size|sizes)$/i, namedSizes);
    collectNamedStrings(productLd, /^(?:color|colour)$/i, namedColors);
    for (const productState of embeddedProducts.slice(0, 12)) {
      collectNamedStrings(productState, /^(?:size|sizes|taille|tailles|pointure|pointures)$/i, namedSizes);
      collectNamedStrings(productState, /^(?:color|colour|couleur|couleurs)$/i, namedColors);
    }

    // A merchant-labelled size can be 'long', 'one size', or another non-numeric
    // value; never silently drop documented options based on title-like heuristics.
    const sizes = unique([...details.map(detail => detail.size), ...namedSizes, ...domSizes], 40);
    const colors = unique([...details.map(detail => detail.color), ...namedColors, ...domColors], 20);
    const names = optionNames(embeddedProduct);
    const groups = names.map((name, index) => ({ name, options: unique(
      (Array.isArray(embeddedProduct?.variants) ? embeddedProduct.variants : []).map((variant: any) => rawVariantValues(variant)[index]), 80,
    ) })).filter(group => group.options.length);

    const ldDescription = typeof productLd?.description === 'string' ? productLd.description.trim() : '';
    const domDescription = text(
      '#productDescription, #feature-bullets, #detailBullets_feature_div, [itemprop="description"], [data-testid*="description" i], [class*="product-intro__description" i], [class*="detail-desc" i], [class*="goods-desc" i], .product-description, #description, [data-testid*="product-details" i]'
    );
    const metaDescription = meta('meta[name="description"]') || meta('meta[property="og:description"]') || meta('meta[name="twitter:description"]');
    const description = cleanDescription(ldDescription || domDescription || metaDescription || '', 1400);

    const jsonLdImages: unknown[] = [];
    for (const node of jsonLd) {
      if (node?.image) jsonLdImages.push(node.image);
      if (node?.['@type'] === 'ImageObject' && (node.url || node.contentUrl)) {
        jsonLdImages.push(node.url || node.contentUrl);
      }
    }

    const domImageNodes = Array.from(document.querySelectorAll(
      'img[data-old-hires], img[data-zoom-image], img[data-high-res-src], img[data-src], img[data-lazy-src], img[srcset], img[data-srcset], #altImages img, #imageBlock img, [data-testid*="gallery" i] img, [data-testid*="thumbnail" i] img, [data-testid*="product-image" i] img, picture source[srcset], picture img, .product-gallery img, [class*="thumbnail" i] img, [class*="gallery" i] img, [class*="image" i] img'
    ));
    const domImages: string[] = [];
    for (const node of domImageNodes) {
      const srcset = node.getAttribute?.('srcset') || node.getAttribute?.('data-srcset');
      if (srcset) {
        for (const entry of srcset.split(',')) {
          const candidate = entry.trim().split(/\s+/)[0];
          if (candidate) domImages.push(candidate);
        }
      }
      for (const attr of ['data-old-hires', 'data-zoom-image', 'data-high-res-src', 'data-src', 'data-lazy-src', 'src']) {
        const val = node.getAttribute?.(attr);
        if (val) domImages.push(val);
      }
    }

    /* GALERIE JSON UNIVERSELLE (fix 24/09/2026 — Kiabi 2/2 au lieu de N) :
     * l'ancienne liste d'autorisation (ztat/media-amazon/shein/zara/asos)
     * jetait les galeries JSON de TOUS LES AUTRES marchands (Kiabi…). Le DOM
     * statique ne contient souvent que les 2 premières slides — le reste vit
     * dans le JSON embarqué. On accepte donc TOUTES les URLs d'images des
     * scripts JSON, filtrées par une liste de REJET du bruit (icônes, logos,
     * bannières, pixels de tracking, placeholders). */
    const scriptImages: string[] = [];
    const JSON_IMAGE_NOISE = /sprite|logo|icone?|icon|banner|banniere|paiement|payment|paypal|visa|mastercard|flag|picto|badge|newsletter|favicon|placeholder|tracking|pixel|avatar|emoji|loader|spinner|arrow|chevron|social|facebook|instagram|tiktok|pinterest|youtube|twitter|breadcrumb|livraison|delivery\.(?:jpe?g|png|webp)/i;
    for (const node of Array.from(document.querySelectorAll('script#__NEXT_DATA__, script[type="application/json"]'))) {
      const textContent = node.textContent || '';
      if (!textContent || textContent.length > 2_000_000) continue;
      const urls = textContent.match(/https?:\/\/[^"'\s\\]+\.(?:jpe?g|png|webp)(?:\?[^"'\s\\]*)?/gi) || [];
      for (const u of urls) {
        const file = (u.split('?')[0].split('/').pop()) || u;
        if (!JSON_IMAGE_NOISE.test(file)) scriptImages.push(u);
      }
    }

    const imageCandidates: unknown[] = [
      meta('meta[property="og:image"]'),
      meta('meta[name="twitter:image"]'),
      productLd?.image,
      ...jsonLdImages,
      embeddedProduct?.featured_image,
      embeddedProduct?.featuredImage,
      embeddedProduct?.images,
      ...scriptImages,
      ...domImages,
    ];
    const images = absoluteImages(imageCandidates, baseUrl);

    // IMAGES PAR COULEUR (fix 24/09/2026 — référence Zalando) : on regroupe les
    // photos par variante de couleur à partir des données embarquées du marchand
    // (Shopify & co : variant.featured_image, images[].variant_ids). On ne devine
    // JAMAIS une image de couleur à partir de son index — sans donnée réelle, le
    // seau reste vide et l'interface retombe sur la galerie complète.
    const colorBuckets: Record<string, string[]> = {};
    const bucket = (colorRaw: unknown, urlRaw: unknown) => {
      const color = cleanLabel(colorRaw).toLocaleLowerCase();
      const value = String(typeof urlRaw === 'object' && urlRaw ? (urlRaw as any).src ?? (urlRaw as any).url : urlRaw ?? '').trim();
      if (!color || !value) return;
      (colorBuckets[color] ??= []).push(value);
    };
    if (embeddedProduct) {
      const optionNamesEmbedded = optionNames(embeddedProduct);
      const colorOfVariant = (variant: any): string => {
        const values = rawVariantValues(variant);
        let color = '';
        values.forEach((value, index) => {
          if (COLOR_NAME.test(optionNamesEmbedded[index] || '')) color = value;
          // Unnamed options might be storage, finish, material or another dimension.
          // They are not evidence of a color/image association.
        });
        return color;
      };
      for (const variant of Array.isArray(embeddedProduct.variants) ? embeddedProduct.variants.slice(0, 300) : []) {
        bucket(colorOfVariant(variant), variant?.featured_image ?? variant?.featuredImage);
      }
      if (Array.isArray(embeddedProduct.images)) {
        const variantById = new Map<string, any>(
          (Array.isArray(embeddedProduct.variants) ? embeddedProduct.variants : []).map((variant: any) => [String(variant?.id), variant]),
        );
        for (const image of embeddedProduct.images.slice(0, 120)) {
          if (!image || typeof image === 'string') continue;
          for (const variantId of Array.isArray(image.variant_ids) ? image.variant_ids.slice(0, 20) : []) {
            bucket(colorOfVariant(variantById.get(String(variantId))), image.src ?? image.url ?? image.source);
          }
        }
      }
    }
    const colorImages: Record<string, string[]> = {};
    for (const [color, urls] of Object.entries(colorBuckets)) {
      const absolute = absoluteImages(urls, baseUrl);
      if (absolute.length) colorImages[color] = absolute;
    }
    // Une seule couleur réelle → TOUTES les photos appartiennent à cette couleur.
    if (colors.length === 1 && images.length) {
      const only = colors[0].toLocaleLowerCase();
      colorImages[only] = [...new Set([...(colorImages[only] || []), ...images])].slice(0, 48);
    }

    return {
      title,
      brand: brand || undefined,
      description: description || undefined,
      price,
      currency,
      referencePrice,
      rating,
      reviewsCount: Number.isSafeInteger(reviewsCount) && reviewsCount >= 0 ? reviewsCount : null,
      images,
      colorImages,
      externalId: String(productLd?.sku || productLd?.productID || embeddedProduct?.id || embeddedProduct?.sku || ''),
      variants: { sizes, colors, details, groups },
      availability: availabilityFrom(productLd, embeddedProduct),
      priceSource,
    };
  } finally {
    dom.window.close();
  }
}
