import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2, User, X } from '../../components/QatafoIcons';
import { addComment, getComments, timeAgo } from '../storyService';
import type { StoryComment } from '../types';
import { useLocale } from '../../i18n/LocaleContext';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

export const CommentSheet: React.FC<{
  postId: string;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onClose: () => void;
}> = ({ postId, isAuthenticated, onRequireAuth, onClose }) => {
  const { locale, direction, tr } = useLocale();
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [submitError, setSubmitError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const submitting = useRef(false);
  const reducedMotion = useReducedMotion();
  useDialogFocus(panel, true);
  useBodyScrollLock(true);
  useEffect(() => {
    // Disabling/removing the focused submit/retry button can leave focus on body.
    // Recover within this sheet, but never steal focus from a newly opened dialog.
    if (!busy && document.activeElement === document.body) {
      const next = loadState === 'error' ? panel.current?.querySelector<HTMLElement>('[role="alert"] button')
        : panel.current?.querySelector<HTMLElement>('input:not(:disabled),button:not(:disabled)');
      next?.focus({ preventScroll: true });
    }
  }, [busy, loadState]);

  useEffect(() => {
    // A reply for a previous post or closed sheet must never alter this sheet.
    const current = ++generation.current;
    submitting.current = false; setBusy(false); setSubmitError(false); setText('');
    return () => { if (generation.current === current) generation.current++; };
  }, [postId]);

  useEffect(() => {
    let current = true;
    setLoadState('loading'); setComments([]);
    getComments(postId).then(value => {
      if (current) { setComments(value); setLoadState('ready'); }
    }).catch(() => { if (current) setLoadState('error'); });
    return () => { current = false; };
  }, [postId, attempt]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated) { onRequireAuth(); return; }
    const value = text.trim();
    if (value.length < 2 || submitting.current || loadState !== 'ready') return;
    const current = generation.current;
    submitting.current = true; setBusy(true); setSubmitError(false);
    try {
      const result = await addComment(postId, value);
      if (generation.current !== current) return;
      if ('authRequired' in result) { onRequireAuth(); return; }
      setComments(previous => [...previous, result]); setText('');
    } catch { if (generation.current === current) setSubmitError(true); }
    finally {
      if (generation.current === current) { submitting.current = false; setBusy(false); }
    }
  };

  return (
    <div ref={panel} tabIndex={-1} className="fixed inset-0 z-[130] bg-ink/45" dir={direction} role="dialog" aria-modal="true" aria-label={tr('Commentaires', 'التعليقات')}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div initial={reducedMotion ? false : { y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 360 }} className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-sheet border-t border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-sm font-black text-ink">{tr('Commentaires', 'التعليقات')}</h3>
          <button type="button" onClick={onClose} aria-label={tr('Fermer', 'إغلاق')} className="grid h-12 w-12 place-items-center rounded-control text-muted transition hover:bg-surface"><X size={23} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3" aria-busy={loadState === 'loading'}>
          {loadState === 'loading' ? <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted"><Loader2 className="h-5 w-5 animate-spin" />{tr('Chargement des commentaires…', 'جارٍ تحميل التعليقات…')}</p>
          : loadState === 'error' ? <div role="alert" className="py-6 text-sm text-danger"><p>{tr('Impossible de charger les commentaires.', 'تعذر تحميل التعليقات.')}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="ay-btn-secondary mt-3 w-full">{tr('Réessayer', 'أعد المحاولة')}</button></div>
          : comments.length ? comments.map(comment => (
            <div key={comment.id} className="flex items-start gap-2.5 border-b border-line py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-xs font-black text-ink">{comment.author.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="text-xs font-extrabold text-ink">{comment.author} <span className="ms-1 font-semibold text-muted">{timeAgo(comment.createdAt, locale)}</span></p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-ink/90">{comment.text}</p>
              </div>
            </div>
          )) : <p className="py-8 text-center text-sm text-muted">{tr('Aucun commentaire pour le moment. Soyez le premier !', 'لا توجد تعليقات بعد. كن أول من يعلّق!')}</p>}
        </div>
        {submitError && <p role="alert" className="px-5 py-2 text-xs text-danger">{tr('Publication non confirmée. Votre texte est conservé. Vérifiez la connexion avant de réessayer.', 'لم يتأكد نشر التعليق. احتفظنا بنصك. تحقق من الاتصال قبل إعادة المحاولة.')}</p>}
        {isAuthenticated ? (
          <form onSubmit={event => void submit(event)} className="flex items-center gap-2 border-t border-line px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
            <input value={text} onChange={event => setText(event.target.value.slice(0, 500))} disabled={busy}
              placeholder={tr('Ajouter un commentaire…', 'أضف تعليقًا…')} aria-label={tr('Votre commentaire', 'تعليقك')} maxLength={500} autoComplete="off"
              className="min-h-12 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-ink" />
            <button type="submit" disabled={text.trim().length < 2 || busy || loadState !== 'ready'} className="ay-btn-primary min-h-12 px-3 text-xs sm:px-5">{busy ? <><Loader2 className="h-4 w-4 animate-spin" />{tr('Publication…', 'جارٍ النشر…')}</> : tr('Publier', 'نشر')}</button>
          </form>
        ) : (
          <div className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
            <p className="text-sm text-muted">{tr('Connectez-vous pour commenter et liker.', 'سجّل الدخول للتعليق والإعجاب.')}</p>
            <button type="button" onClick={onRequireAuth} className="ay-btn-primary mt-3 min-h-12 px-4 text-xs">
              <User size={18} />{tr('Créer un compte / Se connecter', 'إنشاء حساب / تسجيل الدخول')}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
