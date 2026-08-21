import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Bell, Eye, Heart, HeartFilled, Home, Menu, MessageCircle, Package, ShoppingBag,
  ShoppingBagPlus, ShieldCheck, Truck, User, X, AYROVI_ICON_SIGNATURE,
} from '../client/src/components/QatafoIcons';
import { AyroviAI, AyroviBack, AyroviMenu, AyroviProfile, AyroviSearch } from '../client/src/components/icons/ayrovi';

const rebuilt: Array<[string, React.ComponentType]> = [
  ['Menu', AyroviMenu],
  ['Retour', AyroviBack],
  ['Search', AyroviSearch],
  ['Profile', AyroviProfile],
  ['AI', AyroviAI],
];

describe('AYROVI icon system', () => {
  it('rebuilds the first five icons as independent 24px 2px SVG components, not Lucide wrappers', () => {
    for (const [name, Icon] of rebuilt) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup, name).toContain('viewBox="0 0 24 24"');
      expect(markup, name).toContain('fill="none"');
      expect(markup, name).toContain('stroke="currentColor"');
      expect(markup, name).toContain('stroke-width="2"');
      expect(markup, name).toContain('stroke-linecap="round"');
      expect(markup, name).toContain('stroke-linejoin="round"');
      expect(markup, name).toContain('ayrovi-icon');
      expect(markup, name).not.toContain('class="lucide');
    }
  });

  it('places the orange signature only where the reference draws it', () => {
    const menu = renderToStaticMarkup(<AyroviMenu />);
    expect(menu.match(new RegExp(AYROVI_ICON_SIGNATURE, 'g'))).toHaveLength(3);
    expect(renderToStaticMarkup(<AyroviBack />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<AyroviSearch />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<AyroviProfile />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<AyroviAI />)).not.toContain(AYROVI_ICON_SIGNATURE);
  });

  it('wires Menu and Profile aliases to the new AYROVI components', () => {
    expect(renderToStaticMarkup(<Menu />)).toBe(renderToStaticMarkup(<AyroviMenu />));
    expect(renderToStaticMarkup(<User />)).toBe(renderToStaticMarkup(<AyroviProfile />));
  });

  it('keeps remaining public symbols on the shared 24px 2px monoline contract', () => {
    for (const Icon of [Home, ShoppingBag, Heart]) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke-width="2"');
      expect(markup).toContain(AYROVI_ICON_SIGNATURE);
    }
  });

  it('marks both original and adapted symbols as real AYROVI components', () => {
    for (const Icon of [Eye, MessageCircle, Package, ShieldCheck, Truck, Bell]) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('class="lucide');
      expect(markup).toContain('ayrovi-icon');
      expect(markup).toContain('data-ayrovi-icon=');
      expect(markup).toContain('stroke-width="2"');
      expect(markup).toContain(AYROVI_ICON_SIGNATURE);
    }
  });

  it('keeps fill reserved for explicit selected states and leaves close without a signature', () => {
    expect(renderToStaticMarkup(<Heart />)).toContain('fill="none"');
    expect(renderToStaticMarkup(<HeartFilled />)).toContain('fill="currentColor"');
    expect(renderToStaticMarkup(<ShoppingBagPlus />)).toContain('stroke-width="2"');
    expect(renderToStaticMarkup(<X />)).not.toContain(AYROVI_ICON_SIGNATURE);
  });

  it('publishes the global 2px stroke token and signature color', () => {
    const tokens = readFileSync('client/src/design/tokens.css', 'utf8');
    const globalCss = readFileSync('client/src/index.css', 'utf8');
    expect(tokens).toContain('--ayrovi-icon-stroke: 2');
    expect(tokens).toContain('--ayrovi-icon-signature: #FF6A00');
    expect(globalCss).toContain('stroke-width: var(--ayrovi-icon-stroke, 2)');
    expect(globalCss).toContain('vector-effect: non-scaling-stroke');
  });
});
