/* Shared responsive product frame and promotion price. Source photos are never blended or cropped. */
import React, { useMemo, useState } from 'react';
import { Image as ImageIcon, Loader2 } from '../../components/QatafoIcons';
import type { AyrovixPromo } from '../types';
import { safeMediaSrc, withIsolation } from '../services/mediaIsolation';
import { useLocale } from '../../i18n/LocaleContext';
import './quiet-card.css';

/* ────────────────────────────────────────────────────────────────────
 * 1. Cadre studio — toute image produit de la vitrine passe par lui.
 *    Cycle de repli multi-sources unifié (plus d'image cassée muette).
 * ──────────────────────────────────────────────────────────────────── */
export interface StudioImageFrameProps {
  src?: string | null;
  alt: string;
  fallbackSources?: (string | null | undefined)[];
  /** Ratio d'aspect CSS (ex. '2 / 3', '1 / 1'). Défaut : carré. */
  ratio?: string;
  className?: string;
  /** Contenu superposé (badge de similarité, favori…) — positionné par le parent. */
  children?: React.ReactNode;
  /** Libellé du placeholder quand aucune source n'est disponible. */
  placeholderLabel?: string;
  loading?: 'lazy' | 'eager';
  /**
   * Isolation d'arrière-plan (défaut : oui) : la première image distante passe
   * par le pipeline serveur qui retire le fond studio ; l'URL brute reste en repli.
   */
  isolate?: boolean;
}

export const StudioImageFrame: React.FC<StudioImageFrameProps> = ({
  src, alt, fallbackSources, ratio = '1 / 1', className = '', children, placeholderLabel, loading = 'lazy', isolate = true,
}) => {
  const urls = useMemo(
    () => {
      const originals = [...new Set([src, ...(fallbackSources || [])].filter((value): value is string => Boolean(value && safeMediaSrc(value))))];
      return isolate ? withIsolation(originals) : originals;
    },
    [src, fallbackSources, isolate],
  );
  const [attempt, setAttempt] = useState<{ key: string; index: number }>({ key: '', index: 0 });
  const urlsKey = urls.join('|');
  const index = attempt.key === urlsKey ? attempt.index : 0;
  const current = urls[index];
  return (
    <figure className={`ay-studio-frame ${className}`.trim()} style={{ aspectRatio: ratio }}>
      {current
        ? <img
            src={current}
            key={`${urlsKey}:${index}`}
            alt={alt}
            loading={loading}
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setAttempt(state => ({ key: urlsKey, index: Math.min((state.key === urlsKey ? state.index : 0) + 1, urls.length) }))}
            className="ay-studio-frame__image"
          />
        : <span className="ay-studio-frame__placeholder" aria-hidden="true">
            <ImageIcon size={26} />
            {placeholderLabel ? <span className="ay-studio-frame__caption">{placeholderLabel}</span> : null}
          </span>}
      {children}
    </figure>
  );
};

/* ────────────────────────────────────────────────────────────────────
 * 2. Prix — hiérarchie Zalando : remisé ROUGE (élément le plus fort),
 *    original gris barré, badge −X% rouge. Racine <span> pour pouvoir
 *    vivre à l'intérieur d'un <p> existant.
 * ──────────────────────────────────────────────────────────────────── */
export interface QuietPromoPriceProps {
  priceTnd?: number | null;
  /** Promo du jour — seule la remise est requise (ligne panier : original via originalTnd). */
  promo?: ({ percent: number } & Partial<Pick<AyrovixPromo, 'label' | 'priceTnd' | 'originalPriceTnd'>>) | null;
  /** Total ligne original (panier) quand la promo ne porte pas le prix original. */
  originalTnd?: number | null;
  /** Formate un montant TND (ex. formatMoney de useLocale). */
  format: (value: number) => string;
  /** 'grid' = carte de résultats (compacte) ; 'list' = ligne détaillée. */
  variant?: 'grid' | 'list';
  /** Mention grise complémentaire (ex. « Prix boutique 21,99 EUR ») — variant list uniquement. */
  note?: string | null;
}

