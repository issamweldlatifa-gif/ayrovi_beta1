/**
 * Rail d'actions du Reel plein écran — contrat de présence (24/10/2026).
 *
 * Le bug signalé sur l'appareil : un Reel **sans article** n'affichait aucun
 * bouton ni icône — ni cœur, ni commentaire, ni partage, ni son. La cause était
 * une seule condition : `overlay && rail && products.length > 0`. La pastille
 * (« Voir les articles ») doit rester conditionnée aux articles ; le rail, non.
 *
 * Ces tests lisent la source des deux composants (même méthode que
 * `design-system.test.ts`) : un rendu React Native complet n'est pas nécessaire
 * pour garantir qu'on ne réintroduit pas la condition.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatRailCount } from '../src/features/reels/reelTray';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('rail du Reel — toujours visible en plein écran', () => {
  const tray = src('src/features/reels/ReelShopTray.tsx');

  it('le rail n’est PAS conditionné par la présence d’articles', () => {
    expect(tray).not.toMatch(/railView\s*=\s*overlay\s*&&\s*rail\s*&&\s*products\.length/);
    expect(tray).toMatch(/const railView = overlay && rail \?/);
  });

  it('la pastille, elle, reste conditionnée : pas de porte qui n’ouvre rien', () => {
    expect(tray).toMatch(/const pill = products\.length > 0 \?/);
  });

  it('sept actions restent sur la vidéo — référence 10/11', () => {
    for (const key of ['fullscreen', 'sound', 'heart', 'share', 'comment', 'dislike', 'like']) {
      expect(tray).toContain(`key: '${key}'`);
      expect(tray).toContain('reel-rail-${action.key}-${reelId}');
    }
  });

  it('le compteur compact de la référence (« 1.8K », « 9 »)', () => {
    expect(formatRailCount(0)).toBe('0');
    expect(formatRailCount(9)).toBe('9');
    expect(formatRailCount(950)).toBe('950');
    expect(formatRailCount(1000)).toBe('1K');
    expect(formatRailCount(1800)).toBe('1.8K');
    expect(formatRailCount(12345)).toBe('12.3K');
  });

  it('les interactions supplémentaires restent réellement disponibles dans les options', () => {
    const menu = src('src/features/reels/ReelOptions.tsx');
    expect(menu).toContain('onLike');
    expect(menu).toContain('onComment');
    expect(menu).toContain('PublicationAuthSheet');
    expect(menu).toContain('hideReelOnDevice');
  });

  it('le ⋮ n’est plus dans le rail (la référence ne l’affiche pas) mais reste branché', () => {
    expect(tray).not.toMatch(/key: 'options'/);
    const card = src('src/features/social/ReelCard.tsx');
    expect(card).toMatch(/onOptions: \(\) => setOptions\(true\)/);
  });

  it('le pouce bas vaut pour les Reels (référence 10/11) et nécessite un compte', () => {
    const card = src('src/features/social/ReelCard.tsx');
    expect(card).toMatch(/type: "reaction",/);
    expect(card).toMatch(/onDislike: signedIn \? toggleDislike : undefined/);
  });

  it('l’écran plein écran branche le cœur sur le vrai état de session', () => {
    const card = src('src/features/social/ReelCard.tsx');
    expect(card).toMatch(/canLike=\{signedIn\}/);
    expect(card).toMatch(/onLike=\{toggleLike\}/);
    expect(card).toMatch(/liked=\{liked\}/);
  });

  it('la légende réserve la colonne du rail (pas de texte sous les icônes)', () => {
    const card = src('src/features/social/ReelCard.tsx');
    expect(card).toMatch(/paddingEnd: 64/);
  });
});

describe('glyphes et effets de la référence du 11/11', () => {
  const tray = src('src/features/reels/ReelShopTray.tsx');
  const icons = src('src/features/reels/ReelIcons.tsx');
  const sheet = src('src/features/social/ReelCommentsModal.tsx');

  it('le rail dessine les glyphes de la référence, plus aucun Ionicons dans le rail', () => {
    for (const glyph of ['fullscreen', 'heart', 'share', 'comment', 'dislike', 'like']) {
      expect(tray).toContain(`glyph: '${glyph}'`);
    }
    expect(tray).toContain("glyph: rail.muted ? 'muted' : 'sound'");
    expect(tray).not.toMatch(/icon: '(thumbs|chatbubble|share-social|scan|volume|heart)/);
    expect(tray).toContain('<ReelGlyph name={action.glyph}');
  });

  it('chaque glyphe a son tracé (pouce = manchette détachée + main)', () => {
    for (const name of ['like', 'dislike', 'comment', 'share', 'heart', 'muted', 'sound', 'fullscreen', 'sort', 'close', 'back', 'reply', 'flag', 'send']) {
      expect(icons).toContain(`case '${name}':`);
    }
    expect(icons).toMatch(/const THUMB_CUFF = /);
    // Le pouce bas est le pouce haut retourné, comme sur la capture.
    expect(icons).toContain("name === 'dislike' ? 'rotate(180 12 12)'");
  });

  it('les trois effets sont branchés sur la bonne action et la bonne teinte', () => {
    expect(tray).toMatch(/activeColor: theme\.colors\.reelLike,\s*effect: 'like'/);
    expect(tray).toMatch(/activeColor: theme\.colors\.commentDislike,\s*effect: 'dislike'/);
    expect(tray).toMatch(/activeColor: theme\.colors\.reelAccent,\s*effect: 'heart'/);
    expect(tray).toContain('<LikeSparks');
    expect(tray).toMatch(/MINI_HEARTS = \[/);
    // L'indicateur d'appui d'Android n'est pas un effet de l'app : plus de flash.
    expect(tray).not.toMatch(/railFlash|RAIL_FLASH_MS/);
  });

  it('pouce haut / bas optimistes : l\'effet part au toucher, rollback en cas d\'échec', () => {
    const card = src('src/features/social/ReelCard.tsx');
    expect(card).toContain('setLiked(!liked);');
    expect(card).toContain('setDisliked(!disliked);');
    expect(card.match(/setLiked\(before\.liked\)/g)?.length).toBe(2);
  });

  it('la feuille utilise les mêmes glyphes (tri, fermer, répondre, signaler, vérifié)', () => {
    expect(sheet).not.toContain('Ionicons');
    for (const name of ['sort', 'close', 'reply', 'flag', 'like', 'dislike', 'back', 'send']) {
      expect(sheet).toContain(`name="${name}"`);
    }
    expect(sheet).toContain('<VerifiedBadge');
    expect(sheet).toContain('styles.reactionDivider');
  });
});
