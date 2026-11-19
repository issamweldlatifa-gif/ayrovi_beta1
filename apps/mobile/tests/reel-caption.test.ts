import { describe, expect, it } from 'vitest';
import { reelCaption } from '@/features/reels/reelCaption';

describe('copy for the published owner Reels', () => {
  it.each([
    ['shoes', 'أحذية', 'Chaussures'],
    ['clothing', 'ملابس', 'Vêtements'],
    ['home', 'أدوات منزلية', 'Maison'],
    ['perfume', 'عطور', 'Parfums'],
    ['accessories', 'إكسسوارات', 'Accessoires'],
  ])('localizes the %s seed without changing the Reel identity', (name, title, french) => {
    const reel = { id: `reel_owner_${name}_v1`, title, description: '' };
    expect(reelCaption(reel, 'fr')).toMatchObject({ title: french, description: expect.any(String) });
    expect(reelCaption(reel, 'fr').description).not.toBe('');
    expect(reelCaption(reel, 'ar').title).toBe(title);
  });

  it('keeps revised editorial text and never makes up a translation of an unknown Reel', () => {
    const edited = { id: 'reel_owner_shoes_v1', title: 'Nouveau titre', description: 'Texte édité' };
    expect(reelCaption(edited, 'fr')).toEqual({ title: edited.title, description: edited.description });
    const other = { id: 'other', title: 'أحذية', description: 'وصف آخر' };
    expect(reelCaption(other, 'fr')).toEqual({ title: other.title, description: other.description });
    expect(reelCaption(other, 'ar')).toEqual({ title: other.title, description: other.description });
  });
});
