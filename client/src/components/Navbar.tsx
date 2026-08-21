import React from 'react';
import { Menu, ShoppingBag, User } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';
import { AppHeader } from '../design/AppHeader';
import { Button } from '../design/Button';

interface NavbarProps {
  onOpenMenuDrawer: () => void;
  onOpenAccount: () => void;
  onGoHome: () => void;
  onOpenCart: () => void;
  cartCount?: number;
  isAuthenticated?: boolean;
  logoUrl?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenMenuDrawer,
  onOpenAccount,
  onGoHome,
  onOpenCart,
  cartCount = 0,
  isAuthenticated = false,
  logoUrl,
}) => {
  const { isArabic, toggleLocale, tr } = useLocale();
  const count = Math.max(0, Math.min(99, Math.trunc(cartCount)));

  return (
    <AppHeader
      sticky
      className="public-site-header"
      title="AYSONIC"
      subtitle={tr('Shopping international, simplement', 'تسوّق عالمي بكل سهولة')}
      logoUrl={logoUrl}
      onLogoClick={onGoHome}
      actions={<>
        <Button variant="ghost" size="icon" onClick={onOpenMenuDrawer} aria-label={tr('Ouvrir le menu', 'فتح القائمة')} title={tr('Menu', 'القائمة')}>
          <Menu className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleLocale} aria-label={tr('Afficher le site en arabe', 'عرض الموقع بالفرنسية')} title={isArabic ? 'Français' : 'العربية'} className="min-w-11 px-2">
          {isArabic ? 'FR' : 'AR'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenCart}
          className="relative"
          aria-label={tr(`Panier, ${count} article(s)`, `السلة، ${count} منتج`)}
          title={tr('Panier', 'السلة')}
        >
          <ShoppingBag className="h-5 w-5" />
          {count > 0 && <span className="absolute bottom-1.5 end-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[8px] font-black leading-none text-white">{count}</span>}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenAccount}
          className="relative"
          aria-label={isAuthenticated ? tr('Mon compte AYROVI', 'حسابي في AYROVI') : tr('Se connecter', 'تسجيل الدخول')}
          title={isAuthenticated ? tr('Mon compte AYROVI', 'حسابي في AYROVI') : tr('Se connecter', 'تسجيل الدخول')}
        >
          <User className="h-5 w-5" />
          {isAuthenticated && <span className="absolute bottom-2 end-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand" />}
        </Button>
      </>}
    />
  );
};
