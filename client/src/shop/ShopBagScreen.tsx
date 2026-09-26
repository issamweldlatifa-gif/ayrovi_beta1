import React, { useEffect } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useCommercePolicy } from '../commerce/useCommercePolicy';
import { availableAtCheckout } from '../commerce/paymentMethods';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { withIsolation } from '../ayrovix/services/mediaIsolation';
import type { CartItem } from '../types';
import { BagPage, type BagLine, type PolicyState } from './BagPage';
import type { StockState } from './types';

/**
 * CONTENEUR DU PANIER v2 — il relie l'écran aux données et aux conditions.
 *
 * L'écran `BagPage` est muet : il affiche des lignes et appelle des actions.
 * Ici vivent les trois choses qui engagent l'entreprise :
 *
 *  • les CONDITIONS COMMERCIALES du serveur (acompte, délais, remboursement).
 *    Tant qu'elles ne sont pas confirmées, « Commander » reste inactif : un
 *    acompte deviné serait une somme que le client n'a jamais acceptée ;
 *  • les MOYENS DE PAIEMENT réellement encaissables, lus à la source unique ;
 *  • le VERROU DE STOCK : une ligne en rupture constatée bloque la commande.
 *
 * Il expose la même interface que l'ancien tiroir, pour que la bascule ne
 * demande aucun changement ailleurs.
 */
export interface ShopBagScreenProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  totalTND: number;
  deliveryTND?: number;
  loadError?: boolean;
  onRetry?: () => void;
  onUpdateQuantity: (id: string, newQty: number) => void;
  onRemoveItem: (id: string) => void;
  onProceedToCheckout: () => void;
  onCalculateAnotherProduct: () => void;
}

function stockOf(item: CartItem): StockState {
  const raw = (item as unknown as { availability?: string }).availability;
  if (raw === 'out_of_stock' || raw === 'unavailable') return 'unavailable';
  if (raw === 'in_stock' || raw === 'available') return 'available';
  // Le panier ne devine pas : sans information, la ligne n'est ni bloquée ni promue.
  return 'unknown';
}

export const ShopBagScreen: React.FC<ShopBagScreenProps> = ({
  isOpen, onClose, items, totalTND, deliveryTND = 0, loadError = false,
  onRetry, onUpdateQuantity, onRemoveItem, onProceedToCheckout,
}) => {
  const { tr, direction, formatMoney } = useLocale();
  const commerce = useCommercePolicy(isOpen);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const deposit = commerce.policy?.deposit;
  const depositAmount = deposit ? Math.round(totalTND * (deposit.percent / 100) * 1000) / 1000 : 0;

  const policy: PolicyState = commerce.status === 'ready' && deposit
    ? {
        status: 'ready',
        depositNote: tr(
          `À la commande, acompte de ${deposit.percent}% : ${formatMoney(depositAmount)}.`,
          `عند الطلب، عربون ${deposit.percent}%: ${formatMoney(depositAmount)}.`,
        ),
        details: [deposit.reviewDelay, deposit.unavailableRefundPolicy].filter(Boolean) as string[],
      }
    : commerce.status === 'error'
      ? { status: 'error', onRetry: commerce.retry }
      : { status: 'loading' };

  const lines: BagLine[] = items.map((item) => {
    const chain = withIsolation([item.imageUrl].filter(Boolean) as string[]);
    return {
      id: item.id,
      title: item.title,
      brand: item.store && item.store.toLowerCase() !== 'generic' ? item.store : null,
      variant: [
        item.requestedSize && `${tr('Taille', 'المقاس')} ${item.requestedSize}`,
        item.requestedColor && `${tr('Couleur', 'اللون')} ${item.requestedColor}`,
      ].filter(Boolean).join(' · ') || item.variant,
      quantity: item.quantity,
      media: chain.length ? { src: chain[0], alt: item.title } : null,
      lineTotalTnd: item.lineTotalTND ?? item.priceTND * item.quantity,
      referenceTotalTnd: item.originalLineTotalTND ?? null,
      stock: stockOf(item),
    };
  });

  const marks = commerce.policy
    ? availableAtCheckout(commerce.policy).map((method) => ({
        id: method.id,
        src: method.mark.kind === 'image' ? method.mark.src : undefined,
        label: tr(method.label, method.labelAr),
      }))
    : [];

  return (
    <div className="s-drape" role="dialog" aria-modal="true" aria-label={tr('Panier AYROVI', 'سلة AYROVI')} dir={direction}>
      <button type="button" className="s-drape__backdrop" aria-label={tr('Fermer le panier', 'إغلاق السلة')} onClick={onClose} />
      <div className="s-bag-panel" data-side={direction === 'rtl' ? 'start' : 'end'}>
        <BagPage
          lines={lines}
          subtotalTnd={totalTND - deliveryTND}
          deliveryTnd={deliveryTND}
          totalTnd={totalTND}
          paymentMarks={marks}
          policy={policy}
          loadError={loadError}
          onRetryCart={onRetry}
          tr={tr}
          formatMoney={formatMoney}
          direction={direction === 'rtl' ? 'rtl' : 'ltr'}
          onBack={onClose}
          onChangeQuantity={onUpdateQuantity}
          onRemove={onRemoveItem}
          onCheckout={onProceedToCheckout}
        />
      </div>
    </div>
  );
};
