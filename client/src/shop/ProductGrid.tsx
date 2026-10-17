import React from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import type { ProductView } from './types';

/**
 * GRILLE (boutique v2) — la carte de la maquette, à la lettre.
 *
 * Sous le titre, le descriptif se lit EXACTEMENT comme la ligne de prix barrée
 * (0,75 rem / 400 / gris), sur une ligne. Il n'apparaît que si la source en
 * fournit un : la boutique v2 ne découpe pas un titre pour remplir un vide.
 */
/** Résultat d'une lecture FRAÎCHE de la page marchand (bouton « Vérifier le stock »). */
export interface StockCheck {
  status: 'checking' | 'done' | 'failed';
  availability?: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown' | null;
  checkedAt?: string | null;
}

export interface ProductGridProps {
  products: ProductView[];
  tr: (fr: string, ar: string) => string;
  formatMoney: (tnd: number) => string;
  direction?: 'ltr' | 'rtl';
  onOpen: (product: ProductView) => void;
  onFavorite?: (product: ProductView) => void;
  favorites?: Set<string>;
  /** Présent seulement là où une lecture live a un sens (résultats Lens). */
  onVerifyStock?: (product: ProductView) => void;
  stockChecks?: Record<string, StockCheck>;
}

const STOCK_LABEL: Record<string, [string, string]> = {
  in_stock: ['En stock', 'متوفر'],
  limited: ['Stock limité', 'آخر القطع'],
  out_of_stock: ['Épuisé', 'نفدت الكمية'],
};

function isPublicLink(url?: string | null): boolean {
  try { const u = new URL(String(url || '')); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

/** Composition → isolation → proxy → original, au lieu d'abandonner au premier échec. */
const FallbackProductImage: React.FC<{
  media: ProductView['media'][number];
  unavailable: string;
}> = ({ media, unavailable }) => {
  const chain = [media.src, ...media.fallbacks].filter((src, index, values) => Boolean(src) && values.indexOf(src) === index);
  const key = chain.join('|');
  const [step, setStep] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setStep(0); setFailed(false); }, [key]);
  if (!chain.length || failed) return <span className="s-card__desc">{unavailable}</span>;
  return (
    <img
      src={chain[Math.min(step, chain.length - 1)]}
      alt={media.alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (step + 1 < chain.length) setStep((current) => current + 1);
        else setFailed(true);
      }}
    />
  );
};

export const ProductGrid: React.FC<ProductGridProps> = ({
  products, tr, formatMoney, direction = 'ltr', onOpen, onFavorite, favorites, onVerifyStock, stockChecks,
}) => (
  <div className="s-root" dir={direction} data-ay-design="editorial">
    <div className="s-grid">
      {products.map((product) => {
        const cover = product.media[0];
        const price = product.price;
        const saved = favorites?.has(product.id) ?? false;
        const check = stockChecks?.[product.id];
        const canVerify = Boolean(onVerifyStock) && isPublicLink(product.merchant?.url);
        const stockNote = (() => {
          if (!check || check.status === 'checking') return null;
          if (check.status === 'failed' || !check.availability || check.availability === 'unknown') return tr('Stock non confirmé', 'المخزون غير مؤكد');
          const label = STOCK_LABEL[check.availability];
          const time = check.checkedAt ? new Date(check.checkedAt).toLocaleTimeString(direction === 'rtl' ? 'ar-TN' : 'fr-TN', { hour: '2-digit', minute: '2-digit' }) : '';
          const text = label ? tr(label[0], label[1]) : tr('Stock non confirmé', 'المخزون غير مؤكد');
          return time ? `${text} · ${tr(`Vérifié à ${time}`, `تم التحقق ${time}`)}` : text;
        })();
        return (
          <article className="s-card" key={product.id} data-product-id={product.id}>
            <div className="s-card__media">
              <button
                type="button"
                onClick={() => onOpen(product)}
                aria-label={tr(`Voir ${product.title}`, `عرض ${product.title}`)}
                style={{ display: 'block', width: '100%', height: '100%' }}
              >
                {cover
                  ? <FallbackProductImage media={cover} unavailable={tr('Image indisponible', 'الصورة غير متوفرة')} />
                  : <span className="s-card__desc">{tr('Image indisponible', 'الصورة غير متوفرة')}{product.merchant?.name ? ` · ${product.merchant.name}` : ''}</span>}
              </button>

              {onFavorite && (
                <button
                  type="button"
                  className="s-rail__btn"
                  style={{ position: 'absolute', insetInlineEnd: 6, top: 6, width: 36, height: 36 }}
                  aria-pressed={saved}
                  aria-label={tr('Favori', 'المفضّلة')}
                  onClick={() => onFavorite(product)}
                >
                  <EditorialIcon name={saved ? 'HeartFilled' : 'Heart'} size={18} fill={saved ? 'currentColor' : undefined} />
                </button>
              )}

              {(product.flags.length > 0 || product.colors.length > 0) && (
                <div className="s-card__flags">
                  {product.colors.length > 0 && (
                    <span className="s-flag s-flag--info">{tr('Combinaisons disponibles', 'توجد خيارات')}</span>
                  )}
                  {product.flags.map((flag) => (
                    <span key={flag.label} className={`s-flag s-flag--${flag.kind}`}>{flag.label}</span>
                  ))}
                </div>
              )}
            </div>

            {product.brand && <div className="s-card__brand">{product.brand}</div>}
            <div className="s-card__title">{product.title}</div>
            {product.description && <div className="s-card__desc">{product.description}</div>}

            {price ? (
              <>
                <div className="s-card__price" data-deal={Boolean(price.reference)}>{formatMoney(price.current.tnd)}</div>
                {price.reference && (
                  <>
                    <div className="s-card__was">{tr('Prix de référence : ', 'السعر المرجعي: ')}<s>{formatMoney(price.reference.tnd)}</s></div>
                    {price.discountPercent != null && <div className="s-card__off">−{price.discountPercent}%</div>}
                  </>
                )}
              </>
            ) : (
              <div className="s-card__was">{tr('Prix à confirmer', 'السعر قيد التأكيد')}</div>
            )}

            {canVerify && (
              <>
                <button
                  type="button"
                  className="s-card__stock"
                  disabled={check?.status === 'checking'}
                  aria-busy={check?.status === 'checking'}
                  aria-label={tr(`Vérifier le stock : ${product.title}`, `التحقق من المخزون: ${product.title}`)}
                  onClick={() => onVerifyStock?.(product)}
                >
                  {check?.status === 'checking' ? tr('Vérification…', 'جارٍ التحقق…') : tr('Vérifier le stock', 'تحقق من المخزون')}
                </button>
                {stockNote && <div className="s-card__stock-note" role="status">{stockNote}</div>}
              </>
            )}
          </article>
        );
      })}
    </div>
  </div>
);
