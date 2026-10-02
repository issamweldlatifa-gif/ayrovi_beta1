import React, { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import type { AyrovixProduct } from '../ayrovix/types';
import { completeProductOffer, productSelectionLabels, resolveProductSelection } from '../ayrovix/services/productSelection';
import { refreshLiveStock } from '../ayrovix/services/lensApi';
import type { AyrovixVariantOption } from '../ayrovix/types';
import { ProductPage } from './ProductPage';
import { productToView } from './adapter';
import type { SizeOption } from './types';

/**
 * CONTENEUR DE LA FICHE v2 — le seul endroit qui relie l'écran aux données.
 *
 * L'écran `ProductPage` est volontairement muet : il affiche un `ProductView` et
 * appelle des actions. Tout ce qui parle au serveur vit ici — le devis de prix,
 * la couleur active, l'ajout au panier. Cette séparation est ce qui rend l'écran
 * testable sans réseau et remplaçable sans toucher à la logique commerciale.
 *
 * Il expose la MÊME interface que l'ancienne fiche, pour que les trois endroits
 * qui l'affichent (Lens, tiroir produit, assistant) basculent sans rien changer
 * d'autre — et pour qu'un retour arrière reste possible en une ligne.
 */
export interface ShopProductScreenProps {
  /** Suivi du produit (alerte). Fourni par l'hôte quand le service existe. */
  onNotify?: () => void;
  /** Mise de côté. Fourni par l'hôte quand la liste d'envies existe. */
  onFavorite?: () => void;
  favorite?: boolean;
  product: AyrovixProduct;
  ordering?: boolean;
  priceVerified?: boolean;
  onOrder: (selection: {
    size: string;
    color: string;
    option: any;
    quantity: number;
    customerNote: string;
    /** Nom exact du contrat de commande existant : `manualUrl`, pas autre chose. */
    manualUrl: string;
  }) => void | Promise<void>;
  onBack?: () => void;
  onCalculateAnother?: () => void;
  onOpenCart?: () => void;
  onHydrated?: (product: AyrovixProduct) => void;
}

interface CartLineQuote {
  lineTotalTND: number;
  originalLineTotalTND: number | null;
  promo: { percent: number; label: string; discountTND: number } | null;
}

export const ShopProductScreen: React.FC<ShopProductScreenProps> = ({
  product, ordering = false, priceVerified = false, onOrder, onBack, onOpenCart, onCalculateAnother,
  onNotify, onFavorite, favorite = false, onHydrated,
}) => {
  const { tr, direction, formatMoney } = useLocale();
  const alreadyReady = Boolean(
    product.sourceUrl
    && (product.sizes?.length || product.colors?.length)
    && Number(product.price) > 0
    && product.availability
    && product.availability !== 'unknown',
  );
  const [liveProduct, setLiveProduct] = useState(product);
  const [sourceReading, setSourceReading] = useState(Boolean(product.sourceUrl) && !alreadyReady);
  const [activeColor, setActiveColor] = useState<string | null>(() => product.colors.length === 1 ? product.colors[0] : null);
  const [chosenSize, setChosenSize] = useState('');
  const [quote, setQuote] = useState<CartLineQuote | null>(() => (
    typeof product.priceTnd === 'number' && product.priceTnd > 0
      ? {
          lineTotalTND: product.priceTnd,
          originalLineTotalTND: product.originalPriceTnd ?? null,
          promo: product.promo && product.promo.percent
            ? { percent: product.promo.percent, label: product.promo.label, discountTND: 0 }
            : null,
        }
      : null
  ));
  const [quoteLoading, setQuoteLoading] = useState(false);
  const selection = useMemo(() => resolveProductSelection(liveProduct, chosenSize, activeColor ?? ''), [liveProduct, chosenSize, activeColor]);
  const selectedSource = selection.kind === 'matched' && selection.offer.fromVariant && selection.offer.price && selection.offer.currency
    ? { amount: selection.offer.price, currency: selection.offer.currency }
    : Number.isFinite(liveProduct.price as number) && (liveProduct.price as number) > 0 && liveProduct.currency
      ? { amount: liveProduct.price as number, currency: liveProduct.currency }
      : null;
  const selectionBlocked = selection.kind === 'matched' && selection.offer.fromVariant && !completeProductOffer(selection.offer);
  const selectionNotice = !(chosenSize || activeColor) ? null
    : selection.kind === 'ambiguous' ? { text: tr(...productSelectionLabels.ambiguous), alert: false }
    : selectionBlocked ? { text: tr(...productSelectionLabels.incomplete), alert: true }
    : selection.generalEstimate ? { text: tr(...productSelectionLabels.general), alert: false }
    : null;

  useEffect(() => {
    setActiveColor(product.colors.length === 1 ? product.colors[0] : null);
    setChosenSize('');
  }, [liveProduct.sourceUrl]);


  useEffect(() => {
    setLiveProduct(product);
  }, [product.sourceUrl]);

  useEffect(() => {
    const url = product.sourceUrl?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      setSourceReading(false);
      return;
    }
    if (alreadyReady) {
      setSourceReading(false);
      return;
    }
    const controller = new AbortController();
    setSourceReading(true);
    refreshLiveStock([url], controller.signal, product.title)
      .then((rows) => {
        const live = rows.find((row) => row.url === url) || rows[0];
        if (!live || controller.signal.aborted) return;
        const variantOptions: AyrovixVariantOption[] = (live.variants || []).map((variant, index) => ({
          id: `${variant.value}-${variant.color || index}`,
          label: variant.color ? `${variant.value} · ${variant.color}` : variant.value,
          size: variant.value,
          color: variant.color,
          available: variant.availability !== 'unavailable',
          availability: variant.availability,
          price: live.price,
          currency: live.currency,
          priceTnd: live.priceTnd,
          priceToken: live.priceToken || null,
        }));
        const expires = Number.isFinite(Date.parse(live.checkedAt))
          ? new Date(Date.parse(live.checkedAt) + 6 * 60 * 60 * 1000).toISOString()
          : null;
        setLiveProduct((current) => {
          const next = {
          ...current,
          sizes: live.sizes.length ? live.sizes : current.sizes,
          colors: live.colors.length ? live.colors : current.colors,
          images: live.images.length ? live.images : current.images,
          image: live.images[0] || current.image,
          price: live.price ?? current.price,
          currency: live.currency ?? current.currency,
          priceTnd: live.priceTnd ?? current.priceTnd,
          originalPrice: live.originalPrice ?? current.originalPrice,
          originalPriceTnd: live.originalPriceTnd ?? current.originalPriceTnd,
          availability: live.availability || current.availability,
          availabilityCheckedAt: live.checkedAt || current.availabilityCheckedAt,
          availabilityExpiresAt: expires || current.availabilityExpiresAt,
          priceVerified: Boolean(live.price) || current.priceVerified,
          priceVerificationStatus: (live.price ? 'VERIFIED' : current.priceVerificationStatus) as AyrovixProduct['priceVerificationStatus'],
          priceToken: live.priceToken || current.priceToken,
          variantOptions: variantOptions.length ? variantOptions : current.variantOptions,
          description: /v[ée]rification manuelle/i.test(current.description || '') ? '' : current.description,
          };
          onHydrated?.(next);
          return next;
        });
      })
      .catch(() => { /* la fiche reste sur les données Lens ; pas de mensonge stock */ })
      .finally(() => { if (!controller.signal.aborted) setSourceReading(false); });
    return () => controller.abort();
  }, [product.sourceUrl]);

  const quoteKey = `${liveProduct.sourceUrl}|${selectedSource?.amount ?? ''}|${selectedSource?.currency ?? ''}`;

  /*
   * Le prix affiché vient du serveur, jamais d'un calcul dans l'écran : droits,
   * TVA et taux changent sans redéploiement du client. Tant que la réponse n'est
   * pas là, l'écran dit qu'il vérifie — « à confirmer » serait annoncer un échec
   * qui n'a pas eu lieu.
   */
  useEffect(() => {
    const source = selectedSource;
    if (!source || !Number.isFinite(source.amount) || source.amount <= 0) return;
    const price = source.amount;
    const controller = new AbortController();
    setQuoteLoading(true);
    fetch('/api/public/pricing/cart-line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: liveProduct.title, sourcePrice: price, sourceCurrency: source.currency, quantity: 1 }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload?.success !== true || !Number.isFinite(payload?.data?.lineTotalTND)) {
          throw new Error('QUOTE_UNAVAILABLE');
        }
        return payload.data as CartLineQuote;
      })
      .then((data) => { if (!controller.signal.aborted) setQuote(data); })
      .catch(() => { /* l'écran affichera « prix à confirmer » — jamais un montant inventé */ })
      .finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); });
    return () => controller.abort();
  }, [quoteKey, liveProduct.title]);

  /* Un prix marchand brut n'est pas un prix de vente : il ignore droits, TVA et
     frais. Tant que le devis serveur n'est pas là, l'écran n'affiche AUCUN
     montant — « prix à confirmer » — et l'ajout au panier reste fermé. Afficher
     un chiffre puis le corriger après le clic serait une promesse trahie. */
  const quotable = Boolean(selectedSource);
  const awaitingQuote = quotable && !quote;

  const view = useMemo(() => {
    const base = productToView(liveProduct, activeColor);
    if (!quote) return { ...base, price: quotable ? null : base.price };
    // Le devis serveur remplace le prix brut : un seul montant fait autorité.
    return {
      ...base,
      price: {
        current: {
          tnd: quote.lineTotalTND,
          source: selectedSource,
        },
        reference: quote.originalLineTotalTND && quote.originalLineTotalTND > quote.lineTotalTND
          ? { tnd: quote.originalLineTotalTND }
          : null,
        discountPercent: quote.promo?.percent ? Math.round(quote.promo.percent) : null,
        verifiedAtSource: priceVerified || liveProduct.priceVerificationStatus === 'VERIFIED',
      },
    };
  }, [liveProduct, activeColor, quote, priceVerified, quotable]);

  const addToBag = async (size: SizeOption | null, quantity: number, details: { note: string; link: string }) => {
    if (ordering) return;
    await onOrder({
      size: size?.value ?? '',
      color: activeColor ?? '',
      option: null,
      quantity: Math.max(1, Math.round(quantity)),
      customerNote: details.note,
      // Lien fourni par le client : transmis tel quel sous le nom que le contrat
      // de commande attend. Sous un autre nom, il serait silencieusement perdu.
      // Un champ vidé par le client ne doit pas produire une ligne de panier sans
      // adresse : on retombe sur le lien marchand connu, comme l'ancienne fiche.
      manualUrl: details.link.trim() || liveProduct.sourceUrl || '',
    });
  };

  return (
    <ProductPage
      product={view}
      tr={tr}
      formatMoney={formatMoney}
      direction={direction === 'rtl' ? 'rtl' : 'ltr'}
      priceChecking={!quote && (quoteLoading || sourceReading)}
      canAdd={!awaitingQuote}
      onChosenSize={setChosenSize}
      selectionNotice={selectionNotice}
      onCalculateAnother={onCalculateAnother}
      defaultLink={liveProduct.sourceUrl || ''}
      actions={{
        onBack,
        onOpenBag: onOpenCart,
        onAddToBag: addToBag,
        onSelectColor: setActiveColor,
        onNotify,
        onFavorite,
        favorite,
        /*
         * Partage : le lien marchand est déjà public, aucune donnée du client
         * ne circule. On passe par le partage natif du téléphone quand il
         * existe, sinon par le presse-papiers — jamais un bouton qui ne fait rien.
         */
        onShare: liveProduct.sourceUrl
          ? () => {
              const payload = { title: liveProduct.title, url: liveProduct.sourceUrl };
              const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
              if (share) void share.call(navigator, payload).catch(() => undefined);
              else void navigator.clipboard?.writeText(liveProduct.sourceUrl).catch(() => undefined);
            }
          : undefined,
      }}
    />
  );
};
