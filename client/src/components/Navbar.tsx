import React, { useEffect, useState } from 'react';
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
 * فوق الـ Hero: شفاف بالكامل — الشعار الأبيض والأيقونات بيضاء.
 * بعد تجاوز الـ Hero: خلفية بيضاء والشعار العادي.
 */
export const Navbar: React.FC<NavbarProps> = ({
  onOpenMenuDrawer,
  onOpenAccount,
  onGoHome,
  isAuthenticated = false,
  logoUrl,
}) => {
  const { tr } = useLocale();
  const [overHero, setOverHero] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const hero = document.querySelector('[data-hero]');
      if (!hero) { setOverHero(false); return; }
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

  const iconButtonClass = overHero ? 'text-white hover:bg-white/10' : undefined;

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
        <button type="button" onClick={onGoHome} className="flex items-center gap-2.5 bg-transparent" aria-label="AYROVI">
          <img
            src={overHero ? '/media/logo-ayrovi-light.png' : (logoUrl ?? '/media/logo-ayrovi.png')}
            alt=""
            className={`h-11 w-11 bg-transparent object-contain transition-opacity duration-300 sm:h-11 sm:w-11 ${overHero ? '' : 'brightness-0'}`}
          />
          <strong className={`font-display text-lg font-black tracking-tight transition-colors duration-300 sm:text-xl ${overHero ? 'text-white' : 'text-ink'}`}>AYROVI</strong>
        </button>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenAccount}
            className={`relative ${iconButtonClass ?? ''}`}
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
