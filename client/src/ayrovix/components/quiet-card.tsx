/*
 * QUIET CARD v2 (plan UI/Promo — décision client 2026-09-23) :
 * pièces partagées de la carte produit, héritées par les résultats de recherche
 * (listes + grille), la fiche produit et le panier.
 *
 * Règles verrouillées (tests/quiet-card.test.tsx + design contracts) :
 *  • image produit TOUJOURS dans le cadre studio : canvas blanc unifié + padding
 *    + hairline + mix-blend-mode: multiply → le fond blanc des boutiques
 *    disparaît dans le canvas (plus de fond marchand « brut ») ;
 *  • le prix remisé est l'élément le plus fort de la carte et il est ROUGE
 *    (var(--ayrovi-promo), référence Zalando) ; l'original reste gris barré ;
 *  • le badge −X% est rouge — l'orange reste réservé aux CTA.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Loader2 } from '../../components/QatafoIcons';
import type { AyrovixPromo } from '../types';
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
}

export const StudioImageFrame: React.FC<StudioImageFrameProps> = ({
  src, alt, fallbackSources, ratio = '1 / 1', className = '', children, placeholderLabel, loading = 'lazy',
}) => {
  const urls = useMemo(
    () => [...new Set([src, ...(fallbackSources || [])].filter((value): value is string => Boolean(value)))],
    [src, fallbackSources],
  );
  const [index, setIndex] = useState(0);
  const urlsKey = urls.join('|');
  useEffect(() => { setIndex(0); }, [urlsKey]);
  const current = urls[index];
  return (
    <figure className={`ay-studio-frame ${className}`.trim()} style={{ aspectRatio: ratio }}>
      {current
        ? <img
            src={current}
            alt={alt}
            loading={loading}
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setIndex((value) => Math.min(value + 1, urls.length))}
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
  const hasPrice = typeof priceTnd === 'number' && Number.isFinite(priceTnd) && priceTnd > 0;
  const original = promo?.originalPriceTnd ?? originalTnd ?? null;
  const showOriginal = Boolean(promo) && typeof original === 'number' && Number.isFinite(original)
    && typeof priceTnd === 'number' && Number.isFinite(priceTnd) && original > priceTnd;
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
