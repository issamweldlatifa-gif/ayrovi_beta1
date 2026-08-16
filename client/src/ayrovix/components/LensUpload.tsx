import React, { useRef } from 'react';
import { Image as ImageIcon } from '../../components/QatafoIcons';

interface LensUploadProps {
  onImage: (file: File) => void;
}

/** Importer une image — galerie du téléphone (capture WhatsApp, screenshot boutique…). */
export const LensUpload: React.FC<LensUploadProps> = ({ onImage }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
        className="flex w-full items-center gap-4 rounded-[22px] border border-line bg-white p-4 text-left transition hover:border-brand active:scale-[0.98]"
      >
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand-light text-brand">
          <ImageIcon size={24} strokeWidth={1.8} />
        </span>
        <span>
          <span className="block text-sm font-extrabold text-ink">Importer une image</span>
          <span className="mt-0.5 block text-[11px] font-medium text-muted">Capture d'écran ou photo déjà dans votre galerie</span>
        </span>
      </button>
    </>
  );
};
