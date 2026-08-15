import type { Story, StoryComment, StoryPost, StoryPublisher } from './types';

/**
 * AYROVI Story Tab — service couche social.
 * Contenu éditorial réel depuis /api/public (stories publiées par l'Admin),
 * couche sociale (likes, commentaires, vu) en mock local persistant,
 * avec le même contrat d'API qu'un futur backend social.
 */

const LS_KEY = 'ayrovi_social_v1';
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

export const publisherFor = (category: string): StoryPublisher => CHANNELS[category] || OFFICIAL;

/* ------------------------------------------------------------------ */
/* État social local (mock backend-ready)                              */
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

/** Compte de base déterministe (même nombre pour tout le monde, pas de random visible). */
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
/* Mapping du contenu publié (backend réel)                            */
/* ------------------------------------------------------------------ */

export function mapDbStories(rows: any[]): Story[] {
  const seen = loadSeen();
  return rows
    .filter((row) => row && row.media_url)
    .map((row) => ({
      id: String(row.id),
      publisher: publisherFor(String(row.category || '')),
      media: {
        type: row.media_type === 'VIDEO' ? 'video' as const : 'image' as const,
        url: String(row.media_url),
      },
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
    const comments = state.comments[story.id] || [];
    return {
      id: story.id,
      publisher: story.publisher,
      type: story.media.type === 'video' ? 'video' as const : 'image' as const,
      media: [story.media],
      caption: story.caption,
      likesCount: like ? like.count : baseCount(story.id, 7),
      commentsCount: comments.length + (baseCount(story.id, 13) % 14),
      sharesCount: (state.shares[story.id] || 0) + (baseCount(story.id, 29) % 9),
      likedByCurrentUser: Boolean(like?.liked),
      cta: story.cta,
      createdAt: story.createdAt,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Contrat d'API (identique au futur backend social)                   */
/* ------------------------------------------------------------------ */

export async function getStories(): Promise<Story[]> {
  const response = await fetch('/api/public/stories');
  const payload = await response.json();
  if (!response.ok || !payload?.success) throw new Error('stories unavailable');
  const stories = mapDbStories(Array.isArray(payload.data) ? payload.data : []);
  // Une story vidéo de démonstration pour le viewer (backend-ready : retirée
  // automatiquement quand de vraies vidéos seront publiées).
  if (!stories.some((story) => story.media.type === 'video')) {
    stories.splice(1, 0, {
      id: 'story_demo_video',
      publisher: OFFICIAL,
      media: { type: 'video', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' },
      caption: 'La sélection AYROVI en mouvement.',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      seen: Boolean(loadSeen().story_demo_video),
    });
  }
  return stories;
}

export async function getStoryFeed(): Promise<StoryPost[]> {
  const stories = await getStories();
  return storiesToPosts(stories);
}

export function markStoryAsSeen(id: string): void {
  try {
    const seen = loadSeen();
    seen[id] = true;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { /* session only */ }
}

export function likePost(id: string, liked: boolean): { likesCount: number } {
  const state = loadState();
  const current = state.likes[id] || { liked: false, count: baseCount(id, 7) };
  const next = { liked, count: current.count + (liked && !current.liked ? 1 : !liked && current.liked ? -1 : 0) };
  state.likes[id] = next;
  saveState(state);
  return { likesCount: next.count };
}

export function getComments(id: string): StoryComment[] {
  return loadState().comments[id] || [];
}

export function addComment(id: string, text: string): StoryComment {
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

export function sharePost(post: StoryPost): Promise<boolean> {
  const text = `${post.publisher.name} sur AYROVI — ${post.caption || 'Découvrez la sélection AYROVI.'}`;
  if (navigator.share) return navigator.share({ title: 'AYROVI', text }).then(() => true).catch(() => false);
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
}
