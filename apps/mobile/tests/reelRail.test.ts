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

  it('quatre actions sur la vidéo — révision du 11/11 (plein écran retiré, réactions fusionnées)', () => {
    for (const key of ['sound', 'share', 'comment']) expect(tray).toContain(`key: '${key}'`);
    expect(tray).toContain('reel-rail-${action.key}-${reelId}');
    expect(tray).toContain('reel-rail-reaction-${reel.id}');
    // « زر تكبير نحيه » : plus de bouton plein écran, plus de pouces/cœur séparés.
    for (const gone of ['fullscreen', 'heart', 'dislike', 'like']) expect(tray).not.toContain(`key: '${gone}'`);
    expect(tray).not.toMatch(/onFullscreen|enterFullscreen/);
    expect(src('src/features/social/ReelCard.tsx')).not.toMatch(/enterFullscreen|onFullscreen/);
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

  it('un seul bouton Z-Reactions, branché sur le vrai état de session et sur le serveur', () => {
    const card = src('src/features/social/ReelCard.tsx');
    expect(card).toContain('useContentReaction({');
    expect(card).toContain('initial: reel.myReaction ?? null');
    expect(card).toMatch(/reactionEnabled: signedIn/);
    expect(card).toMatch(/canLike=\{signedIn\}/);
    expect(card).toMatch(/onLike=\{reaction\.tap\}/);
  });

  it('double-tap sur la vidéo = J’adore + cœurs rouges', () => {
    const card = src('src/features/social/ReelCard.tsx');
    expect(card).toMatch(/onDoubleTap=\{active \? loveFromDoubleTap : undefined\}/);
    expect(card).toContain('<DoubleTapHearts');
    expect(card).toContain('reaction.love()');
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
    for (const glyph of ['share', 'comment']) expect(tray).toContain(`glyph: '${glyph}'`);
    expect(tray).toContain("glyph: rail.muted ? 'muted' : 'sound'");
    expect(tray).not.toMatch(/icon: '(thumbs|chatbubble|share-social|scan|volume|heart)/);
    expect(tray).toContain('<ReelGlyph name={action.glyph}');
    expect(tray).toContain('<ReactionButton');
  });

  it('chaque glyphe a son tracé (pouce = manchette détachée + main)', () => {
    for (const name of ['like', 'dislike', 'comment', 'share', 'heart', 'muted', 'sound', 'fullscreen', 'sort', 'close', 'back', 'reply', 'flag', 'send']) {
      expect(icons).toContain(`case '${name}':`);
    }
    expect(icons).toMatch(/const THUMB_CUFF = /);
    // Le pouce bas est le pouce haut retourné, comme sur la capture.
    expect(icons).toContain("name === 'dislike' ? 'rotate(180 12 12)'");
  });

  it('les trois effets vivent dans le bouton officiel, avec la teinte de chaque réaction', () => {
    const button = src('src/design/reactions/ReactionButton.tsx');
    expect(button).toContain('<LikeSparks');
    expect(button).toMatch(/MINI_HEARTS = \[/);
    expect(button).toContain('colors.reactionLike');
    expect(button).toContain('colors.reactionLove');
    expect(button).toContain('colors.reactionDislike');
    // L'indicateur d'appui d'Android n'est pas un effet de l'app : plus de flash.
    expect(tray).not.toMatch(/railFlash|RAIL_FLASH_MS/);
  });

  it('réaction optimiste : l\'effet part au toucher, retour à l\'état confirmé en cas d\'échec', () => {
    const hook = src('src/design/reactions/useContentReaction.ts');
    expect(hook).toContain('optimisticCount(');
    expect(hook).toContain('setReaction(confirmed.current.reaction)');
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
