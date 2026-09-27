import React from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import type { StockState } from './types';

/**
 * PANIER (boutique v2).
 *
 * Chaque ligne dit la vérité du moment : le prix vérifié, la variante choisie,
 * et l'état de stock TEL QUE le moteur l'a établi. Une ligne dont le stock n'est
 * pas confirmé le signale — elle ne se maquille pas en ligne normale.
 * Aucun total n'est recalculé ici : les montants arrivent déjà faits du serveur.
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
}

/**
 * État des CONDITIONS COMMERCIALES (acompte, remboursement…). Elles viennent du
 * serveur : tant qu'elles ne sont pas confirmées, la commande reste fermée. Un
 * acompte deviné serait une somme que le client n'a jamais acceptée.
 */
export type PolicyState =
  | { status: 'loading' }
  | { status: 'error'; onRetry?: () => void }
  | { status: 'ready'; depositNote: string; details: string[] };

export interface BagPageProps {
  lines: BagLine[];
  subtotalTnd: number;
  deliveryTnd: number;
  totalTnd: number;
  /** Marques de paiement RÉELLEMENT disponibles, décidées par l'hôte. */
  paymentMarks?: { id: string; src?: string; glyph?: 'Card' | 'Phone' | 'Bank' | 'Mail'; label: string }[];
  /** Conditions serveur — sans elles, « Commander » reste inactif. */
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

export const BagPage: React.FC<BagPageProps> = ({
  lines, subtotalTnd, deliveryTnd, totalTnd, paymentMarks = [],
  policy = { status: 'ready', depositNote: '', details: [] },
  loadError = false, onRetryCart,
  tr, formatMoney, direction = 'ltr', onBack, onChangeQuantity, onRemove, onCheckout,
}) => {
  const stockBlocked = lines.some((line) => line.stock === 'unavailable');
  const blocked = stockBlocked || policy.status !== 'ready' || loadError;
  return (
    <div className="s-root s-page" dir={direction} data-ay-design="editorial">
      <header className="s-appbar">
        <button type="button" className="s-iconbtn" onClick={onBack} aria-label={tr('Retour', 'رجوع')}>
          <EditorialIcon name="Back" direction={direction} />
        </button>
        <div className="s-appbar__title"><span>{tr('Panier', 'السلة')}</span></div>
        <span style={{ width: 44 }} />
      </header>

      <div style={{ flex: 1 }}>
        {loadError && (
          <p className="s-refusal" role="alert" style={{ margin: 16 }}>
            {tr('Panier non actualisé.', 'السلة ما تحدّثتش.')}
            {onRetryCart && (
              <button type="button" className="s-cta s-cta--ghost" style={{ marginTop: 8 }} onClick={onRetryCart}>
                {tr('Réessayer', 'أعد المحاولة')}
              </button>
            )}
          </p>
        )}

        {lines.length === 0 && !loadError && (
          <div className="s-loading">
            <EditorialIcon name="Bag" size={40} />
            <p>{tr('Votre panier est vide.', 'سلّتك فارغة.')}</p>
          </div>
        )}

        {lines.map((line) => (
          <article key={line.id} style={{ display: 'flex', gap: 12, padding: 16, borderBottom: '1px solid var(--s-line)' }}>
            <div style={{ flex: '0 0 88px', height: 116, background: 'var(--s-surface)', overflow: 'hidden' }}>
              {line.media && <img src={line.media.src} alt={line.media.alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} decoding="async" referrerPolicy="no-referrer" />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {line.brand && <div className="s-card__brand">{line.brand}</div>}
              <div className="s-card__title">{line.title}</div>
              {line.variant && <div className="s-card__desc">{line.variant}</div>}

              <div className="s-card__price" data-deal={Boolean(line.referenceTotalTnd)}>{formatMoney(line.lineTotalTnd)}</div>
              {line.referenceTotalTnd != null && (
                <div className="s-card__was"><s>{formatMoney(line.referenceTotalTnd)}</s></div>
              )}

              {line.stock === 'unavailable' && (
                <p className="s-refusal">{tr('Rupture constatée chez la source : cette ligne bloque la commande.', 'مفقود عند المصدر: هذا السطر يسدّ الطلب.')}</p>
              )}
              {line.stock === 'unknown' && (
                <p className="s-refusal">{tr('Stock non confirmé par la source.', 'المخزون غير مؤكّد عند المصدر.')}</p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <button type="button" className="s-iconbtn" aria-label={tr('Diminuer', 'إنقاص')}
                  disabled={line.quantity <= 1}
                  onClick={() => onChangeQuantity?.(line.id, line.quantity - 1)}>
                  <EditorialIcon name="Minus" size={18} />
                </button>
                <span aria-live="polite">{line.quantity}</span>
                <button type="button" className="s-iconbtn" aria-label={tr('Augmenter', 'زيادة')}
                  onClick={() => onChangeQuantity?.(line.id, line.quantity + 1)}>
                  <EditorialIcon name="Plus" size={18} />
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" className="s-iconbtn" aria-label={tr('Supprimer', 'حذف')} onClick={() => onRemove?.(line.id)}>
                  <EditorialIcon name="Trash" size={18} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {lines.length > 0 && (
        <div className="s-buybar">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span>{tr('Sous-total', 'المجموع الفرعي')}</span><span>{formatMoney(subtotalTnd)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginTop: 6 }}>
            <span>{tr('Livraison', 'التوصيل')}</span><span>{formatMoney(deliveryTnd)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.0625rem', margin: '10px 0 4px' }}>
            <span>{tr('Total', 'المجموع')}</span><span>{formatMoney(totalTnd)}</span>
          </div>

          {/* Conditions du serveur : ce qui n'est pas confirmé n'est pas affiché,
              et tant que rien n'est confirmé, la commande ne part pas. */}
          {policy.status === 'loading' && (
            <p className="s-card__desc" role="status" style={{ whiteSpace: 'normal' }}>
              {tr('Chargement des conditions…', 'جارٍ تحميل الشروط…')}
            </p>
          )}
          {policy.status === 'error' && (
            <p className="s-refusal" role="alert">
              {tr('Conditions indisponibles.', 'الشروط غير متوفرة.')}
              {policy.onRetry && (
                <button type="button" className="s-cta s-cta--ghost" style={{ marginTop: 8 }} onClick={policy.onRetry}>
                  {tr('Réessayer', 'أعد المحاولة')}
                </button>
              )}
            </p>
          )}
          {policy.status === 'ready' && policy.depositNote && (
            <details className="s-details">
              <summary>{policy.depositNote}</summary>
              {policy.details.map((line) => (
                <p key={line} className="s-card__desc" style={{ whiteSpace: 'normal' }}>{line}</p>
              ))}
            </details>
          )}

          <button type="button" className="s-cta" onClick={onCheckout} disabled={blocked || !onCheckout}>
            {tr('Commander', 'أتمّ الطلب')}
          </button>
          {stockBlocked && (
            <p className="s-refusal">{tr('Retirez la ligne bloquée pour continuer.', 'احذف السطر المسدود باش تكمّل.')}</p>
          )}

          {paymentMarks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {paymentMarks.map((mark) => (
                <span
                  key={mark.id}
                  title={mark.label}
                  style={{
                    display: 'grid', placeItems: 'center', minWidth: 52, height: 34,
                    padding: '0 8px', border: '1px solid var(--s-line)', background: 'var(--s-canvas)',
                  }}
                >
                  {mark.src
                    ? <img src={mark.src} alt={mark.label} style={{ maxHeight: 20, maxWidth: 46, objectFit: 'contain' }} />
                    : mark.glyph
                      ? <EditorialIcon name={mark.glyph} size={20} title={mark.label} />
                      : <span style={{ fontSize: '0.625rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{mark.label}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
