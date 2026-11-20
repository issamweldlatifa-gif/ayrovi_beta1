jest.mock('@/state/session', () => ({ useSession: () => ({ status: 'signedOut', account: null }) }));
// AYWEBs merchant browser: fixed option-selection action, with a live store cart count.
// The native WebView and server-backed sheets are mocked for deterministic UI tests.
import { StyleSheet, TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { fetchAyWebsCaptureScript } from '@/api/aywebs';
import { STORE_BAR } from '@/design/tokens.mobile';
import { BRAND } from '@/design/tokens.generated';
import StoreBrowserScreen from '../../app/aywebs/browser';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockInjectJavaScript = jest.fn();
const PDP = 'https://www.amazon.com/dp/B012345678';
const ON_DEMAND = 'https://www.amazon.com/on-demand';
const STOREFRONT = 'https://www.amazon.com/';

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({
    url: 'https://www.amazon.com/',
    storeId: 'amazon',
    storeName: 'Amazon',
    capture: '0',
  }),
  Stack: { Screen: () => null },
}));

jest.mock('react-native-webview', () => {
  const { View: RNView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  const WebView = React.forwardRef((_props: Record<string, unknown>, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ goBack: () => undefined, goForward: () => undefined, injectJavaScript: mockInjectJavaScript }));
    return React.createElement(RNView, { testID: 'webview', onNavigationStateChange: _props.onNavigationStateChange, onLoadProgress: _props.onLoadProgress, onScroll: _props.onScroll, onMessage: _props.onMessage, onLoadStart: _props.onLoadStart, onLoadEnd: _props.onLoadEnd, onError: _props.onError });
  });
  return { WebView, __esModule: true, default: WebView };
});

jest.mock('@/features/aywebs/StoreSheets', () => {
  const React = jest.requireActual('react');
  const { View: RNView } = jest.requireActual('react-native');
  return {
    StoreCartSheet: ({ visible }: { visible: boolean }) => (
      visible ? React.createElement(RNView, { testID: 'aywebs-store-cart-sheet' }) : null
    ),
  };
});

jest.mock('@/features/aywebs/AddToCartSheet', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text } = jest.requireActual('react-native');
  const addedCart = {
    hasCart: true,
    items: [{ storeId: 'amazon', quantity: 2 }, { storeId: 'amazon', quantity: 1 }],
    groups: [],
    totals: { units: 3, productSubtotalTnd: null, currency: 'TND', blockedItems: 0, checkoutReady: false, unlinkedUnits: 3 },
    blockers: [],
  };
  return {
    AddToCartSheet: ({ visible, onAdded }: { visible: boolean; onAdded: (item: unknown, cart: unknown) => void }) => (
      visible ? React.createElement(Pressable, {
        testID: 'aywebs-sheet-confirm-add',
        onPress: () => onAdded({ id: 'added-item', images: ['https://img.example/perfume.png'], title: 'Eau de parfum', variantLabel: 'Contenance : 50 ml' }, addedCart),
      }, React.createElement(Text, null, 'Confirm add')) : null
    ),
  };
});

jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    analyzeAyWebsPage: jest.fn(async (url: string) => ({
      url, storeId: 'amazon', storeName: 'Amazon', registered: true,
      browseAllowed: true, captureAllowed: true, externalCaptureAllowed: false,
      isProductPage: /\/dp\//.test(url),
      captureInjection: url.endsWith('/on-demand') ? 'on_demand' : /\/dp\//.test(url) ? 'product_page' : 'never', fallback: '',
    })),
    fetchAyWebsCaptureScript: jest.fn(async () => 'true;'),
    fetchAyWebsCart: jest.fn(async () => ({
      hasCart: false, items: [], groups: [],
      totals: { units: 0, productSubtotalTnd: null, currency: 'TND', blockedItems: 0, checkoutReady: false, unlinkedUnits: 0 },
      blockers: [],
    })),
  };
});

function navigate(url: string, loading = false) {
  return act(async () => {
    fireEvent(screen.getByTestId('webview'), 'navigationStateChange', { url, loading, canGoBack: true });
  });
}

function message(payload: Record<string, unknown>) {
  fireEvent(screen.getByTestId('webview'), 'message', { nativeEvent: { data: JSON.stringify(payload) } });
}

function renderBrowser() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
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

