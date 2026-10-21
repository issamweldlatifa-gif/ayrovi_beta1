// Page boutique (ouverte depuis une carte Stores) : la barre AYWEBs du bas est affichée
// et ses boutons répondent. WebView simulée (module natif absent en test).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import StoreBrowserScreen from '../../app/aywebs/browser';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.setTimeout(30_000);

const mockBack = jest.fn();
let mockWebProps: any;
const mockInject = jest.fn();
const mockResolve = jest.fn();
const mockScript = jest.fn();
const productUrl = 'https://www.amazon.com/dp/B012345678';
const mockOutcome = {
  product: { productId: 'p1', title: 'Tablet', sourceUrl: 'https://www.amazon.com/dp/B012345678',
    storeName: 'Amazon', price: 19.99, currency: 'USD', priceVerified: true, currencyVerified: true,
    variantDetails: [], images: [], ayroviPricing: null },
  missing: [], quoteToken: 'quote', capture: { used: true }, priceRejection: null,
};
jest.mock('@/features/aywebs/AddToCartSheet', () => ({
  AddToCartSheet: () => { const { View } = jest.requireActual('react-native'); return <View testID="options-sheet" />; },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...args: unknown[]) => mockBack(...args), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({
    url: 'https://www.amazon.com/dp/B012345678',
    storeId: 'amazon',
    storeName: 'Amazon',
    capture: '1',
  }),
  Stack: { Screen: () => null },
}));

jest.mock('react-native-webview', () => {
  const { View: RNView } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  const WebView = React.forwardRef((_props: Record<string, unknown>, ref: unknown) => {
    mockWebProps = _props;
    React.useImperativeHandle(ref, () => ({ goBack: () => undefined, goForward: () => undefined, injectJavaScript: mockInject }));
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
    fetchAyWebsCaptureScript: (...args: unknown[]) => mockScript(...args),
    resolveAyWebsProductWithCapture: (...args: unknown[]) => mockResolve(...args),
    analyzeAyWebsPage: jest.fn(async () => ({
      url: 'https://www.amazon.com/dp/B012345678', storeId: 'amazon', storeName: 'Amazon', registered: true,
      browseAllowed: true, captureAllowed: true, externalCaptureAllowed: false, isProductPage: true,
      fallback: '',
    })),
  };
});

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

async function flush() {
  await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
}
async function ready() {
  renderBrowser();
  await flush();
  await act(async () => mockWebProps.onNavigationStateChange({ url: productUrl, loading: false }));
  await flush();
}
function respond(script: string) {
  new Function('window', script)({ ReactNativeWebView: {
    postMessage: (data: string) => mockWebProps.onMessage({ nativeEvent: { data } }),
  } });
}

describe('AYWEBs loading lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockInject.mockReset();
    mockResolve.mockReset().mockResolvedValue(mockOutcome);
    mockScript.mockReset().mockResolvedValue('JSON.stringify({v:1, priceCandidates:[{text:"19.99 USD",source:"dom"}]})');
  });
  afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); });

  it('background prefetch does not disable Add; success opens options and clears loading', async () => {
    await ready();
    expect(mockInject).toHaveBeenCalledTimes(1);
    const button = () => screen.getByTestId('aywebs-store-add-to-cart');
    expect(button().props.accessibilityState?.disabled).not.toBe(true);
    fireEvent.press(button());
    await flush();
    await act(async () => respond(mockInject.mock.calls[0][0]));
    await flush();
    expect(screen.getByTestId('options-sheet')).toBeTruthy();
    expect(button().props.accessibilityState?.busy).not.toBe(true);
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  it('lost WebView reply releases the button; retry succeeds', async () => {
    await ready();
    fireEvent.press(screen.getByTestId('aywebs-store-add-to-cart'));
    await flush();
    await act(async () => { jest.advanceTimersByTime(15_000); });
    await flush();
    expect(screen.queryByTestId('options-sheet')).toBeNull();
    expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.disabled).not.toBe(true);
    mockInject.mockImplementation(respond);
    fireEvent.press(screen.getByTestId('aywebs-store-add-to-cart'));
    await flush();
    expect(screen.getByTestId('options-sheet')).toBeTruthy();
  });

  it('navigation discards old replies and cancels loading', async () => {
    await ready();
    const oldScript = mockInject.mock.calls[0][0];
    fireEvent.press(screen.getByTestId('aywebs-store-add-to-cart'));
    await flush();
    await act(async () => mockWebProps.onNavigationStateChange({ url: productUrl + '?page=2', loading: false }));
    await flush();
    await act(async () => respond(oldScript));
    await flush();
    expect(screen.queryByTestId('options-sheet')).toBeNull();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('a server promise that never settles has an overall deadline', async () => {
    mockResolve.mockImplementation(() => new Promise(() => {}));
    mockInject.mockImplementation(respond);
    await ready();
    fireEvent.press(screen.getByTestId('aywebs-store-add-to-cart'));
    await flush();
    await act(async () => { jest.advanceTimersByTime(60_000); });
    await flush();
    expect(screen.queryByTestId('options-sheet')).toBeNull();
    expect(screen.getByTestId('aywebs-store-add-to-cart').props.accessibilityState?.disabled).not.toBe(true);
  });
});
