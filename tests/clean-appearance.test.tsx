import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import appearance from '../shared/cleanAppearance.json';
import { CleanActionGlyph, CleanWordmark } from '../client/src/components/assistant/CleanVisuals';
describe('approved local Clean appearance', () => {
  it('keeps the exact approved bubble/text palette shared with native', () => {
    expect(appearance.bubble).toBe('#C0F9FF'); expect(appearance.text).toBe('#85BAC2');
    for (const p of ['client/src/components/assistant/CleanVisuals.tsx', 'apps/mobile/src/features/sonim/CleanVisuals.tsx']) expect(readFileSync(p, 'utf8')).toContain('shared/cleanAppearance.json');
  });
  it.each(['wave', 'send', 'busy', 'recording'] as const)('renders a branded speech bubble rather than a circular button in state %s', state => {
    const html = renderToStaticMarkup(<CleanActionGlyph state={state} />);
    expect(html).toContain('data-brand="clean-composer-state"'); expect(html).toContain(appearance.orange);
    expect(html).toContain('M3 22V11A9 9 0 1 1 7.2 18.6Z'); expect(html).toContain('aria-hidden="true"');
    if (state === 'recording') expect(html).toContain('<rect');
    if (state === 'busy') expect(html).toContain('<circle');
  });
  it('keeps the lowercase wordmark with the accent attached to the final n', () => {
    const html = renderToStaticMarkup(<CleanWordmark />);
    expect(html).toContain('clea<span'); expect(html).toContain('>n<span'); expect(html).toContain('clean-star');
  });
  it('shows only three welcome prompts but preserves every native drawer capability', () => {
    const s = readFileSync('apps/mobile/src/features/sonim/SonimScreen.tsx', 'utf8');
    expect(s).toContain("['lens', 'search', 'price']"); expect(s).toContain('{quickActions.map((action)');
  });
});
