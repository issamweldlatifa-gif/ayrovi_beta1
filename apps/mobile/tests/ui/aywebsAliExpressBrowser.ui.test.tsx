// Simulation bout-en-bout de la WebView AliExpress réelle :
//   • URL > 800 caractères avec paramètres pdp_npi / spm / utparam-url
//   • deep-link `aliexpress://` + `ERR_UNKNOWN_URL_SCHEME` + `ERR_ABORTED`
//   • messages parasites WindVane / Aplus sur `ReactNativeWebView.postMessage`
//   • mutation SPA `replaceState` pendant la lecture
// Résultat attendu : zéro « Lecture de la page impossible », zéro « Requête interrompue. »,
// ouverture directe de la feuille d'options AliExpress.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import StoreBrowserScreen from '../../app/aywebs/browser';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockInitialAeUrl =
  'https://www.aliexpress.com/item/1005008512345678.html'
  + '?spm=a2g0o.productlist.main.3.99887766abcdef'
  + '&pdp_npi=4%40dis%21EUR%2149.98%2122.49%21%21%21380.00%21171.00%21%40210389011730000000'
  + '&pdp_ext_f=%7B%22sku_id%22%3A%2212000045678901234%22%7D'
  + '&utparam-url=scene%3Asearch%7Cquery_from%3A' + 'a'.repeat(580);

type CapturedWebViewProps = {
  onShouldStartLoadWithRequest?: (req: { url: string }) => boolean;
  onNavigationStateChange?: (state: { url: string; loading: boolean; canGoBack: boolean }) => void;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  onError?: (event: { nativeEvent: { url?: string; code?: number; description?: string; isForMainFrame?: boolean } }) => void;
  onLoadEnd?: () => void;
};

let mockLatestWebViewProps: CapturedWebViewProps = {};
let mockInjectedCount = 0;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({
    url: mockInitialAeUrl,
    storeId: 'aliexpress',
    storeName: 'AliExpress',
    capture: '1',
  }),
  Stack: { Screen: () => null },
}));

jest.mock('react-native-webview', () => {
  const { View: RNView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  const WebView = React.forwardRef((props: CapturedWebViewProps, ref: unknown) => {
    mockLatestWebViewProps = props;
    React.useImperativeHandle(ref, () => ({
      goBack: () => undefined,
      goForward: () => undefined,
      injectJavaScript: () => {
        mockInjectedCount += 1;
      },
    }));
    return React.createElement(RNView, { testID: 'webview' });
  });
  return { WebView, __esModule: true, default: WebView };
});

jest.mock('@/features/aywebs/StoreSheets', () => ({
  StoreCartSheet: () => null,
}));

jest.mock('@/features/aywebs/VariantReader', () => {
  const React = jest.requireActual('react');
  return {
    VariantReader: React.forwardRef(() => null),
  };
});

jest.mock('@/features/aywebs/AddToCartSheet', () => {
  const React = jest.requireActual('react');
  const { Text, View: RNView } = jest.requireActual('react-native');
  return {
    AddToCartSheet: ({ visible, product }: { visible: boolean; product: { title: string } }) => (
      visible
        ? React.createElement(RNView, { testID: 'aywebs-opened-sheet' }, React.createElement(Text, null, product.title))
        : null
    ),
  };
});

jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_aliexpress_live_test' }));

jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    analyzeAyWebsPage: jest.fn(async (targetUrl: string) => ({
      url: targetUrl,
      storeId: 'aliexpress',
      storeName: 'AliExpress',
      registered: true,
      browseAllowed: true,
      captureAllowed: true,
      externalCaptureAllowed: false,
      isProductPage: true,
      captureInjection: 'product_page',
      fallback: '',
    })),
    fetchAyWebsCaptureScript: jest.fn(async () => '(function () { return "{}"; })();'),
    fetchAyWebsCart: jest.fn(async () => ({
      hasCart: false,
      items: [],
      groups: [],
      totals: { units: 0, productSubtotalTnd: null, currency: 'TND', blockedItems: 0, checkoutReady: false, unlinkedUnits: 0 },
      blockers: [],
    })),
  };
});

