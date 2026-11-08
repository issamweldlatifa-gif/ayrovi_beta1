import { AssistantMediaPending } from './AssistantMediaPending';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import React, { useRef } from 'react';
import { Camera, Paperclip, Image, Search, LensBox, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
interface AssistantAttachmentSheetProps {
  isOpen: boolean; isDark: boolean; pendingAttachments?: number; onCancelAttachments?: () => void;
  webSearchEnabled: boolean; onClose: () => void;
  onPickFile: (file: File, kind: 'image' | 'file') => void;
  onToggleWebSearch: () => void; onConnectors: () => void;
  onOpenCamera?: () => void; onOpenAyWebs?: () => void; onOpenLens?: () => void;
}
export const AssistantAttachmentSheet: React.FC<AssistantAttachmentSheetProps> = ({ isOpen, pendingAttachments = 0, onCancelAttachments, onClose, onPickFile, onOpenCamera, onOpenAyWebs, onOpenLens }) => {
  const { direction, tr } = useLocale();
  const images = useRef<HTMLInputElement>(null), files = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null); useDialogFocus(panel, isOpen);
  if (!isOpen) return null;
  const change = (event: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'file') => {
    const file = event.target.files?.[0]; if (file) onPickFile(file, kind); event.target.value = '';
  };
  const rows = [
    { label: tr('Appareil photo', 'الكاميرا'), Icon: Camera, action: () => onOpenCamera ? onOpenCamera() : camera.current?.click() },
    { label: 'AYWEBs', Icon: Search, asset: '/media/clean/nav-aywebs-v1.svg', action: onOpenAyWebs },
    { label: 'Lens', Icon: LensBox, asset: '/media/clean/nav-lens-v1.svg', action: onOpenLens },
    { label: tr('Photos', 'الصور'), Icon: Image, action: () => images.current?.click() },
    { label: tr('Fichiers', 'الملفات'), Icon: Paperclip, action: () => files.current?.click() },
  ];
  return <>
    <button type="button" onClick={onClose} className="absolute inset-0 z-40 bg-black/30" aria-label={tr('Fermer', 'إغلاق')} />
    <section ref={panel} tabIndex={-1} className="clean-attachment-sheet" dir={direction} role="dialog" aria-modal="true" aria-label={tr('Ajouter au chat', 'إضافة إلى المحادثة')}>
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-black/10" />
      <button type="button" onClick={onClose} className="absolute end-3 top-2 grid h-11 w-11 place-items-center" aria-label={tr('Fermer', 'إغلاق')}><X appearance="clean" size={20} /></button>
      {pendingAttachments > 0 && <AssistantMediaPending phase="images" count={pendingAttachments} onCancel={onCancelAttachments} />}
      <div className="pt-7">{rows.map(({ label, Icon, action, asset }) => <button key={label} type="button" onClick={action} disabled={!action} className="clean-attachment-row"><span className="clean-attachment-icon"><>{asset ? <img src={asset} width={24} height={24} alt="" aria-hidden="true" /> : <Icon appearance="clean" size={24} />}</></span><span>{label}</span></button>)}</div>
      <input ref={images} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={event => change(event, 'image')} />
      <input ref={files} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={event => change(event, 'file')} />
      <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={event => change(event, 'image')} />
    </section>
  </>;
};
