import { describe, expect, it } from 'vitest';

import {
  backdropOpacity, nextTranslate, panMovesSheet, shouldDismiss,
} from '@/design/sheet/sheetPhysics';

const H = 800;

describe('sheet physics', () => {
  it('لا يتجاوز الفتح الكامل للأعلى ولا الإغلاق للأسفل', () => {
    expect(nextTranslate(0, -50, H)).toBe(0);
    expect(nextTranslate(780, 100, H)).toBe(H);
    expect(nextTranslate(100, 40, H)).toBe(140);
  });

  it('يُغلق بالسحب الطويل أو السريع فقط', () => {
    expect(shouldDismiss(H * 0.1, 0, H)).toBe(false);
    expect(shouldDismiss(H * 0.5, 0, H)).toBe(true);
    expect(shouldDismiss(0, 1200, H)).toBe(true);
    expect(shouldDismiss(0, 300, H)).toBe(false);
    expect(shouldDismiss(H, 0, 0)).toBe(false);
  });

  it('إذا كان المحتوى ممرّراً، التمرير يملك السحب والدرج لا يتحرك', () => {
    expect(panMovesSheet(0, 120)).toBe(false);
    expect(panMovesSheet(0, 0)).toBe(true);
    // الدرج منزاح أصلاً: السحب يعيده للأعلى مهما كان التمرير.
    expect(panMovesSheet(200, 120)).toBe(true);
  });

  it('الظل الخلفي يخفت مع موضع الدرج ويبقى بين 0 و1', () => {
    expect(backdropOpacity(0, H)).toBe(1);
    expect(backdropOpacity(H, H)).toBe(0);
    expect(backdropOpacity(H / 2, H)).toBeCloseTo(0.5);
    expect(backdropOpacity(-10, H)).toBe(1);
    expect(backdropOpacity(H + 10, H)).toBe(0);
  });
});
