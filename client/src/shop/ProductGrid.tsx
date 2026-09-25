import React from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import type { ProductView } from './types';
import './shop.css';

/**
 * GRILLE (boutique v2) — la carte de la maquette, à la lettre.
 *
 * Sous le titre, le descriptif se lit EXACTEMENT comme la ligne de prix barrée
 * (0,75 rem / 400 / gris), sur une ligne. Il n'apparaît que si la source en
 * fournit un : la boutique v2 ne découpe pas un titre pour remplir un vide.
 */
export interface ProductGridProps {
  products: ProductView[];
  tr: (fr: string, ar: string) => string;
  formatMoney: (tnd: number) => string;
  direction?: 'ltr' | 'rtl';
  onOpen: (product: ProductView) => void;
  onFavorite?: (product: ProductView) => void;
  favorites?: Set<string>;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products, tr, formatMoney, direction = 'ltr', onOpen, onFavorite, favorites,
}) => (
  <div className="s-root" dir={direction} data-ay-design="editorial">
    <div className="s-grid">
      {products.map((product) => {
        const cover = product.media[0];
        const price = product.price;
        const saved = favorites?.has(product.id) ?? false;
        return (
          <article className="s-card" key={product.id}>
            <div className="s-card__media">
              <button
                type="button"
                onClick={() => onOpen(product)}
                aria-label={tr(`Voir ${product.title}`, `عرض ${product.title}`)}
                style={{ display: 'block', width: '100%', height: '100%' }}
              >
                {cover
                  ? <img src={cover.src} alt={cover.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                  : <span className="s-card__desc">{tr('Image indisponible', 'الصورة غير متوفرة')}</span>}
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

              {product.flags.length > 0 && (
                <div className="s-card__flags">
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
          </article>
        );
      })}
    </div>
  </div>
);
