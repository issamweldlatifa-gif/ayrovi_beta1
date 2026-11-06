import { describe, expect, it } from 'vitest';
import { startsPublicationDismiss as start, finishesPublicationDismiss as finish } from '../src/features/publications/publicationGestures';
describe('publication vertical dismissal', () => {
  it('does not steal horizontal carousel swipes or a scrolled description', () => {
    expect(start(80, 20, true)).toBe(false); expect(start(2, 40, false)).toBe(false);
    expect(start(2, 40, true)).toBe(true); expect(start(0, -40, true)).toBe(false);
  });
  it('requires a deliberate distance or downward flick, and cancels accidental drags', () => {
    expect(finish(20, 1)).toBe(false); expect(finish(70, .2)).toBe(false);
    expect(finish(100, 0)).toBe(true); expect(finish(45, 1)).toBe(true);
  });
});
