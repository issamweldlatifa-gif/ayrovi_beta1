import React from 'react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import identity from '../client/src/design/editorial/identity.json';
import glyphs from '../client/src/design/editorial/glyphs.json';
import { EditorialIcon, type EditorialIconName } from '../client/src/design/editorial/Icon';

const names = Object.keys(glyphs) as EditorialIconName[];
const oldCatalogue = readFileSync('client/src/components/icons/ayrovi/catalog.tsx', 'utf8');
const aliases = readFileSync('client/src/components/QatafoIcons.tsx', 'utf8');
function contrast(a: string, b: string) {
  const l = (hex: string) => {
    const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return v[0] * .2126 + v[1] * .7152 + v[2] * .0722;
  };
  const x = l(a), y = l(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

describe('editorial identity, generated from one versioned source', () => {
  it('covers every existing concept and compatibility alias without deleting one', () => {
    const expected = [...oldCatalogue.matchAll(/createAyroviIcon\('([^']+)'/g)].map(m => m[1]).sort();
    expect(names.slice().sort()).toEqual(expected);
    for (const m of aliases.matchAll(/export const \w+ = I\.Ayrovi(\w+);/g)) expect(names).toContain(m[1]);
    expect(names).toHaveLength(96);
  });
  it('defines the area budget, not alpha opacity, and square geometry', () => {
    expect(identity.orangeAreaLimit).toBe(.03);
    expect(identity.orangeAreaExclusions).toEqual(['product-images']);
    expect(identity.geometry.controlRadius).toBe(0);
    expect(identity.geometry.minTarget).toBeGreaterThanOrEqual(44);
    expect(identity.geometry.iconStroke).toBe(1.3);
  });
  for (const tone of ['colors', 'darkColors'] as const) {
    it(`has readable semantic text pairs in ${tone}`, () => {
      const c = identity[tone];
      for (const bg of [c.canvas, c.surface]) {
        for (const text of [c.ink, c.muted, c.accentText, c.success, c.danger]) expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(c.action, c.onAction)).toBeGreaterThan(7);
    });
  }
  it('rejects white on the bright orange for normal text by documenting a separate text token', () => {
    expect(contrast(identity.colors.accent, '#FFFFFF')).toBeLessThan(4.5);
    expect(contrast(identity.colors.accentText, '#FFFFFF')).toBeGreaterThan(4.5);
  });
  for (const f of identity.fonts) it(`ships a verified local WOFF2 and OFL: ${f.family}`, () => {
    const bytes = readFileSync('client/public' + f.file);
    expect(bytes.subarray(0, 4).toString()).toBe('wOF2');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(f.sha256);
    expect(readFileSync('client/public' + f.license, 'utf8')).toContain('SIL OPEN FONT LICENSE');
    expect(f.file).toMatch(/^\/fonts\/editorial\//);
  });
  it('keeps foundation styles explicitly scoped and without override wars', () => {
    const css = readFileSync('client/src/design/editorial/primitives.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toContain('!important');
    expect(css).toContain('[data-ay-design="editorial"]');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('forced-colors');
  });
});

describe('editorial SVG renderer', () => {
  it.each(names)('renders safe, monochrome 24-grid geometry: %s', name => {
    const html = renderToStaticMarkup(<EditorialIcon name={name} />);
    const doc = new JSDOM(html).window.document;
    const svg = doc.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke-width')).toBe('1.3');
    expect(svg.getAttribute('stroke-linecap')).toBe('square');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('script,image,foreignObject,use,a,style')).toHaveLength(0);
    expect(glyphs[name].shapes.length).toBeGreaterThan(0);
    const allowed = new Set(['d','cx','cy','r','x','y','width','height','rx','fill','stroke']);
    for (const shape of glyphs[name].shapes) {
      expect(['path','rect','circle']).toContain(shape.tag);
      for (const [key, value] of Object.entries(shape.attrs)) {
        expect(allowed.has(key)).toBe(true);
        if (key === 'fill' || key === 'stroke') expect(['none','currentColor']).toContain(value);
      }
    }
    doc.defaultView?.close();
  });
  it('gives titled icons distinct accessible names without repeated IDs', () => {
    const doc = new JSDOM(renderToStaticMarkup(<><EditorialIcon name="Search" title="بحث" /><EditorialIcon name="Search" title="Recherche" /></>)).window.document;
    const ids = [...doc.querySelectorAll('title')].map(el => el.id);
    expect(new Set(ids).size).toBe(2);
    for (const svg of doc.querySelectorAll('svg')) {
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.hasAttribute('aria-hidden')).toBe(false);
      expect(doc.getElementById(svg.getAttribute('aria-labelledby')!)?.textContent).toBeTruthy();
    }
    doc.defaultView?.close();
  });
  it('supports aria-label without a title', () => {
    const html = renderToStaticMarkup(<EditorialIcon name="Lens" aria-label="Lens" />);
    expect(html).toContain('role="img"');
    expect(html).not.toContain('aria-hidden');
  });
  it('mirrors only logical movement, not physical objects or external-link arrows', () => {
    for (const name of names) {
      const html = renderToStaticMarkup(<EditorialIcon name={name} direction="rtl" />);
      expect(html.includes('translate(24 0) scale(-1 1)')).toBe(glyphs[name].mirrorRtl);
    }
    expect(glyphs.Back.mirrorRtl).toBe(true);
    expect(glyphs.Barcode.mirrorRtl).toBe(false);
    expect(glyphs.Camera.mirrorRtl).toBe(false);
    expect(glyphs.External.mirrorRtl).toBe(false);
  });
});
