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

function setup(storeId: 'amazon' | 'zalando', fastMatrix = false, rejectFast = false) {
  const readVariant = jest.fn(() => new Promise<Record<string, unknown>>(() => {}));
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
  const fastCapture = fastMatrix ? { ...capture, variantMatrix: [{ attributes: { size: '39' }, price: '30 EUR', available: true, variantId: 'asin:B012345679', variantUrl: 'https://www.amazon.fr/dp/B012345679' }] } : capture;
  mockResolve.mockImplementation(async (_url, opts) => ({
    product: fastMatrix && opts?.variant?.size === '39' ? { ...product, ayroviPricing: { totalTnd: 120, pricingVersion: 1, breakdown: null } } : product, quoteToken: 'server-signed-token', missing: [], capture: { used: !(rejectFast && opts?.variant?.size === '39') },
    variant: opts?.variant,
  }));
  mockAdd.mockResolvedValue({
    item: { id: 'line', productId: 'test-product', images: [], quantity: 1, variantLabel: '39', unitPrice: 25, currency: 'EUR' },
    cart: { totals: { units: 1 } }, ayrovi: { linked: true },
  });
  render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <PrefsProvider><I18nProvider><ThemeProvider>
      <AddToCartSheet visible local readOnlySelection={readOnlyStoreSelection(storeId)} sessionId="mob_interactive_session_123" product={product} capture={fastCapture} readVariant={readVariant} onClose={() => undefined} />
    </ThemeProvider></I18nProvider></PrefsProvider>
  </SafeAreaProvider>);
  return readVariant;
}

describe.each(['amazon', 'zalando'] as const)('%s interactive sheet', (storeId) => {
  beforeEach(() => { mockResolve.mockReset(); mockAdd.mockReset(); clearVariantMatrixCache(); });
  it('shows published sizes, disables sold out, sends the chosen size to server', async () => {
    setup(storeId);
    await waitFor(() => expect(screen.getByTestId('aywebs-choice-size')).toBeTruthy());
    fireEvent.press(screen.getByTestId('aywebs-choice-size'));
    expect(screen.getByTestId('aywebs-choice-size-40').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('aywebs-captured-selection-box')).toBeNull();
    fireEvent.press(screen.getByTestId('aywebs-choice-size-39'));
    expect(screen.getByTestId('aywebs-choice-size')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('aywebs-sheet-add')); });
    await waitFor(() => expect(mockAdd).toHaveBeenCalled());
    expect(mockAdd.mock.calls[0][0].variant).toMatchObject({ size: '39' });
  });
});


test('Amazon prices a published exact variant through the server without waiting for the hidden WebView', async () => {
  mockResolve.mockReset(); mockAdd.mockReset(); clearVariantMatrixCache();
  const readVariant = setup('amazon', true);
  await waitFor(() => expect(mockResolve).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId('aywebs-choice-size')).toBeTruthy());
  fireEvent.press(screen.getByTestId('aywebs-choice-size'));
  fireEvent.press(screen.getByTestId('aywebs-choice-size-39'));
  await waitFor(() => expect(mockResolve.mock.calls.some(([, options]) => options?.variant?.size === '39')).toBe(true));
  await waitFor(() => expect(screen.getAllByText(/120[,.]00/).length).toBeGreaterThan(0));
  expect(readVariant).not.toHaveBeenCalled();
});


test('Amazon falls back to the variant WebView when the server rejects the fast capture', async () => {
  mockResolve.mockReset(); mockAdd.mockReset(); clearVariantMatrixCache();
  const readVariant = setup('amazon', true, true);
  await waitFor(() => expect(mockResolve).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId('aywebs-choice-size')).toBeTruthy());
  fireEvent.press(screen.getByTestId('aywebs-choice-size'));
  fireEvent.press(screen.getByTestId('aywebs-choice-size-39'));
  await waitFor(() => expect(readVariant).toHaveBeenCalledWith('https://www.amazon.fr/dp/B012345679'));
});

test('Amazon ignores a late price after switching back to another size', async () => {
  mockResolve.mockReset(); mockAdd.mockReset(); clearVariantMatrixCache();
  setup('amazon', true);
  const original = mockResolve.getMockImplementation()!;
  let release: (() => void) | undefined;
  mockResolve.mockImplementation((url, opts) => {
    if (opts?.variant?.size !== '39') return original(url, opts);
    return new Promise((resolve) => { release = () => resolve(original(url, opts)); });
  });
  await waitFor(() => expect(screen.getByTestId('aywebs-choice-size')).toBeTruthy());
  fireEvent.press(screen.getByTestId('aywebs-choice-size'));
  fireEvent.press(screen.getByTestId('aywebs-choice-size-39'));
  await waitFor(() => expect(release).toBeDefined());
  fireEvent.press(screen.getByTestId('aywebs-choice-size'));
  fireEvent.press(screen.getByTestId('aywebs-choice-size-38'));
  await act(async () => { release!(); await Promise.resolve(); });
  expect(screen.queryAllByText(/120[,.]00/)).toHaveLength(0);
});
