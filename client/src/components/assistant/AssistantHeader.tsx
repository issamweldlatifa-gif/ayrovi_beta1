import React from 'react';
import { Menu, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantHeaderProps { isDark: boolean; onOpenMenu: () => void; onClose: () => void }

/** In normal flow: controls never float over a response or product result. */
export const AssistantHeader: React.FC<AssistantHeaderProps> = ({ isDark, onOpenMenu, onClose }) => {
  const { tr, direction } = useLocale();
  const iconButton = 'grid h-11 w-11 place-items-center border border-transparent transition hover:border-current';
  return <header className={`assistant-editorial-header shrink-0 border-b ${isDark ? 'border-white/15 bg-ink text-white' : 'border-line bg-white text-ink'}`} dir={direction}>
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pb-2 pt-[max(.5rem,env(safe-area-inset-top))]">
      <button type="button" onClick={onOpenMenu} className={iconButton} aria-label={tr('Menu', 'القائمة')}><Menu size={24} /></button>
      <div className="text-center"><strong className="block text-base font-medium tracking-[.14em]" dir="ltr">SONIM</strong><span className="text-xs text-muted">AYROVI</span></div>
      <button type="button" onClick={onClose} className={iconButton} aria-label={tr('Fermer SONIM', 'إغلاق SONIM')}><X size={24} /></button>
    </div>
  </header>;
};
