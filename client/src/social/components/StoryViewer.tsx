import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Bookmark, CheckCircle2, Heart, HeartFilled, Share2, X } from '../../components/QatafoIcons';
import { fetchCounts, likePost, markStoryAsSeen, sharePost, timeAgo } from '../storyService';
import type { Story, StoryCta } from '../types';
import type { StoryGroup } from './StoryCircles';

const IMAGE_DURATION = 5000;
const SAVED_KEY = 'ayrovi_saved';

function savedInitially(id: string): boolean {
  try { const value = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(value) && value.includes(id); } catch { return false; }
}

function updateSaved(id: string, saved: boolean): void {
  try {
    const value = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    const list: string[] = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 500) : [];
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved ? [...new Set([...list, id])] : list.filter((item) => item !== id)));
  } catch { /* Storage may be unavailable in private mode. */ }
}

export const StoryViewer: React.FC<{
  groups: StoryGroup[];
  startIndex: number;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onOpenComments: (storyId: string) => void;
  onClose: () => void;
  onCta: (cta: StoryCta) => void;
  onSeenChange: () => void;
}> = ({ groups, startIndex, isAuthenticated, onRequireAuth, onOpenComments, onClose, onCta, onSeenChange }) => {
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, { likes: number; comments: number; views: number; shares: number }>>({});
  const [groupIndex, setGroupIndex] = useState(startIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);
  const markedSeen = useRef<Set<string>>(new Set());

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];

  const markSeen = (id: string) => {
    if (markedSeen.current.has(id)) return;
    markedSeen.current.add(id);
    markStoryAsSeen(id);
    onSeenChange();
  };

  const toggleLike = async (target: Story) => {
    if (!isAuthenticated) { onRequireAuth(); return; }
    const next = !likedIds[target.id];
    setLikedIds((current) => ({ ...current, [target.id]: next }));
    const result = await likePost(target.id, next);
    if (result.authRequired) {
      setLikedIds((current) => ({ ...current, [target.id]: !next }));
      onRequireAuth();
    }
  };

  const toggleSave = (target: Story) => {
    const next = !(savedIds[target.id] ?? savedInitially(target.id));
    setSavedIds((current) => ({ ...current, [target.id]: next }));
    updateSaved(target.id, next);
  };

  useEffect(() => {
    if (!group) return;
    let cancelled = false;
    fetchCounts(group.stories.map((item) => item.id)).then((result) => { if (!cancelled) setCounts(result); });
    return () => { cancelled = true; };
  }, [group]);

  const goNext = useCallback(() => {
    setProgress(0);
    if (group && storyIndex < group.stories.length - 1) setStoryIndex((value) => value + 1);
    else if (groupIndex < groups.length - 1) { setGroupIndex((value) => value + 1); setStoryIndex(0); }
    else onClose();
  }, [group, storyIndex, groupIndex, groups.length, onClose]);

  const goPrev = useCallback(() => {
    setProgress(0);
    if (storyIndex > 0) setStoryIndex((value) => value - 1);
    else if (groupIndex > 0) {
      const previous = groups[groupIndex - 1];
      setGroupIndex((value) => value - 1);
      setStoryIndex(previous.stories.length - 1);
    }
  }, [storyIndex, groupIndex, groups]);

  useEffect(() => { setVideoFailed(false); }, [story?.id]);

  useEffect(() => {
    if (!story || (story.media.type === 'video' && !videoFailed)) return undefined;
    markSeen(story.id);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const ratio = (Date.now() - started) / IMAGE_DURATION;
      if (ratio >= 1) { window.clearInterval(timer); goNext(); }
      else setProgress(ratio);
    }, 80);
    return () => window.clearInterval(timer);
  }, [story?.id, videoFailed, goNext]);

  useEffect(() => {
    if (story?.media.type === 'video') markSeen(story.id);
  }, [story?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onClose]);

  if (!group || !story) return null;
  const storyCounts = counts[story.id] || { likes: 0, comments: 0, views: 0, shares: 0 };
  const saved = savedIds[story.id] ?? savedInitially(story.id);
  const share = () => sharePost({
    id: story.id,
    publisher: group.publisher,
    type: story.media.type === 'video' ? 'video' : 'image',
    media: [story.media],
    caption: story.caption,
    likesCount: storyCounts.likes,
    commentsCount: storyCounts.comments,
    sharesCount: storyCounts.shares,
    likedByCurrentUser: Boolean(likedIds[story.id]),
    createdAt: story.createdAt,
  });

  return (
    <div className="fixed inset-0 z-[120] bg-black" role="dialog" aria-modal="true" aria-label={`Story de ${group.publisher.name}`}>
      <div className="absolute inset-x-0 top-0 z-30 flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {group.stories.map((item, index) => (
          <div key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div className="h-full rounded-full bg-white transition-[width] duration-75" style={{ width: index < storyIndex ? '100%' : index > storyIndex ? '0%' : `${Math.round((story.media.type === 'video' ? (videoRef.current?.duration ? videoRef.current.currentTime / videoRef.current.duration : 0) : progress) * 100)}%` }} />
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 top-[max(1.45rem,calc(env(safe-area-inset-top)+1rem))] z-30 flex items-center gap-2.5 px-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/40 bg-white/95 shadow-lg">
          {group.publisher.official ? <img src="/media/logo-ayrovi.png" alt="" className="h-full w-full object-contain p-1" /> : group.publisher.avatar ? <img src={group.publisher.avatar} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-black text-brand">{group.publisher.name.slice(0, 2).toUpperCase()}</span>}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-white drop-shadow">{group.publisher.name}{group.publisher.verified && <CheckCircle2 size={14} className="ml-1 inline text-accent" />}</p>
          <p className="text-[10px] font-semibold text-white/75 drop-shadow">{timeAgo(story.createdAt)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto grid h-12 w-12 place-items-center rounded-full text-white transition hover:bg-white/10 active:scale-90"><X size={24} /></button>
      </div>

      <motion.div
        key={story.id}
        initial={{ opacity: 0.65, scale: 1.015 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.22 }}
        className="absolute inset-0"
        onTouchStart={(event) => { touchX.current = event.touches[0].clientX; touchY.current = event.touches[0].clientY; }}
        onTouchEnd={(event) => {
          if (touchX.current == null || touchY.current == null) return;
          const deltaX = event.changedTouches[0].clientX - touchX.current;
          const deltaY = event.changedTouches[0].clientY - touchY.current;
          if (Math.abs(deltaY) > 56 && Math.abs(deltaY) > Math.abs(deltaX)) {
            if (deltaY < 0) goNext(); else goPrev();
          } else if (deltaX > 48) goPrev();
          else if (deltaX < -48) goNext();
          touchX.current = null;
          touchY.current = null;
        }}
      >
        {story.media.type === 'image' ? <>
          <img src={story.media.url} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />
          <img src={story.media.url} alt={story.caption || `Story de ${group.publisher.name}`} className="relative h-full w-full object-contain" draggable={false} />
        </> : videoFailed ? (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-deep via-brand to-brand-light"><p className="px-8 text-center text-sm font-bold text-white/80">Vidéo indisponible sur cet appareil.</p></div>
        ) : (
          <video ref={videoRef} src={story.media.url} aria-label={story.caption || `Story vidéo de ${group.publisher.name}`} className="absolute inset-0 h-full w-full object-cover" autoPlay muted playsInline onError={() => setVideoFailed(true)} onEnded={goNext} onTimeUpdate={(event) => { const video = event.currentTarget; if (video.duration) setProgress(video.currentTime / video.duration); }} />
        )}
        <button type="button" aria-label="Story précédente" className="absolute inset-y-0 left-0 w-1/3" onClick={goPrev} />
        <button type="button" aria-label="Story suivante" className="absolute inset-y-0 right-0 w-2/3" onClick={goNext} />
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-64 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <div className="mb-3 flex items-end gap-3">
          <div className="min-w-0 flex-1">
            {story.caption && <p className="line-clamp-3 text-sm font-semibold leading-6 text-white drop-shadow">{story.caption}</p>}
            {story.cta && <button type="button" onClick={() => onCta(story.cta!)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-xs font-extrabold text-ink shadow-lg transition active:scale-95">{story.cta.label}<ArrowRight size={16} /></button>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => (isAuthenticated ? onOpenComments(story.id) : onRequireAuth())} className="min-h-12 min-w-0 flex-1 rounded-full border border-white/70 bg-black/15 px-4 text-left text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/10" aria-label={`Ajouter un commentaire, ${storyCounts.comments} commentaires`}>
            Ajouter un commentaire…
          </button>
          <button type="button" aria-label={`J’aime, ${storyCounts.likes}`} onClick={() => void toggleLike(story)} className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition active:scale-90 ${likedIds[story.id] ? 'heart-pop text-brand-light' : 'text-white'}`}>
            {likedIds[story.id] ? <HeartFilled size={26} /> : <Heart size={26} />}
          </button>
          <button type="button" aria-label={`Partager, ${storyCounts.shares} partages`} onClick={() => void share()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white transition active:scale-90"><Share2 size={25} /></button>
          <button type="button" aria-label={saved ? 'Retirer des éléments enregistrés' : 'Enregistrer'} onClick={() => toggleSave(story)} className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition active:scale-90 ${saved ? 'text-accent' : 'text-white'}`}><Bookmark size={25} className={saved ? 'fill-current' : ''} /></button>
        </div>
      </div>
    </div>
  );
};
