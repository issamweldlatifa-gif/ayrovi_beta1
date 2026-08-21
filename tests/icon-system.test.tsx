import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Bell, Eye, Heart, HeartFilled, Home, Menu, MessageCircle, Package, Plus, ShoppingBag,
  ShoppingBagPlus, ShieldCheck, Sparkles, Truck, User, X, AYROVI_ICON_SIGNATURE,
} from '../client/src/components/QatafoIcons';
import { AyroviAI, AyroviBack, AyroviMenu, AyroviProfile, AyroviSearch } from '../client/src/components/icons/ayrovi';

const family = [AyroviMenu, AyroviBack, AyroviSearch, AyroviAI, Home, ShoppingBag, Heart, Eye, Package, X, Plus];

describe('AYROVI icon system', () => {
  it('renders the family as independent 24px 2px SVG, never Lucide', () => {
    for (const Icon of family) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke-width="2"');
      expect(markup).toContain('stroke-linecap="round"');
      expect(markup).toContain('stroke-linejoin="round"');
      expect(markup).toContain('ayrovi-icon');
      expect(markup).not.toContain('class="lucide');
    }
  });

  it('places the orange signature only where the reference draws it', () => {
    expect(renderToStaticMarkup(<AyroviMenu />).match(new RegExp(AYROVI_ICON_SIGNATURE, 'g'))).toHaveLength(3);
    expect(renderToStaticMarkup(<AyroviBack />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<AyroviSearch />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<AyroviProfile />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<AyroviProfile />)).toContain('stroke-width="1.147"');
    expect(renderToStaticMarkup(<AyroviAI />)).not.toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<X />)).not.toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<Plus />)).not.toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<Sparkles />)).not.toContain(AYROVI_ICON_SIGNATURE);
  });

  it('wires public aliases to the AYROVI components', () => {
    expect(renderToStaticMarkup(<Menu />)).toBe(renderToStaticMarkup(<AyroviMenu />));
    expect(renderToStaticMarkup(<User />)).toBe(renderToStaticMarkup(<AyroviProfile />));
    expect(renderToStaticMarkup(<Sparkles />)).toBe(renderToStaticMarkup(<AyroviAI />));
  });

  it('keeps commerce marks on the shared contract with a signature accent', () => {
    for (const Icon of [Home, ShoppingBag, Heart, Eye, MessageCircle, Package, ShieldCheck, Truck, Bell]) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke-width="2"');
      expect(markup).toContain('data-ayrovi-icon=');
    }
  });

  it('keeps fill reserved for explicit selected states', () => {
    expect(renderToStaticMarkup(<Heart />)).toContain('fill="none"');
    expect(renderToStaticMarkup(<HeartFilled />)).toContain('fill="currentColor"');
    expect(renderToStaticMarkup(<ShoppingBagPlus />)).toContain('stroke-width="2"');
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
