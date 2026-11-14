import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { translate } from '../src/i18n/keys';

/**
 * Refonte des interactions (14/11/2026, approuvée) — phases 3 et 4.
 *  • Phase 3 : famille de glyphes v1 (pouce, cœur, message, partage) PLEINE
 *    aux angles adoucis ; sur vidéo (Reel, Story) icônes blanches nues avec
 *    ombre douce (option A) ; contour gris sur carte au repos.
 *  • Phase 4 : barre Publication façon Facebook + feuille de commentaires
 *    claire, SANS autocollants, GIF, rangée d'émojis ni appareil photo.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('phase 3 — glyphes v1 et option A sur vidéo', () => {
  const icons = read('src/features/reels/ReelIcons.tsx');

  it('les formes pleines sont adoucies (trait rond de même couleur) et la bulle porte trois points', () => {
    expect(icons).toMatch(/export const REEL_GLYPH_SOFT = 1\.4;/);
    expect(icons).toMatch(/BUBBLE_DOTS[^=]*= \[\[8\.2, 10\.4\], \[12, 10\.4\], \[15\.8, 10\.4\]\]/);
    // Bulle pleine percée en evenodd, trous agrandis du demi-trait.
    expect(icons).toContain('fillRule="evenodd"');
    expect(icons).toContain('BUBBLE_DOT_R + REEL_GLYPH_SOFT / 2');
    // Échelles optiques du concept v1.
    expect(icons).toMatch(/heart: 0\.96, share: 1\.05, comment: 0\.94/);
  });

  it('l’ombre douce vient d’un jeton (jamais une teinte en dur dans le glyphe)', () => {
    expect(icons).toMatch(/shadow\?: string;/);
    expect(read('src/design/tokens.mobile.ts')).toMatch(/export const MEDIA_GLYPH_SHADOW = veil\(0\.32\);/);
  });

  it('rail Reels : icônes BLANCHES pleines, nues, avec ombre — pas de pastille', () => {
    const tray = code('src/features/reels/ReelShopTray.tsx');
    expect(tray).toMatch(/<ReelGlyph name=\{action\.glyph\} size=\{theme\.iconSize\.md\} color=\{onMedia\} filled shadow=\{MEDIA_GLYPH_SHADOW\} \/>/);
  });

  it('le bouton de réaction est plein + ombré sur média, au trait au repos sur carte', () => {
    const button = code('src/design/reactions/ReactionButton.tsx');
    expect(button).toMatch(/filled=\{media \|\| reaction !== null\}/);
    expect(button).toMatch(/shadow=\{media \? MEDIA_GLYPH_SHADOW : undefined\}/);
    expect(button).toMatch(/media=\{surface === 'media'\}/);
  });

  it('la carte Reel utilise la même famille (plus d’Ionicons pour commenter / partager)', () => {
    const card = code('src/features/social/ReelCard.tsx');
    expect(card).not.toMatch(/chatbubble-outline|share-social-outline/);
    expect(card).toMatch(/<ReelGlyph name="comment"/);
    expect(card).toMatch(/<ReelGlyph name="share"/);
  });
});

describe('phase 4 — barre Publication et feuille de commentaires', () => {
  const engagement = code('src/features/publications/PublicationEngagement.tsx');
  const screen = code('src/features/publications/PublicationTemplatesScreen.tsx');

  it('la barre vit sous chaque bloc NON sponsorisé, branchée sur l’engagement serveur', () => {
    expect(screen).toMatch(/!item\.sponsored \? \(\s*<PublicationBar/);
    expect(screen).toContain('fetchSocialEngagement(socialIds');
    expect(screen).toMatch(/rows\.filter\(\(row\) => !row\.sponsored\)/);
  });

  it('trois tiers égaux de 44 dp, rangée miroir en arabe', () => {
    expect(engagement).toMatch(/export const PUBLICATION_BAR_HEIGHT = 44;/);
    expect(engagement).toMatch(/third: \{ flex: 1, minHeight: PUBLICATION_BAR_HEIGHT/);
    expect(engagement).toContain('rowDirectionFor(theme.isRTL)');
    for (const id of ['publication-like-', 'publication-comment-', 'publication-share-']) expect(engagement).toContain(id);
  });

  it('J’aime : bouton officiel Z-Reactions, libellé teinté (bleu une fois posé)', () => {
    expect(engagement).toMatch(/<ReactionButton[\s\S]*?count=\{t\('social\.like'\)\}[\s\S]*?tintLabel/);
    expect(code('src/design/reactions/ReactionButton.tsx')).toMatch(/color=\{tintLabel \? reactionColor\(reaction, theme\.colors, ink\) : ink\}/);
  });

  it('feuille : AUCUN autocollant, GIF, émoji ni appareil photo', () => {
    expect(engagement).not.toMatch(/sticker|autocollant|\bgif\b|emoji|camera|appareil photo|ImagePicker/i);
  });

  it('feuille : en-tête réactions + pouce, tri, état vide, champ, envoi BLEU', () => {
    for (const id of ['publication-comments-reactions', 'publication-comments-first', 'publication-comments-like', 'publication-comments-sort', 'publication-comments-empty', 'publication-comment-input', 'publication-comment-send']) {
      expect(engagement).toContain(id);
    }
    expect(engagement).toMatch(/color=\{canSend \? theme\.colors\.action : P\.muted\}/);
  });

  it('les libellés de la référence existent en français et en arabe', () => {
    expect(translate('fr', 'publication.comments.firstLike')).toBe('Soyez la première personne à aimer ça');
    expect(translate('fr', 'publication.comments.relevant')).toBe('Plus pertinents');
    expect(translate('fr', 'publication.comments.emptyTitle')).toBe('Aucun commentaire pour l’instant');
    expect(translate('fr', 'publication.comments.emptyBody')).toBe('Soyez le premier à commenter.');
    expect(translate('fr', 'publication.comments.placeholder')).toBe('Rédigez un commentaire…');
    expect(translate('fr', 'publication.bar.comments', { value: 3 })).toBe('3 commentaires');
    for (const key of ['publication.comments.firstLike', 'publication.comments.placeholder', 'publication.bar.shares'] as const) {
      expect(translate('ar', key)).not.toBe(translate('fr', key));
    }
  });

  it('le partage ne fabrique jamais de lien mort', () => {
    expect(engagement).not.toContain('publications?block=');
  });
});
