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

function contrastWithWhite(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return 1.05 / (luminance + 0.05);
}

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
    expect(lens).toContain('<SearchSheet geometry={sheet}>');
    expect(lens).toContain('PanResponder.create');
    expect(lens).toContain('top: expandedTop');
    expect(lens).toContain('onMoveShouldSetPanResponderCapture');
    // Fluide : on la saisit de n'importe où, elle garde l'élan du doigt, et la
    // liste signale son défilement pour rendre la main à la feuille tout en haut.
    expect(lens).toContain('lensSheetOwnsPan(position.current, scrollY.current, gesture.dx, gesture.dy)');
    expect(lens).toContain('gesture.vy * 1000');
    expect(lens).toContain('<LensSheetScrollContext.Provider value={onListScroll}>');
    expect(grid).toContain('onScroll={onSheetScroll}');
    expect(lens).not.toContain('liftResponder');
    expect(lens).toContain('testID="lens-search-sheet-handle"');
    expect(lens).toContain('<LensSearchSkeleton onCancel={cancelSearch}');
    expect(lens).toContain('removePrivateCapture');
    expect(lens).toContain('if (file.exists) file.delete()');
  });
});

describe('chargement et résultats Lens', () => {
  it('charge avec quatre cartes grises à deux colonnes plutôt qu’un panneau vide', () => {
    expect(skeleton).toContain('[0, 1, 2, 3]');
    expect(skeleton).toContain('lens-skeleton-card-');
    expect(skeleton).toContain('flexWrap: \'wrap\'');
    expect(skeleton).toContain('const GRID_GAP = 4');
    expect(skeleton).toContain("width: '49.3%'");
    expect(skeleton).toContain('minOpacity={0.48}');
    expect(skeleton).toContain("t('common.cancel')");
    expect(skeleton).not.toContain('ActivityIndicator');
  });

  it('virtualise une grille commerciale compacte à deux colonnes avec favoris', () => {
    expect(grid).toContain('<FlatList');
    expect(grid).toContain('numColumns={2}');
    expect(grid).toContain('removeClippedSubviews');
    expect(card).toContain('numberOfLines={2}');
    expect(card).toContain('lens-favorite-');
    expect(card).toContain('event.stopPropagation()');
    expect(card).toContain('aspectRatio: 4 / 5');
    expect(card).toContain('candidate.brand?.trim() || candidate.source.trim()');
    expect(card).not.toContain('cardOptions');
  });

  it('réserve le rouge aux baisses de prix, le violet au favori coché, le violet clair au mode choisi, le noir aux minuteurs et aux étoiles', () => {
    expect(palette).toContain("export { LENS_COLORS } from '@/design/tokens.mobile'");
    // Palette Lens fermée, entièrement dérivée de la marque (sauf le rouge de prix).
    expect(nativeTokens).toContain("const PRICE_DROP_RED = '#CF1322'");
    expect(nativeTokens).toContain('sale: PRICE_DROP_RED');
    expect(nativeTokens).toContain('active: BRAND.violet');
    expect(nativeTokens).toContain('star: BRAND.black');
    expect(nativeTokens).toContain('skeleton: BRAND.lightGray');
    expect(contrastWithWhite('#CF1322')).toBeGreaterThanOrEqual(4.5);
    expect(contrastWithWhite('#571EF6')).toBeGreaterThanOrEqual(4.5);
    // Plus aucun dégradé d'attente : l'attente est le cercle en pointillés (LoadingSpinner).
    expect(nativeTokens).not.toContain('ACTION_GRADIENT');
    expect(nativeTokens).not.toContain('WAITING_GRADIENTS');
    expect(card).toContain('color={LENS_COLORS.star}');
    expect(card).toContain('backgroundColor: LENS_COLORS.sale');
    expect(card).toContain('favorite ? LENS_COLORS.active : LENS_COLORS.black');
    // Fiche produit : le cœur est posé À MÊME LA PHOTO (17/10/2026, plus de
    // pastille blanche) — il est donc blanc sur le média, violet une fois coché.
    expect(product).toContain('favorite ? LENS_COLORS.active : LENS_COLORS.white');
    // v4.2.0 : un minuteur est une information, pas une action — encre noire.
    expect(product).toContain('countdownExpired ? LENS_COLORS.sale : LENS_COLORS.black');
    expect(product).not.toContain('countdownExpired ? LENS_COLORS.sale : LENS_COLORS.active');
    expect(product).toContain('color={theme.colors.ink} accessibilityElementsHidden');
    // Mode caméra choisi : violet clair, libellé noir.
    expect(nativeTokens).toContain('activeSoft: BRAND.violetLight');
    expect(lens).toContain('modeActive: { backgroundColor: LENS_COLORS.activeSoft }');
    expect(lens).toContain('color={active ? LENS_COLORS.black : LENS_COLORS.white}');
    // Le viseur reste sombre dans les DEUX modes : `ink` devient blanc en mode sombre
    // et rendait l'en-tête blanc illisible.
    expect(lens).not.toContain('backgroundColor: theme.colors.ink');
    expect(lens).toContain('styles.previewFallback, { backgroundColor: LENS_COLORS.black }');
  });
});

