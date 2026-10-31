import { describe, expect, it } from 'vitest';

import { imageForSelectedColor, preferredVariantImage } from '@/features/aywebs/variantImage';

describe('AYWEBs image follows selected color', () => {
  const groups = [{
    key: 'color',
    kind: 'color',
    values: [
      { value: 'Emerald Leaf', image: 'https://images.example/emerald.jpg' },
      { value: 'Ruby Red', image: 'https://images.example/ruby.jpg' },
      { value: 'Camel' },
    ],
  }];

  it('returns the actual merchant photo for whichever color is selected', () => {
    expect(imageForSelectedColor(groups, { color: 'Emerald Leaf' })).toBe('https://images.example/emerald.jpg');
    expect(imageForSelectedColor(groups, { color: 'Ruby Red' })).toBe('https://images.example/ruby.jpg');
  });

  it('does not invent a color image when none was published', () => {
    expect(imageForSelectedColor(groups, { color: 'Camel' })).toBeNull();
    expect(imageForSelectedColor(groups, {})).toBeNull();
    expect(imageForSelectedColor([{ key: 'size', kind: 'size', values: [{ value: 'M', image: 'https://images.example/m.jpg' }] }], { size: 'M' })).toBeNull();
  });
  it('prefers the exact combination image to a color thumbnail without fabricating URLs', () => {
    expect(preferredVariantImage('https://images.example/full.jpg', groups, { color: 'Ruby Red' })).toBe('https://images.example/full.jpg');
    expect(preferredVariantImage(null, groups, { color: 'Ruby Red' })).toBe('https://images.example/ruby.jpg');
    expect(preferredVariantImage(null, groups, { color: 'Camel' })).toBeNull();
  });

});
