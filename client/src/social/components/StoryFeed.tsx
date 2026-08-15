import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Heart, HeartFilled, MessageSquare, MoreVertical, Share2 } from '../../components/QatafoIcons';
import { FigLeaf } from '../../components/QatafoIcons';
import { likePost, sharePost, timeAgo } from '../storyService';
import type { StoryCta, StoryPost } from '../types';

const PostHeader: React.FC<{ post: StoryPost }> = ({ post }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex items-center gap-2.5 px-4 pb-3 pt-4 sm:px-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-white">
        {post.publisher.official ? <FigLeaf size={22} /> : <span className="text-xs font-black">{post.publisher.name.slice(0, 2).toUpperCase()}</span>}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex items-center gap-1 text-sm font-extrabold text-ink">
          {post.publisher.name}
          {post.publisher.verified && <CheckCircle2 size={14} className="shrink-0 text-brand" />}
        </p>
        <p className="text-[11px] font-semibold text-muted">{post.publisher.subtitle || 'Publisher'} · {timeAgo(post.createdAt)}</p>
      </div>
      <div className="relative">
        <button type="button" aria-label="Options du post" onClick={() => setMenuOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface active:scale-90">
          <MoreVertical size={18} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-10 z-10 w-44 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
            <button type="button" className="block w-full px-4 py-2.5 text-left text-xs font-bold text-ink hover:bg-surface" onClick={() => { void navigator.clipboard?.writeText(window.location.href); setMenuOpen(false); }}>Copier le lien</button>
            <button type="button" className="block w-full px-4 py-2.5 text-left text-xs font-bold text-muted" onClick={() => setMenuOpen(false)}>Signaler — bientôt</button>
          </div>
        )}
      </div>
    </div>
  );
};

const PostMedia: React.FC<{ post: StoryPost }> = ({ post }) => {
  const [slide, setSlide] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Autoplay muted dans le viewport, pause en dehors (Intersection Observer).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) video.play().catch(() => undefined);
        else video.pause();
      }
    }, { threshold: 0.6 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [post.id]);

  if (post.type === 'carousel' && post.media.length > 1) {
    return (
      <div className="relative">
        <div className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto" onScroll={(event) => {
          const element = event.currentTarget;
          setSlide(Math.round(element.scrollLeft / element.clientWidth));
        }}>
          {post.media.map((media, index) => (
            <img key={index} src={media.url} alt="" loading="lazy" className="aspect-[4/5] w-full shrink-0 snap-center object-cover" />
          ))}
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-black text-white">{slide + 1} / {post.media.length}</span>
      </div>
    );
  }
  if (post.type === 'video' || post.media[0]?.type === 'video') {
    return <video ref={videoRef} src={post.media[0].url} muted loop playsInline className="aspect-[4/5] w-full bg-black object-contain" />;
  }
  return <img src={post.media[0].url} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" />;
};

const PostActions: React.FC<{
  post: StoryPost;
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
}> = ({ post, liked, onLike, onComment }) => (
  <div className="flex items-center gap-1 px-3 pt-3">
    <button type="button" onClick={onLike} aria-label={liked ? 'Ne plus aimer' : 'Aimer'} className={`grid h-10 w-10 place-items-center rounded-full transition active:scale-90 ${liked ? 'heart-pop text-brand' : 'text-ink hover:bg-surface'}`}>
      {liked ? <HeartFilled size={21} /> : <Heart size={21} />}
    </button>
    <button type="button" onClick={onComment} aria-label="Commenter" className="grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-surface active:scale-90">
      <MessageSquare size={20} />
    </button>
    <button type="button" onClick={() => void sharePost(post)} aria-label="Partager" className="grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-surface active:scale-90">
      <Share2 size={20} />
    </button>
  </div>
);

export const StoryPostCard: React.FC<{
  post: StoryPost;
  onOpenComments: (post: StoryPost) => void;
  onCta: (cta: StoryCta) => void;
  onLikeChange: (postId: string, liked: boolean, likesCount: number) => void;
}> = ({ post, onOpenComments, onCta, onLikeChange }) => {
  const [liked, setLiked] = useState(post.likedByCurrentUser);
  const [likesCount, setLikesCount] = useState(post.likesCount);

  const toggleLike = () => {
    const next = !liked;
    setLiked(next); // optimistic
    const result = likePost(post.id, next);
    setLikesCount(result.likesCount);
    onLikeChange(post.id, next, result.likesCount);
  };

  return (
    <article className="border-b border-line bg-white pb-4">
      <PostHeader post={post} />
      <PostMedia post={post} />
      <PostActions post={post} liked={liked} onLike={toggleLike} onComment={() => onOpenComments(post)} />
      <div className="px-4 sm:px-5">
        <p className="pt-1 text-sm font-extrabold text-ink">{likesCount.toLocaleString('fr-FR')} j'aime</p>
        {post.caption && <p className="mt-1.5 text-sm leading-6 text-ink/90"><span className="font-extrabold">{post.publisher.name}</span> {post.caption}</p>}
        <button type="button" onClick={() => onOpenComments(post)} className="mt-1.5 text-sm font-semibold text-muted transition hover:text-brand">
          Voir les {post.commentsCount} commentaires
        </button>
        {post.cta && (
          <button type="button" onClick={() => onCta(post.cta as StoryCta)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-xs font-black uppercase tracking-widest text-white transition hover:bg-brand active:scale-[0.98]">
            {post.cta.label}<ArrowRight size={14} />
          </button>
        )}
      </div>
    </article>
  );
};
