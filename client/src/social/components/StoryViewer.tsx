import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from '../../components/QatafoIcons';
import { FullscreenActionRail } from './FullscreenActionRail';
import { FullscreenMediaHeader } from './FullscreenMediaHeader';
import { fetchCounts, likePost, markStoryAsSeen, sharePost, timeAgo } from '../storyService';
import type { Story, StoryCta } from '../types';
import type { StoryGroup } from './StoryCircles';
import { useLocale } from '../../i18n/LocaleContext';

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
  const { locale, tr } = useLocale();
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, { likes: number; comments: number; views: number; shares: number }>>({});
  const [groupIndex, setGroupIndex] = useState(startIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [muted, setMuted] = useState(true);
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
    <div className="fixed inset-0 z-[120] bg-ink" role="dialog" aria-modal="true" aria-label={tr(`Story de ${group.publisher.name}`, `قصة ${group.publisher.name}`)}>
      <div className="absolute inset-x-0 top-0 z-30 flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {group.stories.map((item, index) => (
          <div key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div className="h-full rounded-full bg-white transition-[width] duration-75" style={{ width: index < storyIndex ? '100%' : index > storyIndex ? '0%' : `${Math.round((story.media.type === 'video' ? (videoRef.current?.duration ? videoRef.current.currentTime / videoRef.current.duration : 0) : progress) * 100)}%` }} />
          </div>
        ))}
      </div>

      <FullscreenMediaHeader
        title={group.publisher.name}
        subtitle={timeAgo(story.createdAt, locale)}
        avatarUrl={group.publisher.avatar}
        official={group.publisher.official}
        verified={group.publisher.verified}
        muted={muted}
        onBack={onClose}
        onToggleMute={() => {
          const next = !muted;
          setMuted(next);
          if (videoRef.current) videoRef.current.muted = next;
        }}
        offsetForProgress
      />

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
          <div className="grid h-full w-full place-items-center bg-ink"><p className="px-8 text-center text-sm font-bold text-white/80">{tr('Vidéo indisponible sur cet appareil.', 'الفيديو غير متاح على هذا الجهاز.')}</p></div>
        ) : (
          <video ref={videoRef} src={story.media.url} aria-label={story.caption || `Story vidéo de ${group.publisher.name}`} className="absolute inset-0 h-full w-full object-cover" autoPlay muted={muted} playsInline onError={() => setVideoFailed(true)} onEnded={goNext} onTimeUpdate={(event) => { const video = event.currentTarget; if (video.duration) setProgress(video.currentTime / video.duration); }} />
        )}
        <button type="button" aria-label={tr('Story précédente', 'القصة السابقة')} className="absolute inset-y-0 start-0 w-1/3" onClick={goPrev} />
        <button type="button" aria-label={tr('Story suivante', 'القصة التالية')} className="absolute inset-y-0 end-0 w-2/3" onClick={goNext} />
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-64 bg-gradient-to-t from-ink/90 via-ink/35 to-transparent" />
      <FullscreenActionRail
        liked={Boolean(likedIds[story.id])}
        saved={saved}
        likes={storyCounts.likes}
        comments={storyCounts.comments}
        shares={storyCounts.shares}
        onLike={() => void toggleLike(story)}
        onComment={() => (isAuthenticated ? onOpenComments(story.id) : onRequireAuth())}
        onShare={() => void share()}
        onSave={() => toggleSave(story)}
      />
      <div className="absolute inset-x-0 bottom-0 z-30 px-4 pe-20 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16">
        {story.caption && <p className="line-clamp-3 text-sm font-semibold leading-6 text-white drop-shadow">{story.caption}</p>}
        {story.cta && <button type="button" onClick={() => onCta(story.cta!)} className="ay-btn-secondary mt-2 min-h-11 text-xs">{story.cta.label}<ArrowRight size={16} /></button>}
      </div>
    </div>
  );
};
