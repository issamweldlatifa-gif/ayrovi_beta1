import React, { useEffect, useRef, useState } from 'react';
import { X } from './QatafoIcons';
import { AyroviMotion } from './AyroviMotion';
import { AyvisiNavIcon, AyrovixNavIcon } from './NavigationBrandIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useNavigationHistory } from '../navigation/NavigationHistory';

interface BottomNavBarProps {
  isAiDrawerOpen: boolean;
  onToggleAiDrawer: () => void;
  onOpenLens: () => void;
}

const NAV_ITEM =
  'flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[17px] text-[9.5px] font-bold leading-none transition-all duration-200 active:scale-[0.95]';

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  isAiDrawerOpen,
  onToggleAiDrawer,
  onOpenLens,
}) => {
  const navigation = useNavigationHistory();
  const [isVisible, setIsVisible] = useState(true);
  const isVisionOpen = navigation.stack[0]?.id === 'app:vision';
  const lastScrollY = useRef(0);
  useBodyScrollLock(isVisionOpen);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsVisible(!(currentScrollY > lastScrollY.current && currentScrollY > 80));
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isVisionOpen) return;
    setIsVisible(true);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') navigation.back(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isVisionOpen]);

  return (
    <>
      {isVisionOpen && (
        <section
          className="fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-brand-light/15 px-5 backdrop-blur-[28px] backdrop-saturate-150"
          role="dialog"
          aria-modal="true"
          aria-label="Ayvisi Vision — bientôt disponible"
          dir="rtl"
        >
          <div className="pointer-events-none absolute -left-24 top-[12%] h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-28 bottom-[8%] h-80 w-80 rounded-full bg-brand-light/20 blur-3xl" />
          <button
            type="button"
            onClick={() => navigation.back()}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-2xl border border-white/70 bg-white/45 text-ink shadow-lg shadow-brand/10 backdrop-blur-xl transition hover:bg-white/70 active:scale-95"
            aria-label="Fermer Ayvisi"
          >
            <X size={20}/>
          </button>

          <div className="relative w-full max-w-sm overflow-hidden rounded-[30px] border border-white/75 bg-white/42 px-6 py-10 text-center shadow-[0_28px_80px_-34px_rgba(56,25,115,0.45)] backdrop-blur-2xl">
            <div className="relative mx-auto grid h-24 w-24 place-items-center">
              <span className="absolute inset-1 animate-pulse rounded-full border border-brand/20 bg-brand/10" />
              <span className="absolute inset-4 rounded-full border border-brand/20 bg-white/45 backdrop-blur-md" />
              <AyvisiNavIcon size={48} className="relative text-brand drop-shadow-[0_8px_16px_rgba(103,61,230,0.25)]" />
            </div>
            <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.26em] text-brand">Ayvisi Vision</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-ink" dir="ltr">Coming Soon</h2>
            <p className="mx-auto mt-3 max-w-[260px] text-xs leading-6 text-muted">Une nouvelle expérience visuelle AYROVI est en préparation.</p>
          </div>
        </section>
      )}

      <div
        className={`fixed bottom-[max(.65rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[330px] -translate-x-1/2 transition-all duration-300 ease-out sm:bottom-5 ${
          isVisible ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-24 opacity-0'
        }`}
      >
        <nav
          className="grid h-[60px] grid-cols-3 items-center gap-1 rounded-[29px] border border-white/65 bg-white/52 p-1.5 shadow-[0_18px_50px_-24px_rgba(25,16,55,0.5)] backdrop-blur-[26px] backdrop-saturate-150"
          aria-label="Navigation principale"
          dir="rtl"
        >
          {/* RTL order: AYROVIX appears on the right. */}
          <button
            type="button"
            onClick={onOpenLens}
            className={`${NAV_ITEM} text-ink hover:bg-white/45 hover:shadow-sm`}
            aria-label="Ouvrir Ayrovix"
          >
            <AyrovixNavIcon size={25}/>
            <span dir="ltr">Ayrovix</span>
          </button>

          <button
            type="button"
            onClick={onToggleAiDrawer}
            className={`${NAV_ITEM} text-ink ${isAiDrawerOpen ? 'bg-white/70 shadow-[0_9px_22px_-14px_rgba(15,15,20,0.55)]' : 'hover:bg-white/45 hover:shadow-sm'}`}
            aria-label="Ouvrir Ayrovi"
            aria-pressed={isAiDrawerOpen}
          >
            <AyroviMotion state="idle" size={25} color="currentColor"/>
            <span dir="ltr">Ayrovi</span>
          </button>

          {/* AYVISI appears on the left. */}
          <button
            type="button"
            onClick={() => navigation.navigate([{ id: 'app:vision' }])}
            className={`${NAV_ITEM} text-ink hover:bg-white/45 hover:shadow-sm`}
            aria-label="Ouvrir Ayvisi Vision"
          >
            <AyvisiNavIcon size={26}/>
            <span dir="ltr">Ayvisi</span>
          </button>
        </nav>
      </div>
    </>
  );
};
