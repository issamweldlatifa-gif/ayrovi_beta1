import React, { useEffect, useRef, useState } from 'react';
import { Home, ShoppingBag } from './QatafoIcons';
import { AiLogoIcon, LensBoxIcon } from './Icons';

interface BottomNavBarProps {
  isAiDrawerOpen: boolean;
  isProductDrawerOpen: boolean;
  cartCount: number;
  onToggleAiDrawer: () => void;
  onToggleProductDrawer: () => void;
  onScrollToTop: () => void;
  onOpenCart: () => void;
}

const NAV_ITEM =
  'flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] text-[9px] font-bold leading-none transition-all duration-200 active:scale-[0.96]';
const NAV_ICON = 'h-[22px] w-[22px]';

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  isAiDrawerOpen,
  isProductDrawerOpen,
  cartCount,
  onToggleAiDrawer,
  onToggleProductDrawer,
  onScrollToTop,
  onOpenCart,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsVisible(!(currentScrollY > lastScrollY.current && currentScrollY > 80));
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-1.5rem)] -translate-x-1/2 transition-all duration-300 ease-out sm:bottom-6 sm:w-[390px] ${
        isVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-28 opacity-0 pointer-events-none'
      }`}
    >
      <nav
        className="flex h-[68px] items-center gap-1 rounded-[34px] border border-slate-200/90 bg-white/90 p-2 shadow-2xl shadow-slate-900/12 backdrop-blur-2xl"
        aria-label="Navigation principale"
      >
        <button
          type="button"
          onClick={onToggleAiDrawer}
          className={`${NAV_ITEM} ${
            isAiDrawerOpen
              ? 'bg-[#673de6] text-white shadow-sm'
              : 'text-[#673de6] hover:bg-[#f1ebff]'
          }`}
          aria-label="Assistant AYROVI"
          aria-pressed={isAiDrawerOpen}
        >
          <AiLogoIcon className={NAV_ICON} />
          <span>Assistant</span>
        </button>

        <button
          type="button"
          onClick={onScrollToTop}
          className={`${NAV_ITEM} text-[#5f6674] hover:bg-[#f4f5fa] hover:text-[#1d2130]`}
          aria-label="Accueil"
        >
          <Home className={NAV_ICON} />
          <span>Accueil</span>
        </button>

        <button
          type="button"
          onClick={onOpenCart}
          className={`${NAV_ITEM} relative text-[#5f6674] hover:bg-[#f4f5fa] hover:text-[#1d2130]`}
          aria-label={`Panier, ${cartCount} article${cartCount > 1 ? 's' : ''}`}
        >
          <span className="relative">
            <ShoppingBag className={NAV_ICON} />
            {cartCount > 0 && (
              <span className="absolute -right-2.5 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#673de6] px-1 text-[9px] font-black leading-none text-white shadow-sm">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </span>
          <span>Panier</span>
        </button>

        <button
          type="button"
          onClick={onToggleProductDrawer}
          className={`${NAV_ITEM} ${
            isProductDrawerOpen
              ? 'bg-[#673de6] text-white shadow-sm'
              : 'text-[#673de6] hover:bg-[#f1ebff]'
          }`}
          aria-label="Ouvrir Lens"
          aria-pressed={isProductDrawerOpen}
        >
          <LensBoxIcon className={NAV_ICON} />
          <span>Lens</span>
        </button>
      </nav>
    </div>
  );
};
