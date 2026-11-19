import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatRailCount } from '../src/features/reels/reelTray';
import { REEL_VIEWER as V, reelViewerAnchors, reelViewerCardSize } from '../src/features/reels/reelViewerStyle';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const tray = src('src/features/reels/ReelShopTray.tsx');
const card = src('src/features/social/ReelCard.tsx');
const menu = src('src/features/reels/ReelOptions.tsx');

describe('fullscreen Reel reference geometry', () => {
  it('at 360 dp: 332×151 card, 4 dp of next card, 48 dp two-tone CTA and 52 dp action pitch', () => {
    const size = reelViewerCardSize(360);
    expect(size).toEqual({ width: 332, height: 151, thumb: 100 });
    expect(360 - V.inset - size.width - V.cardGap).toBe(4);
    expect(V).toMatchObject({ pillHeight: 48, railStep: 52, railTarget: 44, backDisc: 40, headerTarget: 44 });
    expect(tray).toContain('backgroundColor: expanded ? V.ink : V.paper');
    expect(tray).toContain('const pillInk = expanded ? V.paper : V.ink');
  });

  it.each([320, 360, 390])('caption, pill and rail share the same lift at %i dp, including safe area', width => {
    const { height } = reelViewerCardSize(width);
    const closed = reelViewerAnchors(height, 22, true, false);
    const open = reelViewerAnchors(height, 22, true, true);
    const delta = open.pillBottom - closed.pillBottom;
    expect(delta).toBe(height);
    expect(open.captionBottom - closed.captionBottom).toBe(delta);
    expect(open.railBottom - closed.railBottom).toBe(delta);
    expect(reelViewerAnchors(height, 22, false, true).railBottom).toBe(closed.railBottom);
    expect(reelViewerAnchors(height, 22, true, true, 2).pillHeight).toBeGreaterThan(V.pillHeight);
    expect(reelViewerCardSize(width, 2).height).toBeGreaterThan(height);
  });

  it('has a real rail without products; shop toggle exists only for linked items', () => {
    expect(tray).toMatch(/actions:.*= rail \? \[/);
    expect(tray).toContain("{hasProducts ? <Pressable testID={`reel-tray-toggle-${reel.id}`} ");
    expect(tray).toContain('!overlay && reelTrayDefaultOpen(reel)');
    expect(tray).not.toContain('key: \'comment\'');
    for (const key of ['options', 'share', 'sound']) expect(tray).toContain(`key: '${key}'`);
  });

  it('keeps real reactions, comments and double-tap in their new places', () => {
    expect(card).toContain('useContentReaction({');
    expect(card).toContain('initial: reel.myReaction ?? null');
    expect(card).toContain('onReactionPick={reaction.pick}');
    expect(card).toContain('onDoubleTap={active ? loveFromDoubleTap : undefined}');
    expect(card).toContain('<DoubleTapHearts');
    expect(menu).toContain('reel-menu-reaction');
    expect(menu).toContain('onComment();');
    expect(menu).toContain('PublicationAuthSheet');
    expect(menu).toContain('hideReelOnDevice');
    expect(card).toContain('paddingRight: V.railReserve');
    expect(card).toContain('paddingLeft: V.railReserve');
    expect([0, 950, 1800, 12345].map(formatRailCount)).toEqual(['0', '950', '1.8K', '12.3K']);
  });

  it('keeps paired glyphs inside the viewer and original Reels glyphs in the comments', () => {
    expect(tray).toContain('<ReelViewerGlyph name={action.glyph}');
    expect(tray).not.toContain('enterFullscreen');
    const sheet = src('src/features/social/ReelCommentsModal.tsx');
    expect(sheet).not.toContain('Ionicons');
    for (const name of ['sort', 'close', 'reply', 'flag', 'like', 'dislike', 'back', 'send']) expect(sheet).toContain(`name="${name}"`);
    expect(sheet).toContain('<VerifiedBadge');
  });
});
