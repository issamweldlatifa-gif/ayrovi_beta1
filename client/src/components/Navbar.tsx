import React, { useEffect, useState } from 'react';
import { Menu, ShoppingBag, User } from './QatafoIcons';
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
 * فوق الـ Hero: شفاف بالكامل — الشعار الأبيض والأيقونات بيضاء.
 * بعد تجاوز الـ Hero: خلفية بيضاء والشعار العادي.
 */
export const Navbar: React.FC<NavbarProps> = ({
  onOpenMenuDrawer,
  onOpenAccount,
  onGoHome,
  onOpenCart,
  cartCount = 0,
  isAuthenticated = false,
  logoUrl,
}) => {
  const { tr } = useLocale();
  const [overHero, setOverHero] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const hero = document.querySelector('[data-hero]');
      if (!hero || (hero as HTMLElement).dataset.heroLayout === 'editorial') { setOverHero(false); return; }
      const rect = hero.getBoundingClientRect();
      setOverHero(rect.bottom > 8);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const iconButtonClass = overHero ? 'public-site-header-icon' : undefined;

  return (
    <header
      className={`public-site-header sticky top-0 z-40 border-b transition-[background-color,border-color] duration-300 ${
        overHero ? 'is-over-hero' : 'border-line'
      }`}
    >
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-3 sm:h-20 sm:px-6">
        <div className="flex justify-start">
          <Button variant="ghost" size="icon" onClick={onOpenMenuDrawer} className={iconButtonClass} aria-label={tr('Ouvrir le menu', 'فتح القائمة')} title={tr('Menu', 'القائمة')}>
            <Menu className="h-6 w-6" />
          </Button>
        </div>
        <button type="button" onClick={onGoHome} className="flex items-center bg-transparent" aria-label="AYROVI">
          {logoUrl && logoUrl !== '/media/logo-ayrovi.png' ? (
            <>
              <img
                src={overHero ? '/media/logo-ayrovi-light.png' : logoUrl}
                alt=""
                className={`h-11 w-11 bg-transparent object-contain transition-opacity duration-300 sm:h-11 sm:w-11 ${overHero ? '' : 'brightness-0'}`}
              />
              <strong className={`font-display text-lg font-black tracking-tight transition-colors duration-300 sm:text-xl ${overHero ? 'text-white' : 'text-ink'}`}>AYROVI</strong>
            </>
          ) : (
            <img
              src={overHero ? '/media/logo-ayrovi-lockup-white-orange.svg' : '/media/logo-ayrovi-lockup-black-orange.svg'}
              alt="AYROVI"
              className="h-7 w-auto bg-transparent object-contain transition-opacity duration-300 sm:h-8"
            />
          )}
        </button>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenCart}
            className={`relative ${iconButtonClass ?? ''}`}
            aria-label={cartCount > 0
              ? tr(`Ouvrir mon panier, ${cartCount} article${cartCount > 1 ? 's' : ''}`, `فتح سلّتي، ${cartCount} منتج`)
              : tr('Ouvrir mon panier', 'فتح سلّتي')}
            title={tr('Mon panier', 'سلّتي')}
          >
            <ShoppingBag className="h-6 w-6" />
            {cartCount > 0 && <span className="absolute bottom-1.5 end-1.5 min-w-4 rounded-full border-2 border-white bg-ink px-1 text-center text-micro font-black leading-4 text-white" aria-hidden="true">{cartCount}</span>}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenAccount}
            className={`relative ${iconButtonClass ?? ''}`}
            aria-label={tr('Ouvrir mon espace', 'فتح فضائي')}
            title={isAuthenticated ? tr('Mon compte AYROVI', 'حسابي في AYROVI') : tr('Se connecter', 'تسجيل الدخول')}
          >
            <User className="h-6 w-6" />
            {isAuthenticated && <span className="absolute bottom-2 end-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-ink" />}
          </Button>
        </div>
      </div>
    </header>
  );
};
