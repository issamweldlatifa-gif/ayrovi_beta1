/**
 * PAGE PRODUIT — le rendu ne doit JAMAIS jeter.
 *
 * Un plantage à l'ouverture d'une carte produit est le pire défaut possible :
 * l'application se ferme, l'utilisateur ne voit aucune erreur et ne peut rien
 * commander. Ce test monte donc l'écran réel (`app/product/[id].tsx`) avec une
 * réponse serveur complète, puis avec les cas pauvres (sans photo, sans
 * variante, sans prix) : si un composant lit une donnée absente, il jette ici,
 * pas dans la poche de quelqu'un.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: 'product_test_baskets' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../src/session/session', () => ({ useSessionId: () => 'sess_test' }));

// `expo-video` demande son module natif : hors appareil, on le remplace (le
// rendu du reste de la fiche est ce qu'on vérifie ici).
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), loop: false, muted: false }),
  VideoView: () => null,
}));

const product = {
  id: 'product_test_baskets',
  name: 'Baskets route homme',
  description: 'Cuir pleine fleur, semelle crantée de 4 cm.',
  image: '/media/catalogue/baskets-gris-1.jpg',
  additionalImages: ['/media/catalogue/baskets-gris-2.jpg'],
  brandName: 'ZAYROVI',
  category: 'Chaussures',
  originalPrice: 0,
  compareAtPrice: null,
  currency: 'TND',
  convertedPrice: 89,
  customsFee: 0,
  shippingFee: 0,
  serviceFee: 0,
  finalPrice: 89,
  expressAvailable: false,
  stockStatus: 'IN_STOCK' as const,
  visibility: 'CATALOG' as const,
  ficheLabels: { sections: { matiere: 'Matière et entretien' } },
  attributes: [
    { key: 'material', label: 'Matière', type: 'TEXT', section: 'matiere', value: 'Cuir pleine fleur' },
  ],
  family: null,
  sheet: {
    purchasable: true,
    images: ['/media/catalogue/baskets-gris-1.jpg'],
    videos: [],
    stock: { tracked: true, quantity: 100, status: 'IN_STOCK' },
    dimensions: [
      { key: 'size', label: 'Taille', values: [{ value: '40', available: true, stock: 10 }, { value: '41', available: true, stock: 10 }] },
      { key: 'color', label: 'Couleur', values: [{ value: 'Gris', available: true, stock: 10 }, { value: 'Noir', available: true, stock: 10 }] },
    ],
    variants: [
      { id: 'v1', sku: 'ZY-BSK-GR-40', size: '40', color: 'Gris', images: ['/media/catalogue/baskets-gris-1.jpg'], available: true, stock: 10, reason: null },
      { id: 'v2', sku: 'ZY-BSK-NO-40', size: '40', color: 'Noir', images: ['/media/catalogue/baskets-noir-1.jpg'], available: true, stock: 10, reason: null },
    ],
  },
};

jest.mock('../../src/api/catalog', () => ({
  fetchCatalogProduct: jest.fn(async () => require('./productFixture').getProduct()),
  fetchCatalogProducts: jest.fn(async () => []),
  normalizeStockStatus: (value: string) => value,
}));

jest.mock('../../src/api/checkout', () => ({
  fetchCommercePolicy: jest.fn(async () => ({
    deliveryDelay: '5 à 8 jours ouvrés',
    returnWindowDays: 31,
    governorates: [],
    paymentMethods: [],
    depositPercent: 0,
    depositReviewDelayDays: 0,
    unavailableRefundPolicy: '',
    companyLegalName: '',
    companyName: '',
    bankRib: '',
    posteAccount: '',
    flouciNumber: '',
    cardDiscountPercent: 0,
    facebookUrl: '',
    instagramUrl: '',
    tiktokUrl: '',
    whatsappUrl: '',
    siteTheme: 'light',
    interfaceConfig: null,
    footerAbout: '',
  })),
}));

jest.mock('../../src/api/cart', () => ({
  addCatalogToCart: jest.fn(async () => ({})),
}));

describe('écran produit — aucun plantage au montage', () => {
  const mount = async () => {
    const ProductScreen = require('../../app/product/[id]').default;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <QueryClientProvider client={client}>
              <ProductScreen />
            </QueryClientProvider>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>,
    );
    // Laisse les requêtes (déjà résolues) se poser dans l'arbre. On attend le
    // défileur de la fiche : le nom apparaît deux fois (en-tête + identité), le
    // testID est unique.
    await view.findByTestId('product-fiche-scroll');
    return view;
  };

  it('monte la fiche complète (photo, prix, taille, couleur, sections)', async () => {
    require('./productFixture').setProduct(product);
    const view = await mount();
    expect(screen.getByTestId('product-fiche-scroll')).toBeTruthy();
    expect(screen.getByTestId('product-photo-window')).toBeTruthy();
    expect(screen.getByTestId('product-size-row')).toBeTruthy();
    view.unmount();
  });

  it('monte encore quand tout manque : pas de photo, pas de variante, pas de prix', async () => {
    require('./productFixture').setProduct({
      ...product,
      image: '',
      additionalImages: [],
      finalPrice: 0,
      attributes: [],
      ficheLabels: {},
      sheet: { purchasable: false, images: [], videos: [], stock: { tracked: false, quantity: null, status: 'UNKNOWN' }, dimensions: [], variants: [] },
    });
    const view = await mount();
    expect(screen.getByTestId('product-fiche-scroll')).toBeTruthy();
    // Sans prix ni disponibilité, pas de barre d'achat : on ne propose pas un
    // bouton qui échouera à coup sûr.
    expect(screen.queryByTestId('product-add-to-cart')).toBeNull();
    view.unmount();
  });
});
