import React from 'react';
import { ArrowUp, FileText, Mic, Pause, Plus, VoiceWave, X } from '../QatafoIcons';
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

export const AssistantComposer: React.FC<AssistantComposerProps> = ({
  value,
  attachments,
  isDark,
  isGenerating,
  isRecording,
  isTranscribing,
  voiceMode = false,
  recordSeconds: _recordSeconds,
  onChange,
  onOpenAttachments,
  onRemoveAttachment,
  onStartRecording,
  onFinishRecording,
  onCancelRecording: _onCancelRecording,
  onToggleVoiceMode,
  onSend,
  onStop,
}) => {
  const { tr } = useLocale();
  const canSend = value.trim().length > 0 || attachments.length > 0;
  const surfaceButton = isDark
    ? 'bg-white/10 text-muted hover:bg-white/15 hover:text-white'
    : 'bg-[#F7F7F7] text-[#6B6B6B] hover:bg-line hover:text-[#111111]';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (isGenerating) onStop();
      else if (canSend) onSend();
    }
  };

  return (
    <footer className={`relative z-30 shrink-0 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] ${isDark ? 'bg-[#111111]' : 'bg-[#F7F7F7]'}`}>
      <div className={`rounded-[26px] px-4 pb-2.5 pt-3.5 shadow-card ring-1 transition ${isDark ? 'bg-[#181818] ring-white/10' : 'bg-white ring-black/5'}`}>
        {attachments.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className={`flex max-w-[190px] items-center gap-2 rounded-[14px] py-1.5 ps-2 pe-1.5 text-xs ${isDark ? 'bg-white/10 text-white/90' : 'bg-[#F7F7F7] text-[#111111]'}`}>
                {attachment.preview ? <img src={attachment.preview} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" /> : <FileText className="h-7 w-7 shrink-0 text-muted" />}
                <span className="truncate">{attachment.name}</span>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-[#111111]" aria-label={tr(`Retirer ${attachment.name}`, `إزالة ${attachment.name}`)}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {isTranscribing ? (
          <div className="mb-3 flex min-h-[42px] items-center gap-2.5" role="status" aria-live="polite">
            <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-[#FF7A00]/25 border-t-[#FF7A00]" />
            <span className={`text-sm ${isDark ? 'text-white/80' : 'text-muted'}`}>{tr('Transcription en cours…', 'جارٍ تحويل الصوت إلى نص…')}</span>
          </div>
        ) : (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={tr("Demandez n'importe quoi à AYROVI…", 'اكتب رسالتك...')}
            className={`mb-2 min-h-[42px] max-h-32 w-full resize-none bg-transparent py-1 text-[15px] leading-6 outline-none placeholder:text-[#6B6B6B] ${isDark ? 'text-white' : 'text-[#111111]'}`}
            aria-label={tr('Votre message', 'رسالتك')}
          />
        )}

        <div className="flex items-center justify-between gap-2">
          {/* Plus button */}
          <button
            type="button"
            onClick={onOpenAttachments}
            disabled={isGenerating || isTranscribing}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${surfaceButton}`}
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
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${
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
                disabled={isTranscribing}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF7A00] text-white shadow-md transition hover:bg-[#e05f00] active:scale-90 disabled:pointer-events-none disabled:opacity-30"
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
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF7A00] text-white shadow-md shadow-[#FF7A00]/25 transition hover:bg-[#e05f00] active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${
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
