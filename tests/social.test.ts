import { describe, expect, test } from 'vitest';
import { baseCount, mapDbStories, publisherFor, timeAgo, OFFICIAL } from '../client/src/social/storyService';

describe('Story Tab service', () => {
  test('publisherFor : officiel d\'abord, channels par catégorie', () => {
    expect(publisherFor('ARRIVAGE')).toBe(OFFICIAL);
    expect(publisherFor('STYLE').id).toBe('pub_style');
    expect(publisherFor('INCONNU').name).toBe('Inconnu');
    expect(publisherFor('INCONNU').id).toBe('pub_inconnu');
  });

  test('mapDbStories : mapping backend → Story (seen false, cta dérivé)', () => {
    const stories = mapDbStories([
      { id: 's1', media_url: '/media/hero-femme.jpg', media_type: 'IMAGE', category: 'ARRIVAGE', title: 'Arrivage #08', description: 'Sélection ouverte', cta: 'Découvrir', arrival_id: 'arrival_08', publish_at: '2026-08-14T10:00:00.000Z' },
      { id: 's2', media_url: '', category: 'STYLE' },
    ]);
    expect(stories).toHaveLength(1);
    expect(stories[0].media.type).toBe('image');
    expect(stories[0].publisher.official).toBe(true);
    expect(stories[0].cta?.action).toBe('arrivages');
    expect(stories[0].seen).toBe(false);
  });

  test('baseCount déterministe (pas de random visible)', () => {
    expect(baseCount('post_1', 7)).toBe(baseCount('post_1', 7));
    expect(baseCount('post_1', 7)).toBeGreaterThanOrEqual(24);
  });

  test('timeAgo : minutes / heures / jours', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 5 * 60000).toISOString())).toBe('5 min');
    expect(timeAgo(new Date(now - 3 * 3600000).toISOString())).toBe('3 h');
    expect(timeAgo(new Date(now - 2 * 86400000).toISOString())).toBe('2 j');
  });
});
