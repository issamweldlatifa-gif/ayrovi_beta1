/** Read-only merchant confirmation: full image, exact attributes and a pinned quote/action. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AyWebsCart, AyWebsResolvedProduct } from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { clearVariantMatrixCache } from '@/features/aywebs/variantMatrixCache';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockResolveWithCapture = jest.fn();
const mockAddCartItem = jest.fn();

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    fetchAyWebsVariants: jest.fn(async () => ({ variants: [], variantGroups: [] })),
    resolveAyWebsProductWithCapture: (...args: unknown[]) => mockResolveWithCapture(...args),
    addAyWebsCartItem: (...args: unknown[]) => mockAddCartItem(...args),
  };
});

function buildLocalProduct(selectedSize: string | null): {
  product: AyWebsResolvedProduct;
  capture: Record<string, unknown>;
} {
  const capture: Record<string, unknown> = {
    v: 1,
    url: 'https://m.shein.com/fr/Boy-Jeans-p-44556677.html',
    title: 'Jean ample décontracté garçon',
    images: ['https://img.ltwebstatic.com/images3_pi/2026/10/29/garcon_jean_clair_main.jpg'],
    priceCandidates: [{ text: 'US$18.71', source: 'dom' }, { text: 'US$18.71', source: 'a11y_label' }],
    currencyText: 'USD',
    addToCartText: 'Ajouter au panier',
    shein: {
      readerVersion: 2,
      pageGoodsId: '44556677',
      selectedColor: 'Jean clair',
      selectedSize,
      skuId: 'I44556677',
    },
    variantGroups: [
      {
        name: 'Couleur',
        values: ['Jean clair', 'Bleu jean'],
        selected: ['Jean clair'],
        options: [{ value: 'Jean clair', available: true }, { value: 'Bleu jean', available: true }],
      },
      {
        name: 'Taille',
        values: ['4Y (98-104 cm)', '5Y (104-110 cm)'],
        selected: selectedSize ? [selectedSize] : [],
        options: [
          { value: '4Y (98-104 cm)', available: true },
          { value: '5Y (104-110 cm)', available: true },
        ],
      },
    ],
  };

  const product: AyWebsResolvedProduct = {
    productId: '44556677',
    storeId: 'shein',
    storeName: 'SHEIN',
    sourceUrl: 'https://m.shein.com/fr/Boy-Jeans-p-44556677.html',
    sourceDomain: 'm.shein.com',
    title: 'Jean ample décontracté garçon',
    brand: 'DAZY',
    images: ['https://img.ltwebstatic.com/images3_pi/2026/10/29/garcon_jean_clair_main.jpg'],
    price: null,
    currency: '',
    priceVerified: false,
    currencyVerified: false,
    availability: { state: 'AVAILABLE', reason: '', checkedAt: '2026-10-29T00:00:00.000Z', source: 'capture', quantityHint: null },
    purchaseMode: 'ASSISTED',
    integrationType: 'URL_REQUEST',
    zayroviPricing: null,
    variantGroups: [
      { attribute: 'Couleur', values: ['Jean clair', 'Bleu jean'] },
      { attribute: 'Taille', values: ['4Y (98-104 cm)', '5Y (104-110 cm)'] },
    ],
    variantDetails: [],
    variantQuotes: [],
    fromCache: false,
    cacheAgeMs: null,
  };

  return { product, capture };
}

describe('AddToCartSheet — Modèle #2 (Confirmation en lecture seule depuis la boutique)', () => {
  beforeEach(() => {
    clearVariantMatrixCache();
    mockResolveWithCapture.mockReset();
    mockAddCartItem.mockReset();
  });

  it('affiche le choix exact et la photo entière dans la mise en page B, puis ajoute au panier', async () => {
    const { product, capture } = buildLocalProduct('4Y (98-104 cm)');
    const onClose = jest.fn();
    const exactPhoto = 'https://img.ltwebstatic.com/images3_pi/2026/10/29/jean_clair_portrait.jpg';

    mockResolveWithCapture.mockResolvedValue({
      product: {
        ...product,
        price: 18.71,
        currency: 'USD',
        priceVerified: true,
        currencyVerified: true,
        zayroviPricing: {
          unitPriceTnd: 79.4,
          totalTnd: 79.4,
          currency: 'TND',
          breakdown: {},
        },
      },
      quoteToken: 'quote_readonly_ok',
      status: 'READY',
      capture: { used: true, fingerprint: 'fp_ro', priceSource: 'dom', corroborated: true, rejection: null },
      priceRejection: null,
      capturedSelection: { mode: 'selection', attributes: { Couleur: 'Jean clair', Taille: '4Y (98-104 cm)' },
        availability: 'AVAILABLE', pageQuantity: null, image: exactPhoto },
    });

    mockAddCartItem.mockImplementation(async (payload: Record<string, unknown>) => {
      const item = {
        id: 'line-ro-1',
        itemNumber: 'S-99',
        productId: '44556677',
        storeId: 'shein',
        storeName: 'SHEIN',
        sourceUrl: String(payload.sourceUrl || ''),
        title: product.title,
        images: product.images,
        unitPrice: 18.71,
        currency: 'USD',
        variantLabel: 'Jean clair · 4Y (98-104 cm)',
        quantity: Number(payload.quantity || 1),
        availability: 'AVAILABLE' as const,
        status: 'PENDING',
        statusReason: '',
        customerNote: '',
        purchaseMode: 'ASSISTED',
        checkoutReady: true,
        lineTotalTnd: 158.8,
        linkedToZayrovi: true,
        createdAt: '2026-10-29T00:00:00.000Z',
        updatedAt: '2026-10-29T00:00:00.000Z',
      };
      const cart: AyWebsCart = {
        hasCart: true,
        items: [item],
        groups: [],
        totals: { units: item.quantity, productSubtotalTnd: 158.8, currency: 'TND', blockedItems: 0, checkoutReady: true, unlinkedUnits: 0 },
        blockers: [],
      };
      return { item, cart, zayrovi: { linked: true, reason: '' } };
    });

    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <PrefsProvider>
          <I18nProvider>
            <ThemeProvider>
              <AddToCartSheet
                visible
                local
                readOnlySelection
                sessionId="mob_readonly_session_01"
                product={product}
                capture={{ ...capture, captureMode: 'selection' }}
                onClose={onClose}
              />
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/79[.,]40/).length).toBeGreaterThan(0));

    expect(screen.getByLabelText('Confirmation de votre article')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Confirmation de votre article' })).toBeTruthy();
    const image = within(screen.getByTestId('aywebs-sheet-capture-card')).getByTestId('aywebs-sheet-product-image');
    expect(JSON.stringify(image.props.source)).toContain(exactPhoto);
    expect(image.props.contentFit).toBe('contain');
    expect(image.props.contentPosition).toEqual({ left: '50%', top: '50%' });
    expect(StyleSheet.flatten(image.props.style).width).toBe('100%');
    const frame = StyleSheet.flatten(screen.getByTestId('aywebs-sheet-photo-frame').props.style);
    expect(frame.paddingHorizontal).toBeGreaterThan(0);
    expect(frame.height).toBeGreaterThanOrEqual(84);
    expect(frame.height).toBeLessThanOrEqual(160);
    fireEvent(image, 'error', { nativeEvent: { error: 'Missing merchant photo' } });
    const fallback = screen.getByTestId('aywebs-sheet-product-image');
    expect(JSON.stringify(fallback.props.source)).toContain(product.images[0]);
    expect(fallback.props.contentFit).toBe('contain');
    const footer = within(screen.getByTestId('aywebs-sheet-purchase-footer'));
    expect(footer.getByText(/79[.,]40/)).toBeTruthy();
    expect(footer.getByTestId('aywebs-sheet-price-provenance')).toHaveTextContent(/Devis vérifié pour ce choix/);
    expect(footer.getByTestId('aywebs-confirm-merchant-price')).toHaveTextContent(/USD/);
    expect(footer.getByRole('button', { name: 'Ajouter au panier' })).toBeTruthy();
    expect(screen.getByTestId('aywebs-captured-selection-box')).toBeTruthy();
    expect(screen.getByText('Douane et livraison incluses')).toBeTruthy();
    expect(screen.queryByText(/Sélection capturée depuis la boutique/)).toBeNull();
    /* Confirmation (19/11/2026) : le prix publié par la boutique pour CE choix est rappelé. */
    expect(screen.getByTestId('aywebs-confirm-merchant-price')).toBeTruthy();
    expect(screen.getByText(/Prix sur la boutique : .*18[.,]71/)).toBeTruthy();
    expect(screen.queryByText('Changer sur la page')).toBeNull();
    expect(within(screen.getByLabelText('Confirmation de votre article')).getByRole('button', { name: 'Fermer' })).toBeTruthy();
    expect(screen.getByText('Couleur : Jean clair')).toBeTruthy();
    expect(screen.getByText('Taille : 4Y (98-104 cm)')).toBeTruthy();
    expect(screen.getByText('Ajouter au panier')).toBeTruthy();

    /* Aucun sélecteur interactif de taille/couleur n'est rendu dans le Modèle #2 */
    expect(screen.queryByTestId('aywebs-variant-size-0')).toBeNull();
    expect(screen.queryByTestId('aywebs-color-swatch-0')).toBeNull();
    expect(screen.queryByText('Bleu jean')).toBeNull();


    /* Quantité = 2 -> total estimé mis à jour + ajout au panier avec les options capturées */
    fireEvent.press(screen.getByTestId('aywebs-quantity-control'));
    fireEvent.press(screen.getByTestId('aywebs-quantity-2'));
    expect(screen.getAllByText(/158[.,]80/).length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.press(screen.getByTestId('aywebs-sheet-add'));
    });

    await waitFor(() => expect(mockAddCartItem).toHaveBeenCalledTimes(1));
    expect(mockAddCartItem.mock.calls[0][0]).toMatchObject({
      quantity: 2,
      variant: {
        couleur: 'Jean clair',
        taille: '4Y (98-104 cm)',
      },
    });
  });

  it('invite clairement à choisir la taille sur la boutique lorsqu’elle n’a pas encore été sélectionnée, sans code technique', async () => {
    const { product, capture } = buildLocalProduct(null);
    mockResolveWithCapture.mockRejectedValue(Object.assign(new Error('incomplete'), { code: 'CAPTURE_INCOMPLETE' }));

    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <PrefsProvider>
          <I18nProvider>
            <ThemeProvider>
              <AddToCartSheet
                visible
                local
                readOnlySelection
                sessionId="mob_readonly_session_02"
                product={product}
                capture={capture}
                onClose={() => undefined}
              />
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('aywebs-captured-selection-box')).toBeTruthy());
    expect(screen.getByText('Sélection incomplète sur la boutique')).toBeTruthy();
    expect(screen.getByText('Couleur : Jean clair')).toBeTruthy();
    expect(screen.getByText(/Veuillez d’abord choisir sur la boutique : Taille/)).toBeTruthy();
    expect(screen.queryByText(/Détail technique/)).toBeNull();
    expect(screen.getByTestId('aywebs-sheet-add').props.accessibilityState?.disabled).toBe(true);
  });

  it('pré-remplit la quantité affichée sur la page du marchand (mode sélection)', async () => {
    const { product, capture } = buildLocalProduct('4Y (98-104 cm)');
    mockResolveWithCapture.mockResolvedValue({
      product: { ...product, price: 18.71, currency: 'USD', priceVerified: true, currencyVerified: true,
        availability: { ...product.availability, state: 'UNKNOWN' },
        zayroviPricing: { unitPriceTnd: 79.4, totalTnd: 79.4, currency: 'TND', breakdown: {} } },
      quoteToken: 'quote_qty', status: 'READY',
      capture: { used: true, fingerprint: 'fp_q', priceSource: 'dom', corroborated: true, rejection: null },
      priceRejection: null,
      capturedSelection: { mode: 'selection', attributes: {}, variantId: null, variantIdSource: null, availability: 'UNKNOWN', availabilityReason: null, pageQuantity: 3, image: null },
    });
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <PrefsProvider><I18nProvider><ThemeProvider>
          <AddToCartSheet visible local readOnlySelection sessionId="mob_readonly_session_qty" product={product}
            capture={{ ...capture, captureMode: 'selection', pageQuantity: 3 }} onClose={() => undefined} />
        </ThemeProvider></I18nProvider></PrefsProvider>
      </SafeAreaProvider>,
    );
    await waitFor(() => expect(screen.getAllByText(/238[.,]20/).length).toBeGreaterThan(0));
    /* Disponibilité non confirmée : dite telle quelle, jamais « disponible ». */
    expect(screen.getByTestId('aywebs-confirm-availability-unconfirmed')).toBeTruthy();
  });
});
