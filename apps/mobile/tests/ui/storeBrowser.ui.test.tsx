// Page boutique (ouverte depuis une carte Stores) :
// - Lecture automatique silencieuse dans la WebView à l'ouverture d'une fiche produit (aucun appel serveur).
// - Clic sur « Add to Cart » : ouverture immédiate de la feuille locale (tailles, couleurs, titre, quantité) sans appel serveur.
// - Clic pendant la lecture : le bouton reste en chargement, pas de second appel.
// - Confirmation dans la feuille : appel serveur (/product/resolve avec capture + variante + refresh: true) puis ajout (addAyWebsCartItem) avec spinner sur ce bouton seulement.
// - Refus à la confirmation (OUT_OF_STOCK, VARIANT_NOT_PROVEN, prix changé, CAPTURE_INCOMPLETE) : raison affichée, aucun ajout.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import StoreBrowserScreen from '../../app/aywebs/browser';
import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design/theme';
import { AYWEBS_CAPTURE_SAFETY_TIMEOUT_MS } from '@/features/aywebs/captureFlow';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const PRODUCT_URL = 'https://www.amazon.com/dp/B0000224VM';

const mockBack = jest.fn();
let mockParams: Record<string, string> = {
  url: 'https://www.amazon.com/',
  storeId: 'amazon',
  storeName: 'Amazon',
  capture: '0',
};

let latestWebViewProps: Record<string, unknown> = {};
const mockInjectJavaScript = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...args: unknown[]) => mockBack(...args), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));

jest.mock('react-native-webview', () => {
  const { View: RNView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  const WebView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    latestWebViewProps = props;
    React.useImperativeHandle(ref, () => ({
      goBack: () => undefined,
      goForward: () => undefined,
      injectJavaScript: (script: string) => mockInjectJavaScript(script),
    }));
    return React.createElement(RNView, { testID: 'webview' });
  });
  return { WebView, __esModule: true, default: WebView };
});

const mockAnalyzeAyWebsPage = jest.fn();
const mockFetchAyWebsCaptureScript = jest.fn();
const mockResolveAyWebsProductWithCapture = jest.fn();
const mockAddAyWebsCartItem = jest.fn();

jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('@/state/session', () => ({ useSession: () => ({ status: 'signedOut' }) }));
jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    analyzeAyWebsPage: (...args: unknown[]) => mockAnalyzeAyWebsPage(...args),
    fetchAyWebsCaptureScript: (...args: unknown[]) => mockFetchAyWebsCaptureScript(...args),
    resolveAyWebsProductWithCapture: (...args: unknown[]) => mockResolveAyWebsProductWithCapture(...args),
    addAyWebsCartItem: (...args: unknown[]) => mockAddAyWebsCartItem(...args),
  };
});

const SAMPLE_CAPTURE = {
  version: 1,
  url: PRODUCT_URL,
  title: 'Pull en laine mérinos',
  priceCandidates: [{ text: '$109.00', source: 'corePrice' }],
  amazon: {
    pageAsin: 'B0000224VM',
    selectedAsin: 'B0000224VM',
    options: [
      { dimension: 'color', value: 'Vert', asin: 'B0000224VM', selected: true, availabilityEvidence: 'available' },
      { dimension: 'color', value: 'Noir', asin: 'B00008I8YM', selected: false, availabilityEvidence: 'available' },
      { dimension: 'size', value: 'M', asin: 'B0000224VM', selected: true, availabilityEvidence: 'available' },
      { dimension: 'size', value: 'L', asin: 'B00008I8YM', selected: false, availabilityEvidence: 'available' },
    ],
    variants: [
      { asin: 'B0000224VM', selected: true, dimensions: [{ name: 'color', value: 'Vert' }, { name: 'size', value: 'M' }] },
      { asin: 'B00008I8YM', selected: false, dimensions: [{ name: 'color', value: 'Noir' }, { name: 'size', value: 'L' }] },
    ],
  },
};

