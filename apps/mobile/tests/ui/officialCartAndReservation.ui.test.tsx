/**
 * Tests UI React Native de la refonte du 29/10/2026 :
 *   1. Panier officiel Bag / Zalando (`OfficialCartScaffold`, `OfficialCartRow`,
 *      `OfficialCartStickySummary`) : article remisé (rouge + prix barré + -X%)
 *      vs article au prix régulier, bloc inférieur fixe avec `Livraison`,
 *      `Total` + `TVA incluse`, CTA noir compact et badges de paiement ;
 *   2. Grande fiche produit (`app/product/[id].tsx`) : ouverture automatique de
 *      la feuille `Taille` au clic sur `Ajouter au panier`, pastille verte
 *      `Article ajouté`, pastille compte à rebours `MM:SS` et feuille `Panier réservé` ;
 *   3. Feuille compacte post-ajout AYWEBs (`AddToCartSheet.tsx`) : affichage
 *      remisé, bouton plein `Voir le panier` et bandeau du nombre d'articles.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AyWebsCart, AyWebsResolvedProduct } from '@/api/aywebs';
import { ThemeProvider } from '@/design/theme';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import {
  OfficialCartRow,
  OfficialCartScaffold,
  OfficialCartStickySummary,
} from '@/features/shopping/OfficialCartView';
import { clearCartReservation } from '@/features/shopping/cartReservation';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'prod_zalando_1' }),
}));

jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));

jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), loop: false, muted: false }),
  VideoView: () => null,
}));

const mockAddCatalogToCart = jest.fn(async (_input?: unknown) => ({ itemsCount: 2 }));
jest.mock('@/api/cart', () => {
  const actual = jest.requireActual('@/api/cart');
  return {
    ...actual,
    addCatalogToCart: (input?: unknown) => mockAddCatalogToCart(input),
    fetchAyroviCart: jest.fn(async () => ({
      sessionId: 'mob_1234567890123456',
      serverNow: new Date().toISOString(),
      items: [],
      units: 0,
      productSubtotalTND: 0,
      deliveryTND: 0,
      totalTND: 0,
      blockedIds: [],
    })),
  };
});

jest.mock('@/api/checkout', () => ({
  fetchCommercePolicy: jest.fn(async () => ({
    deliveryDelay: '5 à 8 jours ouvrés',
    returnsDays: 14,
  })),
}));

jest.mock('@/api/catalog', () => {
  const actual = jest.requireActual('@/api/catalog');
  const sample = {
    id: 'prod_zalando_1',
    name: 'Veste structurée',
    description: 'Coupe droite en laine mélangée',
    finalPrice: 189,
    currency: 'TND',
    images: ['https://images.example/veste.jpg'],
    videos: [],
    stockStatus: 'AVAILABLE',
    attributes: [],
    sheet: {
      images: ['https://images.example/veste.jpg'],
      videos: [],
      dimensions: [
        {
          key: 'size',
          label: 'Taille',
          values: [
            { value: 'S', available: true, stock: 4 },
            { value: 'M', available: true, stock: 1 },
          ],
        },
      ],
      variants: [
        { id: 'v_s', sku: 'SKU-S', size: 'S', color: '', available: true, stock: 4, reason: null, image: null },
        { id: 'v_m', sku: 'SKU-M', size: 'M', color: '', available: true, stock: 1, reason: null, image: null },
      ],
      stock: { tracked: true, quantity: 5, status: 'AVAILABLE' },
      purchasable: true,
    },
  };
  return {
    ...actual,
    fetchCatalogProduct: jest.fn(async () => sample),
    fetchCatalogProducts: jest.fn(async () => [sample]),
  };
});

jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  const item = {
    id: 'line-shein-1',
    itemNumber: 'A-9',
    productId: 'shein-jacket',
    storeId: 'shein',
    storeName: 'SHEIN',
    sourceUrl: 'https://m.shein.com/fr/Jacket-p-12345.html',
    title: 'Blouson court zippé',
    images: ['https://img.ltwebstatic.com/images3_pi/2026/jacket.jpg'],
    unitPrice: 15,
    currency: 'USD',
    variantLabel: 'Couleur : Noir · Taille : M',
    quantity: 1,
    availability: 'AVAILABLE',
    status: 'PENDING',
    statusReason: '',
    customerNote: '',
    purchaseMode: 'ASSISTED',
    checkoutReady: true,
    lineTotalTnd: 75,
    linkedToAyrovi: true,
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
  };
  const cart: AyWebsCart = {
    hasCart: true,
    items: [item],
    groups: [],
    totals: {
      units: 3,
      productSubtotalTnd: 225,
      currency: 'TND',
      blockedItems: 0,
      checkoutReady: true,
      unlinkedUnits: 0,
    },
    blockers: [],
  };
  return {
    ...actual,
    fetchAyWebsVariants: jest.fn(async () => ({ variants: [], variantGroups: [] })),
    resolveAyWebsProductWithCapture: jest.fn(async () => {
      throw new Error('offline');
    }),
    addAyWebsCartItem: jest.fn(async () => ({ item, cart, ayrovi: { linked: true, reason: '' } })),
  };
});

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, left: 0, right: 0, bottom: 16 },
      }}
    >
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

describe('Refonte du 29/10/2026 — Panier officiel, Fiche réservation 20 min et Feuille post-ajout', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAddCatalogToCart.mockClear();
    clearCartReservation();
  });

  it('affiche le gabarit officiel Bag avec article remisé, article régulier et bloc fixe de paiement', () => {
    const onCheckout = jest.fn();
    render(
      <Providers>
        <OfficialCartScaffold
          title="Panier"
          itemCount={2}
          stickyFooter={
            <OfficialCartStickySummary
              deliveryTnd={8}
              totalTnd={168}
              checkoutLabel="Continuer vers la commande"
              onCheckout={onCheckout}
              bottomPadding={16}
            />
          }
        >
          <OfficialCartRow
            item={{
              id: 'disc-1',
              brandOrStore: 'PULL&BEAR',
              title: 'Jean droit taille haute',
              imageUrl: 'https://images.example/jean.jpg',
              quantity: 1,
              lineTotalTnd: 75,
              originalLineTotalTnd: 100,
              color: 'Bleu brut',
              size: '38',
            }}
          />
          <OfficialCartRow
            item={{
              id: 'reg-1',
              brandOrStore: 'ZARA',
              title: 'Chemise popeline',
              imageUrl: 'https://images.example/chemise.jpg',
              quantity: 1,
              lineTotalTnd: 85,
              originalLineTotalTnd: null,
              color: 'Blanc',
              size: 'M',
            }}
          />
        </OfficialCartScaffold>
      </Providers>,
    );

    expect(screen.getByText('PULL&BEAR')).toBeTruthy();
    expect(screen.getByText('ZARA')).toBeTruthy();
    // Un seul article est remisé -> une seule mention « Prix d’origine : » et « -25% »
    expect(screen.getAllByText('Prix d’origine :')).toHaveLength(1);
    expect(screen.getByText('-25%')).toBeTruthy();

    // Résumé inférieur fixe + moyens de paiement
    expect(screen.getByTestId('cart-sticky-summary')).toBeTruthy();
    expect(screen.getByText('TVA incluse')).toBeTruthy();
    expect(screen.getByTestId('cart-payment-badges')).toBeTruthy();
    expect(screen.getByText('VISA')).toBeTruthy();
    expect(screen.getByText('Mastercard')).toBeTruthy();

    fireEvent.press(screen.getByTestId('cart-checkout'));
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('ouvre la feuille Taille au clic sur Ajouter au panier, anime la pastille verte puis ouvre Panier réservé', async () => {
    const ProductScreen = require('../../app/product/[id]').default;
    render(
      <Providers>
        <ProductScreen />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByTestId('product-add-to-cart')).toBeTruthy());

    // Clic sur « Ajouter au panier » sans taille choisie -> ouvre automatiquement la feuille Taille
    await act(async () => {
      fireEvent.press(screen.getByTestId('product-add-to-cart'));
    });
    expect(screen.getByText('Sélectionnez votre taille')).toBeTruthy();

    // Choix de la taille « S » -> soumet automatiquement l'ajout au panier
    await act(async () => {
      fireEvent.press(screen.getByLabelText('S'));
    });

    await waitFor(() => expect(mockAddCatalogToCart).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('product-header-cart-pill')).toBeTruthy();
    expect(screen.getByText('Article ajouté')).toBeTruthy();

    // Un appui sur la pastille réservée ouvre la feuille « Panier réservé »
    await act(async () => {
      fireEvent.press(screen.getByTestId('product-header-cart-pill'));
    });
    expect(screen.getByTestId('product-reserved-sheet')).toBeTruthy();
    expect(screen.getByText('Panier réservé')).toBeTruthy();
    expect(screen.getByText('20:00')).toBeTruthy();
    expect(screen.getByText('Les articles de votre panier sont réservés pendant 20 minutes.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('product-reserved-view-cart'));
    expect(mockPush).toHaveBeenCalledWith('/cart');
  });

  it('affiche le prix remisé et la feuille compacte « Ajouté au panier » avec le compteur d’articles', async () => {
    const sheinProduct: AyWebsResolvedProduct = {
      productId: 'shein-jacket',
      storeId: 'shein',
      storeName: 'SHEIN',
      sourceUrl: 'https://m.shein.com/fr/Jacket-p-12345.html',
      sourceDomain: 'm.shein.com',
      title: 'Blouson court zippé',
      brand: 'DAZY',
      images: ['https://img.ltwebstatic.com/images3_pi/2026/jacket.jpg'],
      price: 15,
      currency: 'USD',
      priceVerified: true,
      currencyVerified: true,
      availability: { state: 'AVAILABLE', reason: '', checkedAt: '2026-10-29T00:00:00.000Z', source: 'server', quantityHint: null },
      purchaseMode: 'ASSISTED',
      integrationType: 'URL_REQUEST',
      ayroviPricing: {
        totalTnd: 75,
        pricingVersion: 3,
        breakdown: null,
      },
      variantGroups: [],
      variantDetails: [],
      variantQuotes: [],
      fromCache: false,
      cacheAgeMs: null,
    };

    render(
      <Providers>
        <AddToCartSheet
          visible
          sessionId="mob_1234567890123456"
          product={sheinProduct}
          capture={{
            shein: { salePrice: '15.00', retailPrice: '20.00', selectedColor: 'Noir', selectedSize: 'M' },
          }}
          quoteToken="quote-shein-1"
          readOnlySelection
          onClose={() => undefined}
        />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByTestId('aywebs-sheet-add')).toBeTruthy());
    expect(screen.getByText('-25%')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('aywebs-sheet-add'));
    });

    await waitFor(() => expect(screen.getByTestId('aywebs-sheet-success')).toBeTruthy());
    expect(screen.getByText('Ajouté au panier')).toBeTruthy();
    expect(screen.getByText('Vous avez maintenant 3 article(s) dans votre panier.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('aywebs-sheet-go-to-bag'));
    expect(mockPush).toHaveBeenCalledWith('/cart');
  });
});
