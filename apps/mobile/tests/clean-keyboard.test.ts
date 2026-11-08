import { describe, expect, it } from 'vitest';
import { cleanKeyboardOverlap } from '../src/features/sonim/cleanKeyboard';
describe('Clean composer keyboard clearance', () => {
  it('lifts only the occluded portion on a non-resizing Android window', () => expect(cleanKeyboardOverlap(0, 844, 524)).toBe(320));
  it('does not lift twice when adjustResize already resized the root', () => expect(cleanKeyboardOverlap(0, 524, 524)).toBe(0));
  it('accounts for root offset and restores full canvas when hidden', () => {
    expect(cleanKeyboardOverlap(24, 820, 524)).toBe(320);
    expect(cleanKeyboardOverlap(0, 844, null)).toBe(0);
    expect(cleanKeyboardOverlap(0, 400, 524)).toBe(0);
  });
});
