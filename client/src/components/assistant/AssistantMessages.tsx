import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, Check, Copy, Mic, RefreshCw, ThumbsDown, ThumbsUp } from '../QatafoIcons';
import { AyroviMotion, AyroviMotionState } from '../AyroviMotion';
import { AssistantMessage, FeedbackValue } from './types';

interface AssistantMessagesProps {
  messages: AssistantMessage[];
  isGenerating: boolean;
  motionState: AyroviMotionState;
  isDark: boolean;
  copiedId: string | null;
  feedback: Record<string, FeedbackValue | undefined>;
  onPrompt: (prompt: string) => void;
  onCopy: (message: AssistantMessage) => void;
  onRegenerate: (messageId: string) => void;
  onFeedback: (message: AssistantMessage, value: FeedbackValue) => void;
  onOpenComment: (message: AssistantMessage) => void;
}

const QUICK_PROMPTS = [
  { label: 'Calculer mon achat', prompt: 'Comment calculer le total de mon achat ?' },
  { label: 'Commander sur SHEIN', prompt: 'Comment commander sur SHEIN ?' },
  { label: 'Délais de livraison', prompt: 'Quels sont les délais de livraison en Tunisie ?' },
  { label: 'Suivre ma commande', prompt: 'Je veux suivre ma commande.' },
];

const MOTION_LABELS: Record<AyroviMotionState, string> = {
  idle: 'Prêt',
  thinking: 'Réflexion en cours',
  analyzing: 'Analyse en cours',
  reasoning: 'Raisonnement en cours',
  creating: 'Création de la réponse',
};

