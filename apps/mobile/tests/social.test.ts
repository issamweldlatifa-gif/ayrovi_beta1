/**
 * الاجتماعي (Q3) — العقود اللي تمنع «إعجاب وهيبة».
 *
 * ثلاث حقائق من الخادم نثبّتها هنا:
 *  • **الإعجاب يتبدّل**: `liked` يرجّعو الخادم، وهو الحكم — موش تفاؤلنا.
 *  • **النصّ يُقلَّم إلى 500 حرف**، وتحت حرفين ⇒ الخادم يرفض.
 *  • **المدى الأقصى 60 معرّفاً** في `?ids=` — وتجاوزو يعني عدّادات صفر صامتة.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => push(...(args as [])) } }));

// `react-native` فيه Flow: Vite ما يجمش يقراه في Node. نبدّلو ببديل خفيف
// فيه غير اللي يستعملو الملف المُختبر (`Linking`).
const openURL = vi.fn((_url: string) => Promise.resolve(true));
vi.mock('react-native', () => ({ Linking: { openURL: (url: string) => openURL(url) } }));

const apiGet = vi.fn();
const apiSend = vi.fn();
vi.mock('../src/api/client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...(args as [])),
  apiSend: (...args: unknown[]) => apiSend(...(args as [])),
}));

const { fetchComments, fetchReels, fetchSocialCounts, sendInteraction } = await import('../src/api/social');
const { storyHasTarget } = await import('../src/features/social/storyTarget');

beforeEach(() => {
  apiGet.mockClear();
  apiSend.mockClear();
  apiGet.mockResolvedValue({ data: [] });
  apiSend.mockResolvedValue({ data: {} });
});

describe('الريلز', () => {
  it('الحقول `snake_case` تُترجم والعدّادات تُقرا', async () => {
    apiGet.mockResolvedValue({
      data: [{
        id: 'reel_1', title: 'T', channel_id: 'ch', description: 'D',
        video_url: '/media/v.mp4', duration_seconds: 30, publish_at: '2026-10-01',
        views: 120, likes: 7,
      }],
    });
    const rows = await fetchReels({});
    expect(rows[0]).toMatchObject({
      id: 'reel_1', channelId: 'ch', videoUrl: '/media/v.mp4', durationSeconds: 30, views: 120, likes: 7,
    });
  });

  it('سطر بلا معرّف ⇒ يُسقَط (ما نعرضش ريلز ما يتفتحش)', async () => {
    apiGet.mockResolvedValue({ data: [{ title: 'sans id' }] });
    await expect(fetchReels({})).resolves.toEqual([]);
  });
});

describe('العدّادات', () => {
  it('القيم الناقصة ⇒ أصفار، موش `NaN`', async () => {
    apiGet.mockResolvedValue({ data: { reel_1: { likes: 3 } } });
    const counts = await fetchSocialCounts(['reel_1'], {});
    expect(counts.reel_1).toEqual({ likes: 3, comments: 0, views: 0, shares: 0 });
  });

  it('الحدّ 60 معرّفاً — الخادم يسقط ما بعدها بصمت', async () => {
    const ids = Array.from({ length: 80 }, (_, index) => `id_${index}`);
    await fetchSocialCounts(ids, {});
    const called = String(apiGet.mock.calls[0]?.[0] ?? '');
    const sent = decodeURIComponent(called.split('ids=')[1] ?? '');
    expect(sent.split(',')).toHaveLength(60);
  });

  it('قائمة فارغة ⇒ **صفر طلب** (موّش `?ids=`)', async () => {
    await fetchSocialCounts([], {});
    expect(apiGet).not.toHaveBeenCalled();
  });
});

describe('التفاعل', () => {
  it('الإعجاب: رقم الخادم هو الحكم (`liked`)', async () => {
    apiSend.mockResolvedValue({ data: { liked: true, likesCount: 12, counts: { likes: 12, comments: 1, views: 3, shares: 0 } } });
    const result = await sendInteraction({ type: 'like', targetId: 'reel_1' });
    expect(result.liked).toBe(true);
    expect(result.counts?.likes).toBe(12);
  });

  it('الزائر ⇒ ترويسة `x-session-id` مرفوعة (الخادم يرفض بلاها)', async () => {
    await sendInteraction({ type: 'view', targetId: 'story_1', sessionId: 'ayw-abc-123456' });
    const options = apiSend.mock.calls[0]?.[2] as { headers?: Record<string, string> } | undefined;
    expect(options?.headers?.['x-session-id']).toBe('ayw-abc-123456');
  });

  it('التعليق: النصّ يُقلَّم إلى 500 حرف قبل الإرسال', async () => {
    await sendInteraction({ type: 'comment', targetId: 'story_1', text: 'x'.repeat(900) });
    const options = apiSend.mock.calls[0]?.[2] as { body?: { text?: string } } | undefined;
    expect(options?.body?.text).toHaveLength(500);
  });

  it('التعليق يقبل نصّاً من حرفين — الحدّ من الخادم، نحترمو', async () => {
    apiSend.mockResolvedValue({ data: { id: 'int_1', author: 'Sam', text: 'ها', createdAt: 'now' } });
    const result = await sendInteraction({ type: 'comment', targetId: 'story_1', text: 'ها' });
    expect(result.comment).toMatchObject({ id: 'int_1', author: 'Sam' });
  });

  it('التعليقات: مؤلّف مجهول ⇒ «Membre AYROVI» موش فراغ', async () => {
    apiGet.mockResolvedValue({ data: [{ id: 'c1', text: 'S', createdAt: 'now' }] });
    const rows = await fetchComments('story_1', {});
    expect(rows[0]?.author).toBe('Membre AYROVI');
  });
});

describe('هدف الستوري', () => {
  it('منتوج أو وصولة أو رابط ⇒ عندو هدف', () => {
    const base = { id: 's', product: null, mediaType: 'IMAGE', mediaUrl: '', title: '', description: '', cta: '', targetUrl: '', productId: '', arrivalId: '', promotionId: '', publishAt: '', expiresAt: '', priority: 0, status: 'PUBLISHED' };
    expect(storyHasTarget({ ...base, productId: 'p1' })).toBe(true);
    expect(storyHasTarget({ ...base, arrivalId: 'a1' })).toBe(true);
    expect(storyHasTarget({ ...base, targetUrl: 'https://x.tn' })).toBe(true);
  });

  it('بلا هدف ⇒ **ما فمّاش CTA** (موّش زر يفتح والو)', () => {
    const base = { id: 's', product: null, mediaType: 'IMAGE', mediaUrl: '', title: 'T', description: '', cta: '', targetUrl: '', productId: '', arrivalId: '', promotionId: '', publishAt: '', expiresAt: '', priority: 0, status: 'PUBLISHED' };
    expect(storyHasTarget(base)).toBe(false);
  });
});
