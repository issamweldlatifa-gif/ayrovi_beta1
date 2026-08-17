import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = process.cwd();
// AYROVI v2 — palette « Noir & Bordeaux » (luxe mode), corrigée avec success/info/warning.
const PALETTE = {
  interactivePrimary: '#1D1D1F',
  hero: '#1D1D1F',
  surfaceAlt: '#F5F5F7',
  surfaceBase: '#FBFBFD',
  text: '#1D1D1F',
  chart: '#1D1D1F',
  success: '#2F6B4F',
  info: '#4A6B8A',
  warning: '#8C5A1A',
  danger: '#A63B32',
  accentGold: '#9C7A4A',
};

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string) {
  const [bright, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (bright + 0.05) / (dark + 0.05);
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

describe('AYROVI v2 semantic palette (Noir & Bordeaux)', () => {
  test('publishes the canonical roles as CSS theme variables', () => {
    const css = fs.readFileSync(path.join(ROOT, 'client/src/design/tokens.css'), 'utf8').toUpperCase();
    const expected = [
      ['--COLOR-INTERACTIVE-PRIMARY', PALETTE.interactivePrimary],
      ['--COLOR-HERO-BG', PALETTE.hero],
      ['--COLOR-SURFACE-ALT', PALETTE.surfaceAlt],
      ['--COLOR-SURFACE-BASE', PALETTE.surfaceBase],
      ['--COLOR-TEXT-PRIMARY', PALETTE.text],
      ['--COLOR-CHART-ACCENT', PALETTE.chart],
      ['--COLOR-SUCCESS', PALETTE.success],
      ['--COLOR-INFO', PALETTE.info],
      ['--COLOR-WARNING', PALETTE.warning],
      ['--COLOR-DANGER', PALETTE.danger],
      ['--COLOR-ACCENT-GOLD', PALETTE.accentGold],
    ];
    for (const [role, value] of expected) expect(css).toContain(`${role}: ${value}`);
  });

  test('keeps raw colour literals out of components and component styles', () => {
    const sourceRoot = path.join(ROOT, 'client/src');
    const files = sourceFiles(sourceRoot)
      .filter((file) => !file.endsWith(path.join('config', 'interfaceConfig.ts')));
    const styles = fs.readdirSync(path.join(sourceRoot, 'admin')).filter((name) => name.endsWith('.css'))
      .map((name) => path.join(sourceRoot, 'admin', name))
      .concat([
        path.join(sourceRoot, 'index.css'),
        path.join(sourceRoot, 'styles/interface-runtime.css'),
        path.join(sourceRoot, 'styles/journey.css'),
      ]);
    const offenders = [...files, ...styles]
      .filter((file) => /#[0-9a-f]{3,8}\b/i.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  test('meets WCAG AA contrast for text, CTA, chart and semantic roles', () => {
    expect(contrast(PALETTE.interactivePrimary, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.hero, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.text, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.chart, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.success, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.info, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.warning, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.danger, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps secondary actions outline-only and the bottom navigation neutral', () => {
    const journey = fs.readFileSync(path.join(ROOT, 'client/src/styles/journey.css'), 'utf8');
    const navigation = fs.readFileSync(path.join(ROOT, 'client/src/config/interfaceConfig.ts'), 'utf8');
    expect(journey).toContain('.ay-btn-secondary{border:1px solid var(--color-interactive-primary);background:transparent');
    expect(navigation).toContain('background: AYROVI_SEMANTIC_PALETTE.surfaceBase');
    expect(navigation).toContain('activeBackground: AYROVI_SEMANTIC_PALETTE.surfaceAlt');
  });
});
