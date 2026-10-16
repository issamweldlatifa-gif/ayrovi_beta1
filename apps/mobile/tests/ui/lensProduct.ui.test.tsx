import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LensCandidate, LensVariantOption } from '@/api/lens';
import { addExternalToCart } from '@/api/cart';
import { LensProductView } from '@/features/lens/LensProductView';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('@/api/cart', () => ({
  addExternalToCart: jest.fn(async () => ({
    cartItemId: 'line-1', totalItemsCount: 1, totalTND: 85, deliveryTND: 0,
    quoteExpiresAt: '2026-10-14T09:00:00.000Z', serverNow: '2026-10-14T08:30:00.000Z',
  })),
  fetchAyroviCart: jest.fn(async () => ({
    sessionId: 'mob_1234567890123456', serverNow: '2026-10-14T08:30:00.000Z', items: [],
    units: 0, productSubtotalTND: 0, deliveryTND: 0, totalTND: 0,
  })),
}));

const option = (over: Partial<LensVariantOption>): LensVariantOption => ({
  id: null,
  label: '',
  size: null,
  color: null,
  available: true,
  availability: 'available',
  price: null,
  currency: null,
  priceTnd: null,
  priceToken: null,
  ...over,
});

const candidate = (over: Partial<LensCandidate> = {}): LensCandidate => ({
  id: 'lens-ui-1',
  kind: 'external',
  title: 'Sac de voyage',
  promo: null,
  description: 'Un sac léger et solide.',
  brand: 'AYROVI',
  model: null,
  colors: ['Noir'],
  sizes: ['Standard'],
  source: 'merchant',
  sourceUrl: 'https://merchant.example/product/1',
  image: 'https://images.example/main.jpg',
  images: ['https://images.example/second.jpg'],
  colorImages: null,
  price: 25,
  currency: 'EUR',
  priceTnd: 85,
  originalPrice: null,
  originalPriceTnd: null,
  priceOrigin: 'merchant',
  availability: 'in_stock',
  availabilityCheckedAt: null,
  availabilityExpiresAt: null,
  sourceRead: null,
  sourceCondition: null,
  optionLabel: null,
  rating: 4.6,
  ratingCount: 21,
  ratingKind: 'merchant',
  match: null,
  offerCount: 0,
  offers: [],
  priceToken: 'signed-general',
  priceVerificationStatus: 'VERIFIED',
  variantOptions: [],
  ...over,
});

function wrap(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, right: 0, bottom: 16, left: 0 } }}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

/** Flou demandé aux images de la galerie (`expo-image` le reçoit en prop). */
function blurOfGallery(): number[] {
  const { Image: ExpoImage } = require('expo-image');
  return screen.UNSAFE_getAllByType(ExpoImage).map((node: Record<string, any>) => node.props.blurRadius ?? 0);
}

/** Opacité réelle d'une couche animée (valeur interne lue hors animation). */
function readOpacity(node: Record<string, any>): number {
  const style = node.props.style;
  const flat = Array.isArray(style) ? style.flat() : [style];
  for (const item of flat) {
    const opacity = (item as { opacity?: { __getValue?: () => number } } | undefined)?.opacity;
    if (opacity && typeof opacity.__getValue === 'function') return opacity.__getValue();
    if (typeof opacity === 'number') return opacity;
  }
  return Number.NaN;
}

