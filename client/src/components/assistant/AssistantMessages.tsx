import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, Check, Copy, Mic, RefreshCw, ThumbsDown, ThumbsUp } from '../QatafoIcons';
import { AiLogoIcon } from '../Icons';
import { AssistantMessage, FeedbackValue } from './types';

interface AssistantMessagesProps {
  messages: AssistantMessage[];
  isGenerating: boolean;
  isDark: boolean;
  copiedId: string | null;
  feedback: Record<string, FeedbackValue | undefined>;
  onPrompt: (prompt: string) => void;
  onCopy: (message: AssistantMessage) => void;
  onRegenerate: (messageId: string) => void;
  onFeedback: (messageId: string, value: FeedbackValue) => void;
}

const QUICK_PROMPTS = [
  { label: 'Taux de change', prompt: 'Quel est le taux de change AYROVI ?' },
  { label: 'Commander sur SHEIN', prompt: 'Comment commander sur SHEIN ?' },
  { label: 'Délais de livraison', prompt: 'Quels sont les délais de livraison en Tunisie ?' },
  { label: 'Suivre ma commande', prompt: 'Je veux suivre ma commande.' },
];

export const AssistantMessages: React.FC<AssistantMessagesProps> = ({
  messages,
  isGenerating,
  isDark,
  copiedId,
  feedback,
  onPrompt,
  onCopy,
  onRegenerate,
  onFeedback,
}) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const area = areaRef.current;
    if (area) area.scrollTo({ top: area.scrollHeight, behavior });
  };

  useEffect(() => {
    scrollToBottom(messages.length ? 'smooth' : 'auto');
  }, [messages, isGenerating]);

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
      <div ref={areaRef} onScroll={handleScroll} className="absolute inset-0 flex flex-col gap-4 overflow-y-auto px-5 py-6">
        {messages.length === 0 && !isGenerating ? (
          <div className="flex min-h-full flex-col items-center justify-center px-3 text-center">
            <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full shadow-sm ${isDark ? 'bg-[#26262e] text-[#9161f5]' : 'bg-[#f0eeff] text-[#7c3aed]'}`}>
              <AiLogoIcon className="h-7 w-7" />
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
              <div key={message.id} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                {message.fromVoice && (
                  <span className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500"><Mic className="h-3 w-3" />Message vocal</span>
                )}

                {message.role === 'user' ? (
                  <div className={`max-w-[82%] whitespace-pre-wrap break-words px-0.5 text-[15px] leading-6 ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                    {message.text}
                    {message.attachments?.length ? (
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {message.attachments.map((attachment) => attachment.preview ? (
                          <img key={attachment.id} src={attachment.preview} alt={attachment.name} className="h-24 w-24 rounded-xl object-cover shadow-sm" />
                        ) : (
                          <span key={attachment.id} className={`max-w-48 truncate rounded-xl px-3 py-2 text-xs ${isDark ? 'bg-[#26262e] text-zinc-300' : 'bg-[#f0f0ed] text-zinc-700'}`}>{attachment.name}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex max-w-[88%] flex-col items-start gap-1.5">
                    <div className={`whitespace-pre-wrap break-words rounded-[20px_20px_20px_6px] px-4 py-3.5 text-[15px] leading-6 shadow-sm ring-1 ${isDark ? 'bg-[#232329] text-zinc-100 ring-zinc-700/70' : 'bg-white text-zinc-900 ring-zinc-200'}`}>
                      {message.text}
                    </div>
                    <div className="flex items-center gap-0.5 px-1">
                      <button type="button" onClick={() => onCopy(message)} className={actionButton} title="Copier">
                        {copiedId === message.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" onClick={() => onRegenerate(message.id)} className={actionButton} title="Régénérer"><RefreshCw className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => onFeedback(message.id, 'up')} className={`${actionButton} ${feedback[message.id] === 'up' ? '!text-[#7c3aed]' : ''}`} title="Utile"><ThumbsUp className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => onFeedback(message.id, 'down')} className={`${actionButton} ${feedback[message.id] === 'down' ? '!text-red-500' : ''}`} title="Pas utile"><ThumbsDown className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isGenerating && (
              <div className={`flex w-fit items-center gap-1.5 rounded-[20px_20px_20px_6px] px-4 py-4 shadow-sm ring-1 ${isDark ? 'bg-[#232329] ring-zinc-700/70' : 'bg-white ring-zinc-200'}`}>
                {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#7c3aed]" style={{ animationDelay: `${dot * 140}ms` }} />)}
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
