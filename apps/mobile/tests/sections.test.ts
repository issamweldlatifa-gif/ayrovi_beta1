/**
 * أقسام الموقع — العروض، الستوريهات، الأخبار.
 *
 * هذه الاختبارات تقفل قراءة الـ API: أسماء الأعمدة `snake_case` تُترجم،
 * القيم الناقصة ⇒ قيم محايدة، sans jamais lancer d'exception.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../src/api/client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...(args as [])),
}));

const { fetchNews, fetchPromotions, fetchStories } = await import('../src/api/sections');

const PROMOTION = {
  id: 'promo_1', name: 'Soldes', description: 'Test', image: '/media/p.jpg',
  discount_type: 'PERCENT', value: 20, starts_at: '2026-10-01', ends_at: '2026-11-01',
  promo_code: 'AY20', status: 'ACTIVE',
  arrival_ids: ['arrival_1'], product_ids: ['product_1'],
};

// `mockReset` يضيّع تتبّع الرفض المعلّق في Vitest ⇒ وعد مرفوض يبان «غير مُعالَج»
// ويُسقط الاختبار، ولو كان الكود يلقطو صح. `mockClear` + قيمة افتراضية تحلّها.
beforeEach(() => { apiGet.mockClear(); apiGet.mockResolvedValue({ data: [] }); });

describe('قراءة الأقسام بتحفّظ', () => {
  it('العروض: أسماء الأعمدة `snake_case` تُترجم، والقوائم تُبنى', async () => {
    apiGet.mockResolvedValue({ data: [PROMOTION] });
    const rows = await fetchPromotions({});
    expect(rows[0]).toMatchObject({
      id: 'promo_1', discountType: 'PERCENT', value: 20, promoCode: 'AY20',
      arrivalIds: ['arrival_1'], productIds: ['product_1'],
    });
  });

  it('الستوريهات: `media_type`/`media_url` تُقرأ', async () => {
    apiGet.mockResolvedValue({
      data: [{ id: 'story_1', media_type: 'VIDEO', media_url: '/media/v.mp4', title: 'T' }],
    });
    const rows = await fetchStories({});
    expect(rows[0]).toMatchObject({ id: 'story_1', mediaType: 'VIDEO', mediaUrl: '/media/v.mp4' });
  });

  it('الأخبار: الحقول الناقصة ⇒ قيم محايدة، موش استثناء', async () => {
    apiGet.mockResolvedValue({ data: [{ id: 'news_1' }, null, 7] });
    const rows = await fetchNews({});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'news_1', title: '', summary: '', content: '', image: '' });
  });

  it('سطر بلا معرّف ⇒ يُسقَط (ما نعرضش بطاقة ما تتفتحش)', async () => {
    apiGet.mockResolvedValue({ data: [{ name: 'sans id' }] });
    await expect(fetchPromotions({})).resolves.toEqual([]);
  });

  it('ردّ موش مصفوفة ⇒ قائمة فارغة', async () => {
    apiGet.mockResolvedValue({ data: { erreur: true } });
    await expect(fetchStories({})).resolves.toEqual([]);
    await expect(fetchNews({})).resolves.toEqual([]);
  });
});
