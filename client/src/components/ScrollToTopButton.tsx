import React, { useState, useEffect } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { ArrowUp } from './QatafoIcons';

export const ScrollToTopButton: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
  const { tr } = useLocale();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 140);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  if (!isVisible || hidden) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="fixed end-4 sm:end-6 bottom-24 sm:bottom-28 z-20 w-11 h-11 rounded-control bg-white hover:bg-ink hover:text-white text-ink border border-line shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in-75 duration-200 cursor-pointer"
      title={tr('Retourner en haut', 'العودة إلى الأعلى')}
      aria-label={tr('Retourner en haut', 'العودة إلى الأعلى')}
    >
      <ArrowUp className="interface-runtime-icon" />
    </button>
  );
};
