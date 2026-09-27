import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const css = read('client/src/shop/shop.css');
const component = read('client/src/shop/ProductPage.tsx');

describe('mobile product page: image, details, then purchase', () => {
  it('keeps gallery actions attached to the image and places details after the gallery', () => {
    expect(component.indexOf('className="s-media"')).toBeLessThan(component.indexOf('className="s-sheet"'));
    expect(component.indexOf('className="s-sheet"')).toBeLessThan(component.indexOf('className="s-buybar'));
    expect(component).toContain('actions?.onNotify');
    expect(component).toContain('actions?.onFavorite');
    expect(component).toContain('actions?.onOpenBag');
    expect(component).not.toContain('s-scrim');
    expect(component).not.toContain("setProperty('--s-reveal'");
  });

  it('does not make the product image sticky or use a cover sheet', () => {
    expect(css).toMatch(/\.s-media\s*\{[^}]*position: relative/);
    expect(css).not.toMatch(/\.s-media\s*\{[^}]*position: sticky/);
    expect(css).toMatch(/\.s-sheet\s*\{[^}]*position: relative/);
    expect(css).not.toMatch(/\.s-sheet\s*\{[^}]*z-index: 10/);
    expect(css).toContain('object-fit: contain');
  });

  it('shows photo thumbnails and keeps carousel controls reachable', () => {
    expect(component).toContain('s-thumbnails');
    expect(component).toContain('aria-current={slide === index');
    expect(component).toContain('Photo précédente');
    expect(css).toContain('.s-thumbnail[aria-current="true"]');
  });

  it('keeps product purchase controls in normal flow after facts and variants', () => {
    expect(css).toMatch(/\.s-buybar--product\s*\{[^}]*position: relative/);
    expect(css).not.toMatch(/\.s-buybar--product\s*\{[^}]*position: sticky/);
    expect(component.indexOf('className="s-select"')).toBeLessThan(component.indexOf('className="s-cta"'));
    expect(component).toContain('s-buybar s-buybar--product');
  });

  it('loads the single authoritative shop stylesheet', () => {
    expect(read('client/src/index.css')).toContain('./shop/shop.css');
    expect(read('client/src/index.css')).not.toContain('product-page-responsive.css');
  });
});
