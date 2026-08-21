import React, { useEffect } from 'react';
import { Trash2, ArrowRight, Plus, Minus } from './QatafoIcons';
import { AppHeader } from '../design/AppHeader';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { CartItem } from '../types';
import { JourneyProgress } from './JourneyProgress';
import { useLocale } from '../i18n/LocaleContext';
import { getCommerceConfig } from '../services/publicApi';

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
  const [depositPolicy, setDepositPolicy] = React.useState({ percent: 20, reviewDelay: '', refund: '' });
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    getCommerceConfig().then((payload) => {
      const deposit = payload.data?.deposit || {};
      setDepositPolicy({
        percent: Number(deposit.percent) > 0 ? Number(deposit.percent) : 20,
        reviewDelay: String(deposit.reviewDelay || ''),
        refund: String(deposit.unavailableRefundPolicy || ''),
      });
    }).catch(() => undefined);
  }, [isOpen]);

  const pendingManual = items.some((item) => item.priceVerificationStatus === 'PENDING_MANUAL');
  const estimatedDeposit = Math.round(totalTND * depositPolicy.percent / 100 * 1000) / 1000;

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
                  <Plus className="h-4 w-4" />
                  {tr('Calculer un produit avec Lens', 'حساب منتج باستخدام Lens')}
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="bg-surface border border-line rounded-2xl p-3.5 flex gap-3.5 items-start group hover:border-brand/40 transition-all"
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-xl bg-white border border-line flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : null}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand/10 text-brand uppercase">
                        {merchantLabel(item, tr('Marchand externe', 'متجر خارجي'))}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-danger/5 hover:text-danger"
                        title={tr('Supprimer', 'حذف')}
                        aria-label={tr(`Supprimer ${item.title} du panier`, `حذف ${item.title} من السلة`)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <h4 className="text-xs font-bold text-ink truncate mt-1">
                      {item.title}
                    </h4>

                    {item.variant && (
                      <p className="text-[11px] text-muted truncate mt-0.5">
                        {item.variant}
                      </p>
                    )}
                    {(item.requestedSize || item.requestedColor) && (
                      <p className="mt-0.5 text-[10px] font-semibold text-muted">
                        {[item.requestedSize && `${tr('Taille', 'المقاس')} ${item.requestedSize}`, item.requestedColor && `${tr('Couleur', 'اللون')} ${item.requestedColor}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {item.customerNote && <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted">{tr('Note', 'ملاحظة')} : {item.customerNote}</p>}
                    {(item.referenceUrl || item.priceVerificationStatus === 'PENDING_MANUAL') && (
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[10px] font-bold text-brand underline">{tr('Ouvrir le lien produit fourni', 'فتح رابط المنتج المرفق')}</a>
                    )}
                    {item.priceVerificationStatus === 'PENDING_MANUAL' && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-warning">{tr('Prix vérifié par l’équipe avant achat', 'يتحقق الفريق من السعر قبل الشراء')}</p>
                    )}

                    <div className="flex items-center justify-between mt-2.5">
                      <div className="text-xs font-black text-brand">
                        {formatMoney(item.lineTotalTND ?? item.priceTND * item.quantity)}
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1 bg-white border border-line rounded-xl p-0.5 shadow-xs">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
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
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
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
              <div className="rounded-xl border border-accent bg-accent/10 p-3 text-[11px] leading-5 text-ink">
                <p className="font-black">{tr(`Acompte estimé : ${estimatedDeposit.toFixed(3)} DT (${depositPolicy.percent}%)`, `العربون التقديري: ${estimatedDeposit.toFixed(3)} د.ت (${depositPolicy.percent}%)`)}</p>
                {pendingManual && <p className="font-bold">{tr('Le prix du produit sera vérifié par l’équipe avant l’achat.', 'سيتحقق الفريق من سعر المنتج قبل الشراء.')}</p>}
                <p>{tr(depositPolicy.reviewDelay || 'Vérification après réception du justificatif.', 'يتم التحقق بعد استلام إثبات الدفع.')}</p>
                <p>{tr(depositPolicy.refund || 'Remboursement de l’acompte si le produit ne peut pas être validé ou acheté.', 'يُرجع العربون إذا تعذر التحقق من المنتج أو شراؤه.')}</p>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted font-semibold">{tr('Total de la commande :', 'إجمالي الطلب:')}</span>
                <span className="text-xl font-extrabold text-ink">{formatMoney(totalTND)}</span>
              </div>

              <button type="button" onClick={onCalculateAnotherProduct} className="ay-btn-secondary min-h-12 w-full text-sm">
                <Plus className="h-4 w-4" />
                {tr('Calculer un autre produit', 'حساب منتج آخر')}
              </button>

              <button
                type="button"
                onClick={onProceedToCheckout}
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
