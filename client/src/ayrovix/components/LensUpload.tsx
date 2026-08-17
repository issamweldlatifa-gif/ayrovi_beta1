import React, { useRef } from 'react';
import { Image as ImageIcon } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

interface LensUploadProps {
  onImage: (file: File) => void;
}

/** Importer une image — galerie du téléphone (capture WhatsApp, screenshot boutique…). */
export const LensUpload: React.FC<LensUploadProps> = ({ onImage }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { tr } = useLocale();
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
        className="ay-btn-secondary h-auto w-full justify-start gap-4 rounded-card p-4 text-start"
      >
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand-light text-brand">
          <ImageIcon size={24} strokeWidth={1.8} />
        </span>
        <span>
          <span className="block text-sm font-extrabold text-ink">{tr('Importer une image', 'رفع صورة')}</span>
          <span className="mt-0.5 block text-[11px] font-medium text-muted">{tr("Capture d'écran ou photo déjà dans votre galerie", 'لقطة شاشة أو صورة موجودة في معرضك')}</span>
        </span>
      </button>
    </>
  );
};
