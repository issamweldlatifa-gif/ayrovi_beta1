import React, { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon } from '../components/QatafoIcons';
import { getPublications, getReels, getStories, getStoryFeed, type ReelItem } from './storyService';
import type { Story, StoryCta, StoryPost } from './types';
import { groupByPublisher, StoryCircles } from './components/StoryCircles';
import { StoryViewer } from './components/StoryViewer';
import { StoryPostCard } from './components/StoryFeed';
import { CommentSheet } from './components/CommentSheet';
import { ReelsViewer } from './components/ReelsViewer';
import { useNavigationHistory, type NavigationLayer } from '../navigation/NavigationHistory';

interface SocialProps {
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onCta: (cta: StoryCta) => void;
}

const layerNumber = (layer: NavigationLayer | undefined, key: string) => {
  const value = layer?.payload?.[key];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
};
const layerString = (layer: NavigationLayer | undefined, key: string) => {
  const value = layer?.payload?.[key];
  return typeof value === 'string' && value ? value : null;
};

export const StoryTab: React.FC<SocialProps> = ({ isAuthenticated, onRequireAuth, onCta }) => {
  const navigation = useNavigationHistory();
  const storyLayer = navigation.stack.find((layer) => layer.id === 'social:tab-story');
  const reelsLayer = navigation.stack.find((layer) => layer.id === 'social:tab-reels');
  const commentLayer = navigation.stack.find((layer) => layer.id === 'social:tab-comments');
  const viewerIndex = layerNumber(storyLayer, 'index');
  const reelsIndex = layerNumber(reelsLayer, 'index');
  const commentId = layerString(commentLayer, 'postId');
  const openStory = (index: number) => navigation.pushLayer({ id: 'social:tab-story', payload: { index } });
  const openReels = (index: number) => navigation.pushLayer({ id: 'social:tab-reels', payload: { index } });
  const openComments = (postId: string) => navigation.pushLayer({ id: 'social:tab-comments', payload: { postId } });
  const closeOverlay = () => navigation.back();
  const [stories, setStories] = useState<Story[]>([]);
  const [posts, setPosts] = useState<StoryPost[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pubs, setPubs] = useState<StoryPost[]>([]);
  const [reels, setReels] = useState<ReelItem[]>([]);

  const load = useCallback(() => {
    setState('loading');
    Promise.all([getStories(), getStoryFeed(), getPublications().catch(() => []), getReels().catch(() => [])])
      .then(([loadedStories, loadedPosts, loadedPubs, loadedReels]) => {
        setStories(loadedStories);
        setPosts(loadedPosts);
        setPubs(loadedPubs);
        setReels(loadedReels);
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
    <div className="w-full">
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
          <StoryCircles groups={groups} onOpen={openStory} />
        )}
      </div>

      {/* ===== Reels : bande horizontale ===== */}
      {state === 'ready' && reels.length > 0 && (
        <div className="border-b border-line bg-white py-3">
          <p className="px-4 pb-2 text-xs font-black uppercase tracking-[0.18em] text-brand">Reels</p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
            {reels.map((reel, index) => (
              <button key={reel.id} type="button" onClick={() => openReels(index)} className="relative w-28 shrink-0 overflow-hidden rounded-xl bg-black" aria-label={reel.caption}>
                <video src={reel.media[0].url} muted playsInline preload="metadata" className="aspect-[9/16] w-full object-cover opacity-90" />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-black text-white">▶ {reel.views.toLocaleString('fr-FR')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== Feed des publications ===== */}
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
        {state === 'ready' && (pubs.length ? pubs : posts).map((post) => (
          <StoryPostCard
            key={post.id}
            post={post}
            isAuthenticated={isAuthenticated}
            onRequireAuth={onRequireAuth}
            onOpenComments={(target) => openComments(target.id)}
            onOpenReels={() => openReels(0)}
            onCta={onCta}
          />
        ))}
      </div>

      {reelsIndex != null && reels[reelsIndex] && (
        <ReelsViewer
          items={reels}
          startIndex={reelsIndex}
          isAuthenticated={isAuthenticated}
          onRequireAuth={onRequireAuth}
          onOpenComments={openComments}
          onClose={closeOverlay}
        />
      )}

      <SharedOverlays
        viewerIndex={viewerIndex}
        groups={groups}
        refreshSeen={refreshSeen}
        commentId={commentId}
        onOpenComments={openComments}
        onClose={closeOverlay}
        isAuthenticated={isAuthenticated}
        onRequireAuth={onRequireAuth}
        onCta={onCta}
      />
    </div>
  );
};

/** Bande de stories compacte pour la page d'accueil (strip au-dessus des cartes). */
export const HomeStoryStrip: React.FC<SocialProps> = ({ isAuthenticated, onRequireAuth, onCta }) => {
  const navigation = useNavigationHistory();
  const storyLayer = navigation.stack.find((layer) => layer.id === 'social:home-story');
  const commentLayer = navigation.stack.find((layer) => layer.id === 'social:home-comments');
  const viewerIndex = layerNumber(storyLayer, 'index');
  const commentId = layerString(commentLayer, 'postId');
  const openStory = (index: number) => navigation.navigate([{ id: 'social:home-story', payload: { index } }]);
  const openComments = (postId: string) => navigation.pushLayer({ id: 'social:home-comments', payload: { postId } });
  const closeOverlay = () => navigation.back();
  const [stories, setStories] = useState<Story[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStories().then((loaded) => { if (!cancelled) { setStories(loaded); setReady(true); } }).catch(() => setReady(true));
    return () => { cancelled = true; };
  }, []);

  const groups = React.useMemo(() => groupByPublisher(stories), [stories]);
  if (!ready || groups.length === 0) return null;

  return (
    <div className="border-b border-line bg-white py-3">
      <StoryCircles groups={groups} onOpen={openStory} />
      <SharedOverlays
        viewerIndex={viewerIndex}
        groups={groups}
        refreshSeen={() => setStories((current) => current.map((story) => ({ ...story, seen: true })))}
        commentId={commentId}
        onOpenComments={openComments}
        onClose={closeOverlay}
        isAuthenticated={isAuthenticated}
        onRequireAuth={onRequireAuth}
        onCta={onCta}
      />
    </div>
  );
};

const SharedOverlays: React.FC<{
  viewerIndex: number | null;
  groups: ReturnType<typeof groupByPublisher>;
  refreshSeen: () => void;
  commentId: string | null;
  onOpenComments: (id: string) => void;
  onClose: () => void;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onCta: (cta: StoryCta) => void;
}> = ({ viewerIndex, groups, refreshSeen, commentId, onOpenComments, onClose, isAuthenticated, onRequireAuth, onCta }) => (
  <>
    {viewerIndex != null && groups[viewerIndex] && (
      <StoryViewer
        groups={groups}
        startIndex={viewerIndex}
        isAuthenticated={isAuthenticated}
        onRequireAuth={onRequireAuth}
        onOpenComments={onOpenComments}
        onClose={onClose}
        onCta={onCta}
        onSeenChange={refreshSeen}
      />
    )}
    {commentId && (
      <CommentSheet postId={commentId} isAuthenticated={isAuthenticated} onRequireAuth={onRequireAuth} onClose={onClose} />
    )}
  </>
);
