/**
 * الاجتماعي — ريلز، منشورات، ناشرو ستوريهات، وإعجابات/تعليقات (Q3، 08/10/2026).
 *
 * لماذا هذا الملف: الخادم يعرض `/api/public/social/*` من زمان، والتطبيق ما
 * قراهوش — فالقسم الاجتماعي كان والو بالمرّة. لا عذر تقني: الطريق موجودة.
 *
 * ثلاث قواعد تمنع الكذب:
 *
 *   1. **الإعجاب يحتاج حساباً.** الخادم يردّ `401 AUTH_REQUIRED` ل«أعجبني»
 *      و«علّق» بلا حساب. الشاشة تقولها **قبل** الضغطة (زر معطّل بسبب)، موش
 *      بعدها برسالة خطأ.
 *   2. **المشاهدة والوصول للزائر** بمعرّف تركيب (`x-session-id`) — وهو **نفس**
 *      معرّف AYWEBs: نمط الخادم واحد، والسلّة والإعجابات ينتميو لنفس التركيب.
 *   3. **العدادات تُقرأ من الخادم** (`/social/counts`)، والتفاؤل correctif: نُظهر
 *      الأثر فوراً، ونرجّع لرقم الخادم إذا هو قال غيرو.
 */
import { apiGet, apiSend } from './client';
import type { RequestOptions } from './client';
import { parseLinkedProduct, type LinkedProduct } from './linkedProduct';

export type SocialInteractionType = 'like' | 'comment' | 'view' | 'share';

export interface SocialCounts {
  likes: number;
  comments: number;
  views: number;
  shares: number;
}

export const ZERO_COUNTS: SocialCounts = { likes: 0, comments: 0, views: 0, shares: 0 };

export interface Reel {
  id: string;
  title: string;
  channelId: string;
  description: string;
  videoUrl: string;
  durationSeconds: number;
  publishAt: string;
  /** عدّادان يقراهم الخادم في نفس الطلب (من `story_interactions`). */
  views: number;
  likes: number;
  /** Carte produit (null = pas de carte). */
  product: LinkedProduct | null;
}

export interface Publication {
  id: string;
  title: string;
  subtitle: string;
  channelId: string;
  imageUrl: string;
  publishAt: string;
  /** Carte produit (null = contenu normal, ou produit plus vendable). */
  product: LinkedProduct | null;
}

export interface StoryPublisher {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  avatar: string;
  official: boolean;
}

