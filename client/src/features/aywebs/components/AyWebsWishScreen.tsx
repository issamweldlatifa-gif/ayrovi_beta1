import React from 'react';
import { Loader2, ShoppingBag, Trash2 } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import { AyWebsTabBar, type AyWebsTab } from './AyWebsTabBar';
import type { AyWebsFavoritesApi } from '../useAyWebsFavorites';

/**
 * §2 + §6 (04/10/2026) — onglet « Favoris » INTERNE à AyWebs.
 *
 * Avant, cet onglet renvoyait vers l'espace compte AYROVI : la moitié de la
 * barre gardait l'utilisateur dans AyWebs, l'autre moitié l'en sortait. C'est
 * exactement la sensation de « sortir de l'interface » signalée.
 *
 * La liste affichée est celle du compte (même API que « Mon compte ») : ouvrir
 * un élément rouvre la feuille de variantes SANS quitter l'écran, et le lien
 * « Gérer depuis mon compte » reste disponible pour la page complète.
 */
export interface AyWebsWishScreenProps {
  tab: AyWebsTab;
  onTab: (tab: AyWebsTab) => void;
  favorites: AyWebsFavoritesApi;
  onOpenProduct: (url: string) => void;
  onOpenAccount: () => void;
  cartCount: number;
}

export const AyWebsWishScreen: React.FC<AyWebsWishScreenProps> = ({
  tab, onTab, favorites, onOpenProduct, onOpenAccount, cartCount,
}) => {
  const { tr } = useLocale();

  return (
    <div className="ayw-screen" data-aywebs-screen="wish">
      <header className="ayw-head">
        <h1 className="ayw-title">{tr('Wish List', 'المفضلة')}</h1>
      </header>

      {favorites.busy && favorites.items.length === 0 && (
        <p className="ayw-pad ayw-notice"><Loader2 size={18} aria-hidden="true" /> {tr('Loading…', 'جارٍ التحميل…')}</p>
      )}

      {favorites.authRequired && (
        <div className="ayw-pad">
          <p className="ayw-notice">
            {tr('Sign in to see the favorites saved on your AYROVI account.', 'سجّل الدخول لعرض المفضلة المحفوظة في حساب AYROVI.')}
          </p>
          <button type="button" className="ayw-cta" onClick={onOpenAccount}>{tr('Sign in', 'تسجيل الدخول')}</button>
        </div>
      )}

      {favorites.failed && !favorites.authRequired && (
        <p className="ayw-pad ayw-notice">{tr('Favorites are unavailable right now.', 'المفضلة غير متاحة حالياً.')}</p>
      )}

      {!favorites.authRequired && !favorites.busy && favorites.items.length === 0 && !favorites.failed && (
        <p className="ayw-pad ayw-notice">{tr('No favorite yet.', 'لا توجد مفضلة بعد.')}</p>
      )}

      {favorites.items.length > 0 && (
        <div className="ayw-wishlist">
          {favorites.items.map((item) => (
            <article className="ayw-wishline" key={item.id}>
              {item.image_url
                ? <img className="ayw-wishline-img" src={item.image_url} alt="" loading="lazy" />
                : <span className="ayw-wishline-img" aria-hidden="true"><ShoppingBag size={24} /></span>}
              <div className="ayw-wishline-body">
                <button
                  type="button"
                  className="ayw-wishline-open"
                  disabled={!item.source_url}
                  onClick={() => item.source_url && onOpenProduct(item.source_url)}
                >
                  {item.title}
                </button>
                {item.price_tnd != null && item.price_tnd > 0 && (
                  <span className="ayw-wishline-price">{Number(item.price_tnd).toFixed(2)} {tr('DT', 'د.ت')}</span>
                )}
              </div>
              <button
                type="button"
                className="ayw-delete"
                disabled={favorites.busy}
                aria-label={tr('Remove', 'إزالة')}
                onClick={() => { void favorites.remove(item.id); }}
              >
                <Trash2 size={15} aria-hidden="true" />
                {tr('Remove', 'إزالة')}
              </button>
            </article>
          ))}
        </div>
      )}

      {!favorites.authRequired && (
        <p className="ayw-pad">
          <button type="button" className="ayw-linkbtn" onClick={onOpenAccount}>
            {tr('Manage from my account', 'إدارة من حسابي')}
          </button>
        </p>
      )}

      <AyWebsTabBar tab={tab} onTab={onTab} cartCount={cartCount} />
    </div>
  );
};
