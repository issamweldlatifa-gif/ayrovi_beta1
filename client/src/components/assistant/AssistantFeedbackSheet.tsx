import React, { useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp, X } from '../QatafoIcons';
import { FeedbackValue } from './types';
import { useLocale } from '../../i18n/LocaleContext';

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
  const { direction, tr } = useLocale();
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
        : 'border-danger/40 bg-danger/5 text-danger'
      : isDark
        ? 'border-white/15 bg-ink text-white/80 hover:border-muted'
        : 'border-line bg-white text-ink hover:border-muted'
  }`;

  return (
    <div className="absolute inset-0 z-[65] flex items-end justify-center bg-ink/40 px-3 backdrop-blur-[2px] sm:items-center" dir={direction} role="dialog" aria-modal="true" aria-label={tr('Commenter la réponse', 'التعليق على الرد')}>
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label={tr('Fermer', 'إغلاق')} />
      <section className={`assistant-sheet relative z-10 w-full max-w-md rounded-t-[26px] p-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] shadow-overlay sm:rounded-[24px] ${isDark ? 'bg-ink' : 'bg-surface'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-ink'}`}>{tr('Votre avis nous aide', 'رأيك يساعدنا')}</h3>
            <p className="mt-1 text-xs leading-5 text-muted">{tr('Évaluez la réponse et laissez un commentaire facultatif.', 'قيّم الرد واترك تعليقًا اختياريًا.')}</p>
          </div>
          <button type="button" onClick={onClose} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isDark ? 'bg-white/7 text-white/80' : 'bg-surface text-muted'}`} aria-label={tr('Fermer', 'إغلاق')}><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => setRating('up')} className={ratingClass('up')}><ThumbsUp className="h-4 w-4" />{tr('Utile', 'مفيد')}</button>
          <button type="button" onClick={() => setRating('down')} className={ratingClass('down')}><ThumbsDown className="h-4 w-4" />{tr('À améliorer', 'يحتاج إلى تحسين')}</button>
        </div>

        <label className="mt-4 block">
          <span className={`mb-1.5 block text-xs font-semibold ${isDark ? 'text-white/80' : 'text-ink'}`}>{tr('Commentaire', 'تعليق')} <span className="font-normal text-muted">{tr('(facultatif)', '(اختياري)')}</span></span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 1500))}
            rows={4}
            placeholder={tr('Qu’est-ce qui était utile ou à améliorer ?', 'ما الذي كان مفيدًا أو يحتاج إلى تحسين؟')}
            className={`w-full resize-none rounded-[14px] border px-3.5 py-3 text-sm leading-5 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 ${isDark ? 'border-white/15 bg-ink text-white placeholder:text-muted' : 'border-line bg-white text-ink placeholder:text-muted'}`}
          />
          <span className="mt-1 block text-end text-[10px] tabular-nums text-muted">{comment.length}/1500</span>
        </label>

        <button
          type="button"
          disabled={!rating || isSaving}
          onClick={() => rating && onSave(rating, comment.trim())}
          className="ay-btn-primary mt-3 w-full text-sm"
        >
          {isSaving ? tr('Envoi…', 'جارٍ الإرسال…') : tr('Envoyer mon avis', 'إرسال رأيي')}
        </button>
      </section>
    </div>
  );
};
