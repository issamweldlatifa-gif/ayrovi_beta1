import { CleanWordmark } from './CleanVisuals';
import React from 'react';
import { CleanMenu } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantHeaderProps { isDark: boolean; onOpenMenu: () => void; onClose: () => void }

/** In normal flow: controls never float over a response or product result. */
export const AssistantHeader: React.FC<AssistantHeaderProps> = ({ isDark, onOpenMenu }) => {
  const { tr, direction } = useLocale();
  const iconButton = 'grid h-11 w-11 place-items-center border border-transparent transition hover:border-current';
  return <header className={`assistant-editorial-header shrink-0 border-b ${isDark ? 'border-white/15 bg-ink text-white' : 'border-line bg-white text-ink'}`} dir={direction}>
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pb-2 pt-[max(.5rem,env(safe-area-inset-top))]">
      <button type="button" onClick={onOpenMenu} className={iconButton} aria-label={tr('Menu', 'القائمة')}><CleanMenu appearance="clean" size={24} /></button>
      <CleanWordmark />
      <span className="h-11 w-11" aria-hidden="true" />
    </div>
  </header>;
};