export interface SocialComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface InteractionResult {
  /** للإعجاب: هل صار «معجباً» بعد الضغطة (الخادم يبدّل). */
  liked: boolean | null;
  likesCount: number;
  counts: SocialCounts | null;
  /** للتعليق: السطر المضاف كما سجّلو الخادم. */
  comment: SocialComment | null;
  /** للمشاهدة/المشاركة: هل تُسجّلت (مرّة وحدة لكل مالك). */
  recorded: boolean | null;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const bool = (value: unknown): boolean => value === true || value === 1 || value === '1';
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function rowsOf(payload: unknown): Record<string, unknown>[] {
  const body = record(payload);
  const list = Array.isArray(body.data) ? body.data : Array.isArray(payload) ? payload : [];
  return list.flatMap((entry) => {
    const entryRecord = record(entry);
    return Object.keys(entryRecord).length > 0 ? [entryRecord] : [];
  });
}

export async function fetchReels(options: RequestOptions = {}): Promise<Reel[]> {
  return rowsOf(await apiGet('/api/public/social/reels', options)).flatMap((entry) => {
    const id = str(entry.id);
    if (!id) return [];
    return [{
      id,
      title: str(entry.title),
      channelId: str(entry.channel_id),
      description: str(entry.description),
      videoUrl: str(entry.video_url),
      durationSeconds: num(entry.duration_seconds),
      publishAt: str(entry.publish_at),
      views: num(entry.views),
      likes: num(entry.likes),
      product: parseLinkedProduct(entry.product),
    }];
  });
}

export async function fetchPublications(options: RequestOptions = {}): Promise<Publication[]> {
  return rowsOf(await apiGet('/api/public/social/publications', options)).flatMap((entry) => {
    const id = str(entry.id);
    if (!id) return [];
    return [{
      id,
      title: str(entry.title),
      subtitle: str(entry.subtitle),
      channelId: str(entry.channel_id),
      imageUrl: str(entry.image_url),
      publishAt: str(entry.publish_at),
      product: parseLinkedProduct(entry.product),
    }];
  });
}

export async function fetchStoryPublishers(options: RequestOptions = {}): Promise<StoryPublisher[]> {
  return rowsOf(await apiGet('/api/public/story-publishers', options)).flatMap((entry) => {
    const id = str(entry.id);
    if (!id) return [];
    return [{
      id,
      slug: str(entry.slug),
      name: str(entry.name),
      subtitle: str(entry.subtitle),
      avatar: str(entry.avatar),
      official: bool(entry.official),
    }];
  });
}

/**
 * عدّادات دفعة وحدة (`?ids=a,b,c`).
 *
 * الخادم يحدّ 60 معرّفاً ويشدّد على النمط — نحترم الحدّ هنا، لأنّ تجاوزو يعني
 * عدّادات صفر صامتة (الخادم يسقط ما لا يطابق النمط).
 */
export async function fetchSocialCounts(ids: string[], options: RequestOptions = {}): Promise<Record<string, SocialCounts>> {
  const clean = ids
    .map((value) => String(value).trim())
    .filter((value) => /^[A-Za-z0-9_-]{1,120}$/.test(value))
    .slice(0, 60);
  const out: Record<string, SocialCounts> = {};
  for (const id of clean) out[id] = { ...ZERO_COUNTS };
  if (clean.length === 0) return out;

  const body = record(await apiGet(`/api/public/social/counts?ids=${encodeURIComponent(clean.join(','))}`, options));
  const data = record(body.data);
  for (const [key, value] of Object.entries(data)) {
    const counts = record(value);
    out[key] = {
      likes: num(counts.likes),
      comments: num(counts.comments),
      views: num(counts.views),
      shares: num(counts.shares),
    };
  }
  return out;
}

export async function fetchComments(targetId: string, options: RequestOptions = {}): Promise<SocialComment[]> {
  return rowsOf(await apiGet(`/api/public/social/comments?targetId=${encodeURIComponent(targetId)}`, options))
    .flatMap((entry) => {
      const id = str(entry.id);
      if (!id) return [];
      return [{
        id,
        author: str(entry.author) || 'Membre AYROVI',
        text: str(entry.text),
        createdAt: str(entry.createdAt),
      }];
    });
}

/**
 * تفاعل واحد.
 *
 * `sessionId` مطلوب للزائر (الخادم يرفض بلاها: `SOCIAL_SESSION_REQUIRED`)؛
 * وحساب مسجّل يكفيه التوكن. نبعثو في الحالتين: ترويسة زايدة ما تضرّش،
 * وطلب مرفوض يضرّ.
 */
export async function sendInteraction(input: {
  type: SocialInteractionType;
  targetId: string;
  text?: string;
  sessionId?: string;
}, options: RequestOptions = {}): Promise<InteractionResult> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (input.sessionId) headers['x-session-id'] = input.sessionId;

  const body: Record<string, unknown> = { type: input.type, targetId: input.targetId };
  if (input.type === 'comment') body.text = String(input.text ?? '').slice(0, 500);

  const { data } = await apiSend<unknown>('POST', '/api/public/social/interact', {
    ...options,
    headers,
    body,
  });

  const payload = record(data);
  const counts = record(payload.counts);
  const comment = record(payload.comment ?? (payload.id ? payload : undefined));

  return {
    liked: typeof payload.liked === 'boolean' ? payload.liked : null,
    likesCount: num(payload.likesCount),
    counts: Object.keys(counts).length > 0 ? {
      likes: num(counts.likes),
      comments: num(counts.comments),
      views: num(counts.views),
      shares: num(counts.shares),
    } : null,
    comment: str(comment.id)
      ? { id: str(comment.id), author: str(comment.author) || 'Membre AYROVI', text: str(comment.text), createdAt: str(comment.createdAt) }
      : null,
    recorded: typeof payload.recorded === 'boolean' ? payload.recorded : null,
  };
}
