import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const lens = read('../app/lens.tsx');
const matches = read('../src/features/lens/LensVisualMatches.tsx');
const overlay = read('../src/features/lens/LensLiveOverlay.tsx');
const progress = read('../src/features/lens/LensProgressLine.tsx');
const overview = read('../src/features/lens/LensOverviewCard.tsx');
const bar = read('../src/features/lens/LensSearchBar.tsx');
const stream = read('../src/api/lensStream.ts');

/**
 * Z Lens — le contrat de la recherche en flux et de la reconnaissance visuelle.
 * Règle du 25/10/2026 : un cadrage automatique (vision classique serveur, sans
 * SerpApi) isole d'abord le produit unique ; la recherche en flux reste lancée
 * une seule fois avec la zone (roi) choisie, et retombe sur le cadre manuel si
 * la détection n'est pas fiable.
 */
describe('Z Lens — la reconnaissance visuelle parle, la recherche progresse', () => {
  it('la photo déclenche d’abord le cadrage automatique, puis une seule recherche en flux', () => {
    // Le cadrage `/detect-box` ne consomme pas SerpApi : la recherche
    // (`analyzeImageStream`) reste faite une seule fois, avec la roi choisie.
    expect(lens).toContain('analyzeProductBox(');
    expect(lens).toContain("name: 'lens-detect.jpg'");
    expect(lens).toContain('analyzeImageStream(');
    expect(lens).not.toContain('DETECTION_FAILED');
  });

  it('une détection non fiable retombe sur le cadre manuel plein image', () => {
    // Le choix auto vs manuel vit dans une fonction pure testée à part ; l'écran
    // applique son patch et ne devine jamais de boîte lui-même.
    expect(lens).toContain('selectionFromBoxDetection(');
    expect(lens).not.toContain('biggestProductIndex(');
    expect(lens).toContain('const roi = toRoi(photo.selection)');
  });

  it('les correspondances visuelles sont affichées (vignette + titre) et ouvrables', () => {
    expect(lens).toContain('<LensLiveOverlay');
    expect(lens).toContain('matches={live.matches}');
    expect(lens).toContain('onOpenMatch={onOpenLiveMatch}');
    expect(overlay).toContain('<LensVisualMatches');
    expect(matches).toContain('testID="lens-visual-matches"');
    expect(matches).toContain('testID={`lens-visual-match-${index}`}');
  });

  it('une correspondance n’affiche JAMAIS de prix : le prix vient de la page', () => {
    expect(matches).not.toContain('price');
    expect(matches).not.toContain('priceTnd');
    // Ouvrir une correspondance = ouvrir la page marchande DANS le navigateur
    // AYWEBs (règle unique), jamais une autre fiche : le prix y est lu par capture.
    expect(lens).toContain('const decision = lensOpenDecision(candidate);');
    expect(lens).toContain("router.push(decision.target)");
  });

  it('le mode Live dit ce qu’il a trouvé, et le dit toujours', () => {
    expect(lens).toContain("status: result.matches.length ? 'detected' : 'empty'");
    expect(lens).toContain("t('lens.live.matchOne')");
    expect(lens).toContain("t('lens.live.matchMany'");
    expect(lens).toContain("t('lens.live.noMatch')");
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
