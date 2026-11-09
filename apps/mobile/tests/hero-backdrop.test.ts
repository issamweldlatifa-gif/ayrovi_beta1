import { describe, expect, it } from 'vitest';
import { heroBackdropColors, mixHex } from '../src/features/home/heroPalette';
import palette from '../assets/hero/palette.json';

describe('surrounding Hero tint stays separate from the photo/card background', () => {
  it.each(Object.entries(palette))('%s has a lighter exterior, leaving original metadata unchanged', (_, edge) => {
    const before = { ...edge };
    const actual = heroBackdropColors({ edgeTop: edge.top, edgeBottom: edge.bottom }, '#FFFFFF');
    expect(actual.top).toBe(mixHex(edge.top, '#FFFFFF', .65));
    expect(actual.bottom).toBe(mixHex(edge.bottom, '#FFFFFF', .65));
    expect(actual.top.toLowerCase()).not.toBe(edge.top.toLowerCase());
    expect(edge).toEqual(before);
  });
});
