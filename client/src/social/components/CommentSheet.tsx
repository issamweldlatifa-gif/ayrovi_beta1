import React, { useEffect, useState } from 'react';
import { X } from '../../components/QatafoIcons';
import { addComment, getComments, timeAgo } from '../storyService';
import type { StoryComment } from '../types';

export const CommentSheet: React.FC<{ postId: string; onClose: () => void }> = ({ postId, onClose }) => {
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [text, setText] = useState('');

  useEffect(() => { setComments(getComments(postId)); }, [postId]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (value.length < 2) return;
    setComments((current) => [...current, addComment(postId, value)]);
    setText('');
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/45" role="dialog" aria-modal="true" aria-label="Commentaires" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[70dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-white">
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h3 className="text-sm font-black text-ink">Commentaires</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface active:scale-90"><X size={18} /></button>
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
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ajouter un commentaire…"
            className="min-h-11 flex-1 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink outline-none transition focus:border-brand"
          />
          <button type="submit" disabled={text.trim().length < 2} className="min-h-11 rounded-full bg-brand px-5 text-xs font-black uppercase tracking-widest text-white transition active:scale-95 disabled:opacity-40">Publier</button>
        </form>
      </div>
    </div>
  );
};