function makeResolvedOutcome(overrides: Record<string, unknown> = {}) {
  return {
    product: {
      productId: 'ayw_prod_1',
      sourceUrl: PRODUCT_URL,
      normalizedUrl: PRODUCT_URL,
      storeId: 'amazon',
      storeName: 'Amazon',
      integrationType: 'SCRAPER',
      pageType: 'PRODUCT',
      title: 'Pull en laine mérinos',
      description: '',
      brand: 'Stanley',
      sku: 'B0000224VM',
      price: 109,
      currency: 'USD',
      priceVerified: true,
      currencyVerified: true,
      availability: { state: 'AVAILABLE', label: 'En stock', reason: 'in_stock' },
      images: ['https://m.media-amazon.com/images/I/pull.jpg'],
      variants: { colors: ['Vert', 'Noir'], sizes: ['M', 'L'], options: [] },
      variantGroups: [
        { attribute: 'color', values: ['Vert', 'Noir'] },
        { attribute: 'size', values: ['M', 'L'] },
      ],
      variantDetails: [],
      selectedVariant: { color: 'Vert', size: 'M' },
      selectedVariantDetail: null,
      weightKg: 0.4,
      category: 'apparel',
      confidence: 0.95,
      missingFields: [],
      ayroviPricing: {
        available: true,
        currency: 'TND',
        quantity: 1,
        unitBaseTnd: 340,
        productSubtotalTnd: 340,
        serviceFeeTnd: 34,
        shippingTnd: 20,
        customsTnd: 0,
        handlingTnd: 0,
        totalTnd: 394,
        depositPercent: 30,
        depositTnd: 118.2,
        balanceAtDeliveryTnd: 275.8,
        fxRateUsed: 3.12,
        fxSourceCurrency: 'USD',
        blockReason: '',
      },
      resolvedAt: '2026-10-20T12:00:00.000Z',
    },
    capture: {
      used: true,
      fingerprint: 'fp_1',
      priceSource: 'client_capture_corroborated',
      corroborated: true,
      rejection: '',
    },
    priceRejection: null,
    missing: [],
    quoteToken: 'aywq1.signed_quote_token',
    ...overrides,
  };
}

function renderBrowser() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
        <PrefsProvider>
          <I18nProvider>
            <ThemeProvider>
              <View style={{ flex: 1 }}>
                <StoreBrowserScreen />
              </View>
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

function emitPageReady(url = PRODUCT_URL) {
  const onNav = latestWebViewProps.onNavigationStateChange as ((state: Record<string, unknown>) => void) | undefined;
  act(() => {
    onNav?.({ url, loading: false, canGoBack: true, canGoForward: false, title: 'Pull en laine mérinos' });
  });
}

function emitWebViewCapture(capture: Record<string, unknown> = SAMPLE_CAPTURE) {
  const onMessage = latestWebViewProps.onMessage as ((event: { nativeEvent: { data: string } }) => void) | undefined;
  act(() => {
    onMessage?.({
      nativeEvent: {
        data: JSON.stringify(capture),
      },
    });
  });
}

