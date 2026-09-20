import React from 'react';
import { Loader2, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

/** One progress/cancellation contract for both text and hands-free surfaces. */
export function AssistantMediaPending({ phase, count = 1, onCancel }: { phase: 'images' | 'permission' | 'transcribing'; count?: number; onCancel?: () => void }) {
  const { tr } = useLocale();
  const label = phase === 'images' ? tr(`Préparation des images (${count})…`, `جارٍ تجهيز الصور (${count})…`)
    : phase === 'permission' ? tr('Autorisation du microphone en attente…', 'في انتظار إذن الميكروفون…')
      : tr('Transcription en cours…', 'جارٍ تحويل الصوت إلى نص…');
  const cancel = phase === 'images' ? tr('Annuler la préparation des images', 'إلغاء تجهيز الصور')
    : phase === 'permission' ? tr('Annuler la demande de microphone', 'إلغاء طلب الميكروفون')
      : tr('Annuler la transcription', 'إلغاء تحويل الصوت إلى نص');
  return <div data-media-pending={phase} className="ay-readable-label mb-3 flex flex-wrap items-center gap-2 border border-line p-2 text-sm leading-6">
    <span role="status" className="flex min-w-0 flex-1 basis-32 items-center gap-2"><Loader2 size={20} className="shrink-0 animate-spin"/><span className="ay-readable-label">{label}</span></span>
    {onCancel && <button type="button" onClick={onCancel} aria-label={cancel} className="flex min-h-11 min-w-11 items-center justify-center gap-1 px-2 text-xs"><X size={20}/>{tr('Annuler', 'إلغاء')}</button>}
  </div>;
}
