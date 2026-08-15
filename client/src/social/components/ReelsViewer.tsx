import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Heart, HeartFilled, MessageSquare, Share2, Volume2, VolumeX } from '../../components/QatafoIcons';
import { fetchCounts, likePost, likeReel, sharePost, viewReel } from '../storyService';
import type { ReelItem } from '../storyService';
import type { StoryPost } from '../types';

/**
 * Mode Reels (façon Instagram) : vidéos plein écran, autoplay au scroll,
 * rail d'interactions latéral, swipe vertical entre les vidéos publiées.
 */
export const ReelsViewer: React.FC<{
  items: StoryPost[];
  startIndex: number;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onOpenComments: (postId: string) => void;
  onClose: () => void;
}> = ({ items, startIndex, isAuthenticated, onRequireAuth, onOpenComments, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [active, setActive] = useState(startIndex);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, { likes: number; comments: number; shares: number }>>({});

  useEffect(() => {
    let cancelled = false;
    fetchCounts(items.map((item) => item.id)).then((result) => { if (!cancelled) setCounts(result); });
    return () => { cancelled = true; };
  }, [items]);

  const playActive = (index: number) => {
    items.forEach((item, i) => {
      const video = videoRefs.current.get(item.id);
      if (!video) return;
      if (i === index) {
        video.muted = muted;
        video.play().catch(() => {
          // Le navigateur bloque le son sans geste : repli en muet.
          setMuted(true);
          video.muted = true;
          void video.play().catch(() => undefined);
        });
        if ('views' in (item as ReelItem)) viewReel(item.id);
      } else video.pause();
    });
  };

  useEffect(() => { playActive(active); }, [active]);
  useEffect(() => () => { items.forEach((item) => videoRefs.current.get(item.id)?.pause()); }, []);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el || !el.clientHeight) return;
    const index = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / el.clientHeight)));
    if (index !== active) setActive(index);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    items.forEach((item) => { const video = videoRefs.current.get(item.id); if (video) video.muted = next; });
  };

  const toggleLike = async (post: StoryPost) => {
    if (!isAuthenticated) { onRequireAuth(); return; }
    const next = !liked[post.id];
    setLiked((current) => ({ ...current, [post.id]: next }));
    if ('views' in (post as ReelItem)) {
      const total = await likeReel(post.id, !next);
      if (total != null) setCounts((current) => ({ ...current, [post.id]: { likes: total, comments: 0, shares: 0 } }));
    } else {
      const result = await likePost(post.id, next);
      if (result.authRequired) { setLiked((current) => ({ ...current, [post.id]: !next })); onRequireAuth(); }
    }
  };

  return (
    <div className="fixed inset-0 z-[125] bg-black" role="dialog" aria-modal="true" aria-label="Reels">
      {/* Barre haute : retour + son */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-3">
        <button type="button" onClick={onClose} aria-label="Retour" className="grid h-11 w-11 place-items-center rounded-full text-white transition active:scale-90">
          <ArrowLeft size={24} />
        </button>
        <button type="button" onClick={toggleMute} aria-label={muted ? 'Activer le son' : 'Couper le son'} className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white transition active:scale-90">
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* Flux vertical snap */}
      <div ref={containerRef} onScroll={onScroll} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto">
        {items.map((post, index) => (
          <section key={post.id} className="relative h-full w-full snap-start snap-always overflow-hidden">
            <video
              ref={(el) => { if (el) videoRefs.current.set(post.id, el); else videoRefs.current.delete(post.id); }}
              src={post.media[0].url}
              muted={muted}
              loop
              playsInline
              preload={Math.abs(index - startIndex) <= 1 ? 'auto' : 'metadata'}
              className="absolute inset-0 h-full w-full object-cover"
            />

            {/* Rail latéral d'interactions */}
            <div className="absolute bottom-24 left-2 z-20 flex flex-col items-center gap-5">
              <button type="button" aria-label="J'aime" onClick={() => void toggleLike(post)} className={`flex flex-col items-center gap-1 transition active:scale-90 ${liked[post.id] ? 'heart-pop text-brand' : 'text-white'}`}>
                {liked[post.id] ? <HeartFilled size={30} className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" /> : <Heart size={30} className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />}
                <span className="text-[11px] font-extrabold tabular-nums drop-shadow">{('reelLikes' in (post as ReelItem) ? (counts[post.id]?.likes || (post as ReelItem).reelLikes) : (counts[post.id]?.likes || 0)) + (liked[post.id] ? 1 : 0)}</span>
              </button>
              <button type="button" aria-label="Commenter" onClick={() => (isAuthenticated ? onOpenComments(post.id) : onRequireAuth())} className="flex flex-col items-center gap-1 text-white transition active:scale-90">
                <MessageSquare size={28} className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
                <span className="text-[11px] font-extrabold tabular-nums drop-shadow">{counts[post.id]?.comments || 0}</span>
              </button>
              <button type="button" aria-label="Partager" onClick={() => void sharePost(post)} className="flex flex-col items-center gap-1 text-white transition active:scale-90">
                <Share2 size={28} className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
                <span className="text-[11px] font-extrabold tabular-nums drop-shadow">{counts[post.id]?.shares || 0}</span>
              </button>
              <SavedButton postId={post.id} />
            </div>

            {/* Bas : publisher + caption + vues */}
            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-4 pb-6 pt-16 pl-16">
              {'views' in (post as ReelItem) && <p className="mb-1 text-[11px] font-bold text-white/70">▶ {(post as ReelItem).views.toLocaleString('fr-FR')} vues</p>}
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                  {post.publisher.official ? <img src="/media/logo-ayrovi.jpg" alt="" className="h-10 w-10 object-cover" /> : post.publisher.avatar ? <img src={post.publisher.avatar} alt="" className="h-10 w-10 object-cover" /> : <span className="text-xs font-black text-white">{post.publisher.name.slice(0, 2).toUpperCase()}</span>}
                </span>
                <p className="text-sm font-extrabold text-white drop-shadow">{post.publisher.name}</p>
              </div>
              {post.caption && <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/90 drop-shadow">{post.caption}</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

const SavedButton: React.FC<{ postId: string }> = ({ postId }) => {
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ayrovi_saved') || '[]').includes(postId); } catch { return false; }
  });
  const toggle = () => {
    const next = !saved;
    setSaved(next);
    try {
      const list: string[] = JSON.parse(localStorage.getItem('ayrovi_saved') || '[]');
      localStorage.setItem('ayrovi_saved', JSON.stringify(next ? [...new Set([...list, postId])] : list.filter((id) => id !== postId)));
    } catch { /* */ }
  };
  return (
    <button type="button" aria-label="Enregistrer" onClick={toggle} className={`flex flex-col items-center gap-1 transition active:scale-90 ${saved ? 'text-brand' : 'text-white'}`}>
      <Bookmark size={28} className={`drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] ${saved ? 'fill-current' : ''}`} />
    </button>
  );
};
