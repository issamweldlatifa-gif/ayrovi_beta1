import React, { useEffect, useState } from 'react';
import { Menu, User } from './QatafoIcons';

interface NavbarProps {
  onOpenMenuDrawer: () => void;
  onOpenAccount: () => void;
  isAuthenticated?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenMenuDrawer, onOpenAccount, isAuthenticated = false }) => {
  const [hasPassedHero, setHasPassedHero] = useState(false);

  useEffect(() => {
    let frameId: number | null = null;

    const updateHeader = () => {
      frameId = null;
      const hero = document.getElementById('home-hero');
      if (!hero) {
        setHasPassedHero(window.scrollY > 420);
        return;
      }

      const headerHeight = window.innerWidth >= 640 ? 80 : 64;
      setHasPassedHero(hero.getBoundingClientRect().bottom <= headerHeight);
    };

    const requestUpdate = () => {
      if (frameId === null) frameId = window.requestAnimationFrame(updateHeader);
    };

    updateHeader();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-500 ${
        hasPassedHero
          ? 'glass-header text-ink'
          : 'border-b border-transparent bg-transparent text-white'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenuDrawer}
          className={`flex h-10 w-10 items-center justify-center transition-all duration-300 active:scale-95 sm:h-11 sm:w-11 ${
            hasPassedHero ? 'text-ink hover:opacity-70' : 'text-white hover:opacity-80'
          }`}
          aria-label="Menu"
          title="Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <img src="/media/logo-ayrovi.jpg" alt="AYROVI" className="h-9 w-9 rounded-xl object-cover sm:h-10 sm:w-10" />
          <span
            className={`text-2xl font-black tracking-tight transition-colors duration-300 sm:text-3xl ${
              hasPassedHero ? 'text-ink' : 'text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]'
            }`}
          >
            AYROVI
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenAccount}
          className={`relative flex h-10 w-10 items-center justify-center transition active:scale-95 sm:h-11 sm:w-11 ${
            hasPassedHero ? 'text-ink hover:opacity-70' : 'text-white hover:opacity-80'
          }`}
          title={isAuthenticated ? 'Mon compte AYROVI' : 'Se connecter'}
          aria-label={isAuthenticated ? 'Mon compte AYROVI' : 'Se connecter'}
        >
          <User className="h-6 w-6" />
          {isAuthenticated && <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />}

        </button>
      </div>
    </header>
  );
};
