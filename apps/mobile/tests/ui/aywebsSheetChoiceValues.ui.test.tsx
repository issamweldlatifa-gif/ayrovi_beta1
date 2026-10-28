/**
 * Feuille d'ajout AYWEBs — les pastilles affichées sont des CHOIX RÉELS
 * (28/10/2026).
 *
 * Capture d'écran du client, fiche Zalando : la feuille n'affichait qu'un champ
 * « Taille » avec deux pastilles, « Taille » et « Votre taille ». Ni pointure,
 * ni couleur, ni mesure — et choisir « Votre taille » finissait en refus rouge.
 *
 * Ce test monte la feuille avec la fiche EXACTE que le serveur renvoyait
 * (groupe « Taille » pollué) et vérifie l'écran :
 *   • aucune pastille « Taille » / « Votre taille » ;
 *   • les tailles publiées par le marchand sont là ;
 *   • la couleur est là aussi, et reste un vrai groupe.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AyWebsResolvedProduct } from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    fetchAyWebsVariants: jest.fn(async () => ({ variants: [], variantGroups: [] })),
    resolveAyWebsProductWithCapture: jest.fn(async () => { throw new Error('serveur indisponible'); }),
    addAyWebsCartItem: jest.fn(async () => { throw new Error('pas d’ajout dans ce test'); }),
  };
});

function product(overrides: Partial<AyWebsResolvedProduct> = {}): AyWebsResolvedProduct {
  return {
    productId: 'zalando-carpenter',
    storeId: 'zalando',
    storeName: 'Zalando',
    sourceUrl: 'https://www.zalando.fr/pantalon-carpenter-a11.html',
    sourceDomain: 'zalando.fr',
    title: 'EXCLUSIVE CORDUROY RELAXED CARPENTER TROUSERS',
    brand: 'Zalando',
    images: ['https://images.example/trousers.jpg'],
    price: 129.95,
    currency: 'EUR',
    priceVerified: true,
    currencyVerified: true,
    availability: { state: 'AVAILABLE', reason: '', checkedAt: '2026-10-28T00:00:00.000Z', source: 'server', quantityHint: null },
    purchaseMode: 'ASSISTED',
    integrationType: 'URL_REQUEST',
    ayroviPricing: null,
    variantGroups: [],
    variantDetails: [],
    variantQuotes: [],
    fromCache: false,
    cacheAgeMs: null,
    ...overrides,
  };
}

function renderSheet(value: AyWebsResolvedProduct) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <AddToCartSheet visible sessionId="mob_1234567890123456" product={value} onClose={() => undefined} />
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>,
  );
}

describe('feuille d’ajout — valeurs de la page, pas boutons d’interface', () => {
  it('le groupe pollué « Taille / Votre taille » ne produit AUCUNE pastille', async () => {
    renderSheet(product({ variantGroups: [{ attribute: 'Taille', values: ['Taille', 'Votre taille'] }] }));
    await waitFor(() => expect(screen.getByTestId('aywebs-sheet-add')).toBeTruthy(), { timeout: 5000 });

    expect(screen.queryByText('Votre taille')).toBeNull();
    /* Le libellé du groupe peut rester (c'est un titre) ; ce sont les VALEURS
       qui ne doivent plus exister. Une pastille porterait exactement « Taille ». */
    expect(screen.queryByTestId('aywebs-variant-size-0')).toBeNull();
  });

  it('les tailles publiées restent affichées comme pastilles', async () => {
    renderSheet(product({ variantGroups: [{ attribute: 'Taille', values: ['Taille', 'Votre taille', 'S', 'M', 'L'] }] }));
    await waitFor(() => expect(screen.getByTestId('aywebs-variant-size-0')).toBeTruthy(), { timeout: 5000 });

    expect(screen.getByText('S')).toBeTruthy();
    expect(screen.getByText('M')).toBeTruthy();
    expect(screen.getByText('L')).toBeTruthy();
    expect(screen.queryByText('Votre taille')).toBeNull();
  });

  it('la couleur est un vrai groupe, à côté de la taille', async () => {
    renderSheet(product({
      variantGroups: [
        { attribute: 'Taille', values: ['Taille', 'Votre taille', 'S', 'M'] },
        { attribute: 'Couleur', values: ['Couleur', 'Noir', 'Kaki'] },
      ],
    }));
    await waitFor(() => expect(screen.getByTestId('aywebs-variant-size-0')).toBeTruthy(), { timeout: 5000 });

    /* La couleur est rendue en pastilles (pas de photo publiée dans ce test). */
    expect(screen.getAllByTestId('aywebs-color-swatch-0').length).toBeGreaterThan(0);
    expect(screen.getByText('Noir')).toBeTruthy();
    expect(screen.getByText('Kaki')).toBeTruthy();
    expect(screen.queryByText('Votre taille')).toBeNull();
  });
});
