import React from 'react';
import { ArrowLeft, Menu } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantHeaderProps {
  isDark: boolean;
  onBack: () => void;
  onOpenMenu: () => void;
}

export const AssistantHeader: React.FC<AssistantHeaderProps> = ({ isDark, onBack, onOpenMenu }) => {
  const { tr } = useLocale();
  const iconButton = `flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 ${
    isDark ? 'text-white hover:bg-white/10' : 'text-[#111318] hover:bg-black/[0.04]'
  }`;

  return (
    <header
      className={`sonim-chat-toolbar relative z-40 shrink-0 border-b ${isDark ? 'border-white/10 bg-ink/90' : 'border-[#EDEDED] bg-white/92'}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        backdropFilter: 'saturate(1.4) blur(14px)',
        WebkitBackdropFilter: 'saturate(1.4) blur(14px)',
      }}
    >
      <div className="grid h-[52px] grid-cols-[40px_minmax(0,1fr)_40px] items-center px-4" dir="ltr">
        <button type="button" onClick={onBack} className={iconButton} aria-label={tr('Retour', 'رجوع')} title={tr('Retour', 'رجوع')}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center justify-center gap-2">
          <img src="/media/logo-ayrovi.png" alt="" className="h-[26px] w-[26px] shrink-0 bg-transparent object-contain" />
          <strong className={`truncate text-[15px] font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-[#111318]'}`}>SONIM</strong>
        </div>
        <button type="button" onClick={onOpenMenu} className={`${iconButton} justify-self-end`} aria-label={tr('Menu', 'القائمة')} title={tr('Menu', 'القائمة')}>
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
};