describe('fiche produit Lens native', () => {
  beforeEach(() => {
    mockPush.mockClear();
    (addExternalToCart as jest.Mock).mockClear();
  });

  it('auto-sélectionne Standard et masque les contrôles à choix unique', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));

    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    expect(screen.queryByTestId('lens-option-selector')).toBeNull();
    expect(screen.queryByTestId('lens-color-0')).toBeNull();
    expect(screen.getByText(/Standard/)).toBeOnTheScreen();
    expect(screen.getByTestId('lens-add-to-cart')).toBeEnabled();
  });

  it('affiche les identités marchandes scrapées dans Caractéristiques (fiche Zalando)', async () => {
    render(wrap(<LensProductView
      candidate={candidate({ sku: 'LV040BM333', gtin: '6CA22S0GI-C11' })}
      onBack={() => {}}
    />));

    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('lens-accordion-characteristics'));
    expect(screen.getByText('Référence du modèle')).toBeOnTheScreen();
    expect(screen.getByText('LV040BM333')).toBeOnTheScreen();
    expect(screen.getByText('Code-barres')).toBeOnTheScreen();
    expect(screen.getByText('6CA22S0GI-C11')).toBeOnTheScreen();
  });

  it('ne double pas une référence déjà publiée par le marchand', async () => {
    const withMerchantRef = candidate({
      sku: 'LV040BM333',
      details: [{ key: 'productNumber', label: 'Référence du modèle', value: 'LV040BM333', section: 'details' }],
    });
    render(wrap(<LensProductView candidate={withMerchantRef} onBack={() => {}} />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('lens-accordion-characteristics'));
    expect(screen.getAllByText('LV040BM333')).toHaveLength(1);
  });

  it('affiche les signaux de fiche publiés par le marchand (Zalando)', async () => {
    render(wrap(<LensProductView candidate={candidate({
      sizeAdvice: 'Nous vous recommandons de choisir une taille au-dessus de celle habituelle.',
      modelInfo: 'Notre mannequin (190 cm) porte une taille XL',
      manufacturingInfo: 'Turquie',
      deliveryEstimate: '23 octobre-29 octobre',
      promoCountdown: '1j4h22m',
    })} onBack={() => {}} />));

    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    expect(screen.getByTestId('lens-model-info')).toBeOnTheScreen();
    expect(screen.getByText('Notre mannequin (190 cm) porte une taille XL')).toBeOnTheScreen();
    expect(screen.getByTestId('lens-size-advice')).toBeOnTheScreen();
    expect(screen.getByText('Nous vous recommandons de choisir une taille au-dessus de celle habituelle.')).toBeOnTheScreen();
    expect(screen.getByTestId('lens-merchant-countdown')).toBeOnTheScreen();
    expect(screen.getByText('1j4h22m')).toBeOnTheScreen();
    expect(screen.getByTestId('lens-merchant-delivery')).toBeOnTheScreen();
    expect(screen.getByText('23 octobre-29 octobre')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('lens-accordion-characteristics'));
    expect(screen.getByText('Informations sur la fabrication')).toBeOnTheScreen();
    expect(screen.getByText('Turquie')).toBeOnTheScreen();
  });

  it('ouvre une section Dimensions et une ligne de retours quand la fiche les publie', async () => {
    render(wrap(<LensProductView candidate={candidate({
      dimensionsInfo: '30 x 20 x 10 cm',
      returnsPolicy: 'Retours gratuits',
    })} onBack={() => {}} />));

    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    expect(screen.getByTestId('lens-merchant-returns')).toBeOnTheScreen();
    expect(screen.getByText('Retours gratuits')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('lens-accordion-dimensions'));
    expect(screen.getByText('30 x 20 x 10 cm')).toBeOnTheScreen();
  });

  it('n’ouvre aucune section Dimensions sans mesure publiée', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    expect(screen.queryByTestId('lens-accordion-dimensions')).toBeNull();
    expect(screen.queryByTestId('lens-merchant-returns')).toBeNull();
  });

  it('n’affiche aucun signal quand la page marchande n’en publie pas', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    expect(screen.queryByTestId('lens-model-info')).toBeNull();
    expect(screen.queryByTestId('lens-size-advice')).toBeNull();
    expect(screen.queryByTestId('lens-merchant-countdown')).toBeNull();
    expect(screen.queryByTestId('lens-merchant-delivery')).toBeNull();
  });

  it('ne traduit jamais un signal marchand en équivalence de taille chiffrée', async () => {
    render(wrap(<LensProductView candidate={candidate({
      sizeAdvice: 'Nous vous recommandons de choisir une taille au-dessus de celle habituelle.',
      modelInfo: 'Notre mannequin (190 cm) porte une taille XL',
    })} onBack={() => {}} />));

    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    const advice = within(screen.getByTestId('lens-size-advice'));
    expect(advice.getByText('Nous vous recommandons de choisir une taille au-dessus de celle habituelle.')).toBeOnTheScreen();
    expect(advice.queryByText(/38|40|42|44|46/)).toBeNull();
    expect(screen.queryByText(/taille équivalente/i)).toBeNull();
  });

  it('n’invente aucune identité quand la source n’en publie pas', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    expect(screen.queryByTestId('lens-accordion-characteristics')).toBeNull();
    expect(screen.queryByText('Référence du modèle')).toBeNull();
    expect(screen.queryByText('Code-barres')).toBeNull();
  });

  it('pose un en-tête transparent sur la photo : icônes blanches, aucune pastille', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();

    // Retour et panier sont posés à même la photo : l'encre (noire) est à 0.
    const backInk = screen.getByTestId('lens-header-back-ink');
    const cartInk = screen.getByTestId('lens-header-cart-ink');
    expect(readOpacity(backInk)).toBeCloseTo(0, 5);
    expect(readOpacity(cartInk)).toBeCloseTo(0, 5);

    // Photo nette, aucun brouillard au repos.
    expect(readOpacity(screen.getByTestId('lens-hero-haze'))).toBe(0);
    expect(blurOfGallery().every((value) => value === 0)).toBe(true);
  });

  it('transforme l’en-tête en bande pleine et voile la photo quand la fiche monte', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();

    const drawer = screen.getByTestId('lens-product-drawer');
    // Second cran atteint (et dépassé) : la fiche recouvre la photo, l'en-tête
    // est plein. Les interpolations sont bornées, donc une valeur large suffit.
    await act(async () => {
      fireEvent.scroll(drawer, { nativeEvent: { contentOffset: { y: 600, x: 0 }, layoutMeasurement: { width: 390, height: 844 }, contentSize: { width: 390, height: 1600 } } });
    });

    expect(readOpacity(screen.getByTestId('lens-header-back-ink'))).toBeCloseTo(1, 5);
    expect(readOpacity(screen.getByTestId('lens-header-cart-ink'))).toBeCloseTo(1, 5);
    // Le brouillard monte et la photo se floute : la fiche passe DEVANT.
    expect(readOpacity(screen.getByTestId('lens-hero-haze'))).toBeGreaterThan(0);
    expect(blurOfGallery().some((value) => value > 0)).toBe(true);
  });

  it('présente les caractéristiques en grille : intitulé au-dessus, valeur dessous', async () => {
    render(wrap(<LensProductView
      candidate={candidate({
        details: [
          { key: 'length', label: 'Longueur', value: 'longueur standard', section: 'details' },
          { key: 'fit', label: 'Coupe', value: 'regular', section: 'details' },
          { key: 'collar', label: 'Forme du col', value: 'col rond', section: 'details' },
        ],
      })}
      onBack={() => {}}
    />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('lens-accordion-characteristics'));

    // Grille Zalando : deux cellules par rangée, libellé puis valeur en dessous.
    expect(screen.getByTestId('lens-fact-grid')).toBeOnTheScreen();
    // 3 caractéristiques → 2 rangées : [2 cellules] puis [1 cellule].
    expect(screen.getAllByTestId(/^lens-fact-cell-/)).toHaveLength(3);
    expect(screen.getByTestId('lens-fact-cell-0-0')).toBeOnTheScreen();
    expect(screen.getByTestId('lens-fact-cell-0-1')).toBeOnTheScreen();
    expect(screen.getByTestId('lens-fact-cell-1-0')).toBeOnTheScreen();
    expect(screen.getByText('Longueur')).toBeOnTheScreen();
    expect(screen.getByText('longueur standard')).toBeOnTheScreen();
    expect(screen.getByText('Forme du col')).toBeOnTheScreen();
  });

  it('ouvre un guide des tailles qui n’invente aucune équivalence', async () => {
    render(wrap(<LensProductView
      candidate={candidate({ sizes: ['40', '41', '42'], colors: ['Noir'] })}
      onBack={() => {}}
    />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    expect(screen.queryByTestId('lens-size-guide-sheet')).toBeNull();

    fireEvent.press(await screen.findByTestId('lens-open-size-guide'));
    const sheet = await screen.findByTestId('lens-size-guide-sheet');
    expect(sheet).toBeOnTheScreen();
    // Les tailles affichées sont celles du marchand, une par une, sans conversion inventée.
    expect(screen.getByTestId('lens-size-guide-sizes')).toBeOnTheScreen();
    expect(screen.getByText('40')).toBeOnTheScreen();
    expect(screen.getByText('42')).toBeOnTheScreen();
    // La méthode générale est annoncée comme telle (aucune donnée inventée).
    expect(screen.getByText(/Méthode générale/)).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('lens-size-guide-close'));
    await waitFor(() => expect(screen.queryByTestId('lens-size-guide-sheet')).toBeNull());
  });

  it('montre le cercle d’attente tant que la photo n’existe pas, puis s’efface', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    // Pas de rectangle muet : l'attente est le cercle en pointillés ZAYROVI.
    expect(screen.getByTestId('lens-hero-waiting')).toBeOnTheScreen();

    const images = screen.UNSAFE_getAllByType(require('expo-image').Image);
    await act(async () => { images[0].props.onLoad?.(); });
    await waitFor(() => expect(screen.queryByTestId('lens-hero-waiting')).toBeNull());
  });

  it('ouvre la photo en plein écran sur une pression, et la referme au bouton', async () => {
    render(wrap(<LensProductView candidate={candidate({ images: ['https://images.example/third.jpg'] })} onBack={() => {}} />));
    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    expect(screen.queryByTestId('lens-gallery-viewer')).toBeNull();

    fireEvent.press(screen.getByTestId('lens-gallery-zoom-image'));
    // La pression simple laisse la fenêtre du double geste avant d'ouvrir.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 380)); });
    expect(await screen.findByTestId('lens-gallery-viewer')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('lens-gallery-viewer-close'));
    await waitFor(() => expect(screen.queryByTestId('lens-gallery-viewer')).toBeNull());
  });

  it('change la galerie et le prix avec les vrais choix image/variante', async () => {
    const product = candidate({
      colors: ['Rouge', 'Bleu'],
      sizes: ['M', 'L'],
      colorImages: {
        Rouge: ['https://images.example/red.jpg'],
        Bleu: ['https://images.example/blue.jpg'],
      },
      variantOptions: [
        option({ id: 'red-m', label: 'Rouge · M', color: 'Rouge', size: 'M', price: 29, currency: 'EUR', priceTnd: 99, priceToken: 'signed-red-m' }),
        option({ id: 'red-l', label: 'Rouge · L', color: 'Rouge', size: 'L', price: 31, currency: 'EUR', priceTnd: 105, priceToken: 'signed-red-l' }),
        option({ id: 'blue-m', label: 'Bleu · M', color: 'Bleu', size: 'M', price: 30, currency: 'EUR', priceTnd: 101, priceToken: 'signed-blue-m' }),
        option({ id: 'blue-l', label: 'Bleu · L', color: 'Bleu', size: 'L', price: 32, currency: 'EUR', priceTnd: 108, priceToken: 'signed-blue-l' }),
      ],
    });
    render(wrap(<LensProductView candidate={product} onBack={() => {}} />));

    const red = await screen.findByTestId('lens-color-0');
    fireEvent.press(red);
    await waitFor(() => expect(screen.getByTestId('lens-color-0').props.accessibilityState.selected).toBe(true));

    fireEvent.press(screen.getByTestId('lens-option-selector'));
    fireEvent.press(await screen.findByText('M'));
    expect(await screen.findByText('99.00 TND')).toBeOnTheScreen();

    const heroMedia = screen.getByTestId('lens-product-image-media', { includeHiddenElements: true });
    expect(JSON.stringify(heroMedia.props.source)).toContain(encodeURIComponent('https://images.example/red.jpg'));
  });

  it('désactive une variante réellement indisponible dans le sélecteur', async () => {
    const product = candidate({
      sizes: ['M', 'L'],
      colors: ['Noir'],
      variantOptions: [
        option({ id: 'm', label: 'M', size: 'M', color: 'Noir', available: false, availability: 'unavailable' }),
        option({ id: 'l', label: 'L', size: 'L', color: 'Noir', price: 26, currency: 'EUR', priceTnd: 88, priceToken: 'signed-l' }),
      ],
    });
    render(wrap(<LensProductView candidate={product} onBack={() => {}} />));

    fireEvent.press(await screen.findByTestId('lens-add-to-cart'));
    expect(await screen.findByTestId('lens-option-0')).toBeDisabled();
    expect(screen.getByTestId('lens-option-1')).toBeEnabled();
  });

  it('désactive les tailles incompatibles avec la couleur choisie', async () => {
    const product = candidate({
      sizes: ['M', 'L'],
      colors: ['Rouge', 'Bleu'],
      variantOptions: [
        option({ id: 'red-l', label: 'Rouge · L', size: 'L', color: 'Rouge', price: 26, currency: 'EUR', priceTnd: 88, priceToken: 'signed-red-l' }),
        option({ id: 'blue-m', label: 'Bleu · M', size: 'M', color: 'Bleu', price: 25, currency: 'EUR', priceTnd: 85, priceToken: 'signed-blue-m' }),
      ],
    });
    render(wrap(<LensProductView candidate={product} onBack={() => {}} />));

    fireEvent.press(await screen.findByTestId('lens-color-0'));
    fireEvent.press(screen.getByTestId('lens-add-to-cart'));
    expect(await screen.findByTestId('lens-option-0')).toBeDisabled();
    expect(screen.getByTestId('lens-option-1')).toBeEnabled();
  });

  it('ouvre le choix manquant depuis le CTA puis confirme sans forcer la caisse', async () => {
    const product = candidate({
      sizes: ['M', 'L'],
      colors: ['Noir'],
      variantOptions: [
        option({ id: 'm', label: 'M', size: 'M', color: 'Noir', price: 25, currency: 'EUR', priceTnd: 85, priceToken: 'signed-m' }),
        option({ id: 'l', label: 'L', size: 'L', color: 'Noir', price: 26, currency: 'EUR', priceTnd: 88, priceToken: 'signed-l' }),
      ],
    });
    render(wrap(<LensProductView candidate={product} onBack={() => {}} />));

    fireEvent.press(await screen.findByTestId('lens-add-to-cart'));
    fireEvent.press(await screen.findByText('M'));
    fireEvent.press(screen.getByTestId('lens-add-to-cart'));

    expect(await screen.findByText('Article ajouté au panier')).toBeOnTheScreen();
    expect(addExternalToCart).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText(/Prix valable encore/)).toBeOnTheScreen();
  });

  it('rend la grande galerie directement pincable et double-touchable', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));

    const zoomTarget = await screen.findByTestId('lens-gallery-zoom-image');
    expect(zoomTarget.props.accessibilityHint).toBe('Pincez ou touchez deux fois pour zoomer');
    expect(zoomTarget.props.accessibilityRole).toBe('imagebutton');
    expect(screen.getByTestId('lens-product-image-media', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('expose deux crans natifs et une poignée pour lever rapidement la fiche', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));

    const drawer = await screen.findByTestId('lens-product-drawer');
    expect(drawer.props.snapToOffsets).toHaveLength(2);
    expect(drawer.props.snapToOffsets[0]).toBe(0);
    expect(drawer.props.snapToOffsets[1]).toBeGreaterThan(250);
    expect(drawer.props.snapToEnd).toBe(false);
    expect(screen.getByTestId('lens-product-sheet-handle')).toBeOnTheScreen();
  });

  it('garde la description enrichie fermée puis la révèle à la demande', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));

    const description = await screen.findByTestId('lens-accordion-description');
    expect(description.props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByText('Un sac léger et solide.')).toBeNull();
    fireEvent.press(description);
    expect(await screen.findByText('Un sac léger et solide.')).toBeOnTheScreen();
    expect(screen.getByTestId('lens-accordion-description').props.accessibilityState.expanded).toBe(true);
  });
});
