/**
 * AYWEBs — Feuille d'ajout avec Matrice de Prix des Variantes (`VariantMatrixCache`).
 *
 * Vérifie en exécution réelle React Native :
 *   1. Lecture initiale unique, puis bascules Couleur / Âge / Type instantanées
 *      depuis le cache mémoire (0 appel réseau supplémentaire à `/product/resolve`) ;
 *   2. Distinction quantité d'unités (`quantity = 2` avec remise palier non linéaire)
 *      et variantes de lots/types ;
 *   3. Variante non prouvée (`Beige`) : aucun affichage du vieux prix précédent,
 *      lecture delta ciblée unique, fusion dans le cache sans perte de `Noir`,
 *      et retour instantané à `Noir` (0 appel supplémentaire) ;
 *   4. Liaison exacte des options finales (`Couleur + Âge + Type`) et de la quantité
 *      lors de l'ajout au panier ZAYROVI.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AyWebsCart, AyWebsResolvedProduct } from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { clearVariantMatrixCache } from '@/features/aywebs/variantMatrixCache';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const mockResolveWithCapture = jest.fn();
const mockAddCartItem = jest.fn();

jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    fetchAyWebsVariants: jest.fn(async () => ({ variants: [], variantGroups: [] })),
    resolveAyWebsProductWithCapture: (...args: unknown[]) => mockResolveWithCapture(...args),
    addAyWebsCartItem: (...args: unknown[]) => mockAddCartItem(...args),
  };
});

const INITIAL_CAPTURE = {
  v: 1,
  url: 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200911.html',
  title: 'Ensemble enfant capuche hiver',
  priceCandidates: [{ text: '13,90 €', source: 'embedded_json' }],
  currencyText: 'EUR',
  availabilityText: 'InStock',
  addToCartText: 'Ajouter au panier',
  images: ['https://img.ltwebstatic.com/noir.jpg'],
  selectedVariantTexts: ['Noir', '4-5Y', 'Standard'],
  variantTexts: [],
  variantGroups: [
    {
      name: 'Couleur',
      values: ['Noir', 'Bleu Marine', 'Beige'],
      selected: ['Noir'],
      options: [
        { value: 'Noir', available: true, price: null, priceFrom: false, stock: null, image: 'https://img.ltwebstatic.com/noir.jpg', goodsId: '51200911' },
        { value: 'Bleu Marine', available: true, price: null, priceFrom: false, stock: null, image: 'https://img.ltwebstatic.com/marine.jpg', goodsId: '51200922' },
        { value: 'Beige', available: null, price: '15.50 EUR', priceFrom: true, stock: null, image: 'https://img.ltwebstatic.com/beige.jpg', goodsId: '51200933' },
      ],
    },
    {
      name: 'Âge',
      values: ['4-5Y', '8-9Y'],
      selected: ['4-5Y'],
      options: [
        { value: '4-5Y', available: true, price: null, priceFrom: false, stock: 10 },
        { value: '8-9Y', available: true, price: null, priceFrom: false, stock: 6 },
      ],
    },
    {
      name: 'Type',
      values: ['Standard', 'Doublé Polaire'],
      selected: ['Standard'],
      options: [
        { value: 'Standard', available: true, price: null, priceFrom: false, stock: null },
        { value: 'Doublé Polaire', available: true, price: null, priceFrom: false, stock: null },
      ],
    },
  ],
  variantMatrix: [
    {
      variantId: 'shein:51200911:4Y_STD',
      variantUrl: 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200911.html',
      attributes: { Couleur: 'Noir', 'Âge': '4-5Y', Type: 'Standard' },
      price: '13.90 EUR',
      priceFrom: false,
      available: true,
      stock: 10,
      image: 'https://img.ltwebstatic.com/noir.jpg',
      evidenceSource: 'preloaded_state',
    },
    {
      variantId: 'shein:51200911:8Y_FLEECE',
      variantUrl: 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200911.html',
      attributes: { Couleur: 'Noir', 'Âge': '8-9Y', Type: 'Doublé Polaire' },
      price: '21.90 EUR',
      priceFrom: false,
      available: true,
      stock: 6,
      image: 'https://img.ltwebstatic.com/noir.jpg',
      evidenceSource: 'preloaded_state',
      quantityTiers: [{ minQuantity: 2, unitPrice: '19.50 EUR' }],
    },
    {
      variantId: 'shein:51200922:8Y_FLEECE',
      variantUrl: 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200922.html',
      attributes: { Couleur: 'Bleu Marine', 'Âge': '8-9Y', Type: 'Doublé Polaire' },
      price: '22.90 EUR',
      priceFrom: false,
      available: true,
      stock: 4,
      image: 'https://img.ltwebstatic.com/marine.jpg',
      evidenceSource: 'preloaded_state',
    },
  ],
  shein: {
    readerVersion: 2,
    pageGoodsId: '51200911',
    selectedColor: 'Noir',
    selectedSize: '4-5Y',
    skuId: 'sk51200911',
  },
};

const LOCAL_PRODUCT: AyWebsResolvedProduct = {
  productId: 'local_shein_51200911',
  storeId: 'shein',
  storeName: 'SHEIN',
  sourceUrl: 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200911.html',
  sourceDomain: 'fr.shein.com',
  title: 'Ensemble enfant capuche hiver',
  brand: 'SHEIN Kids',
  images: ['https://img.ltwebstatic.com/noir.jpg'],
  price: 13.9,
  currency: 'EUR',
  priceVerified: true,
  currencyVerified: true,
  availability: { state: 'AVAILABLE', reason: 'local', checkedAt: '2026-10-28T00:00:00.000Z', source: 'webview', quantityHint: 10 },
  purchaseMode: 'ASSISTED',
  integrationType: 'WEBVIEW',
  ayroviPricing: null,
  variantGroups: [
    { attribute: 'Couleur', values: ['Noir', 'Bleu Marine', 'Beige'] },
    { attribute: 'Âge', values: ['4-5Y', '8-9Y'] },
    { attribute: 'Type', values: ['Standard', 'Doublé Polaire'] },
  ],
  variantDetails: [],
  variantQuotes: [],
  fromCache: false,
  cacheAgeMs: null,
};

const SERVER_INITIAL_PRODUCT: AyWebsResolvedProduct = {
  ...LOCAL_PRODUCT,
  productId: 'aywprd_shein_51200911',
  ayroviPricing: {
    totalTnd: 82.4,
    pricingVersion: 4,
    quantityTotalsTnd: [82.4, 152.1, 221.8],
    breakdown: {
      convertedSourcePrice: 49.39,
      shipping: 0,
      customs: 0,
      serviceFee: 10,
      other: 23.01,
    },
  },
  variantDetails: [
    {
      sourceVariantId: 'shein:51200911:4Y_STD',
      variantUrl: 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200911.html',
      attributes: { Couleur: 'Noir', 'Âge': '4-5Y', Type: 'Standard' },
      label: 'Noir / 4-5Y / Standard',
      price: 13.9,
      currency: 'EUR',
      quotedPrice: 13.9,
      quotedCurrency: 'EUR',
      priceSource: 'VARIANT',
      availability: 'AVAILABLE',
      availabilityReason: 'sku_in_stock_capture:10',
      stock: 10,
      image: 'https://img.ltwebstatic.com/noir.jpg',
      totalTnd: 82.4,
      quantityTotalsTnd: [82.4, 152.1, 221.8],
    },
    {
      sourceVariantId: 'shein:51200911:8Y_FLEECE',
      variantUrl: 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200911.html',
      attributes: { Couleur: 'Noir', 'Âge': '8-9Y', Type: 'Doublé Polaire' },
      label: 'Noir / 8-9Y / Doublé Polaire',
      price: 21.9,
      currency: 'EUR',
      quotedPrice: 21.9,
      quotedCurrency: 'EUR',
      priceSource: 'VARIANT',
      availability: 'AVAILABLE',
      availabilityReason: 'sku_in_stock_capture:6',
      stock: 6,
      image: 'https://img.ltwebstatic.com/noir.jpg',
      quantityTiers: [{ minQuantity: 2, unitPrice: 19.5 }],
      totalTnd: 118.9,
      quantityTotalsTnd: [118.9, 206.5, 305.0],
    },
    {
      sourceVariantId: 'shein:51200922:8Y_FLEECE',
      variantUrl: 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200922.html',
      attributes: { Couleur: 'Bleu Marine', 'Âge': '8-9Y', Type: 'Doublé Polaire' },
      label: 'Bleu Marine / 8-9Y / Doublé Polaire',
      price: 22.9,
      currency: 'EUR',
      quotedPrice: 22.9,
      quotedCurrency: 'EUR',
      priceSource: 'VARIANT',
      availability: 'LOW_STOCK',
      availabilityReason: 'sku_low_stock_capture:4',
      stock: 4,
      image: 'https://img.ltwebstatic.com/marine.jpg',
      totalTnd: 123.45,
      quantityTotalsTnd: [123.45, 233.9],
    },
  ],
};

const SERVER_BEIGE_DELTA_PRODUCT: AyWebsResolvedProduct = {
  ...LOCAL_PRODUCT,
  productId: 'aywprd_shein_51200933',
  sourceUrl: 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200933.html',
  price: 16.5,
  images: ['https://img.ltwebstatic.com/beige.jpg'],
  ayroviPricing: {
    totalTnd: 94.25,
    pricingVersion: 4,
    quantityTotalsTnd: [94.25, 175.5],
    breakdown: {
      convertedSourcePrice: 58.6,
      shipping: 0,
      customs: 0,
      serviceFee: 10,
      other: 25.65,
    },
  },
  variantDetails: [],
};

describe('AddToCartSheet — Matrice de Prix des Variantes en mémoire', () => {
  beforeEach(() => {
    clearVariantMatrixCache();
    mockResolveWithCapture.mockReset();
    mockAddCartItem.mockReset();
  });

  it('met à jour le prix instantanément sans requête réseau sur les variantes en cache, applique les remises quantité, et ne montre jamais un vieux prix sur une variante non vérifiée', async () => {
    let resolveBeigePromise: ((val: unknown) => void) | null = null;
    mockResolveWithCapture.mockImplementation(async (url: string) => {
      if (url.includes('51200933')) {
        return new Promise((resolve) => {
          resolveBeigePromise = resolve;
        });
      }
      return {
        product: SERVER_INITIAL_PRODUCT,
        quoteToken: 'tok_initial_matrix',
        status: 'READY',
        capture: { used: true, fingerprint: 'fp1', priceSource: 'embedded_json', corroborated: true, rejection: null },
        priceRejection: null,
      };
    });

    const mockReadVariant = jest.fn(async (siblingUrl: string) => ({
      ...INITIAL_CAPTURE,
      url: siblingUrl,
      priceCandidates: [{ text: '16,50 €', source: 'embedded_json' }],
      shein: { readerVersion: 2, pageGoodsId: '51200933', selectedColor: 'Beige', selectedSize: '8-9Y', skuId: 'sk51200933' },
    }));

    mockAddCartItem.mockImplementation(async (payload: Record<string, unknown>) => {
      const item = {
        id: 'line-shein-1',
        itemNumber: 'S-1',
        productId: 'aywprd_shein_51200911',
        storeId: 'shein',
        storeName: 'SHEIN',
        sourceUrl: String(payload.sourceUrl || ''),
        title: 'Ensemble enfant capuche hiver',
        images: ['https://img.ltwebstatic.com/marine.jpg'],
        unitPrice: 19.5,
        currency: 'EUR',
        variantLabel: 'Noir · 8-9Y · Doublé Polaire',
        quantity: Number(payload.quantity || 1),
        availability: 'AVAILABLE' as const,
        status: 'PENDING',
        statusReason: '',
        customerNote: '',
        purchaseMode: 'ASSISTED',
        checkoutReady: true,
        lineTotalTnd: 206.5,
        linkedToAyrovi: true,
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T00:00:00.000Z',
      };
      const cart: AyWebsCart = {
        hasCart: true,
        items: [item],
        groups: [],
        totals: { units: item.quantity, productSubtotalTnd: 206.5, currency: 'TND', blockedItems: 0, checkoutReady: true, unlinkedUnits: 0 },
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
                sessionId="mob_matrix_test_123456"
                product={LOCAL_PRODUCT}
                capture={INITIAL_CAPTURE}
                readVariant={mockReadVariant}
                onClose={() => undefined}
              />
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>,
    );

    /* 1. Lecture initiale unique : Noir + 4-5Y + Standard => 82.40 TND */
    await waitFor(() => expect(screen.getAllByText(/82[.,]40/).length).toBeGreaterThan(0));
    expect(mockResolveWithCapture.mock.calls.length).toBe(1);

    /* 2. Bascule Âge -> 8-9Y puis Type -> Doublé Polaire : mise à jour 0 ms vers 118.90 TND et ZÉRO requête réseau ! */
    fireEvent.press(screen.getByRole('button', { name: /8-9Y/i }));
    fireEvent.press(screen.getByRole('button', { name: /Doublé Polaire/i }));
    expect(screen.getAllByText(/118[.,]90/).length).toBeGreaterThan(0);
    expect(mockResolveWithCapture.mock.calls.length).toBe(1);

    /* 3. Bascule Couleur -> Bleu Marine : mise à jour 0 ms vers 123.45 TND et ZÉRO requête réseau ! */
    fireEvent.press(screen.getByRole('button', { name: /Bleu Marine/i }));
    expect(screen.getAllByText(/123[.,]45/).length).toBeGreaterThan(0);
    expect(mockResolveWithCapture.mock.calls.length).toBe(1);

    /* 4. Bascule Couleur -> Beige (absente de la matrice initiale) :
          l'ancien prix (123.45) disparaît IMMÉDIATEMENT pendant la lecture delta ! */
    fireEvent.press(screen.getByRole('button', { name: /Beige/i }));
    expect(screen.queryByText(/123[.,]45/)).toBeNull();
    expect(screen.queryByText(/82[.,]40/)).toBeNull();

    await waitFor(() => expect(resolveBeigePromise).not.toBeNull());
    resolveBeigePromise!({
      product: SERVER_BEIGE_DELTA_PRODUCT,
      quoteToken: 'tok_beige_delta',
      status: 'READY',
      capture: { used: true, fingerprint: 'fp2', priceSource: 'embedded_json', corroborated: true, rejection: null },
      priceRejection: null,
    });
    await waitFor(() => expect(screen.getAllByText(/94[.,]25/).length).toBeGreaterThan(0));
    expect(mockResolveWithCapture.mock.calls.length).toBe(2);

    /* 5. Retour vers Noir (8-9Y + Doublé Polaire) : toujours en cache => 118.90 TND immédiat et ZÉRO appel supplémentaire ! */
    fireEvent.press(screen.getByRole('button', { name: /Noir/i }));
    expect(screen.getAllByText(/118[.,]90/).length).toBeGreaterThan(0);
    expect(mockResolveWithCapture.mock.calls.length).toBe(2);

    /* 6. Quantité = 2 => total palier non linéaire 206.50 TND (et non 118.90 × 2 = 237.80 TND) ! */
    fireEvent.press(screen.getByTestId('aywebs-quantity-more'));
    expect(screen.getAllByText(/206[.,]50/).length).toBeGreaterThan(0);

    /* 7. Ajout au panier ZAYROVI : lie exactement Noir + 8-9Y + Doublé Polaire + quantity=2 */
    fireEvent.press(screen.getByTestId('aywebs-sheet-add'));
    await waitFor(() => expect(mockAddCartItem).toHaveBeenCalledTimes(1));
    /* La preuve en cache a utilisé directement l'URL initiale 51200911 sans relire le WebView masqué ! */
    expect(mockReadVariant).toHaveBeenCalledTimes(1);
    const addPayload = mockAddCartItem.mock.calls[0][0];
    expect(addPayload.quantity).toBe(2);
    expect(addPayload.variant).toEqual({
      couleur: 'Noir',
      'âge': '8-9Y',
      type: 'Doublé Polaire',
    });
  });
});
