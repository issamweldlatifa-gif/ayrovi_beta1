import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import appearance from '../shared/cleanAppearance.json';
import { CleanActionGlyph, CleanWordmark, CleanSpeakerIcon } from '../client/src/components/assistant/CleanVisuals';
describe('approved local Clean appearance', () => {
  it('keeps the exact approved bubble/text palette shared with native', () => {
    expect(appearance.bubble).toBe('#C0F9FF'); expect(appearance.text).toBe('#365D63'); expect(appearance.star).toBe('#85BAC2');
    for (const p of ['client/src/components/assistant/CleanVisuals.tsx', 'apps/mobile/src/features/sonim/CleanVisuals.tsx']) expect(readFileSync(p, 'utf8')).toContain('shared/cleanAppearance.json');
  });
  it.each(['wave', 'send', 'busy', 'recording'] as const)('renders a branded speech bubble rather than a circular button in state %s', state => {
    const html = renderToStaticMarkup(<CleanActionGlyph state={state} />);
    expect(html).toContain('data-brand="clean-composer-state"'); expect(html).toContain(appearance.orange);
    expect(html).toContain(appearance.actionShape); expect(html).toContain('aria-hidden="true"');
    if (state === 'recording') expect(html).toContain('<rect');
    if (state === 'busy') expect(html).toContain('<circle');
  });
  it('uses the supplied orange customer and blue assistant artwork, identically on native and web', () => {
    for (const [role, name] of [['user','customer'],['assistant','assistant']] as const) {
      expect(renderToStaticMarkup(<CleanSpeakerIcon role={role} />)).toContain(`/media/clean/${name}-speaker.png`);
      expect(readFileSync(`assets/brand/clean/${name}-speaker.png`).equals(readFileSync(`client/public/media/clean/${name}-speaker.png`))).toBe(true);
    }
  });
  it('keeps the lowercase wordmark with the accent attached to the final n', () => {
    const html = renderToStaticMarkup(<CleanWordmark />);
    expect(html).toContain('clea<span'); expect(html).toContain('>n<span'); expect(html).toContain('clean-star');
  });
  it('shows only three welcome prompts and removes the old menu contents without losing the archived implementation', () => {
    const s = readFileSync('apps/mobile/src/features/sonim/SonimScreen.tsx', 'utf8');
    expect(s).toContain("['lens', 'search', 'price']"); const menu = s.slice(s.indexOf('<Drawer visible='), s.indexOf('</Drawer>'));
    expect(menu).not.toContain('DrawerItem'); expect(menu).not.toContain('quickActions.map');
    expect(readFileSync('docs/archive/clean/SonimScreen-before-refinement.tsx.txt', 'utf8')).toContain('DrawerItem');
  });
});
