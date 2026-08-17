import React, { useRef } from 'react';
import { Camera, ChevronRight, Globe2, Image, Plug, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

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
  const { direction, tr } = useLocale();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const rowClass = `flex w-full items-center justify-between rounded-[18px] p-3 text-start transition ${
    isDark ? 'bg-ink hover:bg-ink' : 'bg-surface hover:bg-line'
  }`;
  const iconClass = `flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm ${
    isDark ? 'bg-ink text-white/80' : 'bg-white text-muted'
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
      <button type="button" onClick={onClose} className="absolute inset-0 z-40 bg-ink/45 backdrop-blur-[2px]" aria-label={tr('Fermer', 'إغلاق')} />
      <section className={`assistant-sheet absolute inset-x-0 bottom-0 z-50 max-h-[82%] overflow-y-auto rounded-t-[28px] px-5 pt-2 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-overlay ${isDark ? 'bg-ink' : 'bg-white'}`} dir={direction} role="dialog" aria-modal="true" aria-label={tr('Ajouter au chat', 'إضافة إلى المحادثة')}>
        <div className={`mx-auto my-2 h-1 w-10 rounded-full ${isDark ? 'bg-ink/70' : 'bg-line'}`} />
        <div className="relative mb-5 flex items-center justify-center">
          <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-ink'}`}>{tr('Ajouter au chat', 'إضافة إلى المحادثة')}</h2>
          <button type="button" onClick={onClose} className={`absolute end-0 flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-ink text-white/80' : 'bg-surface text-muted'}`} aria-label={tr('Fermer', 'إغلاق')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <button type="button" onClick={() => chooseFile('image')} className={rowClass}>
            <span className="flex items-center gap-3">
              <span className={iconClass}><Image className="h-4 w-4" /></span>
              <span><strong className={`block text-sm font-medium ${isDark ? 'text-white' : 'text-ink'}`}>{tr('Ajouter une image', 'إضافة صورة')}</strong><small className="text-xs text-muted">{tr('Joindre une image à la conversation', 'إرفاق صورة بالمحادثة')}</small></span>
            </span>
            <ChevronRight className={`h-4 w-4 text-muted ${direction === 'rtl' ? 'rotate-180' : ''}`} />
          </button>

          <button type="button" onClick={() => chooseFile('file')} className={rowClass}>
            <span className="flex items-center gap-3">
              <span className={iconClass}><Camera className="h-4 w-4" /></span>
              <span><strong className={`block text-sm font-medium ${isDark ? 'text-white' : 'text-ink'}`}>{tr('Prendre une photo', 'التقاط صورة')}</strong><small className="text-xs text-muted">{tr('Photographier un produit, un prix ou une étiquette', 'تصوير منتج أو سعر أو ملصق')}</small></span>
            </span>
            <ChevronRight className={`h-4 w-4 text-muted ${direction === 'rtl' ? 'rotate-180' : ''}`} />
          </button>

          <button type="button" onClick={onToggleWebSearch} className={rowClass}>
            <span className="flex items-center gap-3">
              <span className={iconClass}><Globe2 className="h-4 w-4" /></span>
              <span><strong className={`block text-sm font-medium ${isDark ? 'text-white' : 'text-ink'}`}>{tr('Recherche Web', 'بحث الويب')}</strong><small className="text-xs text-muted">{tr('Activer ou désactiver la recherche Web', 'تشغيل بحث الويب أو إيقافه')}</small></span>
            </span>
            <span className={`relative h-[26px] w-11 rounded-full transition ${webSearchEnabled ? 'bg-brand' : isDark ? 'bg-ink/70' : 'bg-line'}`}>
              <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition ${webSearchEnabled ? (direction === 'rtl' ? 'right-5' : 'left-5') : (direction === 'rtl' ? 'right-0.5' : 'left-0.5')}`} />
            </span>
          </button>

          <button type="button" onClick={onConnectors} className={rowClass}>
            <span className="flex items-center gap-3">
              <span className={iconClass}><Plug className="h-4 w-4" /></span>
              <span><strong className={`block text-sm font-medium ${isDark ? 'text-white' : 'text-ink'}`}>{tr('Connecteurs', 'الخدمات المتصلة')}</strong><small className="text-xs text-muted">{tr('Accéder aux services connectés', 'الوصول إلى الخدمات المتصلة')}</small></span>
            </span>
            <ChevronRight className={`h-4 w-4 text-muted ${direction === 'rtl' ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => handleChange(event, 'image')} />
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(event) => handleChange(event, 'file')} />
      </section>
    </>
  );
};
