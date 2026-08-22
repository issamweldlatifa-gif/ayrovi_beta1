import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { User, X } from '../../components/QatafoIcons';
import { addComment, getComments, timeAgo } from '../storyService';
import type { StoryComment } from '../types';
import { useLocale } from '../../i18n/LocaleContext';

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

  useEffect(() => { void getComments(postId).then(setComments); }, [postId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (value.length < 2 || busy) return;
    setBusy(true);
    const result = await addComment(postId, value);
    setBusy(false);
    if (result && 'authRequired' in result) { onRequireAuth(); return; }
    if (result) { setComments((current) => [...current, result]); setText(''); }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-ink/45" dir={direction} role="dialog" aria-modal="true" aria-label={tr('Commentaires', 'التعليقات')} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 360 }} className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[75dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h3 className="text-sm font-black text-ink">{tr('Commentaires', 'التعليقات')}</h3>
          <button type="button" onClick={onClose} aria-label={tr('Fermer', 'إغلاق')} className="grid h-11 w-11 place-items-center rounded-full text-muted transition hover:bg-surface active:scale-90"><X size={23} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
          {comments.length ? comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-2.5 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-[10px] font-black text-brand">{comment.author.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-ink">{comment.author} <span className="ms-1 font-semibold text-muted">{timeAgo(comment.createdAt, locale)}</span></p>
                <p className="mt-0.5 text-sm leading-6 text-ink/90">{comment.text}</p>
              </div>
            </div>
          )) : <p className="py-8 text-center text-sm font-semibold text-muted">{tr('Aucun commentaire pour le moment. Soyez le premier !', 'لا توجد تعليقات بعد. كن أول من يعلّق!')}</p>}
        </div>
        {isAuthenticated ? (
          <form onSubmit={(event) => void submit(event)} className="flex items-center gap-2 border-t border-line px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><User size={21} /></span>
            <input
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 500))}
              placeholder={tr('Ajouter un commentaire…', 'أضف تعليقًا…')}
              aria-label={tr('Votre commentaire', 'تعليقك')}
              maxLength={500}
              autoComplete="off"
              className="min-h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
            <button type="submit" disabled={text.trim().length < 2 || busy} className="ay-btn-primary rounded-full px-4 text-xs sm:px-5">{tr('Publier', 'نشر')}</button>
          </form>
        ) : (
          <div className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
            <p className="text-sm font-semibold text-muted">{tr('Connectez-vous pour commenter et liker.', 'سجّل الدخول للتعليق والإعجاب.')}</p>
            <button type="button" onClick={onRequireAuth} className="ay-btn-primary mt-3 min-h-11 rounded-full px-6 text-xs uppercase tracking-widest">
              <User size={18} />Créer un compte / Se connecter
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
