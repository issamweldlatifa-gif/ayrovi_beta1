import React, { useEffect } from 'react';
import { Eye, LensBox, MessageCircle } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import { useLocale } from '../i18n/LocaleContext';
import { AppHeader } from '../design/AppHeader';

interface BottomNavBarProps {
  isAiDrawerOpen: boolean;
  onToggleAiDrawer: () => void;
  onOpenLens: () => void;
}

const NAV_ITEM = 'relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-control text-[10px] font-extrabold text-ink transition hover:bg-brand/5 active:scale-[0.97]';

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ isAiDrawerOpen, onToggleAiDrawer, onOpenLens }) => {
  const navigation = useNavigationHistory();
  const { tr, direction } = useLocale();
  const isVisionOpen = navigation.stack[0]?.id === 'app:vision';
  useBodyScrollLock(isVisionOpen);

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

      <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-white/95 px-3 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-lg">
        <nav className="mx-auto grid h-16 max-w-md grid-cols-3 gap-1" aria-label={tr('Navigation principale', 'التنقل الرئيسي')} dir={direction}>
          <button type="button" onClick={onOpenLens} className={NAV_ITEM} aria-label={tr('Lens — recherche par image', 'Lens — البحث بالصورة')}>
            <LensBox className="h-5 w-5 text-brand" />
            <span>Lens</span>
          </button>
          <button type="button" onClick={onToggleAiDrawer} className={`${NAV_ITEM} ${isAiDrawerOpen ? 'bg-brand/10 text-brand-dark' : ''}`} aria-label={tr('AI — assistant conversationnel', 'AI — المساعد الذكي')} aria-pressed={isAiDrawerOpen}>
            <MessageCircle className="h-5 w-5 text-brand" />
            <span>AI</span>
          </button>
          <button type="button" onClick={() => navigation.navigate([{ id: 'app:vision' }])} className={NAV_ITEM} aria-label={tr('Vision — bientôt disponible', 'Vision — قريبًا')}>
            <Eye className="h-5 w-5 text-brand" />
            <span>Vision</span>
            <span className="absolute end-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-black text-ink">{tr('Bientôt', 'قريبًا')}</span>
          </button>
        </nav>
      </div>
    </>
  );
};
