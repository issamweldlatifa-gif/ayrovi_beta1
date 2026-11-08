import React, { useEffect, useRef, useState } from 'react';
import { Vision } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import { useLocale } from '../i18n/LocaleContext';
import { AppHeader } from '../design/AppHeader';
import type { PublicInterfaceConfig } from '../config/interfaceConfig';

interface BottomNavBarProps {
  isAiDrawerOpen: boolean;
  onToggleAiDrawer: () => void;
  onOpenLens: () => void;
  onOpenAyWebs: () => void;
  ayWebsEnabled?: boolean;
  config: PublicInterfaceConfig['navigation'];
  iconConfig: PublicInterfaceConfig['icons'];
}

const NAV_ITEM = 'relative flex min-w-0 flex-col items-center justify-center gap-2.5 rounded-control text-xs font-extrabold text-ink transition duration-200 hover:bg-ink-deep/5 active:scale-[0.96]';

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ isAiDrawerOpen, onToggleAiDrawer, onOpenLens, onOpenAyWebs, ayWebsEnabled = true, config }) => {
  const navigation = useNavigationHistory();
  const { tr, direction } = useLocale();
  const isVisionOpen = navigation.stack[0]?.id === 'app:vision';
  const isAyWebsOpen = navigation.stack[0]?.id === 'app:aywebs';
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const frame = useRef<number | null>(null);
  const iconStyle = (_active = false): React.CSSProperties => ({ width: 28, height: 28, color: 'var(--ayrovi-text-primary)', flexShrink: 0 });
  const monochrome = (name: string) => <span aria-hidden="true" style={{ ...iconStyle(), backgroundColor: 'currentColor', maskImage: `url(${name})`, WebkitMaskImage: `url(${name})`, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: 'center', WebkitMaskPosition: 'center' }} />;
  useBodyScrollLock(isVisionOpen);

  useEffect(() => {
    lastScrollY.current = Math.max(0, window.scrollY);
    const updateVisibility = () => {
      frame.current = null;
      const current = Math.max(0, window.scrollY);
      const delta = current - lastScrollY.current;
      if (current <= 24) setIsVisible(true);
      else if (delta > 8) setIsVisible(false);
      else if (delta < -8) setIsVisible(true);
      lastScrollY.current = current;
    };
    const onScroll = () => {
      if (frame.current === null) frame.current = window.requestAnimationFrame(updateVisibility);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  useEffect(() => {
    if (!isVisionOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') navigation.back(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isVisionOpen, navigation]);

  return (
    <>
      {isVisionOpen && (
        <section className="fixed inset-0 z-50 overflow-y-auto bg-surface" role="dialog" aria-modal="true" aria-label={tr('Vision — bientôt disponible', 'Vision — قريبًا')} dir={direction}>
          <AppHeader title="ZAYROVI Vision" subtitle={tr('Nouveau module visuel', 'وحدة بصرية جديدة')} onClose={() => navigation.back()} />
          <div className="grid min-h-[calc(100dvh-5rem)] place-items-center px-5 pb-24 text-center">
            <div className="w-full max-w-sm rounded-card border border-line bg-white p-8 shadow-overlay">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-control bg-surface text-ink"><Vision className="h-11 w-11" /></span>
              <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.2em] text-ink">ZAYROVI Vision</p>
              <h2 className="mt-2 font-display text-3xl font-black text-ink">{tr('Bientôt disponible', 'قريبًا')}</h2>
              <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-muted">{tr('Une nouvelle expérience visuelle ZAYROVI est en préparation.', 'نعمل على تجربة بصرية جديدة من ZAYROVI.')}</p>
            </div>
          </div>
        </section>
      )}

      <div
        className={`ayrovi-glass-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t px-3 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1 ${isVisible ? 'is-visible' : 'is-hidden'}`}
        aria-hidden={!isVisible}
        inert={isVisible ? undefined : true}
      >
        <nav className="mx-auto grid max-w-lg grid-cols-5 gap-1" style={{ minHeight: Math.min(config.height, 56) }} aria-label={tr('Navigation principale', 'التنقل الرئيسي')} dir={direction}>
          <button type="button" onClick={() => navigation.goHome()} className={NAV_ITEM} aria-label={tr('Accueil', 'الرئيسية')}>{monochrome('/media/clean/nav-home-v1.svg')}</button>
          <button type="button" onClick={onOpenLens} className={NAV_ITEM} aria-label={tr('Lens — recherche par image', 'Lens — البحث بالصورة')}>{monochrome('/media/clean/nav-lens-v1.svg')}</button>
          <button type="button" onClick={onToggleAiDrawer} className={NAV_ITEM} aria-label={tr('Clean', 'Clean')} aria-pressed={isAiDrawerOpen}><img src="/media/clean-message.svg" alt="" aria-hidden="true" style={iconStyle()} /></button>
          <button type="button" onClick={onOpenAyWebs} disabled={!ayWebsEnabled} className={NAV_ITEM} aria-label={tr('AYWEBs', 'AYWEBs')} aria-current={isAyWebsOpen ? 'page' : undefined}>{monochrome('/media/clean/nav-aywebs-v1.svg')}</button>
          <button type="button" onClick={() => navigation.navigate([{ id: 'app:account' }])} className={NAV_ITEM} aria-label={tr('Profil', 'حسابي')}>{monochrome('/media/clean/nav-profile-v1.svg')}</button>
        </nav>
      </div>
    </>
  );
};