function renderAliExpressBrowser() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe('AYWEBs AliExpress WebView — zéro « Lecture impossible » et zéro « Requête interrompue »', () => {
  beforeEach(() => {
    mockLatestWebViewProps = {};
    mockInjectedCount = 0;
  });

  it('résiste aux deep-links aliexpress://, aux messages WindVane/Aplus, aux redirections m./fr. et ouvre la feuille', async () => {
    renderAliExpressBrowser();

    const button = await screen.findByTestId('aywebs-store-add-to-cart');
    await waitFor(() => expect(button.props.accessibilityState?.disabled).toBe(false));

    // 1. AliExpress tente d'ouvrir l'application native `aliexpress://` et déclenche ERR_UNKNOWN_URL_SCHEME + ERR_ABORTED
    act(() => {
      const allowed = mockLatestWebViewProps.onShouldStartLoadWithRequest?.({
        url: 'aliexpress://product/detail?itemId=1005008512345678',
      });
      expect(allowed).toBe(false);
      mockLatestWebViewProps.onError?.({
        nativeEvent: {
          url: 'aliexpress://product/detail?itemId=1005008512345678',
          code: -10,
          description: 'net::ERR_UNKNOWN_URL_SCHEME',
          isForMainFrame: true,
        },
      });
      mockLatestWebViewProps.onError?.({
        nativeEvent: {
          url: mockInitialAeUrl,
          code: -3,
          description: 'net::ERR_ABORTED',
          isForMainFrame: true,
        },
      });
    });

    expect(screen.queryByText(/Lecture de la page impossible/i)).toBeNull();
    expect(screen.queryByText(/Requête interrompue/i)).toBeNull();

    // 2. AliExpress redirige vers `fr.aliexpress.com` et envoie du bruit WindVane / Aplus sur postMessage
    act(() => {
      mockLatestWebViewProps.onNavigationStateChange?.({
        url: 'https://fr.aliexpress.com/item/1005008512345678.html?spm=a2g0o.detail.0.0.112233&_t=1730000111',
        loading: false,
        canGoBack: false,
      });
      mockLatestWebViewProps.onMessage?.({ nativeEvent: { data: 'windvane://HybridBridge:ready' } });
      mockLatestWebViewProps.onMessage?.({ nativeEvent: { data: '{"type":"aplus_pv","spm":"a2g0o.detail"}' } });
    });

    expect(screen.queryByText(/Lecture de la page impossible/i)).toBeNull();
    expect(screen.queryByText(/Requête interrompue/i)).toBeNull();

    // 3. Le client appuie sur « Choisir les options » pendant qu'AliExpress réécrit encore ses query-params
    fireEvent.press(button);
    await waitFor(() => expect(mockInjectedCount).toBeGreaterThan(0));

    act(() => {
      mockLatestWebViewProps.onNavigationStateChange?.({
        url: 'https://m.aliexpress.com/item/1005008512345678.html?gatewayAdapt=glo2fra&pdp_npi=mutated_again',
        loading: false,
        canGoBack: false,
      });
    });

    // 4. La capture nettoyée revient avec l'URL courte de la même fiche
    act(() => {
      mockLatestWebViewProps.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            v: 1,
            url: 'https://fr.aliexpress.com/item/1005008512345678.html?sku_id=12000045678901234',
            title: 'Écouteurs Sans Fil Bluetooth 5.4 ANC',
            priceCandidates: [{ text: '22,49 €', source: 'embedded_json' }],
            currencyText: 'EUR',
            availabilityText: 'InStock',
            addToCartText: 'Ajouter au panier',
            variantGroups: [
              {
                name: 'Couleur',
                values: ['Noir', 'Blanc'],
                selected: ['Noir'],
                options: [
                  { value: 'Noir', available: true, price: '22,49 €', image: 'https://ae01.alicdn.com/kf/S222/noir.jpg' },
                  { value: 'Blanc', available: true, price: '22,49 €', image: 'https://ae01.alicdn.com/kf/S333/blanc.jpg' },
                ],
              },
            ],
            images: ['https://ae01.alicdn.com/kf/S111/main.jpg'],
            capturedAt: new Date().toISOString(),
            aliexpress: {
              readerVersion: 2,
              pageItemId: '1005008512345678',
              selectedSkuId: '12000045678901234',
              skus: [
                { skuId: '12000045678901234', attributes: { Couleur: 'Noir' }, price: '22,49 €', available: true, stock: 25 },
                { skuId: '12000045678901235', attributes: { Couleur: 'Blanc' }, price: '22,49 €', available: true, stock: 12 },
              ],
            },
          }),
        },
      });
    });

    expect(await screen.findByTestId('aywebs-opened-sheet')).toBeTruthy();
    expect(screen.getByText('Écouteurs Sans Fil Bluetooth 5.4 ANC')).toBeTruthy();
    expect(screen.queryByText(/Lecture de la page impossible/i)).toBeNull();
    expect(screen.queryByText(/Requête interrompue/i)).toBeNull();
  });
});
