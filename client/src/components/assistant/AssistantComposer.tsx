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
  recordSeconds: number;
  onChange: (value: string) => void;
  onOpenAttachments: () => void;
  onRemoveAttachment: (id: string) => void;
  onStartRecording: () => void;
  onFinishRecording: () => void;
  onCancelRecording: () => void;
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
  recordSeconds,
  onChange,
  onOpenAttachments,
  onRemoveAttachment,
  onStartRecording,
  onFinishRecording,
  onCancelRecording,
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
      <div className={`rounded-[26px] px-4 pb-2.5 pt-3.5 shadow-card ring-1 transition ${isDark ? 'bg-ink ring-white/15' : 'bg-white ring-line'}`}>
        {attachments.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className={`flex max-w-[190px] items-center gap-2 rounded-[14px] py-1.5 ps-2 pe-1.5 text-xs ${isDark ? 'bg-ink text-white/90' : 'bg-surface text-ink'}`}>
                {attachment.preview ? <img src={attachment.preview} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" /> : <FileText className="h-4 w-4 shrink-0 text-muted" />}
                <span className="truncate">{attachment.name}</span>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink" aria-label={tr(`Retirer ${attachment.name}`, `إزالة ${attachment.name}`)}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {isRecording ? (
          <div className="mb-3 flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-interactive-primary" />
            <div className="flex h-5 flex-1 items-center gap-[3px]">
              {[40, 80, 55, 100, 65, 85, 45].map((height, index) => (
                <span key={index} className="w-[3px] animate-pulse rounded-full bg-muted" style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }} />
              ))}
            </div>
            <span className="text-xs font-medium tabular-nums text-muted">{formatTime(recordSeconds)}</span>
            <button type="button" onClick={onCancelRecording} className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-ink" aria-label={tr('Annuler l’enregistrement', 'إلغاء التسجيل')}><X className="h-4 w-4" /></button>
          </div>
        ) : isTranscribing ? (
          <div className="mb-3 flex min-h-[42px] items-center gap-2.5" role="status" aria-live="polite">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
            <span className={`text-sm ${isDark ? 'text-white/80' : 'text-muted'}`}>{tr('Transcription du message vocal…', 'جارٍ تحويل الرسالة الصوتية إلى نص…')}</span>
          </div>
        ) : (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={tr("Demandez n'importe quoi à AYROVI…", 'اسأل AYROVI عن أي شيء…')}
            className={`mb-2 min-h-[42px] max-h-32 w-full resize-none bg-transparent py-1 text-[15px] leading-6 outline-none placeholder:text-muted ${isDark ? 'text-white' : 'text-ink'}`}
            aria-label={tr('Votre message', 'رسالتك')}
          />
        )}

        <div className="flex items-center justify-between">
          <button type="button" onClick={onOpenAttachments} disabled={isGenerating || isRecording || isTranscribing} className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${surfaceButton}`} aria-label={tr('Ajouter au chat', 'إضافة إلى المحادثة')}>
            <Plus className="h-[18px] w-[18px]" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isRecording ? onFinishRecording : onStartRecording}
              disabled={isGenerating || isTranscribing}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${isRecording ? 'animate-pulse bg-interactive-primary text-white' : surfaceButton}`}
              aria-label={isRecording ? tr('Terminer l’enregistrement', 'إنهاء التسجيل') : tr('Enregistrer un message vocal', 'تسجيل رسالة صوتية')}
            >
              {isRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-[18px] w-[18px]" />}
            </button>
            <button
              type="button"
              onClick={isGenerating ? onStop : onSend}
              disabled={isTranscribing || (!isGenerating && (!canSend || isRecording))}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-30 bg-brand text-white hover:bg-brand-dark`}
              aria-label={isGenerating ? tr('Arrêter la réponse', 'إيقاف الرد') : tr('Envoyer', 'إرسال')}
            >
              {isGenerating ? <Pause className="h-[17px] w-[17px] fill-current" /> : <ArrowUp className="h-[18px] w-[18px] stroke-[2.5]" />}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
