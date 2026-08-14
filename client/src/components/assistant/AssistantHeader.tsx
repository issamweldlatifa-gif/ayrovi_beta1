import React from 'react';
import { ArrowLeft, History } from '../QatafoIcons';
import { AyroviMotion, AyroviMotionState } from '../AyroviMotion';

interface AssistantHeaderProps {
  isDark: boolean;
  motionState: AyroviMotionState;
  onBack: () => void;
  onOpenHistory: () => void;
}

export const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  isDark,
  motionState,
  onBack,
  onOpenHistory,
}) => {
  const iconButton = isDark
    ? 'text-zinc-300 hover:bg-white/7 hover:text-white'
    : 'text-zinc-700 hover:bg-black/[0.045] hover:text-zinc-950';

  return (
    <header className={`relative z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-3 pb-2.5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-[18px] ${isDark ? 'border-white/8 bg-[#1a1a1f]' : 'border-[#ebe9e5] bg-[#fbfaf8]'}`}>
      <button
        type="button"
        onClick={onBack}
        className={`flex h-10 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition active:scale-95 ${iconButton}`}
        aria-label="Retour"
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
        <span className="hidden min-[360px]:inline">Retour</span>
      </button>

      <div className={`flex min-w-0 items-center justify-center gap-2 font-extrabold tracking-[-0.045em] ${isDark ? 'text-zinc-50' : 'text-[#111111]'}`} aria-label="AYROVI Assistant">
        <AyroviMotion state={motionState} size={27} color={isDark ? '#fafafa' : '#0a0a0a'} />
        <span className="text-[15px] leading-none">AYROVI</span>
      </div>

      <button
        type="button"
        onClick={onOpenHistory}
        className={`ml-auto flex h-10 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition active:scale-95 ${iconButton}`}
        aria-label="Ouvrir l’historique des conversations"
      >
        <History className="h-[17px] w-[17px]" />
        <span className="hidden min-[390px]:inline">Historique</span>
      </button>
    </header>
  );
};
