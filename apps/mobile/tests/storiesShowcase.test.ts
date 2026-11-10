import { describe, expect, it } from 'vitest';
import { parseStoriesShowcase } from '../src/api/storiesShowcase';
import { readFileSync } from 'node:fs';
const settings = { title: 'Stories', subtitle: 'Weekly', titleAr: 'قصص', ctaLabel: 'Explore', enabled: true, cardCount: 7 };
describe('official showcase settings', () => {
  it('uses backend settings and accepts more than seven cards', () => {
    expect(parseStoriesShowcase(settings)).toMatchObject({ titleAr: 'قصص', cardCount: 7 });
    expect(parseStoriesShowcase({ ...settings, cardCount: 20 })?.cardCount).toBe(20);
    expect(parseStoriesShowcase(null)).toBeNull();
  });
  it('rejects malformed data instead of inventing content', () => {
    for (const value of [{}, [], { ...settings, cardCount: 1.5 }, { ...settings, cardCount: 0 }, { ...settings, cardCount: 1001 }, { ...settings, enabled: 'true' }]) {
      expect(() => parseStoriesShowcase(value)).toThrow();
    }
  });
  it('sits between the home cover and Lens with the same section rules as surrounding content', () => {
    const home = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
    expect(home.indexOf('<HomeCover')).toBeLessThan(home.indexOf('<StoriesSection'));
    expect(home.indexOf('<StoriesSection')).toBeLessThan(home.indexOf('<LensHomeBlock'));
    expect(home).toMatch(/<HomeCover \/>\s*<SectionRule \/>\s*<StoriesSection \/>\s*<SectionRule \/>/);
  });
});
