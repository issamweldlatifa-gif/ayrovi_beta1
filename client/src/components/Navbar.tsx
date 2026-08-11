import React, { useEffect, useState } from 'react';
import { Menu, User } from './QatafoIcons';
import { FigLogoIcon } from './Icons';

interface NavbarProps {
  onOpenMenuDrawer: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenMenuDrawer }) => {
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
          ? 'border-b border-slate-200/90 bg-white/95 text-[#1d2130] shadow-[0_8px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent text-white'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenuDrawer}
          className={`flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm transition-all duration-300 active:scale-95 sm:h-11 sm:w-11 ${
            hasPassedHero
              ? 'border-[#e4dbff] bg-[#f1ebff] text-[#673de6] hover:bg-[#e8e0ff]'
              : 'border-white/30 bg-black/20 text-white backdrop-blur-md hover:bg-black/30'
          }`}
          aria-label="Menu"
          title="Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <span className={`flex rounded-xl p-0.5 transition-colors duration-300 ${hasPassedHero ? 'bg-transparent text-[#673de6]' : 'bg-white/10 text-white backdrop-blur-sm'}`}>
            <FigLogoIcon className="h-8 w-8 drop-shadow-sm sm:h-9 sm:w-9" />
          </span>
          <span
            className={`text-2xl font-black tracking-tight transition-colors duration-300 sm:text-3xl ${
              hasPassedHero ? 'text-[#1d2130]' : 'text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]'
            }`}
          >
            AYROVI
          </span>
        </div>

        <button
          type="button"
          onClick={() => alert(`Profil Client AYROVI — ID: ${localStorage.getItem('ayrovi_session_id') || 'Client'}`)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-[#ffc24b] to-[#ff6b9a] p-0.5 shadow-md transition hover:scale-105 active:scale-95 sm:h-11 sm:w-11"
          title="Mon Profil AYROVI"
          aria-label="Profil"
        >
          <span className={`flex h-full w-full items-center justify-center rounded-full transition-colors duration-300 ${hasPassedHero ? 'bg-[#673de6]' : 'bg-[#1e0b4b]/90 backdrop-blur-sm'}`}>
            <User className="h-5 w-5 text-[#ffc24b]" />
          </span>
        </button>
      </div>
    </header>
  );
};
