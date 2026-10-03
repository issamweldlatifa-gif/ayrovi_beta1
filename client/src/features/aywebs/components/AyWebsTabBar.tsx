import React from 'react';
import { Heart, Home, Search, ShoppingBag, User } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';

/**
 * AYWEBs — barre d'onglets basse (référence Add-to-Buyee, capture 2) avec les
 * libellés AYROVI bilingues : Accueil · Boutiques · Favoris · Panier · Compte.
 * Chaque onglet est VIVANT : il appelle la navigation AYROVI correspondante.
 */
export type AyWebsTab = 'home' | 'stores' | 'wish' | 'cart' | 'account';

export interface AyWebsTabBarProps {
  tab: AyWebsTab;
  onTab: (tab: AyWebsTab) => void;
  cartCount: number;
}

export const AyWebsTabBar: React.FC<AyWebsTabBarProps> = ({ tab, onTab, cartCount }) => {
  const { tr } = useLocale();
  const items: Array<{ id: AyWebsTab; icon: React.ReactNode; label: string; badge?: number }> = [
    { id: 'home', icon: <Home size={21} aria-hidden="true" />, label: tr('Home', 'الرئيسية') },
    { id: 'stores', icon: <Search size={21} aria-hidden="true" />, label: tr('Stores', 'المتاجر') },
    { id: 'wish', icon: <Heart size={21} aria-hidden="true" />, label: tr('Wish List', 'المفضلة') },
    { id: 'cart', icon: <ShoppingBag size={21} aria-hidden="true" />, label: tr('Cart', 'السلة'), badge: cartCount },
    { id: 'account', icon: <User size={21} aria-hidden="true" />, label: tr('My Page', 'حسابي') },
  ];
  return (
    <nav className="ayw-tabs" aria-label={tr('AyWebs navigation', 'تنقل AyWebs')}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`ayw-tab${tab === item.id ? ' is-active' : ''}`}
          aria-current={tab === item.id ? 'page' : undefined}
          onClick={() => onTab(item.id)}
        >
          <span className="ayw-tab-icon">
            {item.icon}
            {Boolean(item.badge) && <span className="ayw-tab-badge">{item.badge}</span>}
          </span>
          <span className="ayw-tab-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};
