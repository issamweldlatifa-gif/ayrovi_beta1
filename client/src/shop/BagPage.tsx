import React from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import type { StockState } from './types';

/**
 * PANIER AYROVI — mobile-first, with source-backed purchase status and a
 * checkout summary that stays visible while the product list scrolls.
 */
export interface BagLine {
  id: string;
  title: string;
  brand: string | null;
  variant: string | null;
  quantity: number;
  media: { src: string; alt: string } | null;
  lineTotalTnd: number;
  referenceTotalTnd: number | null;
  stock: StockState;
  availabilitySource?: string | null;
  availabilityCheckedAt?: string | null;
  availabilityReason?: string | null;
  /** Preuve de prix : seule une ligne FRESH/MANUAL peut aller au paiement. */
  priceTrust?: 'FRESH' | 'MANUAL' | 'STALE' | null;
}

export type PolicyState =
  | { status: 'loading' }
  | { status: 'error'; onRetry?: () => void }
  | { status: 'ready'; depositNote: string; details: string[] };

export interface BagPageProps {
  lines: BagLine[];
  subtotalTnd: number;
  deliveryTnd: number;
  totalTnd: number;
  /** Payment methods that are actually usable under the published server policy. */
  paymentMarks?: { id: string; src?: string; glyph?: 'Card' | 'Phone' | 'Bank' | 'Mail'; label: string }[];
  policy?: PolicyState;
  loadError?: boolean;
  onRetryCart?: () => void;
  tr: (fr: string, ar: string) => string;
  formatMoney: (tnd: number) => string;
  direction?: 'ltr' | 'rtl';
  onBack?: () => void;
  onChangeQuantity?: (id: string, quantity: number) => void;
  onRemove?: (id: string) => void;
  onCheckout?: () => void;
}

function checkedLabel(value: string | null | undefined, locale: string): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

