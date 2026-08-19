import React from 'react';
import { ArrowRight } from './QatafoIcons';

interface TopAnnouncementBarProps {
  onLearnMore?: () => void;
}

export const TopAnnouncementBar: React.FC<TopAnnouncementBarProps> = ({ onLearnMore }) => {
  return (
    <div className="interface-announcement relative z-10 flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-xs font-bold tracking-tight text-ink sm:text-sm">
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
