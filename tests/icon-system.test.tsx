import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AlertCircle, Bell, CheckCircle2, Grid, Heart, HeartFilled, Home, LayoutGrid,
  Menu, MessageCircle, Package, Search, ShoppingBag, Sparkles, Truck, User, X,
  AYROVI_ICON_SIGNATURE,
} from '../client/src/components/QatafoIcons';
import { AyroviBack, AyroviSearch, AyroviSparkles, AyroviUser } from '../client/src/components/icons/ayrovi';

const family = [Menu, AyroviBack, Search, User, Sparkles, Home, ShoppingBag, Heart, MessageCircle, Package, X, AlertCircle];

describe('AYROVI icon system', () => {
  it('renders the family as independent 24px monoline SVG (Zalando-like, stroke 1.5)', () => {
    for (const Icon of family) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke-width="1.5"');
      expect(markup).toContain('stroke-linecap="round"');
      expect(markup).toContain('stroke-linejoin="round"');
      expect(markup).toContain('ayrovi-icon');
      expect(markup).not.toContain('class="lucide');
    }
  });

  it('places the orange signature only where the reference draws it', () => {
    expect(renderToStaticMarkup(<Menu />).match(new RegExp(AYROVI_ICON_SIGNATURE, 'g'))).toHaveLength(3);
    expect(renderToStaticMarkup(<AyroviBack />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<AyroviSearch />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<AyroviUser />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<AyroviSparkles />)).toContain(AYROVI_ICON_SIGNATURE);
    expect(renderToStaticMarkup(<X />)).not.toContain(AYROVI_ICON_SIGNATURE);
  });

  it('wires public aliases to the AYROVI components (one icon per concept)', () => {
    expect(Sparkles).toBe(AyroviSparkles);
    expect(User).toBe(AyroviUser);
    expect(Home).toBeTruthy();
    // Les doublons conceptuels pointent vers UNE seule icône
    expect(Grid).toBe(LayoutGrid);
  });

  it('keeps commerce marks on the shared contract with a signature accent', () => {
    for (const Icon of [Home, ShoppingBag, Heart, MessageCircle, Package, Truck, Bell, CheckCircle2]) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke-width="1.5"');
      expect(markup).toContain('data-ayrovi-icon=');
    }
  });

  it('keeps fill reserved for explicit selected states', () => {
    expect(renderToStaticMarkup(<Heart />)).toContain('fill="none"');
    expect(renderToStaticMarkup(<HeartFilled />)).toContain('fill="currentColor"');
    expect(renderToStaticMarkup(<ShoppingBag />)).toContain('stroke-width="1.5"');
  });

  it('publishes the thin stroke token and signature color, with no lucide dependency', () => {
    const tokens = readFileSync('client/src/design/tokens.css', 'utf8');
    const globalCss = readFileSync('client/src/index.css', 'utf8');
    expect(tokens).toContain('--ayrovi-icon-stroke: 1.5');
    expect(tokens).toContain('--ayrovi-icon-signature: #FF6A00');
    expect(globalCss).toContain('stroke-width: var(--ayrovi-icon-stroke, 1.5)');
    expect(globalCss).toContain('vector-effect: none');
    expect(globalCss).not.toContain('.lucide');
  });
});
