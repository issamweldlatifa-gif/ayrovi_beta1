import React, { useState, useEffect, useRef } from 'react';
import { Home, ShoppingBag } from './QatafoIcons';
import { LensBoxIcon, AiLogoIcon } from './Icons';

interface BottomNavBarProps {
  isAiDrawerOpen: boolean;
  isProductDrawerOpen: boolean;
  cartCount: number;
  onToggleAiDrawer: () => void;
  onToggleProductDrawer: () => void;
  onScrollToTop: () => void;
  onOpenCart: () => void;
}

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

      // Auto-hide when scrolling down, auto-show when scrolling up
      if (currentScrollY > lastScrollY.current && currentScrollY > 80) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className={`fixed left-3 right-3 sm:left-auto sm:right-auto sm:w-[380px] sm:left-1/2 sm:-translate-x-1/2 bottom-4 sm:bottom-6 z-50 transition-all duration-300 ease-in-out ${
        isVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-28 opacity-0 pointer-events-none'
      }`}
    >
      {/* Instagram-Style Transparent White Glass Navbar with Smooth Rounded Edges */}
      <nav className="h-16 sm:h-[68px] px-3 sm:px-4 flex items-center justify-between bg-white/85 backdrop-blur-2xl border border-slate-200/90 rounded-[34px] shadow-2xl shadow-slate-900/12">
        
        {/* FAR LEFT (أقصى اليسار/الشمال): AI Custom Vector Icon Button */}
        <button
          onClick={onToggleAiDrawer}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xs cursor-pointer ${
            isAiDrawerOpen
              ? 'bg-[#673de6] text-white border-2 border-[#673de6]'
              : 'bg-[#f1ebff] hover:bg-[#e4dbff] text-[#673de6] border border-[#e4dbff]'
          }`}
          title="Assistant AYROVI"
          aria-label="Assistant AYROVI"
        >
          <AiLogoIcon className="w-6 h-6" />
        </button>

        {/* CENTER ITEMS: Accueil & Panier */}
        <button
          onClick={onScrollToTop}
          className="flex flex-col items-center gap-0.5 text-[#6b7280] hover:text-[#1d2130] transition-colors text-[10px] font-bold px-2 cursor-pointer"
        >
          <Home className="w-4 h-4" />
          <span>Accueil</span>
        </button>

        <button
          onClick={onOpenCart}
          className="flex flex-col items-center gap-0.5 text-[#6b7280] hover:text-[#1d2130] transition-colors text-[10px] font-bold px-2 relative cursor-pointer"
        >
          <div className="relative">
            <ShoppingBag className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-[#673de6] text-white rounded-full text-[9px] font-black flex items-center justify-center shadow-xs">
                {cartCount}
              </span>
            )}
          </div>
          <span>Panier</span>
        </button>

        {/* FAR RIGHT (أقصى اليمين): LENS Custom Vector Icon Button */}
        <button
          onClick={onToggleProductDrawer}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xs cursor-pointer ${
            isProductDrawerOpen
              ? 'bg-[#673de6] text-white border-2 border-[#673de6]'
              : 'bg-[#f8f9fe] hover:bg-[#eef0f6] text-[#673de6] border border-[#e2e8f0]'
          }`}
          title="Ouvrir la Commande / Lens"
          aria-label="Ouvrir le panneau Lens"
        >
          <LensBoxIcon className="w-6 h-6" />
        </button>

      </nav>
    </div>
  );
};
