import React, { useEffect, useRef, useState } from 'react';
import { Menu, MoreVertical, Pencil, Share2, Trash2, X } from '../QatafoIcons';

interface AssistantHeaderProps {
  isDark: boolean;
  onOpenMenu: () => void;
  onClose: () => void;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  isDark,
  onOpenMenu,
  onClose,
  onShare,
  onRename,
  onDelete,
}) => {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsActionsOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  const iconButton = isDark
    ? 'text-zinc-400 hover:bg-white/7 hover:text-zinc-100'
    : 'text-zinc-500 hover:bg-black/[0.045] hover:text-zinc-900';

  return (
    <header className={`relative z-20 flex items-center justify-between px-[18px] pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] ${isDark ? 'bg-[#1a1a1f]' : 'bg-[#fbfaf8]'}`}>
      <button
        type="button"
        onClick={onOpenMenu}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 ${iconButton}`}
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <span className={`absolute left-1/2 -translate-x-1/2 text-sm font-bold tracking-tight ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
        ayrovi
      </span>

      <div ref={menuRef} className="relative flex items-center gap-1">
        <button
          type="button"
          onClick={() => setIsActionsOpen((open) => !open)}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 ${iconButton}`}
          aria-label="Plus d’options"
          aria-expanded={isActionsOpen}
        >
          <MoreVertical className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 ${iconButton}`}
          aria-label="Fermer l’assistant"
        >
          <X className="h-[18px] w-[18px]" />
        </button>

        {isActionsOpen && (
          <div className={`absolute right-10 top-12 w-56 rounded-2xl p-1.5 shadow-[0_24px_48px_rgba(20,20,30,0.18)] ring-1 ${isDark ? 'bg-[#232329] ring-white/10' : 'bg-white ring-black/5'}`}>
            <button type="button" onClick={() => { onShare(); setIsActionsOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${isDark ? 'text-zinc-100 hover:bg-white/7' : 'text-zinc-800 hover:bg-[#f6f6f4]'}`}>
              <Share2 className="h-4 w-4 text-zinc-400" /> Partager la discussion
            </button>
            <button type="button" onClick={() => { onRename(); setIsActionsOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${isDark ? 'text-zinc-100 hover:bg-white/7' : 'text-zinc-800 hover:bg-[#f6f6f4]'}`}>
              <Pencil className="h-4 w-4 text-zinc-400" /> Renommer
            </button>
            <button type="button" onClick={() => { onDelete(); setIsActionsOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50/80">
              <Trash2 className="h-4 w-4" /> Supprimer la discussion
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
