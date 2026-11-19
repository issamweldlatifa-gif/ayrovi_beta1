import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { addCatalogLook, type CatalogueLookInput } from '@/api/cart';
import { fetchCatalogProduct } from '@/api/catalog';
import { ApiError } from '@/api/errors';
import { LookSelectionSheet, type FeedLook } from '@/features/social-commerce/LookSelectionSheet';
import { ThemeProvider } from '@/design/theme';
import { PrefsProvider } from '@/state/prefs';
import { I18nProvider } from '@/i18n';

jest.mock('@/api/cart', () => ({ addCatalogLook: jest.fn() }));
jest.mock('@/api/catalog', () => ({ fetchCatalogProduct: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '0e7fa2c7-a67a-4b28-8dd0-58efc61f0197') }));
jest.mock('@/design/sheet/AppSheet', () => ({ AppSheet: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <>{children}{footer}</> }));

const cards = [
  { id: 'top', name: 'Veste', brand: '', image: '', currency: 'TND', available: true, stockStatus: 'AVAILABLE', price: 20 },
  { id: 'pants', name: 'Pantalon', brand: '', image: '', currency: 'TND', available: true, stockStatus: 'AVAILABLE', price: 30 },
] as const;
const look: FeedLook = { id: 'look-1', kind: 'look', title: 'Le look', description: '', image: '/media/look.webp', pins: cards.map(product => ({ x: 22, y: 33, product })) };
const add = jest.mocked(addCatalogLook);
const fetch = jest.mocked(fetchCatalogProduct);
const cartResult = { addedCount: 2, totalItemsCount: 3, replay: false };

beforeEach(() => {
  jest.clearAllMocks();
  fetch.mockImplementation(async id => {
    const card = cards.find(product => product.id === id)!;
    const sheet = { purchasable: true, dimensions: [], variants: [] } as unknown as NonNullable<Awaited<ReturnType<typeof fetch>> >['sheet'];
    if (id === 'pants' && sheet) {
      sheet.dimensions = [{ key: 'size', label: 'Taille', values: ['M', 'L', 'XL'].map(value => ({ value, available: value !== 'XL', stock: value === 'XL' ? 0 : 1 })) }];
      sheet.variants = ['M', 'L', 'XL'].map(size => ({ id: size, size, sku: size, color: '', available: size !== 'XL', stock: size === 'XL' ? 0 : 1, reason: size === 'XL' ? 'OUT_OF_STOCK' : null }));
    }
    return { id, name: card.name, finalPrice: card.price, sheet } as Awaited<ReturnType<typeof fetch>>;
  });
  add.mockResolvedValue(cartResult);
});

async function open(attempt: { current: CatalogueLookInput | null } = { current: null }) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const added = jest.fn();
  const view = render(<QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider>
    <LookSelectionSheet look={look} editionNumber={3} sessionId="look-session" attempt={attempt} onClose={jest.fn()} onAdded={added} onFeedChanged={jest.fn()} />
  </ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>);
  await screen.findByRole('button', { name: 'M' });
  return { added, view };
}

it('requires an available size and sends both lines in one canonical cart request', async () => {
  const { added } = await open();
  expect(screen.getByTestId('look-confirm')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'XL' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'M' }));
  fireEvent.press(screen.getByTestId('look-confirm'));
  await waitFor(() => expect(added).toHaveBeenCalledWith(3, 2));
  expect(add).toHaveBeenCalledTimes(1);
  expect(add).toHaveBeenCalledWith({ lookId: 'look-1', editionNumber: 3, requestId: '0e7fa2c7-a67a-4b28-8dd0-58efc61f0197', selections: [
    { productId: 'top', size: '', color: '', price: 20 }, { productId: 'pants', size: 'M', color: '', price: 30 },
  ] }, 'look-session');
});

it('keeps the original request and selections even after the sheet is reopened', async () => {
  add.mockRejectedValueOnce(new ApiError('network', 'No connection'));
  const attempt: { current: CatalogueLookInput | null } = { current: null };
  const first = await open(attempt);
  fireEvent.press(screen.getByRole('button', { name: 'M' }));
  fireEvent.press(screen.getByTestId('look-confirm'));
  await screen.findByRole('button', { name: 'Vérifier l’ajout' });
  expect(first.added).not.toHaveBeenCalled();
  first.view.unmount();
  const { added } = await open(attempt);
  expect(screen.getByRole('button', { name: 'L' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Vérifier l’ajout' }));
  await waitFor(() => expect(added).toHaveBeenCalledTimes(1));
  expect(add.mock.calls[0]).toEqual(add.mock.calls[1]);
  expect(attempt.current).toBeNull();
});
