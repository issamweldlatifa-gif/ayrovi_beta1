import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { AyWebsResolvedProduct } from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { readOnlyStoreSelection } from '@/features/aywebs/storeSheetMode';
import { clearVariantMatrixCache } from '@/features/aywebs/variantMatrixCache';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockResolve = jest.fn();
const mockAdd = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return { ...actual, fetchAyWebsVariants: jest.fn(),
    resolveAyWebsProductWithCapture: (...args: unknown[]) => mockResolve(...args),
    addAyWebsCartItem: (...args: unknown[]) => mockAdd(...args) };
});

function setup(storeId: 'amazon' | 'zalando') {
  const url = storeId === 'amazon' ? 'https://www.amazon.fr/dp/B012345678' : 'https://www.zalando.fr/running-shoe-ni121d0a2-q11.html';
  const product: AyWebsResolvedProduct = {
    productId: 'test-product', storeId, storeName: storeId, sourceUrl: url,
    sourceDomain: new URL(url).hostname, title: 'Chaussure', brand: '', images: [],
    price: 25, currency: 'EUR', priceVerified: true, currencyVerified: true,
    availability: { state: 'AVAILABLE', reason: '', checkedAt: '', source: 'capture', quantityHint: null },
    purchaseMode: 'ASSISTED', integrationType: 'PARTIALLY_SUPPORTED',
    ayroviPricing: { totalTnd: 100, pricingVersion: 1, breakdown: null },
    variantGroups: [{ attribute: 'size', values: ['38', '39', '40'] }],
    variantDetails: [], variantQuotes: [], fromCache: false, cacheAgeMs: null,
  };
  const capture = { v: 1, url, title: 'Chaussure', images: [],
    selectedVariantTexts: ['38'],
    variantGroups: [{ name: 'size', values: ['38', '39', '40'], selected: ['38'],
      options: [{ value: '38', available: true }, { value: '39', available: true }, { value: '40', available: false }] }] };
  mockResolve.mockImplementation(async (_url, opts) => ({
    product, quoteToken: 'server-signed-token', missing: [], capture: { used: true },
    variant: opts?.variant,
  }));
  mockAdd.mockResolvedValue({
    item: { id: 'line', productId: 'test-product', images: [], quantity: 1, variantLabel: '39', unitPrice: 25, currency: 'EUR' },
    cart: { totals: { units: 1 } }, ayrovi: { linked: true },
  });
  render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <PrefsProvider><I18nProvider><ThemeProvider>
      <AddToCartSheet visible local readOnlySelection={readOnlyStoreSelection(storeId)} sessionId="mob_interactive_session_123" product={product} capture={capture} onClose={() => undefined} />
    </ThemeProvider></I18nProvider></PrefsProvider>
  </SafeAreaProvider>);
}

describe.each(['amazon', 'zalando'] as const)('%s interactive sheet', (storeId) => {
  beforeEach(() => { mockResolve.mockReset(); mockAdd.mockReset(); clearVariantMatrixCache(); });
  it('shows published sizes, disables sold out, sends the chosen size to server', async () => {
    setup(storeId);
    await waitFor(() => expect(screen.getByTestId('aywebs-variant-size-1')).toBeTruthy());
    expect(screen.getByTestId('aywebs-variant-size-2').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('aywebs-captured-selection-box')).toBeNull();
    fireEvent.press(screen.getByTestId('aywebs-variant-size-1'));
    await act(async () => { fireEvent.press(screen.getByTestId('aywebs-sheet-add')); });
    await waitFor(() => expect(mockAdd).toHaveBeenCalled());
    expect(mockAdd.mock.calls[0][0].variant).toMatchObject({ size: '39' });
  });
});
