import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Parité avec la référence Amazon Lens (image fournie 2026-09-18) — règles littérales :
 *  P1. Photo uploadée = la photo REMPLIT l'écran (noir autour, aucun encadrement clair, aucun letterbox gris).
 *  P2. En mode photo, le header ne garde que ← + la marque. PAS de flash, PAS de pills d'info (« Auto »,
 *      « Analyse en cours » flottant, compteurs) — le feedback vit dans la sheet et en dots sur l'image.
 *  P3. Dots de détection posées directement sur la photo ; sélection ROI exacte même en cover (math du rect visible).
 *  P4. Contrôles (Effacer, zoom +/−, reset) déménagés dans la barre de la sheet (comme la rangée « Lifestyle | Filters »),
 *      jamais flottants sur la photo en mode shell.
 *  P5. Une seule voie : aucun écran intermédiaire de preview, caméra cachée mais vivante derrière, retour instantané.
 *  P6. Bande de lisibilité dégradée sous le header (référence : header sur la photo, texte blanc lisible).
 */

const camera = readFileSync('client/src/ayrovix/components/LiveCamera.tsx', 'utf8');
const irl = readFileSync('client/src/ayrovix/components/InteractiveLensResults.tsx', 'utf8');
const launcher = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');

describe('AYROVIX Lens ↔ Amazon reference parity', () => {
  it('P1 — full-bleed photo on black (no grey frame, no card)', () => {
    expect(irl).toContain("shell ? 'bg-black' : 'bg-[#FAFAFA]'");
    expect(irl).toContain("'h-full w-full object-cover select-none'");
  });

  it('P2 — photo mode: back + brand only; no torch, no floating info', () => {
    expect(camera).toContain('{photoUrl ? null : (');
    expect(camera).toContain('>ayrovix</p>');
    expect(camera).not.toContain('photoUrl && analyzing');
    expect(camera).not.toContain("tr('Auto'");
    // torch/tab/bar/hint never render once a photo is in
    expect(camera).toContain("{mode !== 'code' && !photoUrl && (");
    expect(camera).toContain('{!photoUrl && (\n      <div className="relative z-10 flex items-end justify-between px-8 pb-2">');
  });

  it('P3 — dots over the photo + cover-exact ROI math', () => {
    expect(irl).toContain('isLoading && !selectedBox');
    expect(irl).toContain('Math.max(cRect.width / img.naturalWidth, cRect.height / img.naturalHeight) * scale');
  });

  it('P4 — controls live in the sheet header strip, never floating over the photo in shell', () => {
    expect(irl).toContain('{!shell && (');
    expect(irl).toContain("{shell && (\n                <span className=\"flex gap-1\">");
    expect(irl).toContain("aria-label={tr('Zoomer', 'تكبير')}");
  });

  it('P5 — single path: no preview interstitial, camera stays mounted and hidden behind the photo', () => {
    expect(launcher).not.toContain("enterStage('preview')");
    expect(launcher).toContain('photoUrl={inImageFlow ? previewUrl : null}');
    expect(camera).toContain("photoUrl ? 'invisible' : ''");
  });

  it('P6 — readability gradient band under the photo-mode header', () => {
    expect(camera).toContain('inset-x-0 top-0 z-[16] h-20 bg-gradient-to-b from-black/55 to-transparent');
  });
});
