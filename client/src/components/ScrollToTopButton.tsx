import React, { useState, useEffect } from 'react';
import { ArrowUp } from './QatafoIcons';

export const ScrollToTopButton: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 140);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed right-4 sm:right-6 bottom-24 sm:bottom-28 z-40 w-11 h-11 rounded-full bg-white hover:bg-[#673de6] hover:text-white text-[#1d2130] border border-slate-200 shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in-75 duration-200 cursor-pointer"
      title="Retourner en haut"
      aria-label="Retourner en haut"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
};
