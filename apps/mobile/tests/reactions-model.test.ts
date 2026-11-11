/** Z-Reactions (11/11) — logique pure du bouton unique et du double-tap. */
import { describe, expect, it } from 'vitest';
import {
  REACTION_ORDER, createTapClassifier, doubleTapReaction, isPositive, optimisticCount, parseReaction,
  pickReaction, reactionFromServer, reactionGlyph, reactionLabelKey, tapReaction,
} from '../src/design/reactions/reactionModel';

describe('Z-Reactions — modèle', () => {
  it('trois réactions, dans l’ordre du sélecteur', () => {
    expect(REACTION_ORDER).toEqual(['like', 'love', 'dislike']);
    expect(parseReaction('love')).toBe('love');
    expect(parseReaction('wow')).toBeNull();
  });
  it('toucher : J’aime, ou retire la réaction posée (quelle qu’elle soit)', () => {
    expect(tapReaction(null)).toBe('like');
    for (const current of REACTION_ORDER) expect(tapReaction(current)).toBeNull();
  });
  it('sélecteur : choisir change, re-choisir retire', () => {
    expect(pickReaction(null, 'love')).toBe('love');
    expect(pickReaction('like', 'dislike')).toBe('dislike');
    expect(pickReaction('love', 'love')).toBeNull();
  });
  it('double-tap : toujours J’adore (jamais de retrait)', () => {
    expect(doubleTapReaction()).toBe('love');
  });
  it('compteur affiché = positifs (J’aime + J’adore), jamais négatif', () => {
    expect(isPositive('dislike')).toBe(false);
    expect(optimisticCount(10, null, 'love')).toBe(11);
    expect(optimisticCount(10, 'like', 'love')).toBe(10);
    expect(optimisticCount(10, 'love', 'dislike')).toBe(9);
    expect(optimisticCount(0, 'like', null)).toBe(0);
    expect(optimisticCount(Number.NaN, null, 'like')).toBe(1);
  });
  it('lit la réponse serveur, y compris les booléens historiques', () => {
    expect(reactionFromServer({ reaction: 'love' })).toBe('love');
    expect(reactionFromServer({ loved: true })).toBe('love');
    expect(reactionFromServer({ disliked: true })).toBe('dislike');
    expect(reactionFromServer({ liked: true })).toBe('like');
    expect(reactionFromServer({ reaction: null, liked: false })).toBeNull();
  });
  it('glyphe et libellé de chaque réaction', () => {
    expect(reactionGlyph(null)).toBe('like');
    expect(reactionGlyph('love')).toBe('heart');
    expect(reactionGlyph('dislike')).toBe('dislike');
    expect(reactionLabelKey('love')).toBe('social.love');
  });
  it('double-tap : deux touchers dans la fenêtre, pas trois', () => {
    const classify = createTapClassifier(260);
    expect(classify(0)).toBe('single');
    expect(classify(200)).toBe('double');
    expect(classify(300)).toBe('single');
    expect(classify(700)).toBe('single');
    expect(classify(900)).toBe('double');
  });
});
