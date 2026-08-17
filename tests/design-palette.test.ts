import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = process.cwd();
// AYROVI v4 — palette monochrome (blanc natif / noir Apple) + statuts sémantiques.
const PALETTE = {
  interactivePrimary: '#1D1D1F',
  hero: '#1D1D1F',
  surfaceAlt: '#F7F7F8',
  surfaceBase: '#FFFFFF',
  text: '#1D1D1F',
  chart: '#1D1D1F',
  success: '#2F6B4F',
  info: '#356A8C',
  warning: '#8A5A14',
  danger: '#A63B32',
  muted: '#6E6E73',
  line: '#D2D2D7',
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

describe('AYROVI v4 monochrome palette', () => {
  test('publishes the canonical roles as CSS theme variables', () => {
    // Collapse runs of whitespace so alignment inside tokens.css can't break us.
    const css = fs.readFileSync(path.join(ROOT, 'client/src/design/tokens.css'), 'utf8')
      .toUpperCase().replace(/\s+/g, ' ');
    const has = (token: string) => expect(css).toContain(token.toUpperCase().replace(/\s+/g, ' '));
    // Canonical literal values
    has('--color-ink: #1D1D1F');
    has('--color-canvas: #FFFFFF');
    has('--color-canvas-alt: #F7F7F8');
    has('--color-success: #2F6B4F');
    has('--color-info: #356A8C');
    has('--color-warning: #8A5A14');
    has('--color-danger: #A63B32');
    // Aliases resolve to the canonical black / canvas tokens
    has('--color-interactive-primary: var(--color-ink)');
    has('--color-hero-bg: var(--color-ink)');
    has('--color-text-primary: var(--color-ink)');
    has('--color-surface-base: var(--color-canvas)');
    has('--color-surface-alt: var(--color-canvas-alt)');
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
      ]).filter((p) => fs.existsSync(p));
    const offenders = [...files, ...styles]
      .filter((file) => /#[0-9a-f]{3,8}\b/i.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));
    // tokens.css itself holds canonical hex values; App.tsx runtime fallbacks
    // use pure white / surface-alt only (allowed). Fail on everything else.
    expect(offenders.filter((f) => !f.endsWith('App.tsx'))).toEqual([]);
  });

  test('meets WCAG AA contrast for text, CTA and semantic statuses', () => {
    expect(contrast(PALETTE.interactivePrimary, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.hero, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.text, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.success, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.info, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.warning, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.danger, PALETTE.surfaceBase)).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps secondary actions outline-only and the bottom navigation neutral', () => {
    const journey = fs.readFileSync(path.join(ROOT, 'client/src/styles/journey.css'), 'utf8');
    const navigation = fs.readFileSync(path.join(ROOT, 'client/src/config/interfaceConfig.ts'), 'utf8');
    expect(journey).toContain('.ay-btn-secondary{border:1px solid var(--color-interactive-primary);');
    expect(navigation).toContain('background: AYROVI_SEMANTIC_PALETTE.surfaceBase');
    expect(navigation).toContain('activeBackground: AYROVI_SEMANTIC_PALETTE.surfaceAlt');
  });
});
