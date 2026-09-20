import React, { useEffect } from 'react';
import { Trash2, ArrowRight, Plus, Minus, ChevronDown } from './QatafoIcons';
import { AppHeader } from '../design/AppHeader';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { CartItem } from '../types';
import { JourneyProgress } from './JourneyProgress';
import { useLocale } from '../i18n/LocaleContext';
import { useCommercePolicy } from '../commerce/useCommercePolicy';
import { validProductUrl } from '../ayrovix/services/resultPolicy';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  totalTND: number;
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

      <div className={`fixed inset-y-0 max-w-full flex ${direction === 'rtl' ? 'left-0 pl-0 sm:pl-10' : 'right-0 pr-0 sm:pr-10'}`}>
        <div className={`ayrovix-theme-scope w-screen max-w-md bg-white shadow-2xl flex flex-col ${direction === 'rtl' ? 'border-r' : 'border-l'} border-line`}>
          
          <AppHeader
            title={tr('Mon panier', 'سلّتي')}
            subtitle={tr(`${items.length} article${items.length > 1 ? 's' : ''}`, `${items.length} منتج`)}
            onBack={onClose}
            actionLabel={tr('Retour à la page précédente', 'العودة إلى الصفحة السابقة')}
          />

          <JourneyProgress active={1} />

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-white">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                                <h3 className="text-base font-bold text-ink">{tr('Votre panier est vide', 'سلّتك فارغة')}</h3>
                <p className="text-xs text-muted max-w-xs leading-relaxed">
                  {tr("Importez une capture d'écran ou collez un lien pour ajouter des articles.", 'ارفع لقطة شاشة أو ألصق رابطًا لإضافة المنتجات.')}
                </p>
                <button type="button" onClick={onCalculateAnotherProduct} className="ay-btn-primary mt-2 min-h-12 text-sm">
                  <Plus className="h-5 w-5" />
                  {tr('Calculer un produit avec Lens', 'حساب منتج باستخدام Lens')}
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="bg-surface border border-line rounded-card p-3.5 flex gap-3.5 items-start group hover:border-line/40 transition-all"
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-card bg-white border border-line flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : null}
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

                    {item.variant && (
                      <p className="ay-readable text-xs text-muted mt-0.5">
                        {item.variant}
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

                    <div className="flex items-center justify-between mt-2.5">
                      <div className="text-xs font-black text-ink">
                        {formatMoney(item.lineTotalTND ?? item.priceTND * item.quantity)}
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
            <div className="ay-safe-bottom p-4 sm:p-6 border-t border-line bg-surface space-y-3">
              {depositPolicy ? <details className="group rounded-card border border-line bg-surface text-xs leading-5 text-ink">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-black [&::-webkit-details-marker]:hidden"><span>{tr(`Acompte estimé : ${estimatedDeposit.toFixed(3)} DT (${depositPolicy.percent}%)`, `العربون التقديري: ${estimatedDeposit.toFixed(3)} د.ت (${depositPolicy.percent}%)`)}</span><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
                <div className="space-y-1 border-t border-line px-3 py-2">
                {pendingManual && <p className="font-bold">{tr('Le prix du produit sera vérifié par l’équipe avant l’achat.', 'سيتحقق الفريق من سعر المنتج قبل الشراء.')}</p>}
                {depositPolicy.reviewDelay && <p dir="auto">{depositPolicy.reviewDelay}</p>}
                {depositPolicy.unavailableRefundPolicy && <p dir="auto">{depositPolicy.unavailableRefundPolicy}</p>}
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{tr('Consulter les conditions publiées', 'راجع الشروط المنشورة')}</a>
                </div>
              </details>
              : <div role={commerce.status === 'error' ? 'alert' : 'status'} className="border border-line p-3 text-xs leading-5">
                {commerce.status === 'error' ? tr('Conditions de paiement indisponibles. Réessayez avant de continuer.', 'تعذر تحميل شروط الدفع. أعد المحاولة قبل المتابعة.') : tr('Chargement des conditions de paiement…', 'جارٍ تحميل شروط الدفع…')}
                {commerce.status === 'error' && <button type="button" onClick={commerce.retry} className="ay-btn-secondary mt-2 w-full">{tr('Réessayer', 'أعد المحاولة')}</button>}
              </div>}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted font-semibold">{tr('Total de la commande :', 'إجمالي الطلب:')}</span>
                <span className="text-xl font-extrabold text-ink">{formatMoney(totalTND)}</span>
              </div>

              <button type="button" onClick={onCalculateAnotherProduct} className="ay-btn-secondary min-h-12 w-full text-sm">
                <Plus className="h-5 w-5" />
                {tr('Calculer un autre produit', 'حساب منتج آخر')}
              </button>

              <button
                type="button"
                onClick={() => { if (commerce.status === 'ready') onProceedToCheckout(); }}
                disabled={commerce.status !== 'ready'}
                className="ay-btn-cta w-full text-sm"
              >
                <span>{tr('Continuer vers la livraison', 'المتابعة إلى التوصيل')}</span>
                <ArrowRight className={`w-4 h-4 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
