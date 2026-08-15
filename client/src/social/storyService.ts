import type { Story, StoryComment, StoryPost, StoryPublisher } from './types';

/**
 * AYROVI Story Tab — service social backend-ready.
 * Contenu éditorial réel via /api/public ; interactions (likes, commentaires,
 * vues, partages) persistées côté serveur via /api/public/social/*, avec
 * fallback local hors-ligne. Invités : lecture seule (auth requise pour agir).
 */

const LS_KEY = 'ayrovi_social_v1';

let csrfToken = '';
/** Fourni par l'App (session client) pour les interactions authentifiées. */
export function configureSocial(opts: { csrfToken?: string }): void {
  csrfToken = opts.csrfToken || '';
}
const jsonHeaders = () => ({
  'content-type': 'application/json',
  ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
});
const SEEN_KEY = 'ayrovi_stories_seen_v1';

export const OFFICIAL: StoryPublisher = {
  id: 'pub_ayrovi',
  name: 'Ayrovi',
  avatar: '',
  verified: true,
  subtitle: 'Official',
  official: true,
};

const CHANNELS: Record<string, StoryPublisher> = {
  STYLE: { id: 'pub_style', name: 'Style', avatar: '', subtitle: 'Channel' },
  PROMO: { id: 'pub_promo', name: 'Promos', avatar: '', subtitle: 'Store' },
  INFO: { id: 'pub_actus', name: 'Actus', avatar: '', subtitle: 'Channel' },
  NEW: { id: 'pub_new', name: 'Nouveautés', avatar: '', subtitle: 'Store' },
  ARRIVAGE: OFFICIAL,
};

