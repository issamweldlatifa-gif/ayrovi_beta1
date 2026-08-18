import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Bell, Eye, Heart, HeartFilled, Home, Menu, MessageCircle, Package, ShoppingBag,
  ShoppingBagPlus, ShieldCheck, Truck, User,
} from '../client/src/components/QatafoIcons';

const core = [Home, ShoppingBag, Menu, Heart, User];

describe('AYROVI icon system', () => {
  it('renders the five reference silhouettes on the shared 24px monoline contract', () => {
    for (const Icon of core) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('fill="none"');
      expect(markup).toContain('stroke="currentColor"');
      expect(markup).toContain('stroke-width="1.5"');
      expect(markup).toContain('stroke-linecap="round"');
      expect(markup).toContain('stroke-linejoin="round"');
    }
  });

  it('marks both original and adapted symbols as real AYROVI components', () => {
    for (const Icon of [Eye, MessageCircle, Package, ShieldCheck, Truck, Bell]) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('class="lucide');
      expect(markup).toContain('ayrovi-icon');
      expect(markup).toContain('data-ayrovi-icon=');
      expect(markup).toContain('stroke-width="1.5"');
    }
  });

  it('keeps fill reserved for explicit selected states', () => {
    expect(renderToStaticMarkup(<Heart />)).toContain('fill="none"');
    expect(renderToStaticMarkup(<HeartFilled />)).toContain('fill="currentColor"');
    expect(renderToStaticMarkup(<ShoppingBagPlus />)).toContain('stroke-width="1.5"');
  });

  it('publishes the global stroke token and non-scaling rendering rule', () => {
    const tokens = readFileSync('client/src/design/tokens.css', 'utf8');
    const globalCss = readFileSync('client/src/index.css', 'utf8');
    expect(tokens).toContain('--ayrovi-icon-stroke: 1.5');
    expect(globalCss).toContain('stroke-width: var(--ayrovi-icon-stroke, 1.5)');
    expect(globalCss).toContain('vector-effect: non-scaling-stroke');
  });
});
