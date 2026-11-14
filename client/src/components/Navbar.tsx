import React, { useEffect, useState } from 'react';
import { ShoppingBag, Bell } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';
import { Button } from '../design/Button';

interface NavbarProps {
  onOpenMenuDrawer: () => void;
  onOpenAccount: () => void;
  onOpenNotifications?: () => void;
  onGoHome: () => void;
  onOpenCart: () => void;
  cartCount?: number;
  isAuthenticated?: boolean;
  logoUrl?: string;
}

/**
 * L'en-tête passe en mode « transparent + logo blanc » seulement quand il est VRAIMENT posé sur
 * le Hero : le Hero doit commencer sous l'en-tête (visuel plein cadre remonté sous la barre) et
 * être encore visible. Le carrousel actuel commence plus bas, après l'en-tête et les liens de
 * page : le rendre transparent posait le logo et les icônes blancs sur du blanc (invisibles)
 * dès le premier défilement, sur bureau comme sur téléphone.
 */
export function headerOverHero(hero: { top: number; bottom: number; layout?: string } | null, scrollY: number): boolean {
  if (!hero || hero.layout === 'editorial') return false;
  const startsUnderHeader = hero.top + scrollY <= 1;
  return startsUnderHeader && hero.bottom > 8;
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
  onOpenNotifications,
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
      const hero = document.querySelector<HTMLElement>('[data-hero]');
      const rect = hero?.getBoundingClientRect();
      setOverHero(headerOverHero(hero && rect ? { top: rect.top, bottom: rect.bottom, layout: hero.dataset.heroLayout } : null, window.scrollY));
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

  const customLogo = logoUrl?.trim() && !/^\/media\/logo-ayrovi(?:[.-])/.test(logoUrl.trim()) ? logoUrl.trim() : null;
  const iconButtonClass = overHero ? 'public-site-header-icon' : undefined;

  return (
    <header
      className={`public-site-header sticky top-0 z-40 border-b transition-[background-color,border-color] duration-300 ${
        overHero ? 'is-over-hero' : 'border-line'
      }`}
    >
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_auto] gap-1 items-center px-3 sm:h-20 sm:px-6">
        <button type="button" onClick={onGoHome} className="flex min-h-11 items-center bg-transparent" aria-label="zayrovi">
          <img src={customLogo ?? (overHero ? '/media/logo-ayrovi-wordmark-white.svg?v=7.0' : '/media/logo-ayrovi-wordmark-black.svg?v=7.0')} alt="zayrovi" className="h-7 w-auto object-contain" />
        </button>
        <button type="button" disabled aria-disabled="true" className="min-h-11 rounded-full border border-current px-2 text-sm whitespace-nowrap">Plus ★ Light</button>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenNotifications ?? onOpenAccount}
            className={`relative ${iconButtonClass ?? ''}`}
            aria-label={tr('Notifications', 'الإشعارات')}
            title={isAuthenticated ? tr('Notifications', 'الإشعارات') : tr('Se connecter', 'تسجيل الدخول')}
          >
            <Bell className="h-6 w-6" />
          </Button>
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
        </div>
      </div>
    </header>
  );
};
