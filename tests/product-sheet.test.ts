import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const css = read('client/src/shop/shop.css');
const component = read('client/src/shop/ProductPage.tsx');

describe('mobile product page: image, details, then purchase', () => {
  it('places details after the gallery and binds mobile action icons to the rising sheet', () => {
    expect(component.indexOf('className="s-media"')).toBeLessThan(component.indexOf('className="s-sheet"'));
    expect(component.indexOf('className="s-sheet"')).toBeLessThan(component.indexOf('className="s-buybar'));
    expect(component).toContain('actions?.onNotify');
    expect(component).toContain('actions?.onFavorite');
    expect(component).toContain('actions?.onOpenBag');
    expect(component).not.toContain('s-scrim');
    expect(component).not.toContain("setProperty('--s-reveal'");
  });

  it('keeps a full-height sticky photo and lets the natural-flow details sheet slide over it', () => {
    expect(css).toMatch(/\.s-media\s*\{[^}]*position: sticky/);
    expect(css).toContain('height: calc(100dvh - var(--s-appbar-height)');
    expect(css).toMatch(/\.s-sheet\s*\{[^}]*z-index: 4/);
    expect(css).toContain('box-shadow: 0 -18px 44px rgb(0 0 0 / 24%)');
    expect(css).toContain('object-fit: contain');
  });

  it('shows at most four source photos in the integrated mobile swipe gallery', () => {
    expect(component).toContain('product.media.slice(0, 4)');
    expect(component).toContain('className="s-media"');
    expect(component).toContain('className="s-gallery-progress"');
    expect(component.indexOf('className="s-gallery-progress"')).toBeLessThan(component.indexOf('className="s-sheet"'));
    expect(component).toContain('aria-current={slide === index');
    expect(component).toContain('onTouchEnd=');
    expect(css).toMatch(/\.s-gallery-progress\s*\{[^}]*position: absolute/);
    expect(css).toContain('.s-gallery-progress button[aria-current="true"] span');
    expect(component).not.toContain('s-thumbnails');
  });

  it('anchors action icons to the rising sheet edge and strengthens the reveal shadow', () => {
    expect(component).toContain("renderRail('s-rail s-rail--sheet')");
    expect(component.indexOf("renderRail('s-rail s-rail--sheet')")).toBeGreaterThan(component.indexOf('className="s-sheet"'));
    expect(css).toMatch(/\.s-rail\s*\{[^}]*inset-inline-end:\s*0/);
    expect(css).toContain('bottom: calc(100% + 6px)');
    expect(css).toContain('box-shadow: 0 -18px 44px rgb(0 0 0 / 24%)');
    expect(css).toContain('backdrop-filter: blur(6px)');
  });

  it('uses the isolated transparent asset before the catalogue composition in the hero', () => {
    expect(component).toContain("src.startsWith('/api/public/media/isolated?')");
    expect(component).toContain("item.src.startsWith('/api/public/media/card?')");
    expect(component).toContain('[isolated, ...chain.filter');
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
