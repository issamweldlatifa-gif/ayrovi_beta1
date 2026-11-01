/**
 * Adresse de la page du choix (ASIN d'une variante Amazon), si elle n'est pas la page affichée.
 * Fonction pure : pas d'appel réseau, pas d'effet de bord.
 *
 * Le twister Amazon ne publie pas toujours l'ASIN de la COMBINAISON exacte : les
 * pastilles de couleur portent l'ASIN de « cette couleur, à la taille affichée ».
 * Exiger l'égalité parfaite (couleur + taille) rendait toute lecture impossible,
 * et l'ajout d'une autre couleur finissait en `STOCK_UNKNOWN` (23/10/2026).
 * On prend donc, à défaut, la valeur qui couvre le PLUS de dimensions choisies —
 * et on ne lit que SA page, une fois, au moment de l'ajout.
 *
 * Retourne `null` quand aucune relecture n'est nécessaire ou possible :
 *   • boutique autre qu'Amazon ;
 *   • aucun choix fait ;
 *   • aucune option choisie n'a d'ASIN valide ;
 *   • la page affichée est déjà celle du choix ;
 *   • l'URL source est invalide.
 */

export interface VariantPageInput {
  sourceUrl: string;
  storeId: string | null | undefined;
  selection: Record<string, string>;
  options: ReadonlyArray<{ attributes: Record<string, string>; sourceVariantId: string; variantUrl?: string | null }>;
}

