import { JSDOM, VirtualConsole } from 'jsdom';
import type { ProductVariantDetail, ProductVariants, StoreType } from '../types';

export interface ParsedProductPage {
  title: string;
  price: number;
  currency: string;
  images: string[];
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

function looksLikeSize(value: string): boolean {
  return /^(?:XXS|XS|S|M|L|XL|XXL|XXXL|[2-5]?XL|ONE SIZE|TU)$/i.test(value)
    || /^(?:[0-9]{1,3}(?:[.,][0-9])?)(?:\s*(?:EU|US|UK|FR|IT|CM))?$/i.test(value)
    || /^(?:EU|US|UK)\s*[0-9]{1,3}(?:[.,][0-9])?$/i.test(value);
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
    if (!variant || variant.available === false || variant.inStock === false || variant.isInStock === false) continue;
    const values = rawVariantValues(variant);
    if (!values.length) continue;
    let size: string | null = null;
    let color: string | null = null;
    values.forEach((value, index) => {
      const name = names[index] || '';
      if (SIZE_NAME.test(name)) size = value;
      else if (COLOR_NAME.test(name)) color = value;
      else if (!size && looksLikeSize(value)) size = value;
      else if (!color && values.length > 1) color = value;
    });
    if (!size && !color && values.length === 1 && !PLACEHOLDER.test(values[0])) {
      if (looksLikeSize(values[0])) size = values[0];
      else color = values[0];
    }
    if (!size && !color) continue;
    const price = variantPrice(variant);
    details.push({
      id: String(variant.id ?? variant.sku ?? '').trim() || null,
      label: unique([size, color], 2).join(' · ') || values.join(' · '),
      size,
      color,
      available: true,
      price: price || null,
    });
  }
  const seen = new Set<string>();
  return details.filter((detail) => {
    const key = `${detail.size || ''}|${detail.color || ''}|${detail.price || ''}`.toLowerCase();
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
  const output: string[] = [];
  const seen = new Set<string>();
  let base: URL | null = null;
  try { base = new URL(baseUrl); } catch { base = null; }
  for (const raw of values.flatMap((value: any) => Array.isArray(value) ? value : [value])) {
    const candidate = typeof raw === 'object' ? raw?.url ?? raw?.src ?? raw?.contentUrl : raw;
    // An empty candidate must never resolve to the page URL itself.
    const value = String(candidate ?? '').trim();
    if (!value) continue;
    try {
      const url = new URL(value, baseUrl);
      const normalized = url.toString();
      if (!['http:', 'https:'].includes(url.protocol) || seen.has(normalized)) continue;
      // The product page (or any HTML document) is not a product image.
      if (base && url.hostname === base.hostname && url.pathname === base.pathname) continue;
      if (/\.(html?|xhtml|php|aspx?|jsp|cfm)$/i.test(url.pathname)) continue;
      seen.add(normalized);
      output.push(normalized);
      if (output.length >= 8) break;
    } catch { /* invalid merchant image */ }
  }
  return output;
}

function availabilityFrom(productLd: any, details: ProductVariantDetail[]): ParsedProductPage['availability'] {
  if (details.length) return 'in_stock';
  const offers = Array.isArray(productLd?.offers) ? productLd.offers : [productLd?.offers];
  const availability = offers.map((offer: any) => String(offer?.availability || '')).join(' ').toLowerCase();
  if (availability.includes('outofstock')) return 'out_of_stock';
  if (availability.includes('limitedavailability')) return 'limited';
  if (availability.includes('instock')) return 'in_stock';
  return 'unknown';
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

    let title = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]')
      || text('#productTitle, h1.product-title-word-break, h1, [class*="product-intro__name"], [class*="goods-name"]')
      || String(productLd?.name || embeddedProduct?.title || embeddedProduct?.name || document.title || '');
    title = title.replace(/\s*\|\s*(SHEIN|Amazon|TEMU|AliExpress).*$/i, '')
      .replace(/\s*:\s*Amazon\.[a-z.]+/i, '').trim();

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
      'select[name*="color" i] option, select[name*="colour" i] option, select[name*="couleur" i] option, #variation_color_name option, [data-testid*="color" i] button',
    )).filter((node: any) => !node.disabled && !UNAVAILABLE.test(node.textContent || ''))
      .map((node: any) => cleanLabel(node.getAttribute?.('data-value') || node.getAttribute?.('aria-label') || node.value || node.textContent));

    const namedSizes: string[] = [];
    const namedColors: string[] = [];
    collectNamedStrings(productLd, /^(?:size|sizes)$/i, namedSizes);
    collectNamedStrings(productLd, /^(?:color|colour)$/i, namedColors);
    for (const productState of embeddedProducts.slice(0, 12)) {
      collectNamedStrings(productState, /^(?:size|sizes|taille|tailles|pointure|pointures)$/i, namedSizes);
      collectNamedStrings(productState, /^(?:color|colour|couleur|couleurs)$/i, namedColors);
    }

    const sizes = unique([...details.map((detail) => detail.size), ...namedSizes, ...domSizes].filter((value) => !value || looksLikeSize(value)), 40);
    const colors = unique([...details.map((detail) => detail.color), ...namedColors, ...domColors], 20);
    if (colors.length === 1) {
      for (const detail of details) if (!detail.color) detail.color = colors[0];
    }

    const imageCandidates: unknown[] = [
      meta('meta[property="og:image"]'), meta('meta[name="twitter:image"]'), productLd?.image,
      embeddedProduct?.featured_image, embeddedProduct?.featuredImage, embeddedProduct?.images,
      document.querySelector('#landingImage, #main-image, img[data-old-hires], img[class*="main-img"]')?.getAttribute('data-old-hires') || '',
      document.querySelector('#landingImage, #main-image, img[class*="main-img"]')?.getAttribute('src') || '',
    ];
    const images = absoluteImages(imageCandidates, baseUrl);

    return {
      title,
      price,
      currency,
      images,
      externalId: String(productLd?.sku || productLd?.productID || embeddedProduct?.id || embeddedProduct?.sku || ''),
      variants: { sizes, colors, details },
      availability: availabilityFrom(productLd, details),
      priceSource,
    };
  } finally {
    dom.window.close();
  }
}