const AssistantAvatar: React.FC<{ isDark: boolean; state?: AyroviMotionState }> = ({ isDark, state = 'idle' }) => (
  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ${isDark ? 'bg-[#7168ec]' : 'bg-[#564fe0]'}`} aria-hidden="true">
    <AyroviMotion state={state} size={16} color="#ffffff" />
  </span>
);

export const AssistantMessages: React.FC<AssistantMessagesProps> = ({
  messages,
  isGenerating,
  motionState,
  isDark,
  copiedId,
  feedback,
  onPrompt,
  onCopy,
  onRegenerate,
  onFeedback,
  onOpenComment,
}) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const area = areaRef.current;
    if (area) area.scrollTo({ top: area.scrollHeight, behavior });
  };

  useEffect(() => {
    scrollToBottom(messages.length ? 'smooth' : 'auto');
  }, [messages, isGenerating, motionState]);

  const handleScroll = () => {
    const area = areaRef.current;
    if (!area) return;
    const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 70;
    setShowScrollButton(!isNearBottom && area.scrollHeight > area.clientHeight + 40);
  };

  const actionButton = `flex h-[30px] w-[30px] items-center justify-center rounded-full transition active:scale-90 ${
    isDark ? 'text-zinc-500 hover:bg-white/7 hover:text-zinc-200' : 'text-zinc-400 hover:bg-black/5 hover:text-zinc-800'
  }`;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={areaRef} onScroll={handleScroll} className="absolute inset-0 flex flex-col gap-3 overflow-y-auto px-4 py-5 sm:px-5 sm:py-6">
        {messages.length === 0 && !isGenerating ? (
          <div className="flex min-h-full flex-col items-center justify-center px-3 text-center">
            <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full shadow-sm ${isDark ? 'bg-[#26262e]' : 'bg-[#eceafb]'}`}>
              <AyroviMotion state="idle" size={34} color={isDark ? '#a9a3ff' : '#564fe0'} />
            </div>
            <h2 className={`text-lg font-bold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Comment puis-je vous aider ?</h2>
            <p className="mt-1 max-w-xs text-[13px] leading-5 text-zinc-500">Votre assistant shopping AYROVI, disponible pour vos achats et vos commandes.</p>
            <div className="mt-5 flex max-w-md flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onPrompt(item.prompt)}
                  className={`rounded-[14px] px-3.5 py-2 text-xs font-medium transition active:scale-[0.97] ${isDark ? 'bg-[#26262e] text-zinc-200 hover:bg-[#2f2f38]' : 'bg-[#f0f0ed] text-zinc-800 hover:bg-[#e8e8e5]'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'user' ? (
                  <div className="flex max-w-[84%] flex-col items-end">
                    {message.fromVoice && (
                      <span className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500"><Mic className="h-3 w-3" />Message vocal</span>
                    )}
                    <div className={`whitespace-pre-wrap break-words rounded-[16px_16px_5px_16px] px-4 py-3 text-[15px] leading-6 ${isDark ? 'bg-[#3a3565] text-zinc-50' : 'bg-[#eceafb] text-[#1b1a24]'}`}>
                      {message.text}
                      {message.attachments?.length ? (
                        <div className="mt-2 flex flex-wrap justify-end gap-2">
                          {message.attachments.map((attachment) => attachment.preview ? (
                            <img key={attachment.id} src={attachment.preview} alt={attachment.name} className="h-24 w-24 rounded-xl object-cover shadow-sm" />
                          ) : (
                            <span key={attachment.id} className={`max-w-48 truncate rounded-xl px-3 py-2 text-xs ${isDark ? 'bg-white/8 text-zinc-300' : 'bg-white/65 text-zinc-700'}`}>{attachment.name}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex max-w-[94%] items-start gap-2.5">
                    <AssistantAvatar isDark={isDark} />
                    <div className="min-w-0 flex-1">
                      <div className={`whitespace-pre-wrap break-words rounded-[6px_16px_16px_16px] border px-4 py-3 text-[15px] leading-6 ${isDark ? 'border-zinc-700/70 bg-[#232329] text-zinc-100' : 'border-[#eae7e2] bg-[#f5f4f1] text-[#1b1a24]'}`}>
                        {message.text}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
                        <button type="button" onClick={() => onCopy(message)} className={actionButton} title="Copier" aria-label="Copier la réponse">
                          {copiedId === message.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button type="button" onClick={() => onRegenerate(message.id)} className={actionButton} title="Régénérer" aria-label="Régénérer la réponse"><RefreshCw className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => onFeedback(message, 'up')} className={`${actionButton} ${feedback[message.id] === 'up' ? '!bg-brand/10 !text-brand' : ''}`} title="Utile" aria-label="Réponse utile"><ThumbsUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => onFeedback(message, 'down')} className={`${actionButton} ${feedback[message.id] === 'down' ? '!bg-red-50 !text-red-500' : ''}`} title="Pas utile" aria-label="Réponse à améliorer"><ThumbsDown className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => onOpenComment(message)} className={`ml-1 rounded-full px-2 py-1.5 text-[11px] font-medium transition ${isDark ? 'text-zinc-500 hover:bg-white/7 hover:text-zinc-200' : 'text-zinc-500 hover:bg-black/5 hover:text-zinc-800'}`}>Laisser un commentaire</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isGenerating && (
              <div className="flex max-w-[94%] items-start gap-2.5" role="status" aria-live="polite">
                <AssistantAvatar isDark={isDark} state={motionState} />
                <div className={`flex min-h-12 items-center gap-2.5 rounded-[6px_16px_16px_16px] border px-4 py-3 ${isDark ? 'border-zinc-700/70 bg-[#232329]' : 'border-[#eae7e2] bg-[#f5f4f1]'}`}>
                  <span className={`text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>{MOTION_LABELS[motionState]}</span>
                  <span className="flex items-center gap-1" aria-hidden="true">
                    {[0, 1, 2].map((dot) => <span key={dot} className="h-1 w-1 animate-bounce rounded-full bg-brand" style={{ animationDelay: `${dot * 130}ms` }} />)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => scrollToBottom()}
        className={`absolute bottom-3 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full shadow-lg ring-1 transition ${showScrollButton ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'} ${isDark ? 'bg-[#232329] text-zinc-300 ring-zinc-700' : 'bg-white text-zinc-600 ring-zinc-200'}`}
        aria-label="Revenir en bas"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  );
};
