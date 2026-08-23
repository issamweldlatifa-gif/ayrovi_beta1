import React, { useEffect, useState } from 'react';
import { ArrowRight } from './QatafoIcons';

interface TopAnnouncementBarProps {
  onLearnMore?: () => void;
}

/** رسائل الشريط الإعلاني — تُعرض بالتتابع بتدوير هادئ وفاخر */
const ANNOUNCEMENTS = [
  'Taux fixe garanti',
  'Dédouanement inclus',
  'Livraison dans les 24 gouvernorats',
  'Acompte sécurisé de 20 %',
  'Prix confirmé avant commande',
];

const HOLD_MS = 3400; // مدة عرض الرسالة
const EXIT_MS = 420;  // مدة خروج النص القديم قبل دخول الجديد

export const TopAnnouncementBar: React.FC<TopAnnouncementBarProps> = ({ onLearnMore }) => {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cycleTimer = 0;
    let swapTimer = 0;
    const schedule = () => {
      cycleTimer = window.setTimeout(() => {
        if (cancelled) return;
        setLeaving(true);
        swapTimer = window.setTimeout(() => {
          if (cancelled) return;
          setIndex((current) => (current + 1) % ANNOUNCEMENTS.length);
          setLeaving(false);
          schedule();
        }, EXIT_MS);
      }, HOLD_MS);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(cycleTimer);
      window.clearTimeout(swapTimer);
    };
  }, []);

  return (
    <div className="interface-announcement relative z-10 flex items-center justify-center gap-2 px-4 py-2 text-center text-xs font-bold tracking-tight sm:text-sm">
      <span aria-live="polite" className={`block ${leaving ? 'announcement-out' : 'announcement-in'}`}>{ANNOUNCEMENTS[index]}</span>
      {onLearnMore && (
        <button
          onClick={onLearnMore}
          className="hidden sm:inline-flex items-center text-xs underline font-extrabold ml-1 transition-colors cursor-pointer hover:opacity-80"
        >
          <span>En savoir plus</span>
          <ArrowRight className="w-3 h-3 ml-0.5" />
        </button>
      )}
    </div>
  );
};
