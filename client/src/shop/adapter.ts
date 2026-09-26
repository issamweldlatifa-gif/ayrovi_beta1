/**
 * ADAPTATEUR — l'unique endroit où les données de production deviennent un `ProductView`.
 *
 * Toute la traduction se fait ici, une fois. Les écrans n'ont donc plus à
 * connaître la forme des candidats Lens, des produits scrapés ni des options de
 * variantes : ils reçoivent une vue déjà juste. C'est ce qui empêche trois
 * écrans d'afficher trois vérités différentes du même produit.
 *
 * Deux règles tenues à la lettre :
 *   • ce que la source ne dit pas vaut `null` — jamais une valeur par défaut ;
 *   • aucune donnée n'est déduite (pas de marque devinée depuis un titre, pas de
 *     conversion de taille maison, pas de stock supposé à partir d'un silence).
 */
import type { AyrovixCandidate, AyrovixProduct, AyrovixVariantOption } from '../ayrovix/types';
import { withIsolation } from '../ayrovix/services/mediaIsolation';
import type { MediaView, PriceView, ProductView, SizeOption, StockState } from './types';

function toMedia(urls: (string | null | undefined)[], alt: string): MediaView[] {
  const clean = [...new Set(urls.map((url) => (url || '').trim()).filter(Boolean))];
  return clean.map((url) => {
    const chain = withIsolation([url]);
    return { src: chain[0] ?? url, fallbacks: chain.slice(1), alt };
  });
}

/** Le stock d'une taille : le verdict du moteur, jamais une interprétation. */
function stockOf(options: AyrovixVariantOption[]): StockState {
  if (!options.length) return 'unknown';
  if (options.some((option) => option.availability === 'available')) return 'available';
  if (options.every((option) => option.availability === 'unavailable')) return 'unavailable';
  if (options.every((option) => option.available === false)) return 'unavailable';
  return 'unknown';
}

function priceOf(
  priceTnd: number | null | undefined,
  promo: { percent: number; priceTnd: number; originalPriceTnd: number } | null | undefined,
  source: { amount: number | null; currency: string | null } | null,
  verified: boolean,
): PriceView | null {
  const current = promo?.priceTnd ?? priceTnd;
  if (!Number.isFinite(current as number) || (current as number) <= 0) return null;
  const sourceMoney = source && Number.isFinite(source.amount as number) && source.currency
    ? { amount: source.amount as number, currency: source.currency }
    : null;
  return {
    current: { tnd: current as number, source: sourceMoney },
    reference: promo && promo.originalPriceTnd > promo.priceTnd ? { tnd: promo.originalPriceTnd } : null,
    discountPercent: promo && Number.isFinite(promo.percent) && promo.percent > 0 ? Math.round(promo.percent) : null,
    verifiedAtSource: verified,
  };
}

/** Une carte de résultat : ce que la recherche a réellement rapporté. */
export function candidateToView(candidate: AyrovixCandidate): ProductView {
  const media = toMedia([candidate.image, ...(candidate.images || [])], candidate.title);
  return {
    id: candidate.id,
    brand: candidate.brand?.trim() || null,
    title: candidate.title.trim(),
    description: candidate.description?.trim() || null,
    media,
    price: priceOf(
      candidate.priceTnd,
      candidate.promo ?? null,
      { amount: candidate.price ?? null, currency: candidate.currency ?? null },
      false,
    ),
    sizes: [],
    sizeScaleLabel: null,
    colors: [],
    flags: candidate.promo ? [{ kind: 'deal', label: candidate.promo.label || 'Promo' }] : [],
    merchant: candidate.source ? { name: candidate.source, url: candidate.sourceUrl } : null,
  };
}

/** La fiche complète : mêmes règles, plus les tailles et les couleurs. */
export function productToView(product: AyrovixProduct, activeColor?: string | null): ProductView {
  const options = product.variantOptions || [];
  const values = [...new Set(product.sizes.map((size) => size.trim()).filter(Boolean))];

  const sizes: SizeOption[] = values.map((value) => {
    const forSize = options.filter((option) => option.size === value);
    const labels = [...new Set(forSize.map((option) => option.label.trim()).filter((label) => label && label !== value))];
    return {
      value,
      brandValue: labels.length === 1 ? labels[0] : null,
      state: stockOf(forSize),
      // Aucune source publique n'expose la quantité restante : le champ reste vide.
      remaining: null,
    };
  });

  const colorSets = product.colorImages && typeof product.colorImages === 'object' ? product.colorImages : null;
  const gallery = activeColor && colorSets?.[activeColor.toLocaleLowerCase()]?.length
    ? colorSets[activeColor.toLocaleLowerCase()]
    : [product.image, ...(product.images || [])];

  return {
    id: product.sourceUrl || product.title,
    brand: product.brand?.trim() || null,
    title: product.title.trim(),
    description: product.description?.trim() || null,
    /* Quatre photos au plus dans le carrousel : au-delà, le client fait défiler
       sans rien apprendre de neuf. Les autres restent dans la fiche produit. */
    media: toMedia(gallery, product.title).slice(0, 4),
    price: priceOf(
      product.priceTnd,
      product.promo ?? null,
      { amount: product.price ?? null, currency: product.currency ?? null },
      product.priceVerificationStatus === 'VERIFIED' || product.priceVerified === true,
    ),
    sizes,
    sizeScaleLabel: null,
    colors: (product.colors || []).map((name) => ({
      name,
      media: toMedia(colorSets?.[name.toLocaleLowerCase()] || [], name)[0] ?? null,
      selected: (activeColor || '').toLocaleLowerCase() === name.toLocaleLowerCase(),
    })),
    flags: product.promo ? [{ kind: 'deal', label: product.promo.label || 'Promo' }] : [],
    merchant: product.source ? { name: product.source, url: product.sourceUrl } : null,
  };
}
