import React, { useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp, X } from '../QatafoIcons';
import { FeedbackValue } from './types';

interface AssistantFeedbackSheetProps {
  isOpen: boolean;
  isDark: boolean;
  initialRating?: FeedbackValue;
  initialComment?: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (rating: FeedbackValue, comment: string) => void;
}

export const AssistantFeedbackSheet: React.FC<AssistantFeedbackSheetProps> = ({
  isOpen,
  isDark,
  initialRating,
  initialComment = '',
  isSaving,
  onClose,
  onSave,
}) => {
  const [rating, setRating] = useState<FeedbackValue | undefined>(initialRating);
  const [comment, setComment] = useState(initialComment);

  useEffect(() => {
    if (!isOpen) return;
    setRating(initialRating);
    setComment(initialComment);
  }, [isOpen, initialRating, initialComment]);

  if (!isOpen) return null;

  const ratingClass = (value: FeedbackValue) => `flex flex-1 items-center justify-center gap-2 rounded-[14px] border px-3 py-3 text-sm font-semibold transition ${
    rating === value
      ? value === 'up'
        ? 'border-brand bg-brand/10 text-brand-dark'
        : 'border-red-400 bg-red-50 text-red-700'
      : isDark
        ? 'border-zinc-700 bg-ink text-zinc-300 hover:border-zinc-500'
        : 'border-[#e5e2dc] bg-white text-zinc-700 hover:border-zinc-400'
  }`;

  return (
    <div className="absolute inset-0 z-[65] flex items-end justify-center bg-black/40 px-3 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" aria-label="Commenter la réponse">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Fermer" />
      <section className={`assistant-sheet relative z-10 w-full max-w-md rounded-t-[26px] p-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] shadow-[0_-16px_48px_rgba(20,20,30,0.2)] sm:rounded-[24px] ${isDark ? 'bg-ink' : 'bg-surface'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className={`text-base font-bold ${isDark ? 'text-zinc-50' : 'text-zinc-950'}`}>Votre avis nous aide</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Évaluez la réponse et laissez un commentaire facultatif.</p>
          </div>
          <button type="button" onClick={onClose} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isDark ? 'bg-white/7 text-zinc-300' : 'bg-[#efeeea] text-zinc-600'}`} aria-label="Fermer"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => setRating('up')} className={ratingClass('up')}><ThumbsUp className="h-4 w-4" />Utile</button>
          <button type="button" onClick={() => setRating('down')} className={ratingClass('down')}><ThumbsDown className="h-4 w-4" />À améliorer</button>
        </div>

        <label className="mt-4 block">
          <span className={`mb-1.5 block text-xs font-semibold ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>Commentaire <span className="font-normal text-zinc-500">(facultatif)</span></span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 1500))}
            rows={4}
            placeholder="Qu’est-ce qui était utile ou à améliorer ?"
            className={`w-full resize-none rounded-[14px] border px-3.5 py-3 text-sm leading-5 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 ${isDark ? 'border-zinc-700 bg-ink text-zinc-100 placeholder:text-zinc-600' : 'border-[#e3e0da] bg-white text-zinc-900 placeholder:text-zinc-400'}`}
          />
          <span className="mt-1 block text-right text-[10px] tabular-nums text-zinc-500">{comment.length}/1500</span>
        </label>

        <button
          type="button"
          disabled={!rating || isSaving}
          onClick={() => rating && onSave(rating, comment.trim())}
          className={`mt-3 flex w-full items-center justify-center rounded-[14px] px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${isDark ? 'bg-zinc-100 text-zinc-950' : 'bg-ink text-white'}`}
        >
          {isSaving ? 'Envoi…' : 'Envoyer mon avis'}
        </button>
      </section>
    </div>
  );
};
