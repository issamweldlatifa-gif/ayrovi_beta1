import React, { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import type { AyrovixProduct } from '../ayrovix/types';
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
  product: AyrovixProduct;
  ordering?: boolean;
  priceVerified?: boolean;
  onOrder: (selection: {
    size: string;
    color: string;
    option: unknown;
    quantity: number;
    customerNote: string;
    /** Nom exact du contrat de commande existant : `manualUrl`, pas autre chose. */
    manualUrl: string;
  }) => void | Promise<void>;
  onBack?: () => void;
  onCalculateAnother?: () => void;
  onOpenCart?: () => void;
}

interface CartLineQuote {
  lineTotalTND: number;
  originalLineTotalTND: number | null;
  promo: { percent: number; label: string; discountTND: number } | null;
}

export const ShopProductScreen: React.FC<ShopProductScreenProps> = ({
  product, ordering = false, priceVerified = false, onOrder, onBack, onOpenCart, onCalculateAnother,
}) => {
  const { tr, direction, formatMoney } = useLocale();
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [quote, setQuote] = useState<CartLineQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const quoteKey = `${product.sourceUrl}|${product.price ?? ''}|${product.currency ?? ''}`;

  /*
   * Le prix affiché vient du serveur, jamais d'un calcul dans l'écran : droits,
   * TVA et taux changent sans redéploiement du client. Tant que la réponse n'est
   * pas là, l'écran dit qu'il vérifie — « à confirmer » serait annoncer un échec
   * qui n'a pas eu lieu.
   */
  useEffect(() => {
    const price = product.price;
    if (!Number.isFinite(price as number) || (price as number) <= 0 || !product.currency) return;
    const controller = new AbortController();
    setQuote(null);
    setQuoteLoading(true);
    fetch('/api/public/pricing/cart-line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: product.title, sourcePrice: price, sourceCurrency: product.currency, quantity: 1 }),
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
  }, [quoteKey, product.title, product.price, product.currency]);

  /* Un prix marchand brut n'est pas un prix de vente : il ignore droits, TVA et
     frais. Tant que le devis serveur n'est pas là, l'écran n'affiche AUCUN
     montant — « prix à confirmer » — et l'ajout au panier reste fermé. Afficher
     un chiffre puis le corriger après le clic serait une promesse trahie. */
  const quotable = Number.isFinite(product.price as number) && (product.price as number) > 0 && Boolean(product.currency);
  const awaitingQuote = quotable && !quote;

  const view = useMemo(() => {
    const base = productToView(product, activeColor);
    if (!quote) return { ...base, price: quotable ? null : base.price };
    // Le devis serveur remplace le prix brut : un seul montant fait autorité.
    return {
      ...base,
      price: {
        current: {
          tnd: quote.lineTotalTND,
          source: product.price && product.currency ? { amount: product.price, currency: product.currency } : null,
        },
        reference: quote.originalLineTotalTND && quote.originalLineTotalTND > quote.lineTotalTND
          ? { tnd: quote.originalLineTotalTND }
          : null,
        discountPercent: quote.promo?.percent ? Math.round(quote.promo.percent) : null,
        verifiedAtSource: priceVerified || product.priceVerificationStatus === 'VERIFIED',
      },
    };
  }, [product, activeColor, quote, priceVerified, quotable]);

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
      manualUrl: details.link.trim() || product.sourceUrl || '',
    });
  };

  return (
    <ProductPage
      product={view}
      tr={tr}
      formatMoney={formatMoney}
      direction={direction === 'rtl' ? 'rtl' : 'ltr'}
      priceChecking={quoteLoading}
      canAdd={!awaitingQuote}
      onCalculateAnother={onCalculateAnother}
      defaultLink={product.sourceUrl || ''}
      actions={{ onBack, onOpenBag: onOpenCart, onAddToBag: addToBag, onSelectColor: setActiveColor }}
    />
  );
};
