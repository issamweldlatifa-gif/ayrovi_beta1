import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OfficeIcon, officeGlyphs } from '../client/src/design/admin/OfficeIcon';
import { OfficeViewSwitch } from '../client/src/design/admin/OfficeViewSwitch';
import { makeRevenueSeries } from '../client/src/admin/back-office/revenueSeries';

function luminance(hex: string) {
  const text = hex.slice(1);
  const expanded = text.length === 3 ? text.split('').map(part => part.repeat(2)).join('') : text;
  const [r, g, b] = [0, 2, 4].map(index => {
    const value = parseInt(expanded.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return r * .2126 + g * .7152 + b * .0722;
}

const palette = (block: string) => Object.fromEntries([...block.matchAll(/--office-([\w-]+):\s*(#[a-f\d]{3,6})\s*;/gi)].map(match => [match[1], match[2]]));

describe('Admin design system', () => {
  it('has readable text and visible focus in light and dark', () => {
    const css = readFileSync('client/src/design/admin/office-tokens.css', 'utf8');
    const blocks = [...css.matchAll(/(?:^|\n)([^\n{]+) \{([^}]+)\}/g)];
    const light = palette(blocks[0][2]);
    const dark = { ...light, ...palette(blocks.find(block => block[1].includes("data-theme='dark'"))![2]) };
    for (const theme of [light, dark]) {
      const pairs: [string, string, number][] = [
        ['text-primary', 'surface-canvas', 4.5], ['text-secondary', 'surface-card', 4.5],
        ['text-caption', 'surface-card', 4.5], ['text-navigation-muted', 'surface-navigation', 4.5],
        ['text-navigation', 'surface-navigation-selected', 4.5], ['text-on-action', 'action-primary', 4.5],
        ['focus-outer', 'surface-card', 3], ['navigator-focus', 'surface-navigation', 3],
      ];
      for (const [foreground, background, threshold] of pairs) {
        expect(theme[foreground], foreground).toBeTruthy();
        expect(theme[background], background).toBeTruthy();
        const tones = [luminance(theme[foreground]), luminance(theme[background])].sort((a, b) => b - a);
        expect((tones[0] + .05) / (tones[1] + .05), `${foreground} / ${background}`).toBeGreaterThanOrEqual(threshold);
      }
    }
  });

  it('renders semantic glyphs through the central family, decorative in button labels', () => {
    const result = renderToStaticMarkup(<OfficeIcon name="cms" size="navigation" />);
    expect(result).toContain('width="20"');
    expect(result).toContain('aria-hidden="true"');
    expect(result).toContain('data-editorial-icon="OfficeContent"');
    expect(new Set(Object.values(officeGlyphs)).size).toBe(Object.values(officeGlyphs).length);
  });

  it('exposes selected and available views as labelled buttons', () => {
    const result = renderToStaticMarkup(<OfficeViewSwitch<'table' | 'board'> label="Vues CRM" value="table" onChange={vi.fn()} options={[
      { value: 'table', label: 'Tableau', icon: 'table' }, { value: 'board', label: 'Kanban', icon: 'kanban' },
    ]} />);
    expect(result).toContain('role="group" aria-label="Vues CRM"');
    expect(result.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(result).toContain('aria-pressed="false"');
  });

  it('fills inactive days using UTC and does not distort the recorded amounts', () => {
    expect(makeRevenueSeries([{ date: '2026-10-31', revenue: 188.123 }, { date: '2026-11-02', revenue: 12 }], 2, new Date('2026-11-02T00:20:00Z'))).toEqual([
      { date: '2026-10-31', value: 188.123 }, { date: '2026-11-01', value: 0 }, { date: '2026-11-02', value: 12 },
    ]);
  });
});
