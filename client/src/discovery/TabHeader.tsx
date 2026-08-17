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
export const TabHeader: React.FC<TabHeaderProps> = ({ title, onClose }) => {
  const { tr } = useLocale();
  return (
    <AppHeader
      sticky
      title={title}
      subtitle="AYROVI"
      onClose={onClose}
      actionLabel={tr(`Fermer ${title}`, `إغلاق ${title}`)}
    />
  );
};