describe('page boutique — barre AYWEBs du bas', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockInjectJavaScript.mockClear();
    mockAnalyzeAyWebsPage.mockReset();
    mockFetchAyWebsCaptureScript.mockReset();
    mockResolveAyWebsProductWithCapture.mockReset();
    mockAddAyWebsCartItem.mockReset();

    mockParams = {
      url: 'https://www.amazon.com/',
      storeId: 'amazon',
      storeName: 'Amazon',
      capture: '0',
    };
    mockAnalyzeAyWebsPage.mockResolvedValue({
      url: 'https://www.amazon.com/',
      storeId: 'amazon',
      storeName: 'Amazon',
      registered: true,
      browseAllowed: true,
      captureAllowed: false,
      externalCaptureAllowed: false,
      isProductPage: false,
      fallback: '',
    });
    mockFetchAyWebsCaptureScript.mockResolvedValue('/* capture script */');
  });

  it('la page s\'affiche avec la WebView', () => {
    renderBrowser();
    expect(screen.getByTestId('webview')).toBeTruthy();
  });

  it('la barre du bas est affichée : retour, avant, panier, favoris, Add to Cart', () => {
    renderBrowser();
    expect(screen.getByTestId('aywebs-store-back')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-forward')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-cart')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-fav')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-add-to-cart')).toBeTruthy();
  });

  it('le bouton fermer de l\'en-tête revient à l\'écran précédent', () => {
    renderBrowser();
    fireEvent.press(screen.getAllByLabelText('Fermer')[0]);
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('AYWEBs « Add to Cart » — lecture auto, feuille locale et confirmation serveur', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockInjectJavaScript.mockClear();
    mockAnalyzeAyWebsPage.mockReset();
    mockFetchAyWebsCaptureScript.mockReset();
    mockResolveAyWebsProductWithCapture.mockReset();
    mockAddAyWebsCartItem.mockReset();

    mockParams = {
      url: PRODUCT_URL,
      storeId: 'amazon',
      storeName: 'Amazon',
      capture: '1',
    };
    mockAnalyzeAyWebsPage.mockResolvedValue({
      url: PRODUCT_URL,
      storeId: 'amazon',
      storeName: 'Amazon',
      registered: true,
      browseAllowed: true,
      captureAllowed: true,
      externalCaptureAllowed: true,
      isProductPage: true,
      fallback: '',
    });
    mockFetchAyWebsCaptureScript.mockResolvedValue('/* capture script */');
  });

  it('lecture auto à l\'ouverture : le bouton tourne puis revient à « Add to Cart » normal, sans aucun appel serveur', async () => {
    renderBrowser();
    emitPageReady();

    // Pendant la lecture automatique dans la WebView : le bouton est en chargement (spinner visible).
    await waitFor(() => {
      expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    });
    const addBtnDuringRead = screen.getByTestId('aywebs-store-add-to-cart');
    expect(addBtnDuringRead.props.accessibilityState?.busy).toBe(true);
    expect(screen.getByTestId('aywebs-store-add-to-cart-busy', { includeHiddenElements: true })).toBeTruthy();

    // La WebView renvoie la capture : le bouton revient à « Add to Cart » normal.
    emitWebViewCapture(SAMPLE_CAPTURE);

    await waitFor(() => {
      const addBtnReady = screen.getByTestId('aywebs-store-add-to-cart');
      expect(addBtnReady.props.accessibilityState?.busy).toBe(false);
      expect(addBtnReady.props.accessibilityState?.disabled).toBe(false);
    });
    expect(screen.getByText('Add to Cart')).toBeTruthy();
    // AUCUN appel serveur pendant ni après la lecture automatique.
    expect(mockResolveAyWebsProductWithCapture).not.toHaveBeenCalled();
  });

  it('clic pendant la lecture : le bouton reste en chargement, pas de second appel', async () => {
    renderBrowser();
    emitPageReady();

    await waitFor(() => {
      expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    });
    const addBtn = screen.getByTestId('aywebs-store-add-to-cart');
    expect(addBtn.props.accessibilityState?.busy).toBe(true);

    // Clic pendant que la lecture est encore en cours : pas de 2e injection ni d'appel serveur.
    fireEvent.press(addBtn);
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockResolveAyWebsProductWithCapture).not.toHaveBeenCalled();
    expect(screen.queryByTestId('aywebs-sheet-confirm')).toBeNull();

    // Nettoyage : on termine la lecture en cours.
    emitWebViewCapture(SAMPLE_CAPTURE);
  });

  it('clic sur « Add to Cart » quand la capture est prête : la feuille s\'ouvre immédiatement avec tailles/couleurs/titre/quantité, sans appel serveur', async () => {
    renderBrowser();
    emitPageReady();

    await waitFor(() => expect(mockInjectJavaScript).toHaveBeenCalledTimes(1));
    emitWebViewCapture(SAMPLE_CAPTURE);

    await waitFor(() => {
      expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.busy).toBe(false);
    });

    // Clic sur « Add to Cart » : ouverture immédiate de la feuille locale.
    fireEvent.press(screen.getByTestId('aywebs-store-add-to-cart'));

    expect(screen.getByTestId('aywebs-sheet-confirm')).toBeTruthy();
    expect(screen.getAllByText('Pull en laine mérinos').length).toBeGreaterThan(0);
    expect(screen.getByTestId('aywebs-option-color-Vert')).toBeTruthy();
    expect(screen.getByTestId('aywebs-option-color-Noir')).toBeTruthy();
    expect(screen.getByTestId('aywebs-option-size-M')).toBeTruthy();
    expect(screen.getByTestId('aywebs-option-size-L')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();

    // Zéro appel serveur à l'ouverture de la feuille.
    expect(mockResolveAyWebsProductWithCapture).not.toHaveBeenCalled();
    expect(mockAddAyWebsCartItem).not.toHaveBeenCalled();
  });

  it('confirmation : appel serveur avec capture et variante choisie, spinner sur ce bouton seulement, puis ajout avec devis signé', async () => {
    let resolveServer!: (value: unknown) => void;
    mockResolveAyWebsProductWithCapture.mockImplementation(
      () => new Promise((resolve) => { resolveServer = resolve; }),
    );
    mockAddAyWebsCartItem.mockResolvedValue({
      item: {
        id: 'ayw_item_1',
        productId: 'ayw_prod_1',
        sourceUrl: PRODUCT_URL,
        storeId: 'amazon',
        storeName: 'Amazon',
        title: 'Pull en laine mérinos',
        images: ['https://m.media-amazon.com/images/I/pull.jpg'],
        variant: { color: 'Noir', size: 'L' },
        variantLabel: 'Noir / L',
        quantity: 2,
        unitPrice: 109,
        currency: 'USD',
        lineTotalTnd: 788,
        availability: 'AVAILABLE',
        status: 'ACTIVE',
      },
      ayrovi: { linked: true, reason: '' },
    });

    renderBrowser();
    emitPageReady();
    await waitFor(() => expect(mockInjectJavaScript).toHaveBeenCalledTimes(1));
    emitWebViewCapture(SAMPLE_CAPTURE);
    await waitFor(() => {
      expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.busy).toBe(false);
    });

    fireEvent.press(screen.getByTestId('aywebs-store-add-to-cart'));

    // Choix de la couleur Noir, de la taille L et de la quantité 2.
    fireEvent.press(screen.getByTestId('aywebs-option-color-Noir'));
    fireEvent.press(screen.getByTestId('aywebs-option-size-L'));
    fireEvent.press(screen.getByLabelText('+'));

    // Clic sur Confirmer dans la feuille.
    fireEvent.press(screen.getByTestId('aywebs-sheet-confirm'));

    // Pendant la confirmation : spinner sur le bouton de confirmation seulement, et le reste de la feuille est inactif.
    expect(screen.getByTestId('aywebs-sheet-confirm-busy', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('aywebs-option-color-Vert').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.busy).toBe(false);

    expect(mockResolveAyWebsProductWithCapture).toHaveBeenCalledTimes(1);
    expect(mockResolveAyWebsProductWithCapture).toHaveBeenCalledWith(
      PRODUCT_URL,
      expect.objectContaining({
        sessionId: 'mob_1234567890123456',
        storeId: 'amazon',
        capture: SAMPLE_CAPTURE,
        variant: { color: 'Noir', size: 'L' },
        quantity: 2,
        refresh: true,
      }),
    );

    // Le serveur répond avec la fiche validée et son devis signé.
    await act(async () => {
      resolveServer(makeResolvedOutcome());
    });

    await waitFor(() => {
      expect(mockAddAyWebsCartItem).toHaveBeenCalledTimes(1);
    });
    expect(mockAddAyWebsCartItem).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'ayw_prod_1',
        sourceUrl: PRODUCT_URL,
        storeId: 'amazon',
        variant: { color: 'Noir', size: 'L' },
        quantity: 2,
        capture: SAMPLE_CAPTURE,
        quoteToken: 'aywq1.signed_quote_token',
      }),
      { sessionId: 'mob_1234567890123456' },
    );
  });

  it('refus à la confirmation (OUT_OF_STOCK, VARIANT_NOT_PROVEN, prix changé, CAPTURE_INCOMPLETE) : raison claire affichée, aucun ajout au panier', async () => {
    renderBrowser();
    emitPageReady();
    await waitFor(() => expect(mockInjectJavaScript).toHaveBeenCalledTimes(1));
    emitWebViewCapture(SAMPLE_CAPTURE);
    await waitFor(() => {
      expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.busy).toBe(false);
    });

    fireEvent.press(screen.getByTestId('aywebs-store-add-to-cart'));

    // 1. Refus OUT_OF_STOCK
    mockResolveAyWebsProductWithCapture.mockResolvedValueOnce(
      makeResolvedOutcome({
        capture: { used: false, fingerprint: 'fp', priceSource: 'none', corroborated: false, rejection: 'OUT_OF_STOCK' },
      }),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('aywebs-sheet-confirm'));
    });
    expect(screen.getByText('Le marchand indique cet article épuisé.')).toBeTruthy();
    expect(mockAddAyWebsCartItem).not.toHaveBeenCalled();

    // 2. Refus VARIANT_NOT_PROVEN
    mockResolveAyWebsProductWithCapture.mockResolvedValueOnce(
      makeResolvedOutcome({
        capture: { used: false, fingerprint: 'fp', priceSource: 'none', corroborated: false, rejection: 'VARIANT_NOT_PROVEN' },
      }),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('aywebs-sheet-confirm'));
    });
    expect(
      screen.getByText('La variante choisie (prix ou disponibilité) n’est pas confirmée sur cette page.'),
    ).toBeTruthy();
    expect(mockAddAyWebsCartItem).not.toHaveBeenCalled();

    // 3. Refus changement de prix (PRICE_CHANGED)
    mockResolveAyWebsProductWithCapture.mockResolvedValueOnce(
      makeResolvedOutcome({
        priceRejection: 'PRICE_CHANGED',
      }),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('aywebs-sheet-confirm'));
    });
    expect(
      screen.getByText('Le prix a changé depuis la lecture de la fiche — vérifiez la fiche puis réessayez.'),
    ).toBeTruthy();
    expect(mockAddAyWebsCartItem).not.toHaveBeenCalled();

    // 4. Refus CAPTURE_INCOMPLETE (422 serveur)
    mockResolveAyWebsProductWithCapture.mockRejectedValueOnce(
      new ApiError('http', 'Capture incomplète', {
        status: 422,
        code: 'CAPTURE_INCOMPLETE',
        missingFields: ['title', 'price'],
      }),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('aywebs-sheet-confirm'));
    });
    expect(
      screen.getByText('Nous n’avons pas pu lire le titre et le prix de ce produit. Réessayez, ou ouvrez la fiche depuis la boutique.'),
    ).toBeTruthy();
    expect(mockAddAyWebsCartItem).not.toHaveBeenCalled();
  });

  it('filet de sécurité silencieux (20 s) : aucun compte à rebours visible, et le bouton sort du chargement si la WebView ne répond jamais', async () => {
    jest.useFakeTimers();
    try {
      renderBrowser();
      emitPageReady();

      await waitFor(() => expect(mockInjectJavaScript).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.busy).toBe(true);
      // Aucun compte à rebours visible à l'écran.
      expect(screen.queryByTestId('reading-countdown')).toBeNull();

      // Au bout de 20 s sans réponse de la WebView, le filet silencieux libère le bouton.
      act(() => {
        jest.advanceTimersByTime(AYWEBS_CAPTURE_SAFETY_TIMEOUT_MS);
      });

      await waitFor(() => {
        expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.busy).toBe(false);
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('Android WebView : quand onNavigationStateChange garde loading=true puis onLoadEnd se déclenche, la lecture auto démarre et la feuille s\'ouvre immédiatement au clic', async () => {
    renderBrowser();
    const onNav = latestWebViewProps.onNavigationStateChange as ((state: Record<string, unknown>) => void) | undefined;
    const onLoadEnd = latestWebViewProps.onLoadEnd as (() => void) | undefined;

    // Android WebView envoie loading: true pendant le chargement des sous-ressources, puis onLoadEnd.
    act(() => {
      onNav?.({ url: PRODUCT_URL, loading: true, canGoBack: true, canGoForward: false, title: 'Pull en laine mérinos' });
      onLoadEnd?.();
    });

    await waitFor(() => expect(mockInjectJavaScript).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.busy).toBe(true);

    emitWebViewCapture(SAMPLE_CAPTURE);

    await waitFor(() => {
      expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.busy).toBe(false);
    });

    // Même si Amazon émet une mise à jour d'ancre (#) sur la même fiche, la capture reste réutilisable.
    act(() => {
      onNav?.({ url: `${PRODUCT_URL}#customerReviews`, loading: false, canGoBack: true, canGoForward: false, title: 'Pull en laine mérinos' });
    });

    fireEvent.press(screen.getByTestId('aywebs-store-add-to-cart'));
    expect(screen.getByTestId('aywebs-sheet-confirm')).toBeTruthy();
    expect(mockResolveAyWebsProductWithCapture).not.toHaveBeenCalled();
  });
});
