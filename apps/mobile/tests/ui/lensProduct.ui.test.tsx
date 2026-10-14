import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LensCandidate, LensVariantOption } from '@/api/lens';
import { LensProductView } from '@/features/lens/LensProductView';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('@/api/cart', () => ({ addExternalToCart: jest.fn(async () => undefined) }));

const option = (over: Partial<LensVariantOption>): LensVariantOption => ({
  id: null,
  label: '',
  size: null,
  color: null,
  available: true,
  availability: 'available',
  price: null,
  currency: null,
  priceTnd: null,
  priceToken: null,
  ...over,
});

const candidate = (over: Partial<LensCandidate> = {}): LensCandidate => ({
  id: 'lens-ui-1',
  kind: 'external',
  title: 'Sac de voyage',
  promo: null,
  description: 'Un sac léger et solide.',
  brand: 'AYROVI',
  model: null,
  colors: ['Noir'],
  sizes: ['Standard'],
  source: 'merchant',
  sourceUrl: 'https://merchant.example/product/1',
  image: 'https://images.example/main.jpg',
  images: ['https://images.example/second.jpg'],
  colorImages: null,
  price: 25,
  currency: 'EUR',
  priceTnd: 85,
  originalPrice: null,
  originalPriceTnd: null,
  priceOrigin: 'merchant',
  availability: 'in_stock',
  availabilityCheckedAt: null,
  availabilityExpiresAt: null,
  sourceRead: null,
  sourceCondition: null,
  optionLabel: null,
  rating: 4.6,
  ratingCount: 21,
  ratingKind: 'merchant',
  match: null,
  offerCount: 0,
  offers: [],
  priceToken: 'signed-general',
  priceVerificationStatus: 'VERIFIED',
  variantOptions: [],
  ...over,
});

function wrap(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, right: 0, bottom: 16, left: 0 } }}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

describe('fiche produit Lens native', () => {
  beforeEach(() => mockPush.mockClear());

  it('auto-sélectionne Standard et masque les contrôles à choix unique', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));

    expect(await screen.findByTestId('lens-product-view')).toBeOnTheScreen();
    expect(screen.queryByTestId('lens-option-selector')).toBeNull();
    expect(screen.queryByTestId('lens-color-0')).toBeNull();
    expect(screen.queryByText('Standard')).toBeNull();
    expect(screen.getByTestId('lens-order')).toBeEnabled();
  });

  it('change la galerie et le prix avec les vrais choix image/variante', async () => {
    const product = candidate({
      colors: ['Rouge', 'Bleu'],
      sizes: ['M', 'L'],
      colorImages: {
        Rouge: ['https://images.example/red.jpg'],
        Bleu: ['https://images.example/blue.jpg'],
      },
      variantOptions: [
        option({ id: 'red-m', label: 'Rouge · M', color: 'Rouge', size: 'M', price: 29, currency: 'EUR', priceTnd: 99, priceToken: 'signed-red-m' }),
        option({ id: 'red-l', label: 'Rouge · L', color: 'Rouge', size: 'L', price: 31, currency: 'EUR', priceTnd: 105, priceToken: 'signed-red-l' }),
        option({ id: 'blue-m', label: 'Bleu · M', color: 'Bleu', size: 'M', price: 30, currency: 'EUR', priceTnd: 101, priceToken: 'signed-blue-m' }),
        option({ id: 'blue-l', label: 'Bleu · L', color: 'Bleu', size: 'L', price: 32, currency: 'EUR', priceTnd: 108, priceToken: 'signed-blue-l' }),
      ],
    });
    render(wrap(<LensProductView candidate={product} onBack={() => {}} />));

    const red = await screen.findByTestId('lens-color-0');
    fireEvent.press(red);
    await waitFor(() => expect(screen.getByTestId('lens-color-0').props.accessibilityState.selected).toBe(true));

    fireEvent.press(screen.getByTestId('lens-option-selector'));
    fireEvent.press(await screen.findByText('M'));
    expect(await screen.findByText('99.00 TND')).toBeOnTheScreen();

    const heroMedia = screen.getByTestId('lens-product-image-media', { includeHiddenElements: true });
    expect(JSON.stringify(heroMedia.props.source)).toContain(encodeURIComponent('https://images.example/red.jpg'));
  });

  it('ouvre la galerie plein écran zoomable puis la referme', async () => {
    render(wrap(<LensProductView candidate={candidate()} onBack={() => {}} />));

    fireEvent.press(await screen.findByTestId('lens-product-image'));
    expect(await screen.findByTestId('lens-gallery-zoom-image')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('lens-gallery-close'));
    await waitFor(() => expect(screen.queryByTestId('lens-gallery-zoom-image')).toBeNull());
  });
});