export const QuietPromoPrice: React.FC<QuietPromoPriceProps> = ({ priceTnd, promo, originalTnd, format, variant = 'grid', note }) => {
  const { tr } = useLocale();
  const hasPrice = typeof priceTnd === 'number' && Number.isFinite(priceTnd) && priceTnd > 0;
  const original = promo?.originalPriceTnd ?? originalTnd ?? null;
  const showOriginal = Boolean(promo) && typeof original === 'number' && Number.isFinite(original)
    && typeof priceTnd === 'number' && Number.isFinite(priceTnd) && original > priceTnd;

  if (variant === 'grid' && showOriginal && promo) {
    return (
      <span className="ay-quiet-price ay-quiet-price--grid">
        <bdi dir="ltr" className="ay-quiet-price__current ay-quiet-price__current--promo">
          {hasPrice ? format(priceTnd as number) : '—'}
        </bdi>
        <span className="ay-quiet-price__ref-row">
          <span className="ay-quiet-price__ref-label">{tr('Prix de référence :', 'السعر المرجعي:')} </span>
          <bdi dir="ltr" className="ay-quiet-price__original"><del className="line-through">{format(original as number)}</del></bdi>
          <span className="ay-quiet-price__badge" dir="ltr">{` -${promo.percent}%`}</span>
        </span>
      </span>
    );
  }

  return (
    <span className={`ay-quiet-price ay-quiet-price--${variant}`}>
      {showOriginal && (
        <bdi dir="ltr" className="ay-quiet-price__original">{format(original as number)}</bdi>
      )}
      <bdi dir="ltr" className={`ay-quiet-price__current${showOriginal ? ' ay-quiet-price__current--promo' : ''}`}>
        {hasPrice ? format(priceTnd as number) : '—'}
      </bdi>
      {promo && (
        <span className="ay-quiet-price__badge">{`−${promo.percent}%`}</span>
      )}
      {variant === 'list' && note ? <span className="ay-quiet-price__note" dir="auto">{note}</span> : null}
    </span>
  );
};

/* ────────────────────────────────────────────────────────────────────
 * 3. Actions — UN bouton principal (encre, jamais orange : sur une carte
 *    promo l'accent unique appartient au rouge du prix) + icônes 44px.
 * ──────────────────────────────────────────────────────────────────── */
export interface QuietCardAction {
  key: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  title?: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}

export interface QuietCardActionsProps {
  primaryLabel: string;
  primaryTitle?: string;
  onPrimary: () => void;
  primaryBusy?: boolean;
  primaryDisabled?: boolean;
  primaryIcon?: React.ComponentType<{ size?: number | string; className?: string }>;
  icons?: QuietCardAction[];
  className?: string;
}

export const QuietCardActions: React.FC<QuietCardActionsProps> = ({
  primaryLabel, primaryTitle, onPrimary, primaryBusy, primaryDisabled,
  primaryIcon: PrimaryIcon, icons, className = '',
}) => (
  <div className={`ay-quiet-actions ${className}`.trim()}>
    <button
      type="button"
      onClick={onPrimary}
      disabled={primaryBusy || primaryDisabled}
      title={primaryTitle}
      className="ay-quiet-actions__primary"
    >
      {primaryBusy
        ? <Loader2 className="ay-quiet-actions__spin" size={16} />
        : PrimaryIcon ? <PrimaryIcon size={16} /> : null}
      <span className="ay-readable">{primaryLabel}</span>
    </button>
    {icons && icons.length > 0 && (
      <div className="ay-quiet-actions__icons" role="group">
        {icons.map(({ key, icon: Icon, label, title, onClick, busy, disabled }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={busy || disabled}
            aria-label={label}
            title={title || label}
            className="ay-quiet-actions__icon"
          >
            {busy ? <Loader2 className="ay-quiet-actions__spin" size={18} /> : <Icon size={18} />}
          </button>
        ))}
      </div>
    )}
  </div>
);
