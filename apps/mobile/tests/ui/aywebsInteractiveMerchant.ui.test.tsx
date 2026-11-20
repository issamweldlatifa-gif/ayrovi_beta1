import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { AyWebsResolvedProduct } from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
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

function setup(storeId: 'amazon' | 'zalando' | 'shein' | 'temu' | 'aliexpress' | 'sephora', withMatrix = false, readFails = false) {
  const url = {
    amazon: 'https://www.amazon.fr/dp/B012345678',
    zalando: 'https://www.zalando.fr/running-shoe-ni121d0a2-q11.html',
    shein: 'https://m.shein.com/fr/Robe-fleurie-p-382460229.html',
    temu: 'https://www.temu.com/fr/sweat-capuche-homme-g-601099512345678.html',
    aliexpress: 'https://www.aliexpress.com/item/1005008811223344.html',
    sephora: 'https://www.sephora.fr/p/soin-P123456.html',
  }[storeId];
  const product: AyWebsResolvedProduct = {
    productId: 'test-product', storeId, storeName: storeId, sourceUrl: url,
    sourceDomain: new URL(url).hostname, title: 'Chaussure', brand: '', images: [],
    price: 25, currency: 'EUR', priceVerified: true, currencyVerified: true,
    availability: { state: 'AVAILABLE', reason: '', checkedAt: '', source: 'capture', quantityHint: null },
    purchaseMode: 'ASSISTED', integrationType: 'PARTIALLY_SUPPORTED',
    zayroviPricing: { totalTnd: 100, pricingVersion: 1, breakdown: null },
    variantGroups: [{ attribute: 'size', values: ['38', '39', '40'] }],
    variantDetails: [], variantQuotes: [], fromCache: false, cacheAgeMs: null,
  };
  const capture = { v: 1, url, title: 'Chaussure', images: [],
    selectedVariantTexts: ['38'],
    variantGroups: [{ name: 'size', values: ['38', '39', '40'], selected: ['38'],
      options: [{ value: '38', available: true }, { value: '39', available: true }, { value: '40', available: false }] }] };
  const siblingUrl = storeId === 'amazon' ? 'https://www.amazon.fr/dp/B012345679' : 'https://www.zalando.fr/running-shoe-ni121d0a2-q12.html';
  const siblingCapture = { ...capture, url: siblingUrl, selectedVariantTexts: ['39'] };
  const readVariant = jest.fn(async () => {
    if (readFails) throw new Error('reader unavailable');
    return siblingCapture;
  });
  const offerCapture = withMatrix ? { ...capture, variantMatrix: [{ attributes: { size: '39' }, available: true,
    variantId: storeId === 'amazon' ? 'asin:B012345679' : 'NI121D0A2-Q12', variantUrl: siblingUrl }] } : capture;
  mockResolve.mockImplementation(async (_url, opts) => ({
    product: withMatrix && opts?.variant?.size === '39' ? { ...product, zayroviPricing: { totalTnd: 120, pricingVersion: 1, breakdown: null } } : product,
    quoteToken: 'server-signed-token', missing: [], capture: { used: Boolean(opts?.capture) }, variant: opts?.variant,
  }));
  mockAdd.mockResolvedValue({
    item: { id: 'line', productId: 'test-product', images: [], quantity: 1, variantLabel: '39', unitPrice: 25, currency: 'EUR' },
    cart: { totals: { units: 1 } }, zayrovi: { linked: true },
  });
  render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <PrefsProvider><I18nProvider><ThemeProvider>
      <AddToCartSheet visible local sessionId="mob_interactive_session_123" product={product} capture={offerCapture} readVariant={readVariant} onClose={() => undefined} />
    </ThemeProvider></I18nProvider></PrefsProvider>
  </SafeAreaProvider>);
  return { readVariant, siblingUrl, siblingCapture };
}

describe.each(['amazon', 'zalando', 'shein', 'temu', 'aliexpress', 'sephora'] as const)('%s interactive sheet', (storeId) => {
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


describe.each(['amazon', 'zalando'] as const)('%s offer verification', (storeId) => {
  beforeEach(() => { mockResolve.mockReset(); mockAdd.mockReset(); clearVariantMatrixCache(); });
  it.each([false, true])('resolves the exact sibling without borrowing the original page capture (read fails: %s)', async (readFails) => {
    const { readVariant, siblingUrl, siblingCapture } = setup(storeId, true, readFails);
    await waitFor(() => expect(mockResolve).toHaveBeenCalled());
    fireEvent.press(screen.getByTestId('aywebs-choice-size'));
    fireEvent.press(screen.getByTestId('aywebs-choice-size-39'));
    await waitFor(() => expect(readVariant).toHaveBeenCalledWith(siblingUrl));
    await waitFor(() => expect(screen.getAllByText(/120[,.]00/).length).toBeGreaterThan(0));
    const call = mockResolve.mock.calls.find(([, opts]) => opts?.variant?.size === '39');
    expect(call?.[0]).toBe(siblingUrl);
    expect(call?.[1].capture).toEqual(readFails ? undefined : siblingCapture);
  });
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
