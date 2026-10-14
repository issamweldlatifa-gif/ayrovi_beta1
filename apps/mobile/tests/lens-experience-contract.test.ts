import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const lens = read('../app/lens.tsx');
const skeleton = read('../src/features/lens/LensSearchSkeleton.tsx');
const grid = read('../src/features/lens/LensResultsGrid.tsx');
const card = read('../src/features/lens/LensResultCard.tsx');
const product = read('../src/features/lens/LensProductView.tsx');
const help = read('../src/features/lens/LensHelpView.tsx');
const palette = read('../src/features/lens/lensPalette.ts');
const nativeTokens = read('../src/design/tokens.mobile.ts');

describe('parcours AYROVIX Lens unifié', () => {
  it('ouvre directement la caméra et traite le premier consentement sans lanceur intermédiaire', () => {
    expect(lens).toContain('testID="lens-camera-experience"');
    expect(lens).toContain('<CameraView');
    expect(lens).toContain("permission.status !== 'undetermined'");
    expect(lens).toContain('void requestPermission()');
    expect(lens).toContain("goBack('/')");
    expect(lens).not.toContain('LensLauncher');
    expect(lens).not.toContain('Segmented');
  });

  it('conserve une seule requête annulable par action, sans boucle de relance', () => {
    expect(lens).toContain('type SearchJob = (signal: AbortSignal) => Promise<void>');
    expect(lens).toContain('requestRef.current?.abort()');
    expect(lens).toContain('const controller = new AbortController()');
    expect(lens).toContain('await job(controller.signal)');
    expect(lens).toContain('if (!signal.aborted) showSearch');
    expect(lens).not.toContain('setInterval(');
    expect(lens).not.toMatch(/setTimeout\([^)]*retry/i);
  });

  it('garde la photo sous une feuille réellement ajustable pendant le chargement et les résultats', () => {
    expect(lens).toContain('setPreviewUri(picture.uri)');
    expect(lens).toContain('accessibilityLabel={t(\'lens.capturedPhoto\')}');
    expect(lens).toContain('<SearchSheet top={sheetTop}>');
    expect(lens).toContain('PanResponder.create');
    expect(lens).toContain('testID="lens-search-sheet-handle"');
    expect(lens).toContain('<LensSearchSkeleton onCancel={cancelSearch} />');
    expect(lens).toContain('removePrivateCapture');
    expect(lens).toContain('if (file.exists) file.delete()');
  });
});

describe('chargement et résultats Lens', () => {
  it('charge avec quatre cartes grises à deux colonnes plutôt qu’un panneau vide', () => {
    expect(skeleton).toContain('[0, 1, 2, 3]');
    expect(skeleton).toContain('lens-skeleton-card-');
    expect(skeleton).toContain('flexWrap: \'wrap\'');
    expect(skeleton).toContain("width: '48.4%'");
    expect(skeleton).toContain("t('common.cancel')");
    expect(skeleton).not.toContain('ActivityIndicator');
  });

  it('virtualise une grille compacte à deux colonnes avec favoris et options', () => {
    expect(grid).toContain('<FlatList');
    expect(grid).toContain('numColumns={2}');
    expect(grid).toContain('removeClippedSubviews');
    expect(card).toContain('numberOfLines={2}');
    expect(card).toContain('lens-favorite-');
    expect(card).toContain('event.stopPropagation()');
    expect(card).toContain('candidate.sizes.length > 0 ? candidate.sizes : candidate.colors');
    expect(card).toContain('cardOptions.slice(0, 4)');
  });

  it('réserve le rouge aux promotions et le jaune aux étoiles, sans orange Lens', () => {
    expect(palette).toContain("export { LENS_COLORS } from '@/design/tokens.mobile'");
    expect(nativeTokens).toContain("sale: '#D00000'");
    expect(nativeTokens).toContain("star: '#F5B800'");
    expect(card).toContain('color={LENS_COLORS.star}');
    expect(card).toContain('backgroundColor: LENS_COLORS.sale');
    expect(`${lens}\n${skeleton}\n${grid}\n${card}\n${product}`).not.toMatch(/theme\.colors\.accent|#ff7900/i);
  });
});

describe('fiche produit Lens continue', () => {
  it('place l’en-tête fixe avant un seul défilement vertical et une grande galerie', () => {
    const header = product.indexOf('styles.productHeader');
    const verticalScroll = product.indexOf('<ScrollView showsVerticalScrollIndicator={false}');
    expect(header).toBeGreaterThan(0);
    expect(verticalScroll).toBeGreaterThan(header);
    expect(product).toContain('const heroHeight = Math.min(690');
    expect(product).toContain('contentFit="contain"');
    expect(product).toContain('styles.details');
  });

  it('propose balayage, pincement et double toucher dans la galerie plein écran', () => {
    expect(product).toContain('function ZoomableGalleryImage');
    expect(product).toContain('touches.length >= 2');
    expect(product).toContain('Math.min(4,');
    expect(product).toContain('now - lastTapAt.current <= 300');
    expect(product).toContain('scrollEnabled={!galleryZoomed}');
    expect(product).toContain('lens-gallery-zoom-image');
  });

  it('utilise des images réelles pour les couleurs et masque les sélecteurs inutiles', () => {
    expect(product).toContain('candidate.colorImages');
    expect(product).toContain("lensGallery(candidate, null, 'thumb')");
    expect(product).toContain('if (candidate.colors.length <= 1) return null');
    expect(product).toContain('if (values.length <= 1) return null');
    expect(product).not.toMatch(/backgroundColor:\s*color\b/);
  });

  it('met à jour le prix de la variante et garde une seule action panier signée', () => {
    expect(product).toContain('const pricedCandidate');
    expect(product).toContain('<LensPriceBlock candidate={pricedCandidate} />');
    expect(product).toContain('buildCartPayload');
    expect(product).toContain('addExternalToCart');
    expect(product).toContain('testID="lens-order"');
    expect(product).not.toContain('LensReviewForm');
    expect(product).not.toContain('WebView');
  });

  it('garde l’aide courte et strictement orientée prise de vue', () => {
    expect(help).toContain('const TIPS');
    expect(help.match(/key: 'lens\.help\.step/g)).toHaveLength(4);
    expect(help).not.toMatch(/estimate|verification|stock/i);
  });
});
