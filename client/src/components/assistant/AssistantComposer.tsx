import React from 'react';
import { ArrowUp, FileText, Mic, Pause, Plus, Square, X } from '../QatafoIcons';
import { AssistantAttachment } from './types';

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
  const canSend = value.trim().length > 0 || attachments.length > 0;
  const surfaceButton = isDark
    ? 'bg-[#26262e] text-zinc-400 hover:bg-[#2f2f38] hover:text-zinc-100'
    : 'bg-[#f0f0ed] text-zinc-500 hover:bg-[#e8e8e5] hover:text-zinc-900';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (isGenerating) onStop();
      else if (canSend) onSend();
    }
  };

  return (
    <footer className={`shrink-0 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] ${isDark ? 'bg-[#1a1a1f]' : 'bg-[#fbfaf8]'}`}>
      <div className={`rounded-[26px] px-4 pb-2.5 pt-3.5 shadow-[0_8px_20px_rgba(20,20,30,0.08)] ring-1 transition ${isDark ? 'bg-[#232329] ring-zinc-700/70' : 'bg-white ring-zinc-200'}`}>
        {attachments.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className={`flex max-w-[190px] items-center gap-2 rounded-[14px] py-1.5 pl-2 pr-1.5 text-xs ${isDark ? 'bg-[#2f2f38] text-zinc-200' : 'bg-[#f0f0ed] text-zinc-800'}`}>
                {attachment.preview ? <img src={attachment.preview} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" /> : <FileText className="h-4 w-4 shrink-0 text-zinc-400" />}
                <span className="truncate">{attachment.name}</span>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-800" aria-label={`Retirer ${attachment.name}`}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {isRecording ? (
          <div className="mb-3 flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            <div className="flex h-5 flex-1 items-center gap-[3px]">
              {[40, 80, 55, 100, 65, 85, 45].map((height, index) => (
                <span key={index} className="w-[3px] animate-pulse rounded-full bg-zinc-400" style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }} />
              ))}
            </div>
            <span className="text-xs font-medium tabular-nums text-zinc-500">{formatTime(recordSeconds)}</span>
            <button type="button" onClick={onCancelRecording} className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:text-red-500" aria-label="Annuler l’enregistrement"><X className="h-4 w-4" /></button>
          </div>
        ) : isTranscribing ? (
          <div className="mb-3 flex min-h-[42px] items-center gap-2.5" role="status" aria-live="polite">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#7638fa]/25 border-t-[#7638fa]" />
            <span className={`text-sm ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>Transcription du message vocal…</span>
          </div>
        ) : (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Demandez à ayrovi..."
            className={`mb-2 min-h-[42px] max-h-32 w-full resize-none bg-transparent py-1 text-[15px] leading-6 outline-none placeholder:text-zinc-400 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}
            aria-label="Votre message"
          />
        )}

        <div className="flex items-center justify-between">
          <button type="button" onClick={onOpenAttachments} disabled={isGenerating || isRecording || isTranscribing} className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${surfaceButton}`} aria-label="Ajouter au chat">
            <Plus className="h-[18px] w-[18px]" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isRecording ? onFinishRecording : onStartRecording}
              disabled={isGenerating || isTranscribing}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${isRecording ? 'animate-pulse bg-red-500 text-white' : surfaceButton}`}
              aria-label={isRecording ? 'Terminer l’enregistrement' : 'Enregistrer un message vocal'}
            >
              {isRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-[18px] w-[18px]" />}
            </button>
            <button
              type="button"
              onClick={isGenerating ? onStop : onSend}
              disabled={isTranscribing || (!isGenerating && (!canSend || isRecording))}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 disabled:pointer-events-none disabled:opacity-30 ${isDark ? 'bg-zinc-100 text-zinc-900 hover:bg-white' : 'bg-zinc-900 text-white hover:bg-black'}`}
              aria-label={isGenerating ? 'Arrêter la réponse' : 'Envoyer'}
            >
              {isGenerating ? <Pause className="h-[17px] w-[17px] fill-current" /> : <ArrowUp className="h-[18px] w-[18px] stroke-[2.5]" />}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
