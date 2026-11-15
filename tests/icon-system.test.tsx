import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AlertCircle, Bell, CheckCircle2, Grid, Heart, HeartFilled, Home, LayoutGrid,
  Menu, MessageCircle, Package, Search, ShoppingBag, Sparkles, Truck, User, X,
} from '../client/src/components/QatafoIcons';
import { ZayroviBack, ZayroviSearch, ZayroviSparkles, ZayroviUser } from '../client/src/components/icons/zayrovi';

const family = [Menu, ZayroviBack, Search, User, Sparkles, Home, ShoppingBag, Heart, MessageCircle, Package, X, AlertCircle];

describe('ZAYROVI icon system', () => {
  it('renders the family as independent 24px monoline SVG (editorial, stroke 1.5)', () => {
    for (const Icon of family) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke-width="1.5"');
      expect(markup).toContain('stroke-linecap="square"');
      expect(markup).toContain('stroke-linejoin="miter"');
      expect(markup).toContain('ay-editorial-icon');
      expect(markup).not.toContain('class="lucide');
    }
  });

  it('is strictly monochrome: no orange signature, no accent, no dot (ordre du client)', () => {
    for (const Icon of family) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).not.toContain('#FF6A00');
      expect(markup).not.toContain('data-zayrovi-signature');
      expect(markup).not.toContain('data-zayrovi-accent');
    }
  });

  it('wires public aliases to the ZAYROVI components (one icon per concept)', () => {
    expect(Sparkles).toBe(ZayroviSparkles);
    expect(User).toBe(ZayroviUser);
    expect(Home).toBeTruthy();
    // Les doublons conceptuels pointent vers UNE seule icône
    expect(Grid).toBe(LayoutGrid);
  });

  it('keeps commerce marks on the shared contract with a signature accent', () => {
    for (const Icon of [Home, ShoppingBag, Heart, MessageCircle, Package, Truck, Bell, CheckCircle2]) {
      const markup = renderToStaticMarkup(<Icon />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke-width="1.5"');
      expect(markup).toContain('data-zayrovi-icon=');
    }
  });

  it('keeps fill reserved for explicit selected states', () => {
    expect(renderToStaticMarkup(<Heart />)).toContain('fill="none"');
    expect(renderToStaticMarkup(<HeartFilled />)).toContain('fill="currentColor"');
    expect(renderToStaticMarkup(<ShoppingBag />)).toContain('stroke-width="1.5"');
  });

  it('publishes the thin stroke token, with no lucide dependency and no signature system', () => {
    const tokens = readFileSync('client/src/design/tokens.css', 'utf8');
    const globalCss = readFileSync('client/src/index.css', 'utf8');
    expect(tokens).toContain('--zayrovi-icon-stroke: 1.5');
    expect(tokens).not.toContain('--zayrovi-icon-signature');
    expect(globalCss).not.toContain('stroke-width: 2px');
    expect(globalCss).toContain('vector-effect: none');
    expect(globalCss).not.toContain('.lucide');
    expect(globalCss).not.toContain('data-zayrovi-signature');
  });
});
