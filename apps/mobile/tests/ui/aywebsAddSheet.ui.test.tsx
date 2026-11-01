/**
 * Feuille « Sélectionnez votre article » — les deux défauts signalés le
 * 27/10/2026 sur les captures de l'utilisateur :
 *
 *  1. **Le prix manquant hurlait.** Quand le serveur n'a pas encore de devis en
 *     dinars, la feuille écrivait « Prix en dinars calculé à l'ajout. » en
 *     corps de titre (28 pt) — trois lignes grises qui passaient sous le pied
 *     de la feuille. Désormais : une seule ligne discrète, jamais un titre.
 *
 *  2. **Le bandeau vert de « Article ajouté » était vide.** Un cadre vert avec
 *     une coche ne dit pas que l'ajout a réussi. La feuille écrit maintenant
 *     « Ajouté au panier », la variante et la quantité réellement enregistrées.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AyWebsCart, AyWebsResolvedProduct } from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  const item = {
    id: 'line-1',
    itemNumber: 'A-1',
    productId: 'amazon-fogfire',
    storeId: 'amazon',
    storeName: 'Amazon',
    sourceUrl: 'https://www.amazon.com/dp/test',
    title: 'Amazon.com: FOGFIRE Mens Joggers',
    images: [],
    unitPrice: 17.99,
    currency: 'USD',
    variantLabel: 'Black · M',
    quantity: 1,
    availability: 'AVAILABLE',
    status: 'PENDING',
    statusReason: '',
    customerNote: '',
    purchaseMode: 'ASSISTED',
    checkoutReady: false,
    lineTotalTnd: 133.71,
    linkedToAyrovi: true,
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
  };
  const cart = {
    hasCart: true,
    items: [item],
    groups: [],
    totals: {
      units: 1,
      productSubtotalTnd: 133.71,
      currency: 'TND',
      blockedItems: 0,
      checkoutReady: false,
      unlinkedUnits: 0,
    },
    blockers: [],
  } satisfies AyWebsCart;
  return {
    ...actual,
    fetchAyWebsVariants: jest.fn(async () => ({ variants: [], variantGroups: [] })),
    resolveAyWebsProductWithCapture: jest.fn(async () => { throw new Error('serveur indisponible'); }),
    addAyWebsCartItem: jest.fn(async () => ({ item, cart, ayrovi: { linked: true, reason: '' } })),
  };
});

const product: AyWebsResolvedProduct = {
  productId: 'amazon-fogfire',
  storeId: 'amazon',
  storeName: 'Amazon',
  sourceUrl: 'https://www.amazon.com/dp/test',
  sourceDomain: 'amazon.com',
  title: 'Amazon.com: FOGFIRE Mens Joggers with Zipper Pockets',
  brand: 'FOGFIRE',
  images: ['https://images.example/joggers.jpg'],
  price: 17.99,
  currency: 'USD',
  priceVerified: true,
  currencyVerified: true,
  availability: { state: 'AVAILABLE', reason: '', checkedAt: '2026-10-27T00:00:00.000Z', source: 'server', quantityHint: null },
  purchaseMode: 'ASSISTED',
  integrationType: 'URL_REQUEST',
  ayroviPricing: null,
  variantGroups: [],
  variantDetails: [],
  variantQuotes: [],
  fromCache: false,
  cacheAgeMs: null,
};

function renderSheet() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <AddToCartSheet
              visible
              sessionId="mob_1234567890123456"
              product={product}
              quoteToken="quote-token"
              onClose={() => undefined}
            />
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>,
  );
}

describe('feuille d’ajout AYWEBs', () => {
  it('sans devis en dinars : une ligne discrète, pas un titre de 28 pt', async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByTestId('aywebs-sheet-add')).toBeTruthy(), { timeout: 5000 });

    // Le libellé COURT est affiché (carte produit + pied), en corps secondaire.
    const short = screen.getAllByText('Prix à l’ajout');
    expect(short.length).toBeGreaterThan(0);
    for (const node of short) {
      const size = Number(node.props.style?.fontSize ?? 0);
      expect(size).toBeLessThanOrEqual(12);
    }

    // La phrase longue en corps de titre a disparu de la feuille.
    expect(screen.queryByText('Prix en dinars calculé à l’ajout.')).toBeNull();
  });

  it('après ajout : le bandeau vert DIT que l’article est au panier', async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByTestId('aywebs-sheet-add')).toBeTruthy(), { timeout: 5000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId('aywebs-sheet-add'));
    });

    await waitFor(() => expect(screen.getByTestId('aywebs-sheet-success')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText('Ajouté au panier')).toBeTruthy();
    expect(screen.getByText('Black · M · Quantité 1')).toBeTruthy();
    // Le pied de la feuille disparaît : l'action est faite, on ne la repropose pas.
    expect(screen.queryByTestId('aywebs-sheet-add')).toBeNull();
  });
});
