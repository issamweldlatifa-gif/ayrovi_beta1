import React from 'react';
import { ArrowRight } from './QatafoIcons';

interface TopAnnouncementBarProps {
  onLearnMore?: () => void;
}

export const TopAnnouncementBar: React.FC<TopAnnouncementBarProps> = ({ onLearnMore }) => {
  return (
    <div className="bg-accent text-ink py-2 px-4 text-center text-xs sm:text-sm font-bold tracking-tight z-50 relative flex items-center justify-center gap-2">
      <span><strong>Taux fixe garanti</strong> — Dédouanement inclus & livraison dans les 24 gouvernorats</span>
      {onLearnMore && (
        <button
          onClick={onLearnMore}
          className="hidden sm:inline-flex items-center text-xs underline font-extrabold hover:text-brand-dark ml-1 transition-colors cursor-pointer"
        >
          <span>En savoir plus</span>
          <ArrowRight className="w-3 h-3 ml-0.5" />
        </button>
      )}
    </div>
  );
};
