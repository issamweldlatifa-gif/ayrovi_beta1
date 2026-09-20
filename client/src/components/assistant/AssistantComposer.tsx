import React from 'react';
import { ArrowUp, FileText, Mic, Pause, Plus, VoiceWave, X } from '../QatafoIcons';
import { AssistantAttachment } from './types';
import { useLocale } from '../../i18n/LocaleContext';
import { recordingTime, shouldSubmitComposer } from './composerPolicy';

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
    ? 'bg-white/10 text-muted hover:bg-white/15 hover:text-white'
    : 'bg-surface text-muted hover:bg-line hover:text-ink';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSubmitComposer({
      key: event.key, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey,
      altKey: event.altKey, metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode,
    }, { canSend, isGenerating, isRecording, isTranscribing })) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <footer data-assistant-composer className={`relative z-30 shrink-0 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] ${isDark ? 'bg-ink' : 'bg-surface'}`}>
      <div className={`rounded-control px-4 pb-2.5 pt-3.5 shadow-card ring-1 transition ${isDark ? 'bg-ink-deep ring-white/10' : 'bg-white ring-black/5'}`}>
        {attachments.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className={`flex max-w-[190px] items-center gap-2 rounded-control py-1.5 ps-2 pe-1.5 text-xs ${isDark ? 'bg-white/10 text-white/90' : 'bg-surface text-ink'}`}>
                {attachment.preview ? <img src={attachment.preview} alt="" className="h-7 w-7 shrink-0 rounded-control object-cover" /> : <FileText className="h-7 w-7 shrink-0 text-muted" />}
                <span className="truncate">{attachment.name}</span>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:text-ink" aria-label={tr(`Retirer ${attachment.name}`, `إزالة ${attachment.name}`)}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {isRecording ? (
          <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
            <span className={`text-sm ${isDark ? 'text-white' : 'text-ink'}`}>
              <span role="status">{tr('Enregistrement en cours', 'جارٍ التسجيل')}</span>{' '}
              <bdi className="tabular-nums" dir="ltr">{recordingTime(recordSeconds)}</bdi>
            </span>
            <button type="button" onClick={onCancelRecording}
              className={`flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 text-sm ${isDark ? 'text-white' : 'text-ink'}`}
              aria-label={tr('Annuler l’enregistrement', 'إلغاء التسجيل')}>
              <X size={20} />{tr('Annuler', 'إلغاء')}
            </button>
          </div>
        ) : isTranscribing ? (
          <div className="mb-3 flex min-h-[42px] items-center gap-2.5" role="status" aria-live="polite">
            <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-ink/25 border-t-[#111111]" />
            <span className={`text-sm ${isDark ? 'text-white/80' : 'text-muted'}`}>{tr('Transcription en cours…', 'جارٍ تحويل الصوت إلى نص…')}</span>
          </div>
        ) : (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={tr("Demandez n'importe quoi à AYROVI…", 'اكتب رسالتك...')}
            className={`mb-2 min-h-[42px] max-h-32 w-full resize-none bg-transparent py-1 text-base leading-6 outline-none placeholder:text-muted ${isDark ? 'text-white' : 'text-ink'}`}
            aria-label={tr('Votre message', 'رسالتك')}
          />
        )}

        <div className="flex items-center justify-between gap-2">
          {/* Plus button */}
          <button
            type="button"
            onClick={onOpenAttachments}
            disabled={isGenerating || isTranscribing || isRecording}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${surfaceButton}`}
            aria-label={tr('Ajouter au chat', 'إضافة إلى المحادثة')}
          >
            <Plus className="h-6 w-6" />
          </button>

          {/* Right actions: Mic | Send (if text typed) | Orange Voice Mode Button */}
          <div className="flex items-center gap-2">
            {/* 1. Dictation Microphone */}
            <button
              type="button"
              onClick={isRecording ? onFinishRecording : onStartRecording}
              disabled={isGenerating || isTranscribing}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${
                isRecording
                  ? 'animate-pulse bg-danger text-white'
                  : surfaceButton
              }`}
              aria-label={isRecording ? tr('Terminer l’enregistrement', 'إنهاء التسجيل') : tr('Enregistrer un message vocal', 'تسجيل صوتي')}
              title={isRecording ? tr('Terminer l’enregistrement', 'إنهاء التسجيل') : tr('Enregistrer un message vocal', 'تسجيل صوتي')}
            >
              <Mic className="h-6 w-6" />
            </button>

            {/* 2. Send Text Button (when text or attachments are present or generating) */}
            {(canSend || isGenerating) && (
              <button
                type="button"
                onClick={isGenerating ? onStop : onSend}
                disabled={isTranscribing || isRecording}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-cta text-cta-ink shadow-md transition hover:bg-cta-hover active:scale-90 disabled:pointer-events-none disabled:opacity-30"
                aria-label={isGenerating ? tr('Arrêter la réponse', 'إيقاف الرد') : tr('Envoyer', 'إرسال')}
              >
                {isGenerating ? <Pause className="h-6 w-6 fill-current" /> : <ArrowUp className="h-6 w-6 stroke-[2.5]" />}
              </button>
            )}

            {/* 3. Circular Orange Voice Mode Button (Mode Switcher strictly to Voice Mode) */}
            {onToggleVoiceMode && (
              <button
                type="button"
                onClick={onToggleVoiceMode}
                disabled={isGenerating || isTranscribing || isRecording}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-white text-ink shadow-sm transition hover:bg-surface active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${
                  voiceMode ? 'ring-2 ring-white animate-pulse' : ''
                }`}
                aria-label={tr('Mode vocal', 'الوضع الصوتي')}
                title={tr('Activer le mode vocal', 'دخول الوضع الصوتي')}
              >
                <VoiceWave className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
