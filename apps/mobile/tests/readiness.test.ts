/**
 * جاهزية الخادم (`/api/ready`) — «أي كود قاعد يخدم فعلاً».
 *
 * هذا الرقم هو اللي يفرّق بين «تحدّث التطبيق» و«تحدّث الخادم». لهذا القراءة
 * صارمة: بلا `status` ما نرجعوش حاجة (`null`) — شاشة «حول» ما تعرضش إصداراً
 * مخترعاً، و`local` تبقى `local` باش تتقال الحقيقة «موش منشور من Git».
 */
import { describe, expect, it } from 'vitest';
import { parseServerReadiness } from '../src/api/public';

describe('قراءة /api/ready', () => {
  it('يقرا الحقول كما هي، ومنها الفرع المنشور', () => {
    expect(parseServerReadiness({
      status: 'ready', database: 'ok', version: '3.10.4', commit: '4ae6c0d24e70',
      branch: 'arena/c0321e79-ayrovi-beta1',
    })).toEqual({
      status: 'ready', database: 'ok', version: '3.10.4', commit: '4ae6c0d24e70',
      branch: 'arena/c0321e79-ayrovi-beta1',
    });
  });

  it('خادم قديم بلا حقل `branch` ⇒ فراغ (الواجهة تقول «ما نعرفش»)', () => {
    expect(parseServerReadiness({ status: 'ready', commit: '4ee2a8af31e1' })?.branch).toBe('');
  });

  it('`local` تبقى `local` (موش تتحوّل ولا تتخبّى)', () => {
    expect(parseServerReadiness({ status: 'ready', commit: 'local' })?.commit).toBe('local');
  });

  it('بلا `status` = ردّ ما ينفعش (ولا نصّ فارغ ينفع)', () => {
    expect(parseServerReadiness({ database: 'ok', version: '3.10.4' })).toBeNull();
    expect(parseServerReadiness({ status: '   ' })).toBeNull();
    expect(parseServerReadiness(null)).toBeNull();
    expect(parseServerReadiness('ready')).toBeNull();
  });

  it('الحقول الناقصة تولّي فراغاً، موش `undefined`', () => {
    const parsed = parseServerReadiness({ status: 'not_ready' });
    expect(parsed).toEqual({ status: 'not_ready', database: '', version: '', commit: '', branch: '' });
  });
});
