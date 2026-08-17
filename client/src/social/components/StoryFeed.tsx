import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Bookmark, CheckCircle2, Heart, HeartFilled, MessageSquare, MoreVertical, Share2, User } from '../../components/QatafoIcons';
import { postPublicUrl } from '../storyService';
import { likePost, sharePost, timeAgo } from '../storyService';
import type { StoryCta, StoryPost } from '../types';
import { useLocale } from '../../i18n/LocaleContext';

const PostHeader: React.FC<{ post: StoryPost; light?: boolean }> = ({ post, light }) => {
  const { locale, tr } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex items-center gap-2.5 px-4 pb-3 pt-4 sm:px-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
        {post.publisher.official ? <img src="/media/logo-ayrovi-final.png" alt="" className="h-10 w-10 object-contain p-1" /> : post.publisher.avatar ? <img src={post.publisher.avatar} alt="" className="h-10 w-10 object-cover" /> : <span className="text-xs font-black text-brand">{post.publisher.name.slice(0, 2).toUpperCase()}</span>}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className={`flex items-center gap-1 text-sm font-extrabold ${light ? 'text-white' : 'text-ink'}`}>
          {post.publisher.name}
          {post.publisher.verified && <CheckCircle2 size={14} className={`shrink-0 ${light ? 'text-white' : 'text-brand'}`} />}
        </p>
        <p className={`text-[11px] font-semibold ${light ? 'text-white/70' : 'text-muted'}`}>{post.publisher.subtitle || tr('Éditeur', 'الناشر')} · {timeAgo(post.createdAt, locale)}</p>
      </div>
      <div className="relative">
        <button type="button" aria-label={tr('Options du post', 'خيارات المنشور')} onClick={() => setMenuOpen((open) => !open)} className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-90 ${light ? 'text-white hover:bg-white/15' : 'text-muted hover:bg-surface'}`}>
          <MoreVertical size={18} />
        </button>
        {menuOpen && (
          <div className="absolute end-0 top-10 z-10 w-44 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
            <button type="button" className="block w-full px-4 py-2.5 text-start text-xs font-bold text-ink hover:bg-surface" onClick={() => { void navigator.clipboard?.writeText(window.location.href); setMenuOpen(false); }}>{tr('Copier le lien', 'نسخ الرابط')}</button>
            <button type="button" className="block w-full px-4 py-2.5 text-start text-xs font-bold text-muted" onClick={() => setMenuOpen(false)}>{tr('Signaler — bientôt', 'إبلاغ — قريبًا')}</button>
          </div>
        )}
      </div>
    </div>
  );
};

const PostMedia: React.FC<{ post: StoryPost; onOpenReels?: (post: StoryPost) => void }> = ({ post, onOpenReels }) => {
  const { tr } = useLocale();
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
        <span className="absolute end-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-black text-white">{slide + 1} / {post.media.length}</span>
      </div>
    );
  }
  if (post.type === 'video' || post.media[0]?.type === 'video') {
    return (
      <button type="button" onClick={() => onOpenReels?.(post)} aria-label={tr('Ouvrir la vidéo', 'فتح الفيديو')} className="relative block w-full">
        <video
          ref={videoRef}
          src={post.media[0].url}
          muted
          loop
          playsInline
          className="aspect-[9/14] w-full bg-ink object-cover"
        />
        <span className="absolute bottom-2 end-2 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">{tr('Reels', 'ريلز')}</span>
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
  const { tr } = useLocale();
  const [saved, setSaved] = React.useState(() => {
    try { const value = JSON.parse(localStorage.getItem('ayrovi_saved') || '[]'); return Array.isArray(value) && value.includes(post.id); } catch { return false; }
  });
  const toggleSave = () => {
    const next = !saved;
    setSaved(next);
    try {
      const value = JSON.parse(localStorage.getItem('ayrovi_saved') || '[]');
      const list: string[] = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 500) : [];
      const updated = next ? [...new Set([...list, post.id])] : list.filter((id: string) => id !== post.id);
      localStorage.setItem('ayrovi_saved', JSON.stringify(updated));
    } catch { /* */ }
  };
  return (
  <div className="flex items-center gap-1 px-3 pt-3">
    <button type="button" onClick={onLike} aria-label={liked ? tr('Ne plus aimer', 'إلغاء الإعجاب') : tr('Aimer', 'إعجاب')} className={`grid h-12 w-12 place-items-center rounded-full transition active:scale-90 ${liked ? 'heart-pop text-brand' : 'text-ink hover:bg-surface'}`}>
      {liked ? <HeartFilled size={24} /> : <Heart size={24} />}
    </button>
    <button type="button" onClick={onComment} aria-label={tr('Commenter', 'تعليق')} className="grid h-12 w-12 place-items-center rounded-full text-ink transition hover:bg-surface active:scale-90">
      <MessageSquare size={23} />
    </button>
    <button type="button" onClick={() => void sharePost(post)} aria-label={tr('Partager', 'مشاركة')} className="grid h-12 w-12 place-items-center rounded-full text-ink transition hover:bg-surface active:scale-90">
      <Share2 size={23} />
    </button>
    <button type="button" onClick={toggleSave} aria-label={tr('Enregistrer', 'حفظ')} className={`ms-auto grid h-12 w-12 place-items-center rounded-full transition active:scale-90 ${saved ? 'text-brand' : 'text-ink hover:bg-surface'}`}>
      <Bookmark size={23} className={saved ? 'fill-current' : ''} />
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
  const { locale, direction, tr } = useLocale();
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
    <motion.article initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.32 }} className="border-b border-line bg-white pb-4">
      {isVideo ? (
        <div className="relative">
          <PostMedia post={post} onOpenReels={onOpenReels} />
          <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-ink/60 to-transparent pb-6">
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
        <p className="pt-1 text-sm font-extrabold text-ink">{likesCount.toLocaleString(locale === 'ar' ? 'ar-TN' : 'fr-TN')} {tr("j'aime", 'إعجاب')}</p>
        {post.caption && <p className="mt-1.5 text-sm leading-6 text-ink/90"><span className="font-extrabold">{post.publisher.name}</span> {post.caption}</p>}
        {post.cta && <button type="button" onClick={() => onCta(post.cta!)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand/10 px-4 text-xs font-extrabold text-brand-dark transition hover:bg-brand/15 active:scale-95">{post.cta.label}<ArrowRight size={16} className={direction === 'rtl' ? 'rotate-180' : ''} /></button>}
        <button type="button" onClick={() => (isAuthenticated ? onOpenComments(post) : onRequireAuth())} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-full border border-line bg-surface px-3 text-start text-sm font-semibold text-muted transition focus:border-brand hover:border-brand/40">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><User size={16} /></span>
          <span className="min-w-0 flex-1 truncate">{tr('Ajouter un commentaire…', 'أضف تعليقًا…')}</span>
          {post.commentsCount > 0 && <span className="text-[11px] font-bold">{post.commentsCount}</span>}
        </button>
      </div>
    </motion.article>
  );
};
