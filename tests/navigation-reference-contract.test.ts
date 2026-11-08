import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (file: string) => readFileSync(file, 'utf8');
describe('approved navigation reference scope', () => {
  it('makes only official Publication/Reel brand avatars Verified blue', () => {
    expect(read('apps/mobile/src/features/publications/PublicationPublisher.tsx')).toContain('<BrandSymbol width={H.mark} color={P.verified}');
    expect(read('apps/mobile/src/features/reels/ReelPublisher.tsx')).toContain('<BrandSymbol width={18} color={BRAND_ACCENT}');
    for (const file of ['StoryFeed', 'ReelsViewer', 'FullscreenMediaHeader']) {
      const s = read(`client/src/social/components/${file}.tsx`);
      expect(s).toContain('official ? <img src="/media/logo-ayrovi-symbol-blue.svg?v=6.0"');
    }
  });
  it('uses the same Clean vector contours and approved local colors on web and native', () => {
    const native = read('apps/mobile/src/design/TabNavIcons.tsx');
    const svg = read('client/public/media/clean-message.svg');
    for (const match of svg.matchAll(/<path d="([^"]+)"/g)) expect(native).toContain(`d="${match[1]}"`);
    const colors = JSON.parse(read('assets/brand/navigation-palette.json'));
    expect(svg).toContain(colors.cleanTurquoise); expect(svg).toContain(colors.cleanOrange);
  });
  it('renames visible assistant identity without migrating conversation or API identifiers', () => {
    expect(read('src/assistant/service.ts')).toContain('Tu es Clean,');
    expect(read('apps/mobile/src/i18n/fr.ts')).toContain("'tabs.sonim': 'Clean'");
    expect(read('apps/mobile/app/(tabs)/_layout.tsx')).toContain('name="sonim"');
    expect(read('apps/mobile/app/(tabs)/_layout.tsx')).toMatch(/name="social"[^>]*href:\s*null/);
  });
});
