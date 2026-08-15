import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bookmark, CheckCircle2, Heart, HeartFilled, MessageSquare, MoreVertical, Share2 } from '../../components/QatafoIcons';
import { postPublicUrl } from '../storyService';
import { likePost, sharePost, timeAgo } from '../storyService';
import type { StoryCta, StoryPost } from '../types';

const PostHeader: React.FC<{ post: StoryPost; light?: boolean }> = ({ post, light }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex items-center gap-2.5 px-4 pb-3 pt-4 sm:px-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
        {post.publisher.official ? <img src="/media/logo-ayrovi.jpg" alt="" className="h-10 w-10 object-cover" /> : post.publisher.avatar ? <img src={post.publisher.avatar} alt="" className="h-10 w-10 object-cover" /> : <span className="text-xs font-black text-white">{post.publisher.name.slice(0, 2).toUpperCase()}</span>}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className={`flex items-center gap-1 text-sm font-extrabold ${light ? 'text-white' : 'text-ink'}`}>
          {post.publisher.name}
          {post.publisher.verified && <CheckCircle2 size={14} className={`shrink-0 ${light ? 'text-accent' : 'text-brand'}`} />}
        </p>
        <p className={`text-[11px] font-semibold ${light ? 'text-white/70' : 'text-muted'}`}>{post.publisher.subtitle || 'Publisher'} · {timeAgo(post.createdAt)}</p>
      </div>
      <div className="relative">
        <button type="button" aria-label="Options du post" onClick={() => setMenuOpen((open) => !open)} className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${light ? 'text-white hover:bg-white/15' : 'text-muted hover:bg-surface'}`}>
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

const PostMedia: React.FC<{ post: StoryPost; onOpenReels?: (post: StoryPost) => void }> = ({ post, onOpenReels }) => {
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
    return (
      <button type="button" onClick={() => onOpenReels?.(post)} aria-label="Ouvrir la vidéo" className="relative block w-full">
        <video
          ref={videoRef}
          src={post.media[0].url}
          muted
          loop
          playsInline
          className="aspect-[9/14] w-full bg-black object-cover"
        />
        <span className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">Reels</span>
      </button>
    );
  }
  return <img src={post.media[0].url} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" />;
};

const PostActions: React.FC<{
  post: StoryPost;
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
}> = ({ post, liked, onLike, onComment }) => {
  const [saved, setSaved] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('ayrovi_saved') || '[]').includes(post.id); } catch { return false; }
  });
  const toggleSave = () => {
    const next = !saved;
    setSaved(next);
    try {
      const list: string[] = JSON.parse(localStorage.getItem('ayrovi_saved') || '[]');
      const updated = next ? [...new Set([...list, post.id])] : list.filter((id: string) => id !== post.id);
      localStorage.setItem('ayrovi_saved', JSON.stringify(updated));
    } catch { /* */ }
  };
  return (
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
    <button type="button" onClick={toggleSave} aria-label="Enregistrer" className={`ml-auto grid h-10 w-10 place-items-center rounded-full transition active:scale-90 ${saved ? 'text-brand' : 'text-ink hover:bg-surface'}`}>
      <Bookmark size={20} className={saved ? 'fill-current' : ''} />
    </button>
  </div>
);};

export const StoryPostCard: React.FC<{
  post: StoryPost;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onOpenComments: (post: StoryPost) => void;
  onOpenReels?: (post: StoryPost) => void;
  onCta: (cta: StoryCta) => void;
}> = ({ post, isAuthenticated, onRequireAuth, onOpenComments, onOpenReels, onCta }) => {
  const [liked, setLiked] = useState(post.likedByCurrentUser);
  const [likesCount, setLikesCount] = useState(post.likesCount);

  // Invités : lecture seule — toute tentative d'interaction guide vers l'inscription (§5).
  const toggleLike = async () => {
    if (!isAuthenticated) { onRequireAuth(); return; }
    const next = !liked;
    setLiked(next); // optimistic UI
    const result = await likePost(post.id, next);
    if (result.authRequired) { setLiked(!next); onRequireAuth(); return; }
    setLikesCount((current) => Math.max(0, current + (next ? 1 : -1)));
  };

  const isVideo = post.type === 'video' || post.media[0]?.type === 'video';
  return (
    <article className="border-b border-line bg-white pb-4">
      {isVideo ? (
        <div className="relative">
          <PostMedia post={post} onOpenReels={onOpenReels} />
          <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/60 to-transparent pb-6">
            <PostHeader post={post} light />
          </div>
        </div>
      ) : (
        <>
          <PostHeader post={post} />
          <PostMedia post={post} />
        </>
      )}
      <PostActions post={post} liked={liked} onLike={() => void toggleLike()} onComment={() => (isAuthenticated ? onOpenComments(post) : onRequireAuth())} />
      <div className="px-4 sm:px-5">
        <p className="pt-1 text-sm font-extrabold text-ink">{likesCount.toLocaleString('fr-FR')} j'aime</p>
        {post.caption && <p className="mt-1.5 text-sm leading-6 text-ink/90"><span className="font-extrabold">{post.publisher.name}</span> {post.caption}</p>}
        <button type="button" onClick={() => onOpenComments(post)} className="mt-1.5 text-sm font-semibold text-muted transition hover:text-brand">
          Voir les {post.commentsCount} commentaires
        </button>
      </div>
    </article>
  );
};