const ASIN_SHAPE = /^(?:asin:)?([A-Z0-9]{10})$/i;
const AMAZON_URL_ASIN_SHAPE = /(?:\/dp\/|\/gp\/(?:product|aw\/d)\/|\/product\/|\/d\/[^/]+\/)([A-Z0-9]{10})(?=[/?&#]|$)/i;
const SHEIN_VARIANT_ID_SHAPE = /^(?:shein:|SHEIN-)(\d{5,16})(?::.*)?$/i;
const SHEIN_HOST_SHAPE = /(?:^|\.)shein\.(?:com|co\.uk|fr|de|es|it|ca|com\.mx|com\.br)$/i;
const AE_VARIANT_ID_SHAPE = /^(?:ae:|AE-)(\d{5,24})$/i;
const AE_HOST_SHAPE = /(?:^|\.)aliexpress\.(?:com|us|ru)$/i;
const MOBILE_HOST_PREFIX = /^(?:www\d*|m\d*|mobile|wap|touch|smile)\./i;

const lower = (value: unknown): string => String(value ?? '').trim().toLowerCase();

function extractSheinGoodsIdFromUrl(rawUrl: string): string | null {
  const qMatch = /[?&](?:goods_id|goodsId|productId)=(\d{5,16})(?:&|$)/i.exec(rawUrl);
  if (qMatch) return qMatch[1];
  const pMatch = /(?:^|[-/])p-(\d{5,16})(?=[-./?&#]|$)/i.exec(rawUrl)
    || /\/p\/(\d{5,16})(?=[-./?&#]|$)/i.exec(rawUrl)
    || /\/product-item-v\d+-(\d{5,16})(?=[-./?&#]|$)/i.exec(rawUrl);
  return pMatch ? pMatch[1] : null;
}

function extractAliExpressItemIdFromUrl(rawUrl: string): string | null {
  const pMatch = /\/(?:item|i)\/(\d{6,20})\.html(?:[/?#]|$)/i.exec(rawUrl)
    || /\/store\/product\/[^/]+\/(?:\d+_)?(\d{6,20})\.html(?:[/?#]|$)/i.exec(rawUrl);
  if (pMatch) return pMatch[1];
  const qMatch = /[?&](?:productId|itemId|item_id)=(\d{6,20})(?:&|$)/i.exec(rawUrl);
  return qMatch ? qMatch[1] : null;
}

function normalizeComparableUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.host.toLowerCase().replace(MOBILE_HOST_PREFIX, '')}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return '';
  }
}

export function variantPageUrlFor(input: VariantPageInput): string | null {
  const chosen = Object.keys(input.selection);
  if (!chosen.length) return null;

  /* 0. Si une option de la matrice porte une `variantUrl` directe différente de la page courante
     SANS contredire un attribut choisi (ex. jamais l'URL de Bleu Marine quand Beige est choisi !),
     on privilégie celle qui couvre le plus de dimensions choisies (SHEIN, Zalando, Amazon…). */
  const scoreOption = (attributes: Record<string, string>) => {
    let hits = 0;
    let contradicts = false;
    for (const [optKey, optVal] of Object.entries(attributes || {})) {
      const pickedKey = chosen.find((name) => lower(name) === lower(optKey));
      if (!pickedKey) continue;
      if (lower(input.selection[pickedKey]) === lower(optVal)) hits += 1;
      else contradicts = true;
    }
    return { hits, contradicts };
  };

  const currentNorm = normalizeComparableUrl(input.sourceUrl);
  const directCandidates = input.options.map((option) => {
    const { hits, contradicts } = scoreOption(option.attributes || {});
    const candidateUrl = typeof option.variantUrl === 'string' && /^https?:\/\//i.test(option.variantUrl)
      ? option.variantUrl.trim()
      : '';
    return { hits, contradicts, candidateUrl };
  }).filter((entry) => entry.hits > 0 && !entry.contradicts && entry.candidateUrl && normalizeComparableUrl(entry.candidateUrl) !== currentNorm);
  if (directCandidates.length > 0) {
    directCandidates.sort((a, b) => b.hits - a.hits);
    return directCandidates[0].candidateUrl;
  }

  if (input.storeId === 'shein') {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(input.sourceUrl);
    } catch {
      return null;
    }
    if (!SHEIN_HOST_SHAPE.test(parsedUrl.hostname)) return null;
    const pageGoodsId = extractSheinGoodsIdFromUrl(input.sourceUrl);
    const coveredShein = input.options.map((option) => {
      const { hits, contradicts } = scoreOption(option.attributes || {});
      const goodsId = SHEIN_VARIANT_ID_SHAPE.exec(String(option.sourceVariantId || '').trim())?.[1] ?? '';
      return { hits, contradicts, goodsId };
    }).filter((entry) => entry.hits > 0 && !entry.contradicts && entry.goodsId && entry.goodsId !== pageGoodsId);
    coveredShein.sort((a, b) => b.hits - a.hits);
    const bestShein = coveredShein[0];
    if (!bestShein) return null;
    const protocol = parsedUrl.protocol === 'http:' ? 'http:' : 'https:';
    const localeMatch = /^\/([a-z]{2}(?:-[a-z]{2})?)\//i.exec(parsedUrl.pathname);
    const localePrefix = localeMatch && localeMatch[1].toLowerCase() !== 'product'
      ? `/${localeMatch[1].toLowerCase()}`
      : '';
    return `${protocol}//${parsedUrl.host}${localePrefix}/-p-${bestShein.goodsId}.html`;
  }

  if (input.storeId === 'aliexpress') {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(input.sourceUrl);
    } catch {
      return null;
    }
    if (!AE_HOST_SHAPE.test(parsedUrl.hostname)) return null;
    const itemId = extractAliExpressItemIdFromUrl(input.sourceUrl);
    if (!itemId) return null;
    const currentSkuId = parsedUrl.searchParams.get('sku_id') || parsedUrl.searchParams.get('skuId') || '';
    const coveredAe = input.options.map((option) => {
      let hits = 0;
      for (const name of chosen) {
        const published = Object.entries(option.attributes || {})
          .find(([key]) => lower(key) === lower(name));
        if (published && lower(published[1]) === lower(input.selection[name])) hits += 1;
      }
      const skuId = AE_VARIANT_ID_SHAPE.exec(String(option.sourceVariantId || '').trim())?.[1] ?? '';
      return { hits, skuId };
    }).filter((entry) => entry.hits > 0 && entry.skuId && entry.skuId !== currentSkuId);
    coveredAe.sort((a, b) => b.hits - a.hits);
    const bestAe = coveredAe[0];
    if (!bestAe) return null;
    const protocol = parsedUrl.protocol === 'http:' ? 'http:' : 'https:';
    return `${protocol}//${parsedUrl.host}/item/${itemId}.html?sku_id=${bestAe.skuId}`;
  }

  if (input.storeId !== 'amazon') return null;

  const pageAsin = AMAZON_URL_ASIN_SHAPE.exec(input.sourceUrl)?.[1]?.toUpperCase() ?? null;

  /* Nombre de dimensions choisies que cette option couvre, avec la MÊME valeur.
     La page COURANTE est écartée des candidates : la relire ne prouverait rien
     de plus, et occuperait la place d'une page qui, elle, montre le choix. */
  const covered = input.options.map((option) => {
    let hits = 0;
    for (const name of chosen) {
      const published = Object.entries(option.attributes || {})
        .find(([key]) => lower(key) === lower(name));
      if (published && lower(published[1]) === lower(input.selection[name])) hits += 1;
    }
    const asinMatch = ASIN_SHAPE.exec(String(option.sourceVariantId || '').trim());
    const asin = asinMatch ? asinMatch[1].toUpperCase() : '';
    return { option, hits, asin };
  }).filter((entry) => entry.hits > 0 && entry.asin && entry.asin !== pageAsin);
  covered.sort((a, b) => b.hits - a.hits);
  const best = covered[0];
  if (!best) return null;
  const asin = best.asin;

  try {
    return `https://${new URL(input.sourceUrl).host}/dp/${asin}`;
  } catch {
    return null;
  }
}
