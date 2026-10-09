/**
 * الفوتر — حيث الأمان أهمّ من الجمالية (08/10/2026).
 *
 * لماذا اختبار مستقل: الفوتر يعرض **روابط تُنشر للعميل**. رابط `javascript:`
 * أو `https://user:pass@…` في فوتر تطبيق تسوّق هو باب تضليل، موش تفصيلة.
 * والقاعدة منقولة من الموقع بالحرف: **قناة غير صالحة ⇒ تبقى خاملة** — عرض
 * حساب مزيّف أسوأ من عرض والو.
 *
 * وقاعدة التطبيق: **الفوتر ما يطيّحش الشاشة** — عنصر زينة، ونقصو ما يمنعش
 * العميل من تصفّح المتجر.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetData = vi.fn();
vi.mock('../src/api/client', () => ({
  apiGetData: (...args: unknown[]) => apiGetData(...(args as [])),
}));

const { fetchFooterInfo, safeChannelUrl } = await import('../src/api/footer');

// `mockReset` يضيّع تتبّع الرفض المعلّق في Vitest ⇒ وعد مرفوض يبان «غير مُعالَج»
// ويُسقط الاختبار، ولو كان الكود يلقطو صح. `mockClear` + قيمة افتراضية تحلّها.
beforeEach(() => { apiGetData.mockClear(); apiGetData.mockResolvedValue(null); });

describe('safeChannelUrl — ما يُنشر للعميل', () => {
  it('`https://` صالح ⇒ يُنشر', () => {
    expect(safeChannelUrl('https://facebook.com/ayrovi')).toBe('https://facebook.com/ayrovi');
  });

  it('`javascript:` ⇒ مرفوض (ما ينفّذش سكريبت)', () => {
    expect(safeChannelUrl('javascript:alert(1)')).toBeNull();
  });

  it('`data:` والبروتوكولات المخصّصة ⇒ مرفوضة', () => {
    expect(safeChannelUrl('data:text/html,<script>')).toBeNull();
    expect(safeChannelUrl('ayrovi://account')).toBeNull();
    expect(safeChannelUrl('mailto:hi@ayrovi.tn')).toBeNull();
  });

  it('بيانات اعتماد داخل الرابط ⇒ مرفوض (وسيلة تضليل معروفة)', () => {
    expect(safeChannelUrl('https://user:pass@facebook.com/ayrovi')).toBeNull();
  });

  it('رابط ناقص أو موش نص ⇒ مرفوض، موش استثناء', () => {
    expect(safeChannelUrl('')).toBeNull();
    expect(safeChannelUrl('facebook.com/ayrovi')).toBeNull();
    expect(safeChannelUrl(null)).toBeNull();
    expect(safeChannelUrl(42)).toBeNull();
    expect(safeChannelUrl(['https://a.tn'])).toBeNull();
  });
});

describe('قراءة الفوتر — تتدهور وما تطيّحش', () => {
  it('القنوات الصالحة فقط تُعرض، والتالفة تُسقَط', async () => {
    apiGetData.mockResolvedValue({
      footerAbout: '  متجر تونسي  ',
      channels: { facebook: 'https://fb.com/ayrovi', tiktok: 'javascript:alert(1)', whatsapp: '' },
      paymentMethods: ['cod', 'card'],
    });
    const info = await fetchFooterInfo({});
    expect(info.channels.map((channel) => channel.id)).toEqual(['facebook']);
    expect(info.about).toBe('متجر تونسي');
    expect(info.paymentMethods).toEqual(['COD', 'CARD']);
  });

  it('`channels` موش كائن ⇒ صفر قناة، موش استثناء', async () => {
    apiGetData.mockResolvedValue({ channels: 'pas un objet' });
    await expect(fetchFooterInfo({})).resolves.toMatchObject({ channels: [] });
  });

  it('الردّ فارغ ⇒ فوتر فارغ (موّش استثناء)', async () => {
    apiGetData.mockResolvedValue(null);
    const info = await fetchFooterInfo({});
    expect(info).toEqual({ about: '', channels: [], paymentMethods: [] });
  });

  it('الخادم ساقط ⇒ **ما يطيّحش الشاشة**: فوتر فارغ', async () => {
    apiGetData.mockImplementation(() => Promise.reject(new Error('réseau')));
    // `resolves` موش `await`: المراقِب يربط الوعد بنفسو، فما يبانش «رفض غير
    // مُعالَج» من وعد أنشأناه نحنا في الاختبار.
    await expect(fetchFooterInfo({})).resolves.toEqual({ about: '', channels: [], paymentMethods: [] });
  });

  it('وسائل الخلاص هي قائمة الخزينة: الفوتر ما يوعدش بوسيلة تترفض', async () => {
    apiGetData.mockResolvedValue({ paymentMethods: ['COD'] });
    const info = await fetchFooterInfo({});
    // لو الخزينة تقبل غير الدفع عند الاستلام، الفوتر يقول غيرو — ما يزيدش بطاقة.
    expect(info.paymentMethods).toEqual(['COD']);
  });
});
