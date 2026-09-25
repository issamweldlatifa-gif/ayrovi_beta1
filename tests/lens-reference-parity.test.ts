import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (name: string) => readFileSync('client/src/ayrovix/components/' + name, 'utf8');
const camera = read('LiveCamera.tsx'), results = read('InteractiveLensResults.tsx');
const css = read('lens-results.css'), sheet = read('useLensResultsSheet.ts');
describe('Lens results — approved September 21 reference', () => {
 it('fits the entire image rather than cropping it behind the sheet', () => {
  expect(css).toContain('object-fit:contain'); expect(results).toContain('containedImageRect');
  expect(results).not.toContain('object-cover');
 });
 it('has one chrome owner, with no camera header above the expanded results', () => {
  expect(camera).toContain('{!(photoUrl && overlay) && <header');
  expect(camera).not.toContain('z-[16] h-20');
  expect(results).toContain('inert={drawer.full && Boolean(previewUrl)}');
 });
 it('removes zoom/reset/expand toolbar instead of relocating it', () => {
  for (const literal of ["tr('Zoomer'", "tr('Dézoomer'", "tr('Agrandir'", "tr('Réduire'", "tr('Effacer'"]) expect(results).not.toContain(literal);
  expect(results).toContain('className="lens-sheet-handle"');
 });
 it('keeps a single image flow with the camera hidden rather than reopened', () => {
  expect(read('LensLauncher.tsx')).toContain('photoUrl={inImageFlow ? previewUrl : null}');
  expect(camera).toContain("photoUrl ? 'invisible' : ''");
 });
 it('uses transform-only drag and native list scrolling, without accidental reset on pull', () => {
  expect(css).toContain('translate3d(0,var(--sheet-offset),0)');
  expect(sheet).toContain('requestAnimationFrame'); expect(sheet).toContain('node.scrollTop <= 0');
  expect(sheet).not.toContain('onReset'); expect(sheet).toContain('touchcancel');
 });
 it('uses bounded selection corners and truthful loading-only dots', () => {
  expect(results).toContain('resizeSelection'); expect(results).toContain('isLoading && <div className="lens-analysis-dots"');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
 });
 it('keeps automatic delivery website-only', () => {
  const workflow = readFileSync('.github/workflows/android-apk.yml', 'utf8');
  expect(workflow).not.toMatch(/^  push:/m); expect(workflow).toContain('workflow_dispatch:');
 });
});

/*
 * Carte de résultat — le descriptif se lit comme la ligne de prix barrée
 * (demande client du 25/09/2026) : même taille, même gris, même poids, une ligne.
 */
describe('carte Lens — descriptif sous le titre', () => {
  const cardCss = readFileSync('client/src/ayrovix/components/lens-product-card.css', 'utf8');
  const quietCss = readFileSync('client/src/ayrovix/components/quiet-card.css', 'utf8');
  const rule = (css: string, selector: string) => css.split(selector)[1]?.split('}')[0] ?? '';

  it('reprend la taille, le gris et le poids du prix barré de la grille', () => {
    const desc = rule(cardCss, '.lens-product-card .lens-card-description');
    const struck = rule(quietCss, '.ay-quiet-price--grid .ay-quiet-price__original');
    expect(desc).toContain('font-size:.75rem');
    expect(struck).toContain('font-size: 0.75rem');
    expect(desc).toContain('#595959');
    expect(struck).toContain('#595959');
    expect(desc).toContain('font-weight:400');
    expect(struck).toContain('font-weight: 400');
  });

  it('tient sur une seule ligne pour ne pas pousser le prix hors de la carte', () => {
    expect(rule(cardCss, '.lens-product-card .lens-card-description')).toContain('-webkit-line-clamp:1');
  });
});
