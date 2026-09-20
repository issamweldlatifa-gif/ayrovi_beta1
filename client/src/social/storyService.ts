import type { Story, StoryComment, StoryPost, StoryPublisher } from './types';
import { getSessionId } from '../utils/session';

/**
 * AYROVI Story Tab — service social backend-ready.
 * Contenu éditorial réel via /api/public ; interactions (likes, commentaires,
 * vues, partages) persistées côté serveur via /api/public/social/*, avec
 * erreurs explicites : aucun faux succès local. Invités : lecture seule.
 */


let csrfToken = '';
/** Fourni par l'App (session client) pour les interactions authentifiées. */
export function configureSocial(opts: { csrfToken?: string }): void {
  csrfToken = opts.csrfToken || '';
}
const jsonHeaders = () => ({
  'content-type': 'application/json',
  'x-session-id': getSessionId(),
  ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
});
const SEEN_KEY = 'ayrovi_stories_seen_v1';

async function interactionRequest(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(path, { ...init, signal: controller.signal });
    const payload = await res.json().catch(() => null);
    return { res, payload };
  } finally { clearTimeout(timeout); }
}
function isComment(value: any): value is StoryComment {
  return value && typeof value.id === 'string' && typeof value.author === 'string'
    && typeof value.text === 'string' && typeof value.createdAt === 'string'
    && Number.isFinite(Date.parse(value.createdAt));
}


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
/* Temps et état de lecture local uniquement                          */
/* ------------------------------------------------------------------ */

export function timeAgo(iso: string, locale: 'fr' | 'ar' = 'fr'): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return locale === 'ar' ? `منذ ${minutes} د` : `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === 'ar' ? `منذ ${hours} س` : `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return locale === 'ar' ? `منذ ${days} ي` : `il y a ${days} j`;
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
        id: String(row.id || row.slug),
        slug: String(row.slug || ''),
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
  const bySlug = new Map(publishers.map((pub) => [String(pub.slug || pub.id).toUpperCase(), pub]));
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
      title: String(row.title || ''),
      description: String(row.description || ''),
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
  return stories.map((story) => {
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
      likedByCurrentUser: false,
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
  fetch('/api/public/social/interact', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ targetId: id, type: 'view' }),
  }).catch(() => undefined);
}

export async function likeReel(id: string): Promise<LikeResult | null> {
  return likePostRemote(id);
}

export async function getStoryFeed(): Promise<StoryPost[]> {
  const stories = await getStories();
  const posts = storiesToPosts(stories);
  // Compteurs persistants côté serveur, sans compteur local inventé.
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

/** Compatibility argument retained; the server owns the toggle and resulting count. */
export async function likePost(id: string, _liked: boolean): Promise<LikeResult | null> {
  return likePostRemote(id);
}

export async function likePostRemote(id: string): Promise<LikeResult | null> {
  try {
    const { res, payload } = await interactionRequest('/api/public/social/interact', {
      method: 'POST', headers: jsonHeaders(),
      body: JSON.stringify({ targetId: id, type: 'like' }),
    });
    if (res.status === 401) return { liked: false, likesCount: 0, authRequired: true };
    if (res.ok && payload?.success && typeof payload.data?.liked === 'boolean'
      && Number.isInteger(payload.data?.likesCount) && payload.data.likesCount >= 0) return payload.data;
  } catch { /* offline */ }
  return null;
}

export async function getComments(id: string): Promise<StoryComment[]> {
  const remote = await getCommentsRemote(id);
  if (remote !== null) return remote;
  throw new Error('COMMENTS_UNAVAILABLE');
}

export async function getCommentsRemote(id: string): Promise<StoryComment[] | null> {
  try {
    const { res, payload } = await interactionRequest(`/api/public/social/comments?targetId=${encodeURIComponent(id)}`);
    if (res.ok && payload?.success && Array.isArray(payload.data) && payload.data.every(isComment)) return payload.data;
  } catch { /* offline */ }
  return null;
}

export async function addComment(id: string, text: string): Promise<StoryComment | { authRequired: true }> {
  const remote = await addCommentRemote(id, text);
  if (remote) return remote;
  throw new Error('COMMENT_NOT_PUBLISHED');
}

export async function addCommentRemote(id: string, text: string): Promise<StoryComment | { authRequired: true } | null> {
  try {
    const { res, payload } = await interactionRequest('/api/public/social/interact', {
      method: 'POST', headers: jsonHeaders(),
      body: JSON.stringify({ targetId: id, type: 'comment', text }),
    });
    if (res.status === 401) return { authRequired: true };
    if (res.ok && payload?.success && isComment(payload.data)) return payload.data;
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
    if (res.ok && payload?.success) return payload.data;
  } catch { /* offline */ }
  return {};
}

export function postPublicUrl(id: string): string {
  return `${window.location.origin}/?post=${encodeURIComponent(id)}`;
}

export async function sharePost(post: StoryPost): Promise<boolean> {
  const url = postPublicUrl(post.id);
  const text = `${post.publisher.name} sur AYROVI Social — ${post.caption || 'Découvrez la sélection AYROVI.'}`;
  try {
    if (navigator.share) await navigator.share({ title: 'AYROVI Social', text, url });
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else return false;
    recordShare(post.id);
    return true;
  } catch { return false; }
}
