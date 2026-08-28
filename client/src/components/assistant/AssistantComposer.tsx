import React from 'react';
import { ArrowUp, FileText, Mic, Pause, Plus, Square, X } from '../QatafoIcons';
import { AssistantAttachment } from './types';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantComposerProps {
  value: string;
  attachments: AssistantAttachment[];
  isDark: boolean;
  isGenerating: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  voiceMode?: boolean;
  recordSeconds: number;
  onChange: (value: string) => void;
  onOpenAttachments: () => void;
  onRemoveAttachment: (id: string) => void;
  onStartRecording: () => void;
  onFinishRecording: () => void;
  onCancelRecording: () => void;
  onToggleVoiceMode?: () => void;
  onSend: () => void;
  onStop: () => void;
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const AssistantComposer: React.FC<AssistantComposerProps> = ({
  value,
  attachments,
  isDark,
  isGenerating,
  isRecording,
  isTranscribing,
  voiceMode = false,
  recordSeconds,
  onChange,
  onOpenAttachments,
  onRemoveAttachment,
  onStartRecording,
  onFinishRecording,
  onCancelRecording,
  onToggleVoiceMode,
  onSend,
  onStop,
}) => {
  const { tr } = useLocale();
  const canSend = value.trim().length > 0 || attachments.length > 0;
  const surfaceButton = isDark
    ? 'bg-ink text-muted hover:bg-ink hover:text-white'
    : 'bg-surface text-muted hover:bg-line hover:text-ink';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (isGenerating) onStop();
      else if (canSend) onSend();
    }
  };

  return (
    <footer className={`relative z-30 shrink-0 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] ${isDark ? 'bg-ink' : 'bg-surface'}`}>
      <div className={`rounded-[26px] px-4 pb-2.5 pt-3.5 shadow-card ring-1 transition ${voiceMode ? 'ring-2 ring-cta' : isDark ? 'bg-ink ring-white/15' : 'bg-white ring-line'}`}>
        {attachments.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className={`flex max-w-[190px] items-center gap-2 rounded-[14px] py-1.5 ps-2 pe-1.5 text-xs ${isDark ? 'bg-ink text-white/90' : 'bg-surface text-ink'}`}>
                {attachment.preview ? <img src={attachment.preview} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" /> : <FileText className="h-7 w-7 shrink-0 text-muted" />}
                <span className="truncate">{attachment.name}</span>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink" aria-label={tr(`Retirer ${attachment.name}`, `إزالة ${attachment.name}`)}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {isTranscribing ? (
          <div className="mb-3 flex min-h-[42px] items-center gap-2.5" role="status" aria-live="polite">
            <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-2 border-cta/25 border-t-cta" />
            <span className={`text-sm ${isDark ? 'text-white/80' : 'text-muted'}`}>{tr('Transcription du message vocal…', 'جارٍ تحويل الرسالة الصوتية إلى نص…')}</span>
          </div>
        ) : (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={voiceMode ? tr('Parlez ou écrivez votre message…', 'تحدث بصوتك أو اكتب رسالتك…') : tr("Demandez n'importe quoi à AYROVI…", 'اسأل AYROVI عن أي شيء…')}
            className={`mb-2 min-h-[42px] max-h-32 w-full resize-none bg-transparent py-1 text-[15px] leading-6 outline-none placeholder:text-muted ${isDark ? 'text-white' : 'text-ink'}`}
            aria-label={tr('Votre message', 'رسالتك')}
          />
        )}

        <div className="flex items-center justify-between">
          <button type="button" onClick={onOpenAttachments} disabled={isGenerating || isTranscribing} className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${surfaceButton}`} aria-label={tr('Ajouter au chat', 'إضافة إلى المحادثة')}>
            <Plus className="h-7 w-7" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleVoiceMode || (isRecording ? onFinishRecording : onStartRecording)}
              disabled={isGenerating || isTranscribing}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${
                voiceMode
                  ? 'bg-cta text-white shadow-md ring-2 ring-cta/40 animate-pulse'
                  : isRecording
                    ? 'animate-pulse bg-danger text-white'
                    : surfaceButton
              }`}
              aria-label={voiceMode ? tr('Arrêter le mode vocal', 'إيقاف الوضع الصوتي') : isRecording ? tr('Terminer l’enregistrement', 'إنهاء التسجيل') : tr('Mode vocal', 'الوضع الصوتي')}
              title={voiceMode ? tr('Arrêter le mode vocal', 'إيقاف الوضع الصوتي') : tr('Activer le mode vocal', 'تشغيل الوضع الصوتي')}
            >
              <Mic className="h-7 w-7" />
            </button>
            <button
              type="button"
              onClick={isGenerating ? onStop : onSend}
              disabled={isTranscribing || (!isGenerating && (!canSend || isRecording))}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-30 bg-cta text-white hover:bg-cta-dark`}
              aria-label={isGenerating ? tr('Arrêter la réponse', 'إيقاف الرد') : tr('Envoyer', 'إرسال')}
            >
              {isGenerating ? <Pause className="h-7 w-7 fill-current" /> : <ArrowUp className="h-7 w-7 stroke-[2.5]" />}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
