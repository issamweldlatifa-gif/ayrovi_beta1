// AYWEBs merchant browser: fixed Add to Cart action, with cart at the top.
// The native WebView and store-cart sheet are mocked for deterministic UI tests.
import { fireEvent, render, screen } from '@testing-library/react-native';
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

jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    analyzeAyWebsPage: jest.fn(async () => ({
      url: 'https://www.amazon.com/', storeId: 'amazon', storeName: 'Amazon', registered: true,
      browseAllowed: true, captureAllowed: false, externalCaptureAllowed: false, isProductPage: false,
      fallback: '',
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

  it('affiche la WebView et conserve le bouton jaune Add to Cart', () => {
    renderBrowser();
    expect(screen.getByTestId('webview')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-add-to-cart')).toBeTruthy();
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
