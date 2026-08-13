import React, { useRef } from 'react';

interface LensCameraProps {
  onImage: (file: File) => void;
}

/**
 * 📷 Photographier — ouvre la caméra arrière quand le navigateur le permet
 * (capture="environment"). Sinon le sélecteur de fichiers natif prend le relais :
 * le fallback est donc garanti partout.
 */
export const LensCamera: React.FC<LensCameraProps> = ({ onImage }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImage(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="bg-brand-gradient flex w-full items-center gap-4 rounded-[22px] p-4 text-left text-white shadow-lg shadow-brand/25 transition active:scale-[0.98]"
      >
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white/15">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3" y="7" width="18" height="13" rx="3" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8.5 7 10 4.5h4L15.5 7" />
          </svg>
        </span>
        <span>
          <span className="block text-sm font-extrabold">Photographier</span>
          <span className="mt-0.5 block text-[11px] font-medium text-white/80">Prenez le produit en photo — la caméra s'ouvre directement</span>
        </span>
      </button>
    </>
  );
};
