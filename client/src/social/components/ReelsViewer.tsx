import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FullscreenActionRail } from './FullscreenActionRail';
import { FullscreenMediaHeader } from './FullscreenMediaHeader';
import { fetchCounts, likePost, likeReel, sharePost, viewReel } from '../storyService';
import type { ReelItem } from '../storyService';
import type { StoryPost } from '../types';
import { useLocale } from '../../i18n/LocaleContext';

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
  const { locale, direction, tr } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [active, setActive] = useState(startIndex);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, { likes: number; comments: number; shares: number }>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>(() => {
    try {
      const list = JSON.parse(localStorage.getItem('ayrovi_saved') || '[]');
      return Array.isArray(list) ? Object.fromEntries(list.filter((id): id is string => typeof id === 'string').map((id) => [id, true])) : {};
    } catch { return {}; }
  });
  const [videoFailed, setVideoFailed] = useState<Record<string, boolean>>({});

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
    const previous = Boolean(liked[post.id]);
    const optimistic = !previous;
    const baseline = counts[post.id]?.likes ?? ('reelLikes' in (post as ReelItem) ? (post as ReelItem).reelLikes : 0);
    setLiked((current) => ({ ...current, [post.id]: optimistic }));
    setCounts((current) => ({
      ...current,
      [post.id]: { ...(current[post.id] || { comments: 0, shares: 0 }), likes: Math.max(0, baseline + (optimistic ? 1 : -1)) },
    }));

    const result = 'views' in (post as ReelItem)
      ? await likeReel(post.id)
      : await likePost(post.id, optimistic);
    if (!result || result.authRequired) {
      setLiked((current) => ({ ...current, [post.id]: previous }));
      setCounts((current) => ({ ...current, [post.id]: { ...(current[post.id] || { comments: 0, shares: 0 }), likes: baseline } }));
      if (result?.authRequired) onRequireAuth();
      return;
    }
    setLiked((current) => ({ ...current, [post.id]: result.liked }));
    setCounts((current) => ({ ...current, [post.id]: { ...(current[post.id] || { comments: 0, shares: 0 }), likes: result.likesCount } }));
  };

  const toggleSave = (postId: string) => {
    const next = !saved[postId];
    const updated = { ...saved, [postId]: next };
    setSaved(updated);
    try { localStorage.setItem('ayrovi_saved', JSON.stringify(Object.keys(updated).filter((id) => updated[id]))); } catch { /* storage unavailable */ }
  };

  return (
    <div className="fixed inset-0 z-[125] bg-ink" dir={direction} role="dialog" aria-modal="true" aria-label={tr('Reels', 'ريلز')}>
      <FullscreenMediaHeader muted={muted} onBack={onClose} onToggleMute={toggleMute} />

      {/* Flux vertical snap */}
      <div ref={containerRef} onScroll={onScroll} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto">
        {items.map((post, index) => (
          <motion.section key={post.id} initial={{ opacity: 0.7, scale: 1.01 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ amount: 0.7 }} transition={{ duration: 0.24 }} className="relative h-full w-full snap-start snap-always overflow-hidden">
            <video
              ref={(el) => { if (el) videoRefs.current.set(post.id, el); else videoRefs.current.delete(post.id); }}
              src={post.media[0].url}
              poster="/media/logo-ayrovi-final.png"
              muted={muted}
              loop
              playsInline
              preload={Math.abs(index - startIndex) <= 1 ? 'auto' : 'metadata'}
              className={`absolute inset-0 h-full w-full bg-ink object-cover ${videoFailed[post.id] ? 'hidden' : ''}`}
              onError={() => setVideoFailed((current) => ({ ...current, [post.id]: true }))}
            />
            {videoFailed[post.id] && <div className="absolute inset-0 grid place-items-center bg-ink"><img src="/media/logo-ayrovi-final.png" alt="" className="h-24 w-24 rounded-card bg-white object-contain p-3" /></div>}

            <FullscreenActionRail
              liked={Boolean(liked[post.id])}
              saved={Boolean(saved[post.id])}
              likes={'reelLikes' in (post as ReelItem) ? (counts[post.id]?.likes ?? (post as ReelItem).reelLikes) : (counts[post.id]?.likes ?? 0)}
              comments={counts[post.id]?.comments || 0}
              shares={counts[post.id]?.shares || 0}
              onLike={() => void toggleLike(post)}
              onComment={() => (isAuthenticated ? onOpenComments(post.id) : onRequireAuth())}
              onShare={() => void sharePost(post)}
              onSave={() => toggleSave(post.id)}
            />

            {/* Bas : publisher + caption + vues */}
            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink/85 via-ink/30 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pe-20 pt-16">
              {'views' in (post as ReelItem) && <p className="mb-1 text-[11px] font-bold text-white/70">▶ {(post as ReelItem).views.toLocaleString(locale === 'ar' ? 'ar-TN' : 'fr-TN')} {tr('vues', 'مشاهدة')}</p>}
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                  {post.publisher.official ? <img src="/media/logo-ayrovi-final.png" alt="" className="h-10 w-10 object-contain p-1" /> : post.publisher.avatar ? <img src={post.publisher.avatar} alt="" className="h-10 w-10 object-cover" /> : <span className="text-xs font-black text-brand">{post.publisher.name.slice(0, 2).toUpperCase()}</span>}
                </span>
                <p className="text-sm font-extrabold text-white drop-shadow">{post.publisher.name}</p>
              </div>
              {post.caption && <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/90 drop-shadow">{post.caption}</p>}
            </div>
          </motion.section>
        ))}
      </div>
    </div>
  );
};
