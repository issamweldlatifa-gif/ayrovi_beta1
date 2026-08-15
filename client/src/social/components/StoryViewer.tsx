import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ArrowRight } from '../../components/QatafoIcons';
import { FigLeaf } from '../../components/QatafoIcons';
import { markStoryAsSeen, timeAgo } from '../storyService';
import type { StoryCta } from '../types';
import type { StoryGroup } from './StoryCircles';

const IMAGE_DURATION = 5000;

export const StoryViewer: React.FC<{
  groups: StoryGroup[];
  startIndex: number;
  onClose: () => void;
  onCta: (cta: StoryCta) => void;
  onSeenChange: () => void;
}> = ({ groups, startIndex, onClose, onCta, onSeenChange }) => {
  const [groupIndex, setGroupIndex] = useState(startIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchX = useRef<number | null>(null);

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];

  const goNext = useCallback(() => {
    setProgress(0);
    if (group && storyIndex < group.stories.length - 1) setStoryIndex(storyIndex + 1);
    else if (groupIndex < groups.length - 1) { setGroupIndex(groupIndex + 1); setStoryIndex(0); }
    else onClose();
  }, [group, storyIndex, groupIndex, groups.length, onClose]);

  const goPrev = useCallback(() => {
    setProgress(0);
    if (storyIndex > 0) setStoryIndex(storyIndex - 1);
    else if (groupIndex > 0) {
      const previous = groups[groupIndex - 1];
      setGroupIndex(groupIndex - 1);
      setStoryIndex(previous.stories.length - 1);
    }
  }, [storyIndex, groupIndex, groups]);

  // Avancement automatique (images ou vidéo en échec) ; le video pilote via onEnded/timeupdate.
  useEffect(() => {
    setVideoFailed(false);
  }, [story?.id]);

  useEffect(() => {
    if (!story || (story.media.type === 'video' && !videoFailed)) return undefined;
    markStoryAsSeen(story.id);
    onSeenChange();
    const started = Date.now();
    const timer = window.setInterval(() => {
      const ratio = (Date.now() - started) / IMAGE_DURATION;
      if (ratio >= 1) { window.clearInterval(timer); goNext(); }
      else setProgress(ratio);
    }, 80);
    return () => window.clearInterval(timer);
  }, [story?.id, videoFailed, goNext]);

  useEffect(() => {
    if (story?.media.type === 'video') {
      markStoryAsSeen(story.id);
      onSeenChange();
    }
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

  return (
    <div className="fixed inset-0 z-[120] bg-black" role="dialog" aria-modal="true" aria-label={`Story de ${group.publisher.name}`}>
      {/* Progress indicators */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {group.stories.map((item, index) => (
          <div key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: index < storyIndex ? '100%' : index > storyIndex ? '0%' : `${Math.round((story.media.type === 'video' ? (videoRef.current?.duration ? (videoRef.current.currentTime / videoRef.current.duration) : 0) : progress) * 100)}%` }}
            />
          </div>
        ))}
      </div>

      {/* Header publisher */}
      <div className="absolute inset-x-0 top-6 z-20 flex items-center gap-2.5 px-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-white">
          {group.publisher.official ? <FigLeaf size={20} /> : <span className="text-xs font-black">{group.publisher.name.slice(0, 2).toUpperCase()}</span>}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-white">{group.publisher.name}{group.publisher.verified && <span className="ml-1 text-accent">✓</span>}</p>
          <p className="text-[10px] font-semibold text-white/60">{timeAgo(story.createdAt)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto grid h-10 w-10 place-items-center rounded-full text-white/90 transition active:scale-90"><X size={22} /></button>
      </div>

      {/* Media + tap zones */}
      <div
        className="absolute inset-0"
        onTouchStart={(event) => { touchX.current = event.touches[0].clientX; }}
        onTouchEnd={(event) => {
          if (touchX.current == null) return;
          const delta = event.changedTouches[0].clientX - touchX.current;
          if (delta > 48) goPrev();
          else if (delta < -48) goNext();
          touchX.current = null;
        }}
      >
        {story.media.type === 'image' ? (
          <img src={story.media.url} alt="" className="h-full w-full object-contain" draggable={false} />
        ) : videoFailed ? (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-deep via-brand to-brand-light">
            <p className="px-8 text-center text-sm font-bold text-white/80">Vidéo indisponible sur cet appareil — touchez pour continuer.</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={story.media.url}
            className="h-full w-full object-contain"
            autoPlay
            muted
            playsInline
            onError={() => setVideoFailed(true)}
            onEnded={goNext}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              if (video.duration) setProgress(video.currentTime / video.duration);
            }}
          />
        )}
        <button type="button" aria-label="Story précédente" className="absolute inset-y-0 left-0 w-1/3" onClick={goPrev} />
        <button type="button" aria-label="Story suivante" className="absolute inset-y-0 right-0 w-2/3" onClick={goNext} />
      </div>

      {/* Caption + CTA */}
      {(story.caption || story.cta) && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 to-transparent px-5 pb-6 pt-14">
          {story.caption && <p className="text-sm font-semibold leading-6 text-white">{story.caption}</p>}
          {story.cta && (
            <button
              type="button"
              onClick={() => { onCta(story.cta as StoryCta); onClose(); }}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-6 text-xs font-black uppercase tracking-widest text-ink transition active:scale-95"
            >
              {story.cta.label || 'Découvrir'}<ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
