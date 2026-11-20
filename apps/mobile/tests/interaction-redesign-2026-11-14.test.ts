import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';


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

  it('fullscreen rail uses light viewer glyphs without filled backgrounds', () => {
    const tray = code('src/features/reels/ReelShopTray.tsx');
    expect(tray).toContain('<ReelViewerGlyph name={action.glyph} size={V.railGlyph} color={V.paper} />');
    expect(tray).not.toContain('MEDIA_GLYPH_SHADOW');
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
