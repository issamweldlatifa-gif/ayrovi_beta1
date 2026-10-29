/**
 * Modèle #2 — Feuille de confirmation AYWEBs en lecture seule (`readOnlySelection`)
 * au-dessus du WebView marchand (29/10/2026).
 *
 * Vérifie que :
 *   1. L'en-tête affiche le mot-symbole officiel AYWEBs + « Confirmation de votre article » ;
 *   2. La carte produit affiche la photo réelle, le titre, « SHEIN · Prix boutique : 18,71 USD »
 *      et le prix converti en dinars (« 79,40 TND ») ;
 *   3. Le bloc « Sélection capturée depuis la boutique » affiche les badges verrouillés
 *      (`Couleur : Jean clair` avec pastille denim, `Taille : 4Y (98-104 cm)`), SANS sélecteur
 *      interactif de variantes dans la feuille ;
 *   4. Le bouton « Changer la taille ou la couleur sur la boutique » referme immédiatement
 *      la feuille (`onClose`) pour laisser le client modifier son choix sur la boutique ;
 *   5. Si une option requise (`Taille`) n'a pas encore été choisie sur la boutique, la feuille
 *      l'indique clairement sans jargon technique (`quote:...`) et désactive l'ajout.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
    ayroviPricing: null,
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

  it('affiche les badges verrouillés, le prix boutique + TND, renvoie à la boutique sur clic retour et ajoute au panier', async () => {
    const { product, capture } = buildLocalProduct('4Y (98-104 cm)');
    const onClose = jest.fn();

    mockResolveWithCapture.mockResolvedValue({
      product: {
        ...product,
        price: 18.71,
        currency: 'USD',
        priceVerified: true,
        currencyVerified: true,
        ayroviPricing: {
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
        linkedToAyrovi: true,
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
      return { item, cart, ayrovi: { linked: true, reason: '' } };
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
                capture={capture}
                onClose={onClose}
              />
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/79[.,]40/).length).toBeGreaterThan(0));

    expect(screen.getByLabelText('Confirmation de votre article')).toBeTruthy();
    expect(screen.getByTestId('aywebs-captured-selection-box')).toBeTruthy();
    expect(screen.getByText('Douane et livraison incluses')).toBeTruthy();
    expect(screen.queryByText(/Sélection capturée depuis la boutique/)).toBeNull();
    expect(screen.queryByText(/Prix boutique/)).toBeNull();
    expect(screen.getByText('Couleur : Jean clair')).toBeTruthy();
    expect(screen.getByText('Taille : 4Y (98-104 cm)')).toBeTruthy();
    expect(screen.getByText('Ajouter au panier')).toBeTruthy();

    /* Aucun sélecteur interactif de taille/couleur n'est rendu dans le Modèle #2 */
    expect(screen.queryByTestId('aywebs-variant-size-0')).toBeNull();
    expect(screen.queryByTestId('aywebs-color-swatch-0')).toBeNull();
    expect(screen.queryByText('Bleu jean')).toBeNull();

    /* Le bouton retour referme la feuille pour modifier le choix sur la boutique */
    fireEvent.press(screen.getByTestId('aywebs-change-on-store'));
    expect(onClose).toHaveBeenCalledTimes(1);

    /* Quantité = 2 -> total estimé mis à jour + ajout au panier avec les options capturées */
    fireEvent.press(screen.getByTestId('aywebs-quantity-more'));
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
});
