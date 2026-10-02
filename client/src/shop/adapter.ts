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
import { classifyProduct, extractCapacity, presentSizes, usesCapacity } from '../ayrovix/services/productAttributes';
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
  const states = new Set(options.map((option) => option.availability === 'available' || option.availability === 'unavailable' ? option.availability : 'unknown'));
  return states.size === 1 ? [...states][0] : 'unknown';
}

function priceOf(
  priceTnd: number | null | undefined,
  promo: { percent: number; priceTnd: number; originalPriceTnd: number } | null | undefined,
  source: { amount: number | null; currency: string | null } | null,
  verified: boolean,
  /** Prix barré DU MARCHAND, déjà passé par le calculateur (02/10/2026). */
  merchantOriginal?: { tnd: number | null | undefined; amount: number | null | undefined } | null,
): PriceView | null {
  const current = promo?.priceTnd ?? priceTnd;
  if (!Number.isFinite(current as number) || (current as number) <= 0) return null;
  const sourceMoney = source && Number.isFinite(source.amount as number) && source.currency
    ? { amount: source.amount as number, currency: source.currency }
    : null;
  /*
   * Deux remises possibles, jamais additionnées ni confondues :
   *  • la promo AYROVI du jour (serveur) — prioritaire, car c'est notre prix ;
   *  • sinon la remise que le marchand affiche lui-même (prix barré de sa page).
   */
  const promoReference = promo && promo.originalPriceTnd > promo.priceTnd ? { tnd: promo.originalPriceTnd } : null;
  const merchantTnd = merchantOriginal?.tnd;
  const merchantReference = !promoReference && Number.isFinite(merchantTnd as number) && (merchantTnd as number) > (current as number)
    ? { tnd: merchantTnd as number }
    : null;
  const merchantPercent = merchantReference && source?.amount && merchantOriginal?.amount && merchantOriginal.amount > source.amount
    ? Math.round((1 - source.amount / merchantOriginal.amount) * 100)
    : null;
  return {
    current: { tnd: current as number, source: sourceMoney },
    reference: promoReference ?? merchantReference,
    discountPercent: promo && Number.isFinite(promo.percent) && promo.percent > 0 ? Math.round(promo.percent)
      : merchantPercent && merchantPercent > 0 ? merchantPercent : null,
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
      candidate.priceOrigin === 'merchant' || candidate.priceVerificationStatus === 'VERIFIED',
      { tnd: candidate.originalPriceTnd, amount: candidate.originalPrice },
    ),
    sizes: [],
    sizeScaleLabel: null,
    sizeKind: 'none',
    optionLabel: null,
    capacity: null,
    // Search snippets have no trustworthy stock timestamp; only the opened source page can confirm availability.
    availability: 'unknown',
    availabilitySource: candidate.source || null,
    availabilityCheckedAt: null,
    availabilityExpiresAt: null,
    colors: [],
    flags: candidate.promo ? [{ kind: 'deal', label: candidate.promo.label || 'Promo' }] : [],
    merchant: candidate.source ? { name: candidate.source, url: candidate.sourceUrl } : null,
  };
}

/** Titre vitrine : on retire le suffixe boutique et la liste de coloris SerpApi. */
export function displayProductTitle(raw: string): string {
  let title = String(raw || '').replace(/\s+/g, ' ').trim();
  title = title.replace(/\s*[-–—]\s*[A-Z0-9.-]+\.[A-Z]{2,}\s*$/i, '');
  const parts = title.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3 && /\//.test(parts[parts.length - 1])) {
    title = parts.slice(0, -1).join(' - ');
  }
  return title.slice(0, 140);
}

