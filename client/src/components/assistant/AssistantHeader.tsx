import React from 'react';
import { Menu, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantHeaderProps {
  isDark: boolean;
  onOpenMenu: () => void;
  onClose: () => void;
}

export const AssistantHeader: React.FC<AssistantHeaderProps> = ({ isDark, onOpenMenu, onClose }) => {
  const { tr } = useLocale();
  const chip = isDark
    ? 'border-white/10 bg-white/10 text-white shadow-[0_8px_24px_-16px_rgba(0,0,0,.7)]'
    : 'border-black/[0.04] bg-white/72 text-[#111318] shadow-[0_8px_24px_-18px_rgba(17,19,24,.45)]';
  const iconBtn = 'flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40" aria-label={tr('Commandes SONIM', 'أوامر SONIM')}>
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-24 ${isDark ? 'bg-gradient-to-b from-ink/80 to-transparent' : 'bg-gradient-to-b from-white/80 to-transparent'}`}
        aria-hidden="true"
      />
      <div
        className="pointer-events-auto relative flex items-center justify-between px-3"
        dir="ltr"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={onOpenMenu}
          className={`${iconBtn} ${chip} backdrop-blur-xl`}
          aria-label={tr('Menu', 'القائمة')}
          title={tr('Menu', 'القائمة')}
        >
          <Menu className="h-7 w-7" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`${iconBtn} ${chip} backdrop-blur-xl`}
          aria-label={tr('Fermer SONIM', 'إغلاق SONIM')}
          title={tr('Fermer SONIM', 'إغلاق SONIM')}
        >
          <X className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
};
