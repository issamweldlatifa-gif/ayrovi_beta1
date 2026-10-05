import React from 'react';
import { Heart, HeartFilled, Loader2, ShoppingBag, X } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import type { AyWebsFavoriteTarget, AyWebsFavoritesApi } from '../useAyWebsFavorites';

/**
 * §6 (04/10/2026) — tiroir « Favoris » d'AyWebs.
 *
 * Il monte du bas comme la feuille de variantes, montre l'article CONCERNÉ
 * (image originale entière, titre, prix) et expose UNE action explicite :
 * ajouter ou retirer. L'écriture va au compte AYROVI ; il n'y a pas de
 * « favori local » qui disparaîtrait au rechargement.
 *
 * Sans session : le tiroir le DIT et propose la connexion — aucun faux succès.
 */
export interface AyWebsFavoriteSheetProps {
  target: AyWebsFavoriteTarget;
  favorites: AyWebsFavoritesApi;
  onClose: () => void;
  onOpenAccount: () => void;
}

export const AyWebsFavoriteSheet: React.FC<AyWebsFavoriteSheetProps> = ({ target, favorites, onClose, onOpenAccount }) => {
  const { tr } = useLocale();
  const saved = favorites.isSaved(target.sourceUrl);

  return (
    <div className="ayw-sheet-mask" role="presentation" onClick={onClose}>
      <div
        className="ayw-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={tr('Favorites', 'المفضلة')}
        data-aywebs-sheet="favorite"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="ayw-sheet-close" aria-label={tr('Close', 'إغلاق')} onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="ayw-favsheet-body">
          <h2 className="ayw-sheet-title">{tr('Favorites', 'المفضلة')}</h2>

          <div className="ayw-favsheet-product">
            {target.image
              ? <img className="ayw-favsheet-thumb" src={target.image} alt="" loading="lazy" />
              : <span className="ayw-favsheet-thumb" aria-hidden="true"><ShoppingBag size={26} /></span>}
            <div>
              <p className="ayw-favsheet-title">{target.title}</p>
              {typeof target.priceTnd === 'number' && target.priceTnd > 0 && (
                <p className="ayw-favsheet-price">{target.priceTnd.toFixed(2)} {tr('DT', 'د.ت')}</p>
              )}
            </div>
          </div>

          {favorites.authRequired ? (
            <>
              <p className="ayw-notice">
                {tr(
                  'Sign in to save this item to your AYROVI account. Nothing is stored on this phone.',
                  'سجّل الدخول لحفظ هذا العنصر في حساب AYROVI. لا يُحفظ شيء على هذا الهاتف.',
                )}
              </p>
              <button type="button" className="ayw-cta" onClick={onOpenAccount}>
                {tr('Sign in', 'تسجيل الدخول')}
              </button>
            </>
          ) : (
            <>
              {favorites.failed && (
                <p className="ayw-notice">{tr('Favorites are unavailable right now.', 'المفضلة غير متاحة حالياً.')}</p>
              )}
              <button
                type="button"
                className={saved ? 'ayw-cta-outline' : 'ayw-cta'}
                disabled={favorites.busy}
                aria-pressed={saved}
                onClick={() => { void favorites.toggle(target); }}
              >
                {favorites.busy && <Loader2 size={18} aria-hidden="true" />}
                {saved ? <HeartFilled size={18} aria-hidden="true" /> : <Heart size={18} aria-hidden="true" />}
                {saved ? tr('Remove from favorites', 'أزل من المفضلة') : tr('Add to favorites', 'أضف إلى المفضلة')}
              </button>
              <p className="ayw-notice">
                {tr('Synced with your AYROVI account.', 'متزامن مع حسابك في AYROVI.')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