/** La fiche complète : mêmes règles, plus les tailles et les couleurs. */
export function productToView(product: AyrovixProduct, activeColor?: string | null): ProductView {
  const options = product.variantOptions || [];

  /*
   * La classe du produit et l'ORDRE des tailles viennent du service partagé :
   * une pointure se lit 40,5 < 42 < 43 et un vêtement S < M < XL. Les trier ici
   * à nouveau, autrement, ferait diverger la fiche du reste du site.
   */
  const productClass = classifyProduct(product.title, product.description);
  const capacityBased = usesCapacity(productClass);
  const presented = presentSizes(productClass, product.title, product.sizes || []);
  const storageOptions = presented.options.filter((value) => /\b\d+(?:[.,]\d+)?\s*(?:gb|go|tb|to)\b/i.test(value));
  const volumeOptions = presented.options.filter((value) => extractCapacity(value) !== null);
  const suppliedLabel = product.optionLabel?.trim() || '';
  const sourceSaysStorage = /stockage|storage|mémoire|memory/i.test(suppliedLabel);
  const sourceSaysVolume = /volume|contenance|capacity/i.test(suppliedLabel);
  /*
   * COMPRÉHENSION PRODUIT (02/10/2026) — l'écran s'adapte à ce qu'EST le produit :
   *   vêtement → Taille · chaussure → Pointure · parfum/soin → Contenance (ml)
   *   électronique → Stockage (Go) ou Modèle · auto/moto/vélo → Référence
   * Les valeurs restent celles que le MARCHAND publie : on choisit le mot et la
   * mise en page, jamais les options. Une option publiée n'est plus jetée parce
   * que la classe n'est ni « vêtement » ni « chaussure ».
   */
  const merchantOptions = presented.options;
  const values = sourceSaysStorage || (productClass === 'electronics' && storageOptions.length)
    ? storageOptions
    : capacityBased || sourceSaysVolume
      ? volumeOptions
      : merchantOptions;
  const optionLabel = suppliedLabel || (capacityBased ? 'Contenance'
    : productClass === 'shoes' ? 'Pointure'
      : productClass === 'clothing' ? 'Taille'
        : storageOptions.length ? 'Stockage' : volumeOptions.length ? 'Volume'
          : productClass === 'vehicle' && values.length ? 'Référence'
            : productClass === 'electronics' && values.length ? 'Modèle'
              : values.length ? 'Option' : null);

  const sizes: SizeOption[] = values.map((value) => {
    const forSize = options.filter((option) => option.size === value && (!activeColor || !option.color || option.color.toLocaleLowerCase() === activeColor.toLocaleLowerCase()));
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
    title: displayProductTitle(product.title),
    description: product.description?.trim() || null,
    /* Keep every image supplied by this product's own merchant page. */
    media: toMedia(gallery, product.title),
    price: priceOf(
      product.priceTnd,
      product.promo ?? null,
      { amount: product.price ?? null, currency: product.currency ?? null },
      product.priceVerificationStatus === 'VERIFIED' || product.priceVerified === true,
      { tnd: product.originalPriceTnd, amount: product.originalPrice },
    ),
    sizes,
    sizeScaleLabel: null,
    sizeKind: capacityBased || sourceSaysVolume ? 'capacity' : productClass === 'shoes' ? 'shoes'
      : sourceSaysStorage || (productClass === 'electronics' && storageOptions.length) ? 'storage'
        : (productClass === 'clothing' || productClass === 'accessory') && values.length ? 'clothing'
          : values.length ? 'generic' : 'none',
    optionLabel,
    availability: product.availability === 'in_stock' || product.availability === 'limited' ? 'available' : product.availability === 'out_of_stock' ? 'unavailable' : 'unknown',
    availabilitySource: product.source?.trim() || null,
    availabilityCheckedAt: product.availabilityCheckedAt || null,
    availabilityExpiresAt: product.availabilityExpiresAt || null,
    /* Contenance lue dans le titre quand le marchand n'a listé aucune variante :
       « 10 ml » est une information du produit, pas une supposition. */
    capacity: capacityBased && !sizes.length ? extractCapacity(`${product.title} ${product.description || ''}`)?.label ?? null : null,
    colors: (product.colors || []).map((name) => ({
      name,
      media: toMedia(colorSets?.[name.toLocaleLowerCase()] || [], name)[0] ?? null,
      selected: (activeColor || '').toLocaleLowerCase() === name.toLocaleLowerCase(),
    })),
    flags: product.promo ? [{ kind: 'deal', label: product.promo.label || 'Promo' }] : [],
    merchant: product.source ? { name: product.source, url: product.sourceUrl } : null,
  };
}
