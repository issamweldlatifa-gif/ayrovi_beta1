import React from 'react';
import { ArrowLeft, X } from '../components/QatafoIcons';
import { Button } from './Button';
import { useLocale } from '../i18n/LocaleContext';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
  actionLabel?: string;
  actionDisabled?: boolean;
  actions?: React.ReactNode;
  sticky?: boolean;
  tone?: 'light' | 'dark';
  className?: string;
}

/** Shared AYROVI header: stable logo/title placement and one accessible action area. */
export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  onBack,
  onClose,
  actionLabel,
  actionDisabled = false,
  actions,
  sticky = false,
  tone = 'light',
  className = '',
}) => {
  const { tr, direction } = useLocale();
  const action = onBack || onClose;
  const label = actionLabel || (onBack ? tr('Retour', 'رجوع') : tr('Fermer', 'إغلاق'));

  return (
    <header className={`${sticky ? 'sticky top-0' : ''} z-40 border-b ${tone === 'dark' ? 'border-white/10 bg-ink' : 'border-line bg-white'} ${className}`}>
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
        <div className="flex min-w-0 items-center gap-3" dir="ltr">
          <img src="/media/logo-ayrovi.png" alt="AYROVI" className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11" />
          <div className="min-w-0" dir={direction}>
            <strong className={`block truncate font-display text-base font-black sm:text-lg ${tone === 'dark' ? 'text-white' : 'text-ink'}`}>{title}</strong>
            {subtitle && <span className={`block truncate text-[10px] font-bold sm:text-xs ${tone === 'dark' ? 'text-white/60' : 'text-muted'}`}>{subtitle}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5" dir={direction}>
          {actions}
          {action && (
            <Button variant="ghost" size="icon" onClick={action} disabled={actionDisabled} aria-label={label} title={label} className={tone === 'dark' ? 'text-white hover:bg-white/10' : ''}>
              {onBack ? <ArrowLeft className={`h-5 w-5 ${direction === 'rtl' ? 'rotate-180' : ''}`} /> : <X className="h-5 w-5" />}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
