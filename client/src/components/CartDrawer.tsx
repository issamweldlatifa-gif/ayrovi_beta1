import React, { useEffect } from 'react';
import { Trash2, ArrowRight, Plus, Minus, ChevronDown, ChevronLeft, ShoppingBag } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { CartItem } from '../types';
import { useLocale } from '../i18n/LocaleContext';
import { useCommercePolicy } from '../commerce/useCommercePolicy';
import { validProductUrl } from '../ayrovix/services/resultPolicy';
import { StudioImageFrame, QuietPromoPrice } from '../ayrovix/components/quiet-card';

interface CartDrawerProps {
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

function merchantLabel(item: CartItem, fallback: string): string {
  if (item.store && item.store.toLowerCase() !== 'generic') return item.store.toUpperCase();
  try {
    const host = new URL(item.sourceUrl).hostname.replace(/^www\./, '');
    return host || fallback;
  } catch { return fallback; }
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  totalTND,
  deliveryTND = 0,
  loadError = false,
  onRetry,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
  onCalculateAnotherProduct,
}) => {
  const { tr, direction, formatMoney } = useLocale();
  const commerce = useCommercePolicy(isOpen);
  const depositPolicy = commerce.policy?.deposit;
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);


  const pendingManual = items.some((item) => item.priceVerificationStatus === 'PENDING_MANUAL');
  const estimatedDeposit = Math.round(totalTND * (depositPolicy?.percent ?? 0) / 100 * 1000) / 1000;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" dir={direction} role="dialog" aria-modal="true" aria-label={tr('Panier AYROVI', 'سلة AYROVI')}>
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/40 backdrop-blur-xs transition-opacity"
        aria-label={tr('Fermer le panier', 'إغلاق السلة')}
      />

      <div className={`fixed inset-y-0 max-w-full flex ${direction === 'rtl' ? 'left-0' : 'right-0'}`}>
        <div className={`ayrovix-theme-scope w-screen max-w-lg bg-white shadow-2xl flex flex-col min-h-0 ${direction === 'rtl' ? 'border-r' : 'border-l'} border-line`}>
          
          <header className="flex min-h-16 items-center gap-3 border-b border-line bg-white px-4">
            <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-surface" aria-label={tr('Retour au produit', 'العودة للمنتج')}>
              <ChevronLeft className={direction === 'rtl' ? 'rotate-180' : ''} size={22} />
            </button>
            <h2 className="text-lg font-black text-ink">{tr('Mon panier', 'سلّتي')}
              {items.length > 0 && <span className="ms-2 text-sm font-medium text-muted">({items.reduce((sum, item) => sum + item.quantity, 0)} {tr('article(s)', 'منتج')})</span>}
            </h2>
          </header>

          {loadError && items.length > 0 && <div role="alert" className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-sm text-danger">
            {tr('Panier non actualisé.', 'لم تُحدّث السلة.')}
            <button type="button" onClick={onRetry} className="underline">{tr('Réessayer', 'أعد المحاولة')}</button>
          </div>}
          {/* Cart Items List */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:p-6 space-y-4 bg-white">
            {loadError && items.length === 0 ? (
              <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-ink">{tr('Impossible de charger le panier.', 'تعذّر تحميل السلة.')}</p>
                <button type="button" onClick={onRetry} className="ay-btn-secondary min-h-12 px-6">{tr('Réessayer', 'أعد المحاولة')}</button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-full min-h-96 flex-col items-center justify-center gap-4 text-center">
                <div className="relative grid h-28 w-28 place-items-center rounded-full bg-surface text-ink" aria-hidden="true"><ShoppingBag size={52} /></div>
                <h3 className="text-xl font-black text-ink">{tr('Votre panier est vide', 'سلّتك فارغة')}</h3>
                <p className="max-w-xs text-sm leading-relaxed text-muted">{tr('Explorez les produits pour commencer votre commande.', 'اكتشف المنتجات لتبدأ طلبك.')}</p>
                <button type="button" onClick={onCalculateAnotherProduct} className="ay-btn-cta mt-1 min-h-12 rounded-full px-8 text-sm">
                  {tr('Découvrir les produits', 'تصفّح المنتجات')}
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-line pb-5 flex gap-4 items-start"
                >
                  {/* Vignette — cadre studio unifié : blanc + hairline + multiply */}
                  <div className="w-20 h-24 flex-shrink-0 overflow-hidden rounded-lg">
                    <StudioImageFrame src={item.imageUrl} alt={item.title} ratio="4 / 5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-surface text-ink uppercase">
                        {merchantLabel(item, tr('Marchand externe', 'متجر خارجي'))}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-danger/5 hover:text-danger"
                        title={tr('Supprimer', 'حذف')}
                        aria-label={tr(`Supprimer ${item.title} du panier`, `حذف ${item.title} من السلة`)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <h4 className="ay-readable text-sm font-bold text-ink mt-1">
                      {item.title}
                    </h4>

                    {item.variant && !item.requestedSize && !item.requestedColor && (
                      <p className="ay-readable text-xs text-muted mt-0.5">
                        {!item.requestedSize && !item.requestedColor ? item.variant : null}
                      </p>
                    )}
                    {(item.requestedSize || item.requestedColor) && (
                      <p className="mt-0.5 text-xs font-semibold text-muted">
                        {[item.requestedSize && `${tr('Taille', 'المقاس')} ${item.requestedSize}`, item.requestedColor && `${tr('Couleur', 'اللون')} ${item.requestedColor}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {item.customerNote && <p className="ay-readable mt-1 text-xs leading-relaxed text-muted">{tr('Note', 'ملاحظة')} : {item.customerNote}</p>}
                    {(item.referenceUrl || item.priceVerificationStatus === 'PENDING_MANUAL') && validProductUrl(item.sourceUrl) && (
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-bold text-ink underline">{tr('Ouvrir le lien produit fourni', 'فتح رابط المنتج المرفق')}</a>
                    )}
                    {item.priceVerificationStatus === 'PENDING_MANUAL' && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-muted">{tr('Prix vérifié par l’équipe avant achat', 'يتحقق الفريق من السعر قبل الشراء')}</p>
                    )}
                    {item.requiresWeightValidation && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-muted">{tr('Colis lourd : le fret international sera confirmé par notre équipe avant paiement', 'منتج ثقيل: يتم تأكيد الشحن الدولي من قبل فريقنا قبل الدفع')}</p>
                    )}

                    <div className="flex items-center justify-between mt-2.5">
                      <div className="text-xs font-black text-ink" data-cart-line-tnd={item.lineTotalTND ?? item.priceTND * item.quantity}>
                        <QuietPromoPrice
                          priceTnd={item.lineTotalTND ?? item.priceTND * item.quantity}
                          promo={item.promo ?? null}
                          originalTnd={item.originalLineTotalTND}
                          format={formatMoney}
                          variant="list"
                        />
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1 bg-white border border-line rounded-card p-0.5 shadow-xs">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="flex h-11 w-11 items-center justify-center rounded-icon text-muted hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={tr(`Diminuer la quantité de ${item.title}`, `تقليل كمية ${item.title}`)}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-ink px-1">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= 99}
                          className="flex h-11 w-11 items-center justify-center rounded-icon text-muted hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={tr(`Augmenter la quantité de ${item.title}`, `زيادة كمية ${item.title}`)}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer & Checkout */}
          {items.length > 0 && (
            <div className="ay-safe-bottom border-t border-line bg-white p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{tr('Sous-total', 'المجموع الفرعي')}</span>
                <strong className="text-ink">{formatMoney(totalTND - deliveryTND)}</strong>
              </div>
              {deliveryTND > 0 && <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{tr('Livraison locale (une fois)', 'التوصيل المحلي (مرة واحدة)')}</span>
                <span className="text-ink">{formatMoney(deliveryTND)}</span>
              </div>}
              <div className="flex justify-between items-center text-sm border-t border-line pt-3">
                <span className="text-muted font-semibold">{tr('Total de la commande', 'إجمالي الطلب')}</span>
                <strong className="text-xl font-extrabold text-ink">{formatMoney(totalTND)}</strong>
              </div>
              {depositPolicy ? <details className="group text-xs leading-5 text-ink">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 font-semibold [&::-webkit-details-marker]:hidden">
                  <span>{tr(`À la commande, acompte de ${depositPolicy.percent}% : ${formatMoney(estimatedDeposit)}.`, `عند الطلب، عربون ${depositPolicy.percent}%: ${formatMoney(estimatedDeposit)}.`)}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-1 border-t border-line py-2 text-muted">
                  {pendingManual && <p>{tr('Prix marchand à vérifier avant achat.', 'سيتحقق الفريق من سعر المنتج قبل الشراء.')}</p>}
                  {depositPolicy.reviewDelay && <p dir="auto">{depositPolicy.reviewDelay}</p>}
                  {depositPolicy.unavailableRefundPolicy && <p dir="auto">{depositPolicy.unavailableRefundPolicy}</p>}
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{tr('Conditions publiées', 'شروط الخدمة')}</a>
                </div>
              </details> : <div role={commerce.status === 'error' ? 'alert' : 'status'} className="text-xs text-muted">
                {commerce.status === 'error' ? tr('Conditions indisponibles.', 'تعذّر تحميل شروط الدفع.') : tr('Chargement des conditions…', 'جارٍ تحميل الشروط…')}
                {commerce.status === 'error' && <button type="button" onClick={commerce.retry} className="ms-2 underline">{tr('Réessayer', 'أعد المحاولة')}</button>}
              </div>}
              <button
                type="button"
                onClick={() => { if (commerce.status === 'ready' && !loadError) onProceedToCheckout(); }}
                disabled={commerce.status !== 'ready' || loadError}
                className="ay-btn-cta w-full text-sm"
              >
                <span>{tr('Commander', 'إتمام الطلب')}</span>
                <ArrowRight className={`w-4 h-4 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
