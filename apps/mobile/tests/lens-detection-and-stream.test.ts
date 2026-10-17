import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const lens = read('../app/lens.tsx');
const chips = read('../src/features/lens/LensDetectedChips.tsx');
const progress = read('../src/features/lens/LensProgressLine.tsx');
const overview = read('../src/features/lens/LensOverviewCard.tsx');
const bar = read('../src/features/lens/LensSearchBar.tsx');
const stream = read('../src/api/lensStream.ts');

/**
 * Z Lens — le contrat de la recherche en flux et de la détection qui parle.
 * Ces règles sont celles des fiches du 16/10/2026 (E1, E2, E3, D1, D2).
 */
describe('Z Lens — la détection parle, la recherche progresse', () => {
  it('les objets repérés restent accessibles quand la feuille monte', () => {
    expect(lens).toContain('<LensDetectedChips');
    expect(lens).toContain('products={sessionPhoto.products}');
    expect(lens).toContain('onSelect={onSelectTarget}');
    // Choisir une cible = reprendre la recherche sur cette zone.
    expect(lens).toContain("onSelectionCommit({ kind: 'product', index })");
  });

  it('le nombre de produits n’est montré que pour la cible réellement cherchée', () => {
    expect(chips).toContain("active && typeof resultCount === 'number'");
    // Jamais de « 0 » inventé pour une cible qui n'a pas encore été cherchée.
    expect(chips).not.toMatch(/resultCount\s*\?\?\s*0/);
  });

  it('la détection a trois états, tous dits à l’utilisateur', () => {
    expect(lens).toContain("'detected' | 'noObject' | 'unavailable' | 'pending' | 'none'");
    expect(lens).toContain("detectionState === 'unavailable' || detectionState === 'noObject'");
    expect(lens).toContain("'lens.detect.unavailable' : 'lens.detect.noObject'");
    expect(lens).toContain('testID="lens-detect-notice"');
  });

  it('la recherche arrive en flux : identification, puis fiche par fiche', () => {
    expect(lens).toContain('analyzeImageStream(');
    expect(lens).toContain('onProgress: (progress) =>');
    expect(lens).toContain('onCard: (candidate) =>');
    expect(stream).toContain('text/event-stream');
    expect(stream).toContain('xhr.responseText');
    // Le flux ne se ferme jamais sur un résultat vide silencieux.
    expect(stream).toContain('STREAM_INCOMPLETE');
  });

  it('la ligne d’avancement n’invente aucun pourcentage', () => {
    expect(progress).toContain('done / total');
    expect(progress).toContain('lens.progress.reading');
    expect(progress).toContain('lens-progress-bar-indeterminate');
  });

  it('l’identification affichée est celle publiée par le serveur, sans prix', () => {
    expect(overview).toContain('identification.description');
    expect(overview).not.toContain('price');
    expect(overview).not.toContain('priceTnd');
  });

  it('la barre flottante garde l’étape et l’annulation', () => {
    expect(lens).toContain('<LensSearchBar');
    expect(lens).toContain("busy={stage.kind === 'busy'}");
    expect(bar).toContain('testID="lens-search-bar-cancel"');
  });

  it('l’échec de la recherche visuelle est dit comme tel', () => {
    // SerpApi est l’entrée de la recherche : quand elle ne répond pas, le
    // message le dit (pas « la recherche n'a pas abouti »).
    expect(lens).toContain("error.code === 'VISUAL_SEARCH_FAILED'");
    expect(lens).toContain("'lens.error.visualTitle'");
    expect(lens).toContain("'lens.error.visualBody'");
  });
});
