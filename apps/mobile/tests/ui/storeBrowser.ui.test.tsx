// Page boutique (ouverte depuis une carte Stores) : la barre AYWEBs du bas est affichée
// et ses boutons répondent. WebView simulée (module natif absent en test).
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

jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('@/state/session', () => ({ useSession: () => ({ status: 'signedOut' }) }));
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

async function renderBrowser() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
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

describe('page boutique — barre AYWEBs du bas', () => {
  beforeEach(async () => mockBack.mockClear());

  it('la page s\'affiche avec la WebView', async () => {
    await renderBrowser();
    expect(screen.getByTestId('webview')).toBeTruthy();
  });

  it('la barre du bas est affichée : retour, avant, panier, favoris, Add to Cart', async () => {
    await renderBrowser();
    expect(screen.getByTestId('aywebs-store-back')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-forward')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-cart')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-fav')).toBeTruthy();
    expect(screen.getByTestId('aywebs-store-add-to-cart')).toBeTruthy();
  });

  it('le bouton fermer de l\'en-tête revient à l\'écran précédent', async () => {
    await renderBrowser();
    // Le premier « Fermer » est celui de l'en-tête (les tiroirs fermés en portent aussi un).
    await fireEvent.press(screen.getAllByLabelText('Fermer')[0]);
    expect(mockBack).toHaveBeenCalled();
  });
});
