import React, { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon } from '../components/QatafoIcons';
import { getStoryFeed, getStories } from './storyService';
import type { Story, StoryCta, StoryPost } from './types';
import { groupByPublisher, StoryCircles } from './components/StoryCircles';
import { StoryViewer } from './components/StoryViewer';
import { StoryPostCard } from './components/StoryFeed';
import { CommentSheet } from './components/CommentSheet';

interface StoryTabProps {
  onCta: (cta: StoryCta) => void;
}

export const StoryTab: React.FC<StoryTabProps> = ({ onCta }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [posts, setPosts] = useState<StoryPost[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);

  const load = useCallback(() => {
    setState('loading');
    Promise.all([getStories(), getStoryFeed()])
      .then(([loadedStories, loadedPosts]) => {
        setStories(loadedStories);
        setPosts(loadedPosts);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = React.useMemo(() => groupByPublisher(stories), [stories]);

  const refreshSeen = useCallback(() => {
    setStories((current) => current.map((story) => ({ ...story, seen: true })));
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* ===== Story circles ===== */}
      <div className="pt-4">
        {state === 'loading' && (
          <div className="no-scrollbar flex gap-3 overflow-hidden px-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <div className="h-[62px] w-[62px] animate-pulse rounded-full bg-brand-light/25" />
                <div className="h-2 w-10 animate-pulse rounded bg-brand-light/25" />
              </div>
            ))}
          </div>
        )}
        {state === 'error' && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-bold text-red-600">Les stories n'ont pas pu être chargées.</p>
            <button type="button" onClick={load} className="mt-3 min-h-10 rounded-full bg-ink px-5 text-xs font-black uppercase tracking-widest text-white">Réessayer</button>
          </div>
        )}
        {state === 'ready' && groups.length === 0 && (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand/10 text-brand"><ImageIcon size={24} /></span>
            <p className="mt-3 text-sm font-extrabold text-ink">Aucune story pour le moment</p>
            <p className="mt-1 max-w-60 text-xs leading-5 text-muted">Les stories publiées depuis l'espace Admin apparaîtront ici.</p>
          </div>
        )}
        {state === 'ready' && groups.length > 0 && (
          <StoryCircles groups={groups} onOpen={(index) => setViewerIndex(index)} />
        )}
      </div>

      {/* ===== Feed ===== */}
      <div className="mt-3 border-t border-line">
        {state === 'loading' && (
          <div className="space-y-6 px-4 py-5">
            {[0, 1].map((index) => (
              <div key={index} className="animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="h-10 w-10 rounded-full bg-brand-light/25" />
                  <div className="space-y-1.5"><div className="h-2.5 w-28 rounded bg-brand-light/25" /><div className="h-2 w-16 rounded bg-brand-light/25" /></div>
                </div>
                <div className="mt-3 aspect-[4/5] w-full rounded-xl bg-brand-light/20" />
                <div className="mt-3 h-3 w-40 rounded bg-brand-light/25" />
              </div>
            ))}
          </div>
        )}
        {state === 'error' && (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-bold text-red-600">Le fil n'a pas pu être chargé.</p>
            <button type="button" onClick={load} className="mt-3 min-h-10 rounded-full bg-ink px-5 text-xs font-black uppercase tracking-widest text-white">Réessayer</button>
          </div>
        )}
        {state === 'ready' && posts.length === 0 && (
          <p className="px-4 py-10 text-center text-sm font-semibold text-muted">Le fil est vide pour le moment.</p>
        )}
        {state === 'ready' && posts.map((post) => (
          <StoryPostCard
            key={post.id}
            post={post}
            onOpenComments={(target) => setCommentPostId(target.id)}
            onCta={onCta}
            onLikeChange={() => undefined}
          />
        ))}
      </div>

      {/* ===== Overlays ===== */}
      {viewerIndex != null && groups[viewerIndex] && (
        <StoryViewer
          groups={groups}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onCta={onCta}
          onSeenChange={refreshSeen}
        />
      )}
      {commentPostId && <CommentSheet postId={commentPostId} onClose={() => setCommentPostId(null)} />}
    </div>
  );
};
