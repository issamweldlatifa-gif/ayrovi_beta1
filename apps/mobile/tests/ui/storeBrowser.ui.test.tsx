// AYWEBs merchant browser: fixed option-selection action, with a live store cart count.
// The native WebView and server-backed sheets are mocked for deterministic UI tests.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import StoreBrowserScreen from '../../app/aywebs/browser';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...args: unknown[]) => mockBack(...args), replace: jest.fn(), canGoBack: () => true },
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
    React.useImperativeHandle(ref, () => ({ goBack: () => undefined, goForward: () => undefined, injectJavaScript: () => undefined }));
    return React.createElement(RNView, { testID: 'webview' });
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
        onPress: () => onAdded({ id: 'added-item' }, addedCart),
      }, React.createElement(Text, null, 'Confirm add')) : null
    ),
  };
});

jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    analyzeAyWebsPage: jest.fn(async () => ({
      url: 'https://www.amazon.com/', storeId: 'amazon', storeName: 'Amazon', registered: true,
      browseAllowed: true, captureAllowed: false, externalCaptureAllowed: false, isProductPage: false,
      captureInjection: 'on_demand', fallback: '',
    })),
    fetchAyWebsCart: jest.fn(async () => ({
      hasCart: false, items: [], groups: [],
      totals: { units: 0, productSubtotalTnd: null, currency: 'TND', blockedItems: 0, checkoutReady: false, unlinkedUnits: 0 },
      blockers: [],
    })),
  };
});

jest.mock('@/features/aywebs/captureFlow', () => {
  const actual = jest.requireActual('@/features/aywebs/captureFlow');
  return {
    ...actual,
    resolveAddToCart: jest.fn(async () => ({
      decision: { kind: 'sheet' },
      outcome: {
        product: {
          storeId: 'amazon', storeName: 'Amazon', title: 'Test product',
          price: 12, currency: 'EUR', sourceUrl: 'https://www.amazon.com/dp/test',
        },
        capture: null, priceRejection: null, missing: [], quoteToken: 'test-quote',
      },
      capture: undefined,
    })),
  };
});

function renderBrowser() {
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

describe('page boutique — actions intégrées AYWEBs', () => {
  beforeEach(() => mockBack.mockClear());

  it('affiche la WebView et le bouton jaune de sélection des options', () => {
    renderBrowser();
    expect(screen.getByTestId('webview')).toBeTruthy();
    expect(screen.getByText('Choisir les options')).toBeTruthy();
  });

  it('met le compteur à jour dès l’ajout et confirme en vert', async () => {
    renderBrowser();
    const button = await screen.findByTestId('aywebs-store-add-to-cart');
    await waitFor(() => expect(button.props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(button);

    fireEvent.press(await screen.findByTestId('aywebs-sheet-confirm-add'));
    await waitFor(() => {
      const badge = screen.getByTestId('aywebs-store-header-cart-count');
      expect(within(badge).getByText('3')).toBeTruthy();
    });
    expect(screen.getByTestId('aywebs-store-header-cart').props.accessibilityLabel).toBe('Panier (3)');
    expect(screen.getByText('Article ajouté')).toBeTruthy();
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

  it('la flèche de l’en-tête revient à l’écran précédent', () => {
    renderBrowser();
    fireEvent.press(screen.getByTestId('aywebs-store-header-back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