export const publisherFor = (category: string): StoryPublisher => {
  if (CHANNELS[category]) return CHANNELS[category];
  const clean = String(category || '').trim();
  if (!clean || clean === 'ARRIVAGE') return OFFICIAL;
  // Canal personnalisé créé depuis l'Admin.
  const name = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  return { id: `pub_${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, avatar: '', subtitle: 'Channel' };
};

/* ------------------------------------------------------------------ */
/* État local (fallback hors-ligne)                                    */
/* ------------------------------------------------------------------ */

interface SocialState {
  likes: Record<string, { liked: boolean; count: number }>;
  comments: Record<string, StoryComment[]>;
  shares: Record<string, number>;
}

function loadState(): SocialState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { likes: {}, comments: {}, shares: {}, ...JSON.parse(raw) };
  } catch { /* fresh */ }
  return { likes: {}, comments: {}, shares: {} };
}

function saveState(state: SocialState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

/** Compte de base déterministe (seed visuel stable, ajouté aux compteurs serveur). */
export function baseCount(id: string, salt: number): number {
  let hash = salt;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 24 + (hash % 180);
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

function loadSeen(): Record<string, boolean> {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; }
}

/* ------------------------------------------------------------------ */
/* Mapping du contenu publié                                           */
/* ------------------------------------------------------------------ */

export async function getStoryPublishers(): Promise<StoryPublisher[]> {
  try {
    const res = await fetch('/api/public/story-publishers');
    const payload = await res.json();
    if (payload?.success && Array.isArray(payload.data)) {
      return payload.data.map((row: any) => ({
        id: String(row.slug),
        name: String(row.name),
        avatar: String(row.avatar || ''),
        subtitle: String(row.subtitle || ''),
        verified: Boolean(row.official),
        official: Boolean(row.official),
      }));
    }
  } catch { /* fallback derivation */ }
  return [];
}

export function mapDbStories(rows: any[], publishers: StoryPublisher[] = []): Story[] {
  const seen = loadSeen();
  const bySlug = new Map(publishers.map((pub) => [pub.id.toUpperCase(), pub]));
  return rows
    .filter((row) => row && row.media_url)
    .map((row) => ({
      id: String(row.id),
      publisher: bySlug.get(String(row.category || '').toUpperCase()) || publisherFor(String(row.category || '')),
      media: {
        type: row.media_type === 'VIDEO' ? 'video' as const : 'image' as const,
        url: String(row.media_url),
      },
      mediaList: (() => {
        const type = row.media_type === 'VIDEO' ? 'video' as const : 'image' as const;
        let extra: string[] = [];
        try { extra = Array.isArray(JSON.parse(row.secondary_images || '[]')) ? JSON.parse(row.secondary_images) : []; } catch { /* */ }
        return [{ type, url: String(row.media_url) }, ...extra.filter((u) => /^https?:\/\//.test(u) || String(u).startsWith('/')).map((u) => ({ type: 'image' as const, url: String(u) }))];
      })(),
      caption: String(row.description || row.title || ''),
      cta: row.cta || row.product_id || row.arrival_id || row.promotion_id
        ? {
            label: String(row.cta || (row.product_id ? 'Voir le produit' : 'Découvrir')),
            action: row.product_id ? 'product' : row.arrival_id ? 'arrivages' : row.promotion_id ? 'promotions' : 'url',
            targetId: String(row.product_id || row.arrival_id || row.promotion_id || row.target_url || ''),
          }
        : undefined,
      createdAt: String(row.publish_at || new Date().toISOString()),
      expiresAt: String(row.expires_at || new Date(Date.now() + 86400000).toISOString()),
      seen: Boolean(seen[String(row.id)]),
    }));
}

export function storiesToPosts(stories: Story[]): StoryPost[] {
  const state = loadState();
  return stories.map((story) => {
    const like = state.likes[story.id];
    return {
      id: story.id,
      publisher: story.publisher,
      type: story.media.type === 'video' ? 'video' as const : 'image' as const,
      media: story.mediaList?.length ? story.mediaList : [story.media],
      caption: story.caption,
      // Compteurs 100% réels (base de données), aucun chiffre fictif.
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      likedByCurrentUser: Boolean(like?.liked),
      cta: story.cta,
      createdAt: story.createdAt,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Contrat d'API                                                       */
/* ------------------------------------------------------------------ */

export async function getStories(): Promise<Story[]> {
  const [response, publishers] = await Promise.all([fetch('/api/public/stories'), getStoryPublishers()]);
  const payload = await response.json();
  if (!response.ok || !payload?.success) throw new Error('stories unavailable');
  const rows = Array.isArray(payload.data) ? payload.data : [];
  // 100% backend-driven : contenu + couvertures de cercles viennent de l'Admin.
  return mapDbStories(rows, publishers);
}

export async function getPublications(): Promise<StoryPost[]> {
  const [res, publishers] = await Promise.all([fetch('/api/public/social/publications'), getStoryPublishers()]);
  const payload = await res.json();
  if (!payload?.success) return [];
  const bySlug = new Map(publishers.map((pub) => [pub.id, pub]));
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.map((row: any) => {
    const channel = row.channel_id ? publishers.find((pub: any) => pub.id === row.channel_id) : null;
    return {
      id: String(row.id),
      publisher: channel || OFFICIAL,
      type: 'image' as const,
      media: [{ type: 'image' as const, url: String(row.image_url) }],
      caption: row.subtitle ? `${row.title} — ${row.subtitle}` : String(row.title),
      likesCount: 0, commentsCount: 0, sharesCount: 0, likedByCurrentUser: false,
      createdAt: String(row.publish_at),
    };
  });
}

export interface ReelItem extends StoryPost { views: number; reelLikes: number; }

export async function getReels(): Promise<ReelItem[]> {
  const [res, publishers] = await Promise.all([fetch('/api/public/social/reels'), getStoryPublishers()]);
  const payload = await res.json();
  if (!payload?.success) return [];
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.map((row: any) => {
    const channel = row.channel_id ? publishers.find((pub: any) => pub.id === row.channel_id) : null;
    return {
      id: String(row.id),
      publisher: channel || OFFICIAL,
      type: 'video' as const,
      media: [{ type: 'video' as const, url: String(row.video_url) }],
      caption: row.description ? `${row.title} — ${row.description}` : String(row.title),
      likesCount: 0, commentsCount: 0, sharesCount: 0, likedByCurrentUser: false,
      createdAt: String(row.publish_at),
      views: Number(row.views || 0),
      reelLikes: Number(row.likes || 0),
    };
  });
}

export function viewReel(id: string): void {
  fetch(`/api/public/social/reels/${encodeURIComponent(id)}/view`, { method: 'POST' }).catch(() => undefined);
}

export async function likeReel(id: string, unlike: boolean): Promise<number | null> {
  try {
    const res = await fetch(`/api/public/social/reels/${encodeURIComponent(id)}/like`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unlike }),
    });
    const payload = await res.json();
    return payload?.success ? Number(payload.data.likes) : null;
  } catch { return null; }
}

export async function getStoryFeed(): Promise<StoryPost[]> {
  const stories = await getStories();
  const posts = storiesToPosts(stories);
  // Compteurs persistants côté serveur, fusionnés avec la seed visuelle.
  const remote = await fetchCounts(posts.map((post) => post.id));
  for (const post of posts) {
    const counts = remote[post.id];
    if (counts) {
      post.likesCount += counts.likes;
      post.commentsCount += counts.comments;
      post.sharesCount += counts.shares;
    }
  }
  return posts;
}

export function markStoryAsSeen(id: string): void {
  try {
    const seen = loadSeen();
    seen[id] = true;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { /* session only */ }
  recordView(id);
}

export interface LikeResult { liked: boolean; likesCount: number; authRequired?: boolean }

export async function likePost(id: string, liked: boolean): Promise<LikeResult> {
  const remote = await likePostRemote(id);
  if (remote && !remote.authRequired) return remote;
  if (remote?.authRequired) return { ...remote, likesCount: 0 };
  const state = loadState();
  const current = state.likes[id] || { liked: false, count: baseCount(id, 7) };
  const next = { liked, count: current.count + (liked && !current.liked ? 1 : !liked && current.liked ? -1 : 0) };
  state.likes[id] = next;
  saveState(state);
  return { liked: next.liked, likesCount: next.count };
}

export async function likePostRemote(id: string): Promise<LikeResult | null> {
  try {
    const res = await fetch('/api/public/social/interact', {
      method: 'POST', headers: jsonHeaders(),
      body: JSON.stringify({ targetId: id, type: 'like' }),
    });
    const payload = await res.json();
    if (res.status === 401) return { liked: false, likesCount: 0, authRequired: true };
    if (payload?.success) return payload.data;
  } catch { /* offline */ }
  return null;
}

export async function getComments(id: string): Promise<StoryComment[]> {
  const remote = await getCommentsRemote(id);
  if (remote) return remote;
  return loadState().comments[id] || [];
}

export async function getCommentsRemote(id: string): Promise<StoryComment[] | null> {
  try {
    const res = await fetch(`/api/public/social/comments?targetId=${encodeURIComponent(id)}`);
    const payload = await res.json();
    if (payload?.success) return payload.data;
  } catch { /* offline */ }
  return null;
}

export async function addComment(id: string, text: string): Promise<StoryComment | { authRequired: true }> {
  const remote = await addCommentRemote(id, text);
  if (remote) return remote;
  const state = loadState();
  const comment: StoryComment = {
    id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    author: 'Vous',
    text: text.slice(0, 500),
    createdAt: new Date().toISOString(),
  };
  state.comments[id] = [...(state.comments[id] || []), comment];
  saveState(state);
  return comment;
}

export async function addCommentRemote(id: string, text: string): Promise<StoryComment | { authRequired: true } | null> {
  try {
    const res = await fetch('/api/public/social/interact', {
      method: 'POST', headers: jsonHeaders(),
      body: JSON.stringify({ targetId: id, type: 'comment', text }),
    });
    const payload = await res.json();
    if (res.status === 401) return { authRequired: true };
    if (payload?.success) return payload.data;
  } catch { /* offline */ }
  return null;
}

export function recordView(id: string): void {
  fetch('/api/public/social/interact', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ targetId: id, type: 'view' }) }).catch(() => undefined);
}

export function recordShare(id: string): void {
  fetch('/api/public/social/interact', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ targetId: id, type: 'share' }) }).catch(() => undefined);
}

export async function fetchCounts(ids: string[]): Promise<Record<string, { likes: number; comments: number; views: number; shares: number }>> {
  try {
    const res = await fetch(`/api/public/social/counts?ids=${ids.join(',')}`);
    const payload = await res.json();
    if (payload?.success) return payload.data;
  } catch { /* offline */ }
  return {};
}

export function postPublicUrl(id: string): string {
  return `${window.location.origin}/?post=${encodeURIComponent(id)}`;
}

export function sharePost(post: StoryPost): Promise<boolean> {
  const url = postPublicUrl(post.id);
  const text = `${post.publisher.name} sur AYROVI Social — ${post.caption || 'Découvrez la sélection AYROVI.'}`;
  recordShare(post.id);
  if (navigator.share) return navigator.share({ title: 'AYROVI Social', text, url }).then(() => true).catch(() => false);
  return navigator.clipboard.writeText(url).then(() => true).catch(() => false);
}
