import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, RefreshCw, Share2, Square, ThumbsDown, ThumbsUp, Volume2 } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { cleanAssistantText } from './composerPolicy';
import { shareAssistantText, textActionLabels, type TextActionResult } from './messageActions';
import type { AssistantMessage, FeedbackValue } from './types';
import type { useMessageReader } from './useMessageReader';

interface Props {
  message: AssistantMessage;
  isDark: boolean;
  copied: boolean;
  generating: boolean;
  feedback?: FeedbackValue;
  feedbackPending?: boolean;
  reader: ReturnType<typeof useMessageReader>;
  onCopy: (message: AssistantMessage) => void;
  onRegenerate: (id: string) => void;
  onFeedback: (message: AssistantMessage, value: FeedbackValue) => void;
  onOpenComment: (message: AssistantMessage) => void;
}

export function AssistantMessageActions({ message, isDark, copied, generating, feedback, feedbackPending, reader, onCopy, onRegenerate, onFeedback, onOpenComment }: Props) {
  const { tr } = useLocale();
  const [notice, setNotice] = useState<TextActionResult | null>(null);
  const [busy, setBusy] = useState<'copy' | 'share' | null>(null);
  const pending = useRef(false);
  const version = useRef(0);
  const text = cleanAssistantText(message.text);
  useEffect(() => {
    pending.current = false; setBusy(null); setNotice(null);
    return () => { version.current++; };
  }, [text]);
  const run = async (action: 'copy' | 'share') => {
    if (pending.current || !text) return;
    pending.current = true;
    const token = version.current;
    setBusy(action); setNotice(null);
    try {
      if (action === 'copy') await onCopy(message);
      else {
        const result = await shareAssistantText(text);
        if (token === version.current) setNotice(result);
      }
    } catch { if (token === version.current) setNotice('error'); }
    finally { if (token === version.current) { pending.current = false; setBusy(null); } }
  };
  const reading = reader.reading?.id === message.id ? reader.reading.state : null;
  const active = reading === 'starting' || reading === 'reading';
  const button = `rounded-icon p-1.5 transition disabled:opacity-40 ${isDark ? 'text-muted hover:bg-white/5 hover:text-white' : 'text-muted hover:bg-surface hover:text-ink'}`;
  return <div className="assistant-message-actions mt-1.5 px-1">
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" disabled={!text || Boolean(busy)} aria-busy={busy === 'copy'} onClick={() => void run('copy')} aria-label={tr('Copier', 'نسخ')} className={button}>{copied ? <Check size={26}/> : <Copy size={26}/>}</button>
      <button type="button" disabled={generating} onClick={() => onRegenerate(message.id)} aria-label={tr('Régénérer', 'إعادة التوليد')} className={button}><RefreshCw size={26}/></button>
      <button type="button" disabled={!text} aria-pressed={active} onClick={() => reader.toggle(message)} aria-label={active ? tr('Arrêter la lecture', 'إيقاف القراءة') : tr('Lire', 'استماع')} className={button}>{active ? <Square size={26}/> : <Volume2 size={26}/>}</button>
      <button type="button" disabled={!text || Boolean(busy)} aria-busy={busy === 'share'} onClick={() => void run('share')} aria-label={tr('Partager', 'مشاركة')} className={button}><Share2 size={26}/></button>
      <span className={`mx-1 h-4 w-px ${isDark ? 'bg-white/10' : 'bg-line'}`} aria-hidden="true"/>
      <button type="button" disabled={feedbackPending} aria-busy={feedbackPending} onClick={() => onFeedback(message, 'up')} aria-label={tr('Utile', 'مفيد')} aria-pressed={feedback === 'up'} className={`${button} ${feedback === 'up' ? 'bg-success/10 text-success' : ''}`}><ThumbsUp size={26}/></button>
      <button type="button" disabled={feedbackPending} aria-busy={feedbackPending} onClick={() => onFeedback(message, 'down')} aria-label={tr('Pas utile', 'غير مفيد')} aria-pressed={feedback === 'down'} className={`${button} ${feedback === 'down' ? 'bg-danger/10 text-danger' : ''}`}><ThumbsDown size={26}/></button>
      <button type="button" onClick={() => onOpenComment(message)} className={`${button} ms-1 px-2 py-1 text-xs font-bold`}>{tr('Commenter', 'تعليق')}</button>
    </div>
    <div role="status" aria-atomic="true" className="ay-readable text-xs leading-5 text-muted">
      {!text && <p>{tr('Cette réponse contient des cartes, sans texte à copier, partager ou lire.', 'يتضمن هذا الرد بطاقات دون نص للنسخ أو المشاركة أو القراءة.')}</p>}
      {feedbackPending && <p>{tr('Envoi de votre avis…', 'جارٍ إرسال رأيك…')}</p>}
      {busy === 'share' && <p>{tr('Partage en cours…', 'جارٍ المشاركة…')}</p>}
      {notice && <p>{tr(...textActionLabels[notice])}</p>}
      {reading === 'starting' && <p>{tr('Préparation de la lecture…', 'جارٍ تجهيز القراءة…')}</p>}
      {reading === 'reading' && <p>{tr('Lecture en cours', 'القراءة جارية')}</p>}
      {reading === 'error' && <p>{tr('Lecture indisponible. Vérifiez les voix et les autorisations du navigateur, puis réessayez.', 'تعذّرت القراءة. تحقّق من أصوات المتصفح وأذوناته ثم أعد المحاولة.')}</p>}
    </div>
  </div>;
}