describe('fiche produit Lens continue', () => {
  it('place un chrome progressif avant un seul défilement vertical et une grande galerie recouverte par la fiche', () => {
    const header = product.indexOf('styles.productHeader');
    const verticalScroll = product.indexOf('<Animated.ScrollView');
    expect(header).toBeGreaterThan(0);
    expect(verticalScroll).toBeGreaterThan(header);
    expect(product).toContain('const chromeOpacity = scrollY.interpolate');
    expect(product).toContain('Math.min(560, Math.round(width * 1.2))');
    expect(product).toContain('contentFit="contain"');
    expect(product).toContain('styles.detailsSheet');
    expect(product).toContain('marginTop: -SPACE[4]');
    expect(product).toContain('snapToOffsets={[0, expandedOffset]}');
    expect(product).toContain('snapToEnd={false}');
    expect(product).toContain('testID="lens-product-sheet-handle"');
  });

  it('propose balayage, pincement et double toucher dans la galerie plein écran', () => {
    expect(product).toContain('function ZoomableGalleryImage');
    expect(product).toContain('touches.length >= 2');
    expect(product).toContain('Math.min(4,');
    expect(product).toContain('now - lastTapAt.current <= 300');
    expect(product).toContain('scrollEnabled={!zoomed}');
    expect(product).toContain('lens-gallery-zoom-image');
  });

  it('utilise des images réelles pour les couleurs et masque les sélecteurs inutiles', () => {
    expect(product).toContain('candidate.colorImages');
    expect(product).toContain("lensGallery(candidate, null, 'thumb')");
    expect(product).toContain('if (candidate.colors.length <= 1) return null');
    expect(product).toContain('if (values.length <= 1) return null');
    expect(product).not.toMatch(/backgroundColor:\s*color\b/);
  });

  it('met à jour le prix de la variante et garde une seule action panier signée et guidée', () => {
    expect(product).toContain('const displayCandidate');
    expect(product).toContain('<LensPriceBlock candidate={displayCandidate}');
    expect(product).toContain('buildCartPayload');
    expect(product).toContain('addExternalToCart');
    expect(product).toContain('priceVerificationStatus: candidate.priceVerificationStatus');
    expect(product).not.toContain("selection.option.priceToken ? 'VERIFIED'");
    expect(product).toContain('setSizeOpenRequest');
    expect(product).toContain('disabledValues={sizeUnavailable}');
    expect(product).toContain('testID="lens-add-to-cart"');
    expect(product).toContain('styles.confirmationSheet');
    expect(product).not.toContain('LensReviewForm');
    expect(product).not.toContain('WebView');
  });

  it('garde description, caractéristiques, matière, coupe et entretien dans des accordéons fermés', () => {
    expect(product).toContain('const [open, setOpen] = useState(false)');
    expect(product).toContain('lens-accordion-description');
    expect(product).toContain('lens-accordion-characteristics');
    expect(product).toContain('lens-accordion-material');
    expect(product).toContain('lens-accordion-fit');
    expect(product).toContain('lens-accordion-care');
    expect(product).not.toContain('defaultOpen');
  });

  it('garde l’aide courte et strictement orientée prise de vue', () => {
    expect(help).toContain('const TIPS');
    expect(help.match(/key: 'lens\.help\.step/g)).toHaveLength(4);
    expect(help).not.toMatch(/estimate|verification|stock/i);
  });
});

describe('Z Lens — option 3 voulue par le client (16/10/2026)', () => {
  const menu = read('../src/features/lens/LensMenu.tsx');
  const selectionView = read('../src/features/lens/LensSelectionView.tsx');
  const liveOverlay = read('../src/features/lens/LensLiveOverlay.tsx');
  const fr = read('../src/i18n/fr.ts');

  it('titre « Z Lens » écrit en texte, quatre modes Live · QR code · Lien · Mot clé', () => {
    expect(lens).toContain("t('lens.title')");
    expect(lens).not.toContain('AYROVIX Lens</AppText>');
    expect(fr).toContain("'lens.title': 'Z Lens'");
    expect(fr).toContain("'lens.modeLive': 'Live'");
    expect(fr).toContain("'lens.modeCode': 'QR code'");
    expect(fr).toContain("'lens.modeLink': 'Lien'");
    expect(fr).toContain("'lens.modeText': 'Mot clé'");
  });

  it('panneau du bas : Galerie · déclencheur · OCEREX AU-DESSUS, barre des modes TOUT EN BAS', () => {
    const panel = lens.slice(lens.indexOf('testID="lens-panel"'));
    const gallery = panel.indexOf('testID="lens-gallery"');
    const shutter = panel.indexOf('testID="lens-capture"');
    const ocerex = panel.indexOf('testID="lens-open-ocerex"');
    const bar = panel.indexOf('styles.modePicker');
    expect(gallery).toBeGreaterThan(0);
    expect(shutter).toBeGreaterThan(gallery);
    expect(ocerex).toBeGreaterThan(shutter);
    expect(bar).toBeGreaterThan(ocerex);
    // Le déclencheur ressort nettement : 104 points contre 54 pour Galerie et OCEREX.
    expect(lens).toContain('const SHUTTER = 104;');
    expect(lens).toContain('const SIDE = 54;');
  });

  it('panneau du bas TRANSPARENT : la caméra plein écran reste visible derrière les boutons', () => {
    const marker = lens.indexOf('testID="lens-panel"');
    const panelTag = lens.slice(lens.lastIndexOf('<View', marker), marker);
    expect(panelTag).not.toContain('backgroundColor');
    expect(lens).toMatch(/<CameraView\s+ref=\{cameraRef\}\s+style=\{StyleSheet\.absoluteFill\}/);
  });

  it('menu ⋮ : Informations, Historique, Politique de confidentialité, Conditions d’utilisation, Produits interdits', () => {
    for (const key of ['lens.menu.info', 'lens.menu.history', 'lens.menu.privacy', 'lens.menu.terms', 'lens.menu.rules']) {
      expect(menu).toContain(`'${key}'`);
    }
    expect(lens).toContain("router.push('/legal/privacy')");
    expect(lens).toContain("router.push('/legal/terms')");
  });

  it('Live = repérage en direct par le serveur, déclenché quand le téléphone se stabilise', () => {
    expect(lens).toContain('detectProducts(');
    expect(lens).toContain('shouldDetect(');
    expect(lens).toContain("import('expo-sensors')");
    expect(lens).toContain('shutterSound: false');
    expect(lens).toContain('animateShutter={false}');
    expect(liveOverlay).toContain('productIndexAt(');
  });

  it('le cadre se pose sur le seul produit ou le plus grand, et suit le produit touché', () => {
    expect(lens).toContain('biggestProductIndex(products)');
    expect(lens).toContain('padBox(products[selected].box)');
    expect(lens).toContain("commit.kind === 'product'");
    expect(lens).toContain('const roi = toRoi(photo.selection)');
    expect(lens).toContain('{ roi, signal }');
    expect(selectionView).toContain('resizeSelection(');
    expect(selectionView).toContain('moveSelection(');
    expect(selectionView).toContain('productIndexAt(found, point)');
  });

  it('la galerie ouvre la galerie du client, plusieurs photos à la fois', () => {
    expect(lens).toContain('launchImageLibraryAsync');
    expect(lens).toContain('allowsMultipleSelection: true');
    expect(lens).toContain('selectionLimit: GALLERY_LIMIT');
  });
});
