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
  options: ReadonlyArray<{ attributes: Record<string, string>; sourceVariantId: string }>;
}

const ASIN_SHAPE = /^[A-Z0-9]{10}$/i;
const SHEIN_VARIANT_ID_SHAPE = /^(?:shein:|SHEIN-)(\d{5,16})$/i;
const SHEIN_HOST_SHAPE = /(?:^|\.)shein\.(?:com|co\.uk|fr|de|es|it|ca|com\.mx|com\.br)$/i;
const AE_VARIANT_ID_SHAPE = /^(?:ae:|AE-)(\d{5,24})$/i;
const AE_HOST_SHAPE = /(?:^|\.)aliexpress\.(?:com|us|ru)$/i;

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

export function variantPageUrlFor(input: VariantPageInput): string | null {
  const chosen = Object.keys(input.selection);
  if (!chosen.length) return null;

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
      let hits = 0;
      for (const name of chosen) {
        const published = Object.entries(option.attributes || {})
          .find(([key]) => lower(key) === lower(name));
        if (published && lower(published[1]) === lower(input.selection[name])) hits += 1;
      }
      const goodsId = SHEIN_VARIANT_ID_SHAPE.exec(String(option.sourceVariantId || '').trim())?.[1] ?? '';
      return { hits, goodsId };
    }).filter((entry) => entry.hits > 0 && entry.goodsId && entry.goodsId !== pageGoodsId);
    coveredShein.sort((a, b) => b.hits - a.hits);
    const bestShein = coveredShein[0];
    if (!bestShein) return null;
    const protocol = parsedUrl.protocol === 'http:' ? 'http:' : 'https:';
    return `${protocol}//${parsedUrl.host}/-p-${bestShein.goodsId}.html`;
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

  const pageAsin = /\/dp\/([A-Z0-9]{10})/i.exec(input.sourceUrl)?.[1]?.toUpperCase() ?? null;

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
    const asin = ASIN_SHAPE.test(option.sourceVariantId) ? option.sourceVariantId.toUpperCase() : '';
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