describe('page boutique — actions intégrées AYWEBs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('affiche la WebView sans bouton ni barre sur accueil, recherche et rayon', async () => {
    renderBrowser();
    expect(screen.getByTestId('webview')).toBeTruthy();
    for (const url of [STOREFRONT, 'https://www.amazon.com/s?k=cafe', 'https://www.amazon.com/gp/browse.html']) {
      await navigate(url);
      expect(screen.queryByTestId('aywebs-store-footer')).toBeNull();
    }
    expect(fetchAyWebsCaptureScript).not.toHaveBeenCalled();
  });

  it('15/11 : après l’ajout, la feuille se ferme, le badge grimpe et une ligne confirme (pas de seconde feuille)', async () => {
    renderBrowser();
    await navigate(PDP);
    const button = await screen.findByTestId('aywebs-store-add-to-cart');
    await waitFor(() => expect(button.props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(button);
    await waitFor(() => expect(mockInjectJavaScript).toHaveBeenCalled());
    message({ v: 1, url: PDP, title: 'Eau de parfum', priceCandidates: [{ text: '12,00 €', source: 'dom' }], currencyText: 'EUR' });
    fireEvent.press(await screen.findByTestId('aywebs-sheet-confirm-add'));
    await waitFor(() => {
      const badge = screen.getByTestId('aywebs-store-header-cart-icon-badge');
      expect(within(badge).getByText('3')).toBeTruthy();
    });
    expect(screen.getByTestId('aywebs-store-header-cart').props.accessibilityLabel).toBe('Panier (3)');
    expect(screen.queryByTestId('aywebs-sheet-confirm-add')).toBeNull();
    expect(screen.getByTestId('aywebs-store-added-strip')).toBeTruthy();
    expect(screen.getByText('Ajouté au panier')).toBeTruthy();
    expect(screen.getByText('Eau de parfum')).toBeTruthy();
    expect(screen.getByText('Contenance : 50 ml')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-added-image', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByTestId('aywebs-store-added-go-to-cart'));
    expect(mockPush).toHaveBeenCalledWith('/panier');
  });

  it('en-tête jaune jusqu’au titre sombre et CTA jaune sur la fiche seulement', async () => {
    renderBrowser();
    const header = StyleSheet.flatten(screen.getByTestId('aywebs-store-header').props.style);
    expect(header.backgroundColor).toBe(STORE_BAR.background);
    expect(StyleSheet.flatten(screen.getByText('AYWEBs').props.style).color).toBe(BRAND.black);
    expect(StyleSheet.flatten(screen.getByTestId('aywebs-store-header-address').props.style).color).toBe(BRAND.black);
    expect(screen.getByTestId('aywebs-ask-clean-logo')).toBeTruthy();
    await navigate(PDP);
    const cta = StyleSheet.flatten((await screen.findByTestId('aywebs-store-add-to-cart')).props.style);
    expect([cta.backgroundColor, cta.borderColor]).toContain(BRAND.yellow);
  });

  it('16/11 : adresse = domaine de la page ouverte, suit les liens, NON modifiable ; ligne de progression', async () => {
    renderBrowser();
    expect(screen.getByTestId('aywebs-store-header-address').props.children).toBe('amazon.com');
    expect(screen.getByTestId('aywebs-store-header-title').findAllByType(TextInput)).toHaveLength(0);
    // Filet décoratif, masqué aux lecteurs d'écran : on le cherche donc parmi les éléments cachés.
    expect(screen.getByTestId('aywebs-store-progress', { includeHiddenElements: true })).toBeTruthy();
    await act(async () => {
      fireEvent(screen.getByTestId('webview'), 'navigationStateChange', {
        url: 'https://www.amazon.fr/dp/B0TEST', loading: false, canGoBack: true, canGoForward: false, title: '', navigationType: 'click',
      });
    });
    expect(screen.getByTestId('aywebs-store-header-address').props.children).toBe('amazon.fr');
    expect(screen.getByLabelText('AYWEBs · Adresse de la page : amazon.fr')).toBeTruthy();
    expect(screen.queryByTestId('aywebs-store-progress', { includeHiddenElements: true })).toBeNull();
  });

  it('retire la barre du bas et la demande de revue humaine', () => {
    renderBrowser();
    expect(screen.queryByTestId('aywebs-store-back')).toBeNull();
    expect(screen.queryByTestId('aywebs-store-forward')).toBeNull();
    expect(screen.queryByTestId('aywebs-store-cart')).toBeNull();
    expect(screen.queryByTestId('aywebs-store-fav')).toBeNull();
    expect(screen.queryByTestId('aywebs-store-request')).toBeNull();
    expect(screen.queryByText('Demander cet achat (revue humaine)')).toBeNull();
  });

  it('remplace le X par une icône panier qui ouvre le tiroir existant', () => {
    renderBrowser();
    fireEvent.press(screen.getByTestId('aywebs-store-header-cart'));
    expect(screen.getByTestId('aywebs-store-cart-sheet')).toBeTruthy();
    expect(screen.queryByLabelText('Fermer')).toBeNull();
  });

  it('garde l’en-tête et la capture fixes pendant le scroll, puis retire la capture à la navigation', async () => {
    renderBrowser();
    await navigate(PDP);
    await screen.findByTestId('aywebs-store-add-to-cart');
    for (const y of [50, 350, 25, 0]) {
      fireEvent.scroll(screen.getByTestId('webview'), { nativeEvent: { contentOffset: { y } } });
      expect(screen.getByTestId('aywebs-store-header')).toBeTruthy();
      expect(screen.getByText('Capturer cet article')).toBeTruthy();
    }
    await navigate(STOREFRONT, true);
    expect(screen.queryByTestId('aywebs-store-add-to-cart')).toBeNull();
    expect(screen.getByTestId('aywebs-store-header')).toBeTruthy();
  });

  it('reconnaît un produit sur une page à la demande sans lancer le lecteur avant le clic', async () => {
    renderBrowser();
    await navigate(ON_DEMAND);
    await waitFor(() => expect(mockInjectJavaScript).toHaveBeenCalled());
    const data = { type: 'aywebs-product-surface', nonce: 1, url: ON_DEMAND, product: true };
    expect(screen.queryByTestId('aywebs-store-add-to-cart')).toBeNull();
    message({ ...data, url: STOREFRONT });
    message({ ...data, nonce: 0 });
    expect(screen.queryByTestId('aywebs-store-add-to-cart')).toBeNull();
    message(data);
    expect(screen.getByTestId('aywebs-store-add-to-cart')).toBeTruthy();
    expect(fetchAyWebsCaptureScript).not.toHaveBeenCalled();
    message({ ...data, product: false });
    expect(screen.queryByTestId('aywebs-store-add-to-cart')).toBeNull();
  });

  it('la flèche de l’en-tête revient à l’écran précédent', () => {
    renderBrowser();
    fireEvent.press(screen.getByTestId('aywebs-store-header-back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
