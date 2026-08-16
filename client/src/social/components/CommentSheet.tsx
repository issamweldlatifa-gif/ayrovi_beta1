import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { User, X } from '../../components/QatafoIcons';
import { addComment, getComments, timeAgo } from '../storyService';
import type { StoryComment } from '../types';

export const CommentSheet: React.FC<{
  postId: string;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onClose: () => void;
}> = ({ postId, isAuthenticated, onRequireAuth, onClose }) => {
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
    <div className="fixed inset-0 z-[130] bg-black/45" role="dialog" aria-modal="true" aria-label="Commentaires" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 360 }} className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[75dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h3 className="text-sm font-black text-ink">Commentaires</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-11 w-11 place-items-center rounded-full text-muted transition hover:bg-surface active:scale-90"><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
          {comments.length ? comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-2.5 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-[10px] font-black text-brand">{comment.author.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-ink">{comment.author} <span className="ml-1 font-semibold text-muted">{timeAgo(comment.createdAt)}</span></p>
                <p className="mt-0.5 text-sm leading-6 text-ink/90">{comment.text}</p>
              </div>
            </div>
          )) : <p className="py-8 text-center text-sm font-semibold text-muted">Aucun commentaire pour le moment. Soyez le premier !</p>}
        </div>
        {isAuthenticated ? (
          <form onSubmit={(event) => void submit(event)} className="flex items-center gap-2 border-t border-line px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><User size={18} /></span>
            <input
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 500))}
              placeholder="Ajouter un commentaire…"
              aria-label="Votre commentaire"
              maxLength={500}
              autoComplete="off"
              className="min-h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
            <button type="submit" disabled={text.trim().length < 2 || busy} className="min-h-12 rounded-full bg-brand px-4 text-xs font-black text-white transition active:scale-95 disabled:opacity-40 sm:px-5">Publier</button>
          </form>
        ) : (
          <div className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
            <p className="text-sm font-semibold text-muted">Connectez-vous pour commenter et liker.</p>
            <button type="button" onClick={onRequireAuth} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-6 text-xs font-black uppercase tracking-widest text-white transition active:scale-95">
              <User size={15} />Créer un compte / Se connecter
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
