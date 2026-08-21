import React, { useEffect, useRef, useState } from 'react';
import { Eye, LensBox, Sparkles } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import { useLocale } from '../i18n/LocaleContext';
import { AppHeader } from '../design/AppHeader';
import type { InterfaceIconLibrary, PublicInterfaceConfig } from '../config/interfaceConfig';
import { Bot as LucideBot, Eye as LucideEye, ScanSearch as LucideScanSearch } from 'lucide-react';
import { FaCamera, FaEye, FaRobot } from 'react-icons/fa6';
import { BsCamera, BsChatDots, BsEye } from 'react-icons/bs';
import { MdCenterFocusStrong, MdSmartToy, MdVisibility } from 'react-icons/md';

interface BottomNavBarProps {
  isAiDrawerOpen: boolean;
  onToggleAiDrawer: () => void;
  onOpenLens: () => void;
  config: PublicInterfaceConfig['navigation'];
  iconConfig: PublicInterfaceConfig['icons'];
}

const ICON_SETS: Record<InterfaceIconLibrary, [React.ElementType, React.ElementType, React.ElementType]> = {
  ayrovi: [LensBox, Sparkles, Eye],
  lucide: [LucideScanSearch, LucideBot, LucideEye],
  fontawesome: [FaCamera, FaRobot, FaEye],
  bootstrap: [BsCamera, BsChatDots, BsEye],
  material: [MdCenterFocusStrong, MdSmartToy, MdVisibility],
};
const NAV_ITEM = 'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-extrabold text-[#111318] transition duration-200 hover:bg-black/[0.05] active:scale-[0.96]';

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ isAiDrawerOpen, onToggleAiDrawer, onOpenLens, config, iconConfig }) => {
  const navigation = useNavigationHistory();
  const { tr, direction } = useLocale();
  const isVisionOpen = navigation.stack[0]?.id === 'app:vision';
  const [LensIcon, AiIcon, VisionIcon] = ICON_SETS[iconConfig.library];
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const frame = useRef<number | null>(null);
  const iconStyle = (active = false): React.CSSProperties => ({
    width: iconConfig.size,
    height: iconConfig.size,
    color: active ? (iconConfig.activeColor || '#fe7003') : '#111318',
    fill: iconConfig.style === 'solid' && ['ayrovi', 'lucide'].includes(iconConfig.library) ? 'currentColor' : undefined,
  });
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
        <section className="fixed inset-0 z-[90] overflow-y-auto bg-surface" role="dialog" aria-modal="true" aria-label={tr('Vision — bientôt disponible', 'Vision — قريبًا')} dir={direction}>
          <AppHeader title="AYROVI Vision" subtitle={tr('Nouveau module visuel', 'وحدة بصرية جديدة')} onClose={() => navigation.back()} />
          <div className="grid min-h-[calc(100dvh-5rem)] place-items-center px-5 pb-24 text-center">
            <div className="w-full max-w-sm rounded-card border border-line bg-white p-8 shadow-overlay">
              <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand/10 text-brand"><Eye className="h-10 w-10" /></span>
              <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.2em] text-brand">AYROVI Vision</p>
              <h2 className="mt-2 font-display text-3xl font-black text-ink">{tr('Bientôt disponible', 'قريبًا')}</h2>
              <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-muted">{tr('Une nouvelle expérience visuelle AYROVI est en préparation.', 'نعمل على تجربة بصرية جديدة من AYROVI.')}</p>
            </div>
          </div>
        </section>
      )}

      <div
        className={`ayrovi-glass-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t px-3 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1.5 ${isVisible ? 'is-visible' : 'is-hidden'}`}
        aria-hidden={!isVisible}
        inert={isVisible ? undefined : true}
      >
        <nav className="mx-auto grid max-w-md grid-cols-3 gap-1" style={{ minHeight: config.height }} aria-label={tr('Navigation principale', 'التنقل الرئيسي')} dir={direction}>
          <button type="button" onClick={onOpenLens} className={NAV_ITEM} aria-label={tr('Lens — recherche par image', 'Lens — البحث بالصورة')}>
            <LensIcon className="interface-runtime-icon" style={iconStyle(false)} />
            {config.showLabels && <span>{config.lensLabel}</span>}
          </button>
          <button type="button" onClick={onToggleAiDrawer} className={NAV_ITEM} aria-label={tr("SONIM — l'assistant IA d'AYROVI", 'SONIM — المساعد الذكي لـ AYROVI')} aria-pressed={isAiDrawerOpen}>
            <AiIcon className="interface-runtime-icon" style={iconStyle(isAiDrawerOpen)} />
            {config.showLabels && <span className={isAiDrawerOpen ? 'text-cta' : undefined}>{config.aiLabel}</span>}
          </button>
          <button type="button" onClick={() => navigation.navigate([{ id: 'app:vision' }])} className={NAV_ITEM} aria-label={tr('Vision — bientôt disponible', 'Vision — قريبًا')} aria-current={isVisionOpen ? 'page' : undefined}>
            <VisionIcon className="interface-runtime-icon" style={iconStyle(isVisionOpen)} />
            {config.showLabels && <span className={isVisionOpen ? 'text-cta' : undefined}>{config.visionLabel}</span>}
            <span className="absolute end-2 top-1.5 h-1.5 w-1.5 rounded-full bg-cta" aria-hidden="true" />
          </button>
        </nav>
      </div>
    </>
  );
};
