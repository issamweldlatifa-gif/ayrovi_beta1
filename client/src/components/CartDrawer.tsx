import React, { useEffect } from 'react';
import { X, Trash2, ShoppingBag, ArrowRight, Plus, Minus, Package } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { CartItem } from '../types';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  totalTND: number;
  onUpdateQuantity: (id: string, newQty: number) => void;
  onRemoveItem: (id: string) => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  totalTND,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
}) => {
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label="Panier AYROVI">
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40 backdrop-blur-xs transition-opacity"
        aria-label="Fermer le panier"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pr-0 sm:pr-10">
        <div className="w-screen max-w-md bg-white border-l border-line shadow-2xl flex flex-col">
          
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-line flex items-center justify-between bg-surface">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-ink">Mon Panier</h2>
                <p className="text-xs text-muted font-medium">{items.length} article{items.length > 1 ? 's' : ''} dans le panier</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-muted hover:text-ink hover:bg-line transition-colors"
              aria-label="Fermer le panier"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-white">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-surface border border-line flex items-center justify-center text-muted">
                  <ShoppingBag className="w-8 h-8 text-brand" />
                </div>
                <h3 className="text-base font-bold text-ink">Votre panier est vide</h3>
                <p className="text-xs text-muted max-w-xs leading-relaxed">
                  Importez une capture d'écran ou collez un lien pour ajouter des articles.
                </p>
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
                    ) : (
                      <Package className="w-6 h-6 text-muted" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand/10 text-brand uppercase">
                        {item.store}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="text-muted hover:text-red-600 transition-colors p-1"
                        title="Supprimer"
                        aria-label={`Supprimer ${item.title} du panier`}
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
                        {[item.requestedSize && `Taille ${item.requestedSize}`, item.requestedColor && `Couleur ${item.requestedColor}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {item.customerNote && <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted">Note : {item.customerNote}</p>}
                    {(item.referenceUrl || item.priceVerificationStatus === 'PENDING_MANUAL') && (
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[10px] font-bold text-brand underline">Lien produit fourni</a>
                    )}
                    {item.priceVerificationStatus === 'PENDING_MANUAL' && (
                      <p className="mt-1 text-[10px] font-bold text-amber-700">⏳ Vérification manuelle après acompte</p>
                    )}

                    <div className="flex items-center justify-between mt-2.5">
                      <div className="text-xs font-black text-brand">
                        {(item.lineTotalTND ?? item.priceTND * item.quantity).toFixed(2)} DT
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1.5 bg-white border border-line rounded-lg p-0.5 shadow-xs">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`Diminuer la quantité de ${item.title}`}
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
                          className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`Augmenter la quantité de ${item.title}`}
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
            <div className="p-4 sm:p-6 border-t border-line bg-surface space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted font-semibold">Total général de la commande :</span>
                <span className="text-xl font-extrabold text-ink">{totalTND.toFixed(2)} DT</span>
              </div>

              <button
                type="button"
                onClick={onProceedToCheckout}
                className="w-full hostinger-btn text-white font-bold py-3.5 px-6 rounded-2xl shadow-md flex items-center justify-center gap-2 text-sm transition-all"
              >
                <span>Passer la commande et livraison</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