export const BagPage: React.FC<BagPageProps> = ({
  lines, subtotalTnd, deliveryTnd, totalTnd, paymentMarks = [],
  policy = { status: 'ready', depositNote: '', details: [] },
  loadError = false, onRetryCart,
  tr, formatMoney, direction = 'ltr', onBack, onChangeQuantity, onRemove, onCheckout,
}) => {
  // Unknown is not a saleable state. It is distinct from a confirmed rupture,
  // but both must stop the final order until a source-backed result exists.
  const blockedLines = lines.filter((line) => line.stock !== 'available');
  // Un prix dont la preuve signée a expiré n'est pas payable : la même décision
  // que le serveur appliquera à la commande, montrée avant l'envoi.
  const stalePriceLines = lines.filter((line) => line.priceTrust === 'STALE');
  const blocked = blockedLines.length > 0 || stalePriceLines.length > 0 || policy.status !== 'ready' || loadError;
  const locale = direction === 'rtl' ? 'ar-TN' : 'fr-TN';

  return (
    <div className="s-root s-page s-bag-page" dir={direction} data-ay-design="editorial">
      <header className="s-appbar">
        <button type="button" className="s-iconbtn" onClick={onBack} aria-label={tr('Retour', 'رجوع')}>
          <EditorialIcon name="Back" direction={direction} />
        </button>
        <div className="s-appbar__title"><span>{tr('Panier', 'السلة')}</span></div>
        <span className="s-appbar__spacer" aria-hidden="true" />
      </header>

      <div className="s-bag-scroll">
        {loadError && (
          <div className="s-refusal" role="alert">
            {tr('Panier non actualisé.', 'السلة ما تحدّثتش.')}
            {onRetryCart && <button type="button" className="s-cta s-cta--ghost" onClick={onRetryCart}>{tr('Réessayer', 'أعد المحاولة')}</button>}
          </div>
        )}

        {lines.length === 0 && !loadError && (
          <div className="s-loading"><EditorialIcon name="Bag" size={40} /><p>{tr('Votre panier est vide.', 'سلّتك فارغة.')}</p></div>
        )}

        {lines.map((line) => {
          const date = checkedLabel(line.availabilityCheckedAt, locale);
          return (
            <article key={line.id} className="s-bag-line">
              <div className="s-bag-line__media">
                {line.media
                  ? <img src={line.media.src} alt={line.media.alt} decoding="async" loading="lazy" referrerPolicy="no-referrer" />
                  : <span className="s-bag-line__placeholder"><EditorialIcon name="Bag" size={24} /></span>}
              </div>

              <div className="s-bag-line__details">
                <div className="s-bag-line__heading">
                  <div className="s-bag-line__identity">
                    {line.brand && <div className="s-card__brand">{line.brand}</div>}
                    <div className="s-bag-line__title">{line.title}</div>
                  </div>
                </div>

                {line.variant && <div className="s-bag-line__variant">{line.variant}</div>}
                <div className="s-bag-line__price" data-cart-line-tnd={line.lineTotalTnd} data-deal={Boolean(line.referenceTotalTnd)}>{formatMoney(line.lineTotalTnd)}</div>
                {line.referenceTotalTnd != null && <div className="s-card__was"><s>{formatMoney(line.referenceTotalTnd)}</s></div>}

                <div className="s-bag-stock" data-state={line.stock}>
                  <strong>{line.stock === 'available'
                    ? tr('Disponibilité confirmée', 'التوفّر مؤكّد')
                    : line.stock === 'unavailable'
                      ? tr('Rupture signalée', 'المصدر أفاد بنفاد المخزون')
                      : tr('Disponibilité à confirmer', 'التوفّر غير مؤكّد')}</strong>
                  <small>{[line.availabilitySource || '', date ? `${tr('Vérifié', 'آخر تثبّت')} : ${date}` : ''].filter(Boolean).join(' · ')
                    || tr('Aucune confirmation récente de la source.', 'ما فماش تأكيد حديث من المصدر.')}</small>
                </div>

                {line.priceTrust === 'STALE' && (
                  <div className="s-bag-stock" data-state="unknown" role="status">
                    <strong>{tr('Prix à revérifier', 'السعر يستحق إعادة تثبّت')}</strong>
                    <small>{tr('La vérification du prix a expiré : relancez-la avant de commander.', 'تثبّت السعر انتهت صلاحيته: أعد التحقّق قبل الطلب.')}</small>
                  </div>
                )}

                <div className="s-bag-quantity" role="group" aria-label={tr('Quantité', 'الكمية')}>
                  <button type="button" className="s-iconbtn" aria-label={tr('Diminuer la quantité', 'إنقاص الكمية')} disabled={line.quantity <= 1} onClick={() => onChangeQuantity?.(line.id, line.quantity - 1)}>
                    <EditorialIcon name="Minus" size={18} />
                  </button>
                  <span aria-live="polite">{line.quantity}</span>
                  <button type="button" className="s-iconbtn" aria-label={tr('Augmenter la quantité', 'زيادة الكمية')} onClick={() => onChangeQuantity?.(line.id, line.quantity + 1)}>
                    <EditorialIcon name="Plus" size={18} />
                  </button>
                  <span className="s-bag-quantity__spacer" aria-hidden="true" />
                  <button type="button" className="s-iconbtn s-bag-line__remove" aria-label={tr('Supprimer', 'حذف')} onClick={() => onRemove?.(line.id)}>
                    <EditorialIcon name="Trash" size={18} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {lines.length > 0 && (
        <div className="s-buybar s-bag-summary">
          <div className="s-bag-summary__row"><span>{tr('Sous-total', 'المجموع الفرعي')}</span><span>{formatMoney(subtotalTnd)}</span></div>
          <div className="s-bag-summary__row"><span>{tr('Livraison', 'التوصيل')}</span><span>{formatMoney(deliveryTnd)}</span></div>
          <div className="s-bag-summary__total"><span>{tr('Total', 'المجموع')}</span><strong>{formatMoney(totalTnd)}</strong></div>

          {policy.status === 'loading' && <p className="s-bag-summary__note" role="status">{tr('Chargement des conditions…', 'جارٍ تحميل الشروط…')}</p>}
          {policy.status === 'error' && (
            <p className="s-refusal" role="alert">{tr('Conditions indisponibles.', 'الشروط غير متوفرة.')}
              {policy.onRetry && <button type="button" className="s-cta s-cta--ghost" onClick={policy.onRetry}>{tr('Réessayer', 'أعد المحاولة')}</button>}
            </p>
          )}
          {policy.status === 'ready' && policy.depositNote && (
            <details className="s-details s-bag-policy"><summary>{policy.depositNote}</summary>
              {policy.details.map((line) => <p key={line} className="s-card__desc">{line}</p>)}
            </details>
          )}

          {blockedLines.length > 0 && <p className="s-bag-blocked" role="status">
            {tr('Une ligne est en rupture ou sans confirmation de stock. Retirez-la ou vérifiez-la à la source avant de continuer.', 'ثمّة منتج مفقود أو مخزونه غير مؤكّد. احذفه أو تثبّت من المصدر قبل المواصلة.')}
          </p>}
          {stalePriceLines.length > 0 && <p className="s-bag-blocked" role="status">
            {tr('Le prix vérifié d’un article a expiré. Relancez la vérification du prix (Lens), puis validez la commande.', 'صلاحية تثبّت سعر منتج انتهت. أعد التحقّق من السعر ثم واصل الطلب.')}
          </p>}
          <button type="button" className="s-cta s-bag-checkout" onClick={onCheckout} disabled={blocked || !onCheckout}>
            {tr('Continuer vers le paiement', 'المواصلة إلى الدفع')}
          </button>

          {paymentMarks.length > 0 && (
            <div className="s-payment-strip" aria-label={tr('Moyens de paiement disponibles', 'وسائل الدفع المتاحة')}>
              <div className="s-payment-strip__heading">
                <strong>{tr('Moyens de paiement', 'وسائل الدفع')}</strong>
                <small>{tr('Disponibles sur AYROVI', 'المتاحة على AYROVI')}</small>
              </div>
              <div className="s-payment-strip__marks">
                {paymentMarks.map((mark) => (
                  <span key={mark.id} className="s-payment-mark" title={mark.label}>
                    {mark.src
                      ? <img src={mark.src} alt={mark.label} loading="lazy" />
                      : <><EditorialIcon name={mark.glyph || 'Bank'} size={17} /><small>{mark.label}</small></>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
