/**
 * طبقات Lens: درج واحد، الرجوع خطوة خطوة، والقراءة لا تعمل فوق درج.
 */
import { describe, expect, it } from 'vitest';
import {
  LENS_START, applyBack, backAction, changeMode, closeLayer, openLayer, scanAllowed,
  type LensStack,
} from '@/features/lens/lensLayers';

describe('طبقات Lens', () => {
  it('درج واحد في كل مرة: فتح درج يستبدل الذي قبله', () => {
    const s = openLayer(openLayer(LENS_START, 'help'), 'ocerex');
    expect(s.layer).toBe('ocerex');
  });

  it('تغيير الوضع يغلق الدرج', () => {
    const s = changeMode(openLayer(LENS_START, 'results'), 'live');
    expect(s).toEqual({ mode: 'live', layer: null });
  });

  it('إغلاق الدرج يبقي الوضع (الرابط يبقى رابطاً بعد إغلاق النتائج)', () => {
    const s = closeLayer(openLayer(changeMode(LENS_START, 'code'), 'results'));
    expect(s).toEqual({ mode: 'code', layer: null });
  });

  it('سلسلة الرجوع: درج ← وضع الصورة ← ترك الشاشة', () => {
    let s: LensStack = openLayer(changeMode(LENS_START, 'code'), 'results');
    expect(backAction(s)).toBe('close-layer');
    s = applyBack(s);
    expect(s).toEqual({ mode: 'code', layer: null });
    expect(backAction(s)).toBe('photo-mode');
    s = applyBack(s);
    expect(s).toEqual({ mode: 'photo', layer: null });
    expect(backAction(s)).toBe('leave');
    expect(applyBack(s)).toBe(s);
  });

  it('الرجوع من درج في وضع الصورة يعود إلى الكاميرا لا إلى الخروج', () => {
    const s = applyBack(openLayer(LENS_START, 'history'));
    expect(s).toEqual({ mode: 'photo', layer: null });
    expect(backAction(s)).toBe('leave');
  });

  it('القراءة المباشرة لا تعمل إلا في وضع المسح وبلا درج', () => {
    expect(scanAllowed(changeMode(LENS_START, 'live'))).toBe(true);
    expect(scanAllowed(openLayer(changeMode(LENS_START, 'live'), 'results'))).toBe(false);
    expect(scanAllowed(LENS_START)).toBe(false);
    expect(scanAllowed(changeMode(LENS_START, 'code'))).toBe(false);
  });
});
