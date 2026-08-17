import React from 'react';
import { AppHeader } from '../design/AppHeader';
import { useLocale } from '../i18n/LocaleContext';

interface TabHeaderProps {
  current: number;
  total: number;
  title: string;
  onClose: () => void;
}

/** Shared header for Arrivals, Promotions, Social and Magazine. */
export const TabHeader: React.FC<TabHeaderProps> = ({ current, total, title, onClose }) => {
  const { tr } = useLocale();
  const counter = `${String(current).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  return (
    <AppHeader
      sticky
      title={title}
      subtitle="AYROVI"
      onClose={onClose}
      actionLabel={tr(`Fermer ${title}`, `إغلاق ${title}`)}
      actions={<span className="rounded-control bg-brand/10 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-brand-dark" aria-label={tr(`Onglet ${current} sur ${total}`, `التبويب ${current} من ${total}`)}>{counter}</span>}
    />
  );
};
