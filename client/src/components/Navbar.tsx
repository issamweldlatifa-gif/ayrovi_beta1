import React from 'react';
import { Menu, User } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';
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

/**
 * En-tête minimaliste (ordre du client) :
 * [Menu] — [Logo + nom au centre] — [Profil]
 * Panier et bascule de langue : dans le tiroir de menu.
 */
export const Navbar: React.FC<NavbarProps> = ({
  onOpenMenuDrawer,
  onOpenAccount,
  onGoHome,
  isAuthenticated = false,
  logoUrl,
}) => {
  const { tr } = useLocale();

  return (
    <header className="public-site-header sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-3 sm:h-20 sm:px-6">
        <div className="flex justify-start">
          <Button variant="ghost" size="icon" onClick={onOpenMenuDrawer} aria-label={tr('Ouvrir le menu', 'فتح القائمة')} title={tr('Menu', 'القائمة')}>
            <Menu className="h-6 w-6" />
          </Button>
        </div>
        <button type="button" onClick={onGoHome} className="flex items-center gap-2.5 bg-transparent" aria-label="AYROVI">
          <img src={logoUrl ?? '/media/logo-ayrovi.png'} alt="" className="h-11 w-11 bg-transparent object-contain sm:h-11 sm:w-11" />
          <strong className="font-display text-lg font-black tracking-tight text-ink sm:text-xl">AYROVI</strong>
        </button>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenAccount}
            className="relative"
            aria-label={isAuthenticated ? tr('Mon compte AYROVI', 'حسابي في AYROVI') : tr('Se connecter', 'تسجيل الدخول')}
            title={isAuthenticated ? tr('Mon compte AYROVI', 'حسابي في AYROVI') : tr('Se connecter', 'تسجيل الدخول')}
          >
            <User className="h-7 w-7" />
            {isAuthenticated && <span className="absolute bottom-2 end-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand" />}
          </Button>
        </div>
      </div>
    </header>
  );
};
