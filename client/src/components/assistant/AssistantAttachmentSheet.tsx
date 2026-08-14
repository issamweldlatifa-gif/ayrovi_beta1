import React, { useRef } from 'react';
import { Camera, ChevronRight, Globe2, Image, Plug, X } from '../QatafoIcons';

interface AssistantAttachmentSheetProps {
  isOpen: boolean;
  isDark: boolean;
  webSearchEnabled: boolean;
  onClose: () => void;
  onPickFile: (file: File, kind: 'image' | 'file') => void;
  onToggleWebSearch: () => void;
  onConnectors: () => void;
}

export const AssistantAttachmentSheet: React.FC<AssistantAttachmentSheetProps> = ({
  isOpen,
  isDark,
  webSearchEnabled,
  onClose,
  onPickFile,
  onToggleWebSearch,
  onConnectors,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const rowClass = `flex w-full items-center justify-between rounded-[18px] p-3 text-left transition ${
    isDark ? 'bg-[#26262e] hover:bg-[#2f2f38]' : 'bg-[#f6f6f4] hover:bg-[#ececea]'
  }`;
  const iconClass = `flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm ${
    isDark ? 'bg-[#232329] text-zinc-300' : 'bg-white text-zinc-600'
  }`;

  const chooseFile = (kind: 'image' | 'file') => {
    const input = kind === 'image' ? imageInputRef.current : fileInputRef.current;
    input?.click();
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'file') => {
    const file = event.target.files?.[0];
    if (file) onPickFile(file, kind);
    event.target.value = '';
  };

  return (
    <>
      <button type="button" onClick={onClose} className="absolute inset-0 z-40 bg-black/45 backdrop-blur-[2px]" aria-label="Fermer" />
      <section className={`assistant-sheet absolute inset-x-0 bottom-0 z-50 max-h-[82%] overflow-y-auto rounded-t-[28px] px-5 pt-2 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(20,20,30,0.16)] ${isDark ? 'bg-[#232329]' : 'bg-white'}`} role="dialog" aria-modal="true" aria-label="Ajouter au chat">
        <div className={`mx-auto my-2 h-1 w-10 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />
        <div className="relative mb-5 flex items-center justify-center">
          <h2 className={`text-base font-bold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Ajouter au chat</h2>
          <button type="button" onClick={onClose} className={`absolute right-0 flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-[#2f2f38] text-zinc-300' : 'bg-[#f6f6f4] text-zinc-600'}`} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <button type="button" onClick={() => chooseFile('image')} className={rowClass}>
            <span className="flex items-center gap-3">
              <span className={iconClass}><Image className="h-4 w-4" /></span>
              <span><strong className={`block text-sm font-medium ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Ajouter une image</strong><small className="text-xs text-zinc-500">Joindre une image à la conversation</small></span>
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </button>

          <button type="button" onClick={() => chooseFile('file')} className={rowClass}>
            <span className="flex items-center gap-3">
              <span className={iconClass}><Camera className="h-4 w-4" /></span>
              <span><strong className={`block text-sm font-medium ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Prendre une photo</strong><small className="text-xs text-zinc-500">Photographier un produit, un prix ou une étiquette</small></span>
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </button>

          <button type="button" onClick={onToggleWebSearch} className={rowClass}>
            <span className="flex items-center gap-3">
              <span className={iconClass}><Globe2 className="h-4 w-4" /></span>
              <span><strong className={`block text-sm font-medium ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Recherche Web</strong><small className="text-xs text-zinc-500">Activer ou désactiver la recherche Web</small></span>
            </span>
            <span className={`relative h-[26px] w-11 rounded-full transition ${webSearchEnabled ? 'bg-brand' : isDark ? 'bg-zinc-700' : 'bg-zinc-300'}`}>
              <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition ${webSearchEnabled ? 'left-5' : 'left-0.5'}`} />
            </span>
          </button>

          <button type="button" onClick={onConnectors} className={rowClass}>
            <span className="flex items-center gap-3">
              <span className={iconClass}><Plug className="h-4 w-4" /></span>
              <span><strong className={`block text-sm font-medium ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Connecteurs</strong><small className="text-xs text-zinc-500">Accéder aux services connectés</small></span>
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </button>
        </div>

        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => handleChange(event, 'image')} />
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(event) => handleChange(event, 'file')} />
      </section>
    </>
  );
};
