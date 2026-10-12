import { describe, expect, it } from 'vitest';
/**
 * منطق ثبات الجهاز لـ«Scan en direct»: يلتقط مرة واحدة بعد سكون قصير، ويُعاد التسليح بحركة.
 */
import { INITIAL_STILLNESS, STILL_MS, nextStillness, type Sample, type StillnessState } from '../src/features/lens/stillness';

const still: Sample = { x: 0, y: 0, z: 1 };
const moved: Sample = { x: 0.5, y: 0, z: 1 };

function run(samples: Array<[Sample, number]>): { fires: number; state: StillnessState } {
  let state = INITIAL_STILLNESS;
  let fires = 0;
  for (const [sample, at] of samples) {
    const next = nextStillness(state, sample, at);
    state = next.state;
    if (next.fire) fires += 1;
  }
  return { fires, state };
}

describe('nextStillness', () => {
  it('لا يلتقط قبل مرور المدة المطلوبة من السكون', () => {
    const { fires } = run([[still, 0], [still, STILL_MS - 100]]);
    expect(fires).toBe(0);
  });

  it('يلتقط مرة واحدة بعد السكون الكافي', () => {
    const { fires } = run([[still, 0], [still, STILL_MS / 2], [still, STILL_MS + 10], [still, STILL_MS + 200]]);
    expect(fires).toBe(1);
  });

  it('الحركة تعيد العدّ من الصفر', () => {
    const { fires } = run([[still, 0], [moved, 400], [moved, 500], [moved, 600]]);
    expect(fires).toBe(0);
  });

  it('بعد حركة جديدة يُسلَّح الالتقاط من جديد', () => {
    const { fires } = run([
      [still, 0], [still, STILL_MS + 10],     // التقاط أول
      [moved, STILL_MS + 50],                 // حركة تعيد التسليح
      [still, STILL_MS + 100], [still, STILL_MS + 150], // سكون جديد يبدأ بعد الحركة
      [still, STILL_MS * 2 + 200],            // مدة كافية من السكون الجديد
    ]);
    expect(fires).toBe(2);
  });
});
