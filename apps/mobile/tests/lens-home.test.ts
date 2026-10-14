import { describe, expect, it } from 'vitest';

import { parseLensHome } from '../src/features/home/lensHomeContent';

describe('بلوك Lens في الصفحة الرئيسية — قراءة المحتوى', () => {
  it('يقرأ النص والصورة من الخادم', () => {
    expect(parseLensHome({
      enabled: true, eyebrow: ' Nouveau ', title: 'Lens', description: 'desc', ctaLabel: 'Ouvrir',
      ctaUrl: '/lens', media: { type: 'IMAGE', poster: '/uploads/p.jpg' },
    })).toEqual({
      enabled: true, eyebrow: 'Nouveau', title: 'Lens', description: 'desc', ctaLabel: 'Ouvrir', poster: '/uploads/p.jpg',
    });
  });

  it('حقل غير نصي ⇒ فارغ، ولا تخمين', () => {
    const parsed = parseLensHome({ title: 42, media: { poster: null } });
    expect(parsed).toMatchObject({ title: '', poster: '', enabled: true });
  });

  it('القسم المطفأ يبقى مطفأ، والرد غير الصالح يرجّع null', () => {
    expect(parseLensHome({ enabled: false, title: 'x' })?.enabled).toBe(false);
    expect(parseLensHome(null)).toBeNull();
    expect(parseLensHome('oops')).toBeNull();
  });
});
