/**
 * Carte produit de grille (13/11/2026) — comportement réel, rendu par RNTL.
 *
 * Ce que le propriétaire a demandé, d'après sa vidéo de référence :
 *  • naviguer entre les photos DANS la carte (points sous la photo) ;
 *  • des lignes alignées (toutes les cartes de la même hauteur) ;
 *  • un affichage grandes / petites photos.
 *
 * Reprend aussi les cas de l'ancienne galerie Lens (`LensCardGallery`, supprimée) :
 * pas de points pour une photo seule, fenêtre bornée, page suivie au défilement.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FlatList, StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProductTile } from '../../src/design/ProductTile';
import { productTileMetrics } from '../../src/design/productTile';
import { FICHE_COLORS } from '../../src/design/tokens.mobile';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('../../src/design/appImage', () => ({
  AppImage: (props: { accessibilityLabel?: string; uri?: string }) => {
    const { View } = require('react-native');
    return <View testID={`img-${props.uri}`} />;
  },
}));
const mockAddToCart = jest.fn(async () => ({ ok: true }));
jest.mock('../../src/api/cart', () => ({ addCatalogToCart: (...args: unknown[]) => mockAddToCart(...(args as [])) }));
jest.mock('../../src/features/shopping/cartReservation', () => ({ touchCartReservation: jest.fn() }));
jest.mock('../../src/session/session', () => ({ useSessionId: () => 'sess_test' }));
jest.mock('../../src/api/catalog', () => ({
  ...jest.requireActual('../../src/api/catalog'),
  fetchCatalogProducts: jest.fn(async () => []),
  fetchCatalogArrivals: jest.fn(async () => []),
}));

// Importés APRÈS les mocks (ils tirent `api/cart` et `expo-router`).
// eslint-disable-next-line import/first
import { ProductCard } from '../../src/features/catalog/ProductCard';
// eslint-disable-next-line import/first
import CatalogScreen from '../../app/catalog';

/** Les points sont cachés aux lecteurs d'écran (la galerie annonce « photo 2 sur 6 ») : on les cherche quand même. */
const HIDDEN = { includeHiddenElements: true } as const;
const grid = () => screen.UNSAFE_getAllByType(FlatList).find((list) => list.props.testID === 'catalog-list')!;
const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

/** Clients créés par les tests : vidés après chaque cas (sinon leurs minuteries gardent Jest en vie). */
const clients: QueryClient[] = [];
function newClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { gcTime: 0 } } });
  clients.push(client);
  return client;
}
afterEach(() => { while (clients.length) clients.pop()?.clear(); });

function wrap(node: React.ReactNode, client = newClient()) {
  return (
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, bottom: 24, left: 0, right: 0 } }}>
        <PrefsProvider><I18nProvider><ThemeProvider>{node}</ThemeProvider></I18nProvider></PrefsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const metrics = productTileMetrics({ width: 360, density: 'grid' });
const photos = (count: number) => Array.from({ length: count }, (_, i) => ({ uri: `/p${i}.jpg` }));

function scrollTo(page: number, width = metrics.cardWidth, count = 8) {
  fireEvent.scroll(screen.getByTestId('t-pager'), {
    nativeEvent: {
      contentOffset: { x: page * width, y: 0 },
      layoutMeasurement: { width, height: metrics.mediaHeight },
      contentSize: { width: width * count, height: metrics.mediaHeight },
    },
  });
}

describe('ProductTile — navigation entre les photos', () => {
  it('points SOUS la photo : au plus 6, l’actif en encre, les autres en gris', async () => {
    render(wrap(<ProductTile testID="t" metrics={metrics} images={photos(8)} accessibilityLabel="Puma" imageLabel="Puma" brand="Puma" name="PUMA SNEAKERS" onOpen={jest.fn()} />));
    await act(async () => {});
    expect(screen.getAllByTestId(/^t-dot-/, HIDDEN)).toHaveLength(6);
    const active = flat(screen.getByTestId('t-dot-0', HIDDEN)).backgroundColor;
    expect(flat(screen.getByTestId('t-dot-1', HIDDEN)).backgroundColor).toBe(FICHE_COLORS.dotIdle);
    expect(active).not.toBe(FICHE_COLORS.dotIdle);
    expect(flat(screen.getByTestId('t-dot-0', HIDDEN))).toMatchObject({ width: 6, height: 6 });
  });

  it('le doigt fait défiler les photos, les points suivent, la fenêtre glisse au-delà de 6', async () => {
    render(wrap(<ProductTile testID="t" metrics={metrics} images={photos(8)} accessibilityLabel="Puma" imageLabel="Puma" name="X" onOpen={jest.fn()} />));
    await act(async () => {});
    scrollTo(2);
    expect(flat(screen.getByTestId('t-dot-2', HIDDEN)).backgroundColor).not.toBe(FICHE_COLORS.dotIdle);
    expect(flat(screen.getByTestId('t-dot-0', HIDDEN)).backgroundColor).toBe(FICHE_COLORS.dotIdle);
    scrollTo(7);
    expect(screen.queryByTestId('t-dot-0', HIDDEN)).toBeNull();
    expect(screen.getByTestId('t-dot-7', HIDDEN)).toBeTruthy();
    expect(screen.getAllByTestId(/^t-dot-/, HIDDEN)).toHaveLength(6);
    expect(screen.getByTestId('t-gallery').props.accessibilityValue).toEqual({ text: 'Photo 8 sur 8' });
  });

  it('un appui ouvre la fiche SUR la photo regardée (photo ou texte)', async () => {
    const onOpen = jest.fn();
    render(wrap(<ProductTile testID="t" metrics={metrics} images={photos(4)} accessibilityLabel="Puma" imageLabel="Puma" name="X" onOpen={onOpen} />));
    await act(async () => {});
    scrollTo(1, metrics.cardWidth, 4);
    fireEvent.press(screen.getByTestId('t-photo-1'));
    expect(onOpen).toHaveBeenLastCalledWith(1);
    fireEvent.press(screen.getByTestId('t-copy'));
    expect(onOpen).toHaveBeenLastCalledWith(1);
  });

  it('lecteur d’écran : balayer change de photo, activer ouvre', async () => {
    const onOpen = jest.fn();
    render(wrap(<ProductTile testID="t" metrics={metrics} images={photos(3)} accessibilityLabel="Puma" imageLabel="Puma" name="X" onOpen={onOpen} />));
    await act(async () => {});
    const gallery = screen.getByTestId('t-gallery');
    expect(gallery.props.accessibilityRole).toBe('adjustable');
    expect(gallery.props.accessibilityValue).toEqual({ text: 'Photo 1 sur 3' });
    fireEvent(gallery, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('t-gallery').props.accessibilityValue).toEqual({ text: 'Photo 2 sur 3' });
    fireEvent(screen.getByTestId('t-gallery'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    fireEvent(screen.getByTestId('t-gallery'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByTestId('t-gallery').props.accessibilityValue).toEqual({ text: 'Photo 1 sur 3' });
    fireEvent(screen.getByTestId('t-gallery'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onOpen).toHaveBeenLastCalledWith(0);
  });

  it('une seule photo : aucun point, aucune galerie, mais la rangée garde sa place', async () => {
    render(wrap(<ProductTile testID="t" metrics={metrics} images={photos(1)} accessibilityLabel="Puma" imageLabel="Puma" name="X" onOpen={jest.fn()} />));
    await act(async () => {});
    expect(screen.queryByTestId('t-pager')).toBeNull();
    expect(screen.queryAllByTestId(/^t-dot-/, HIDDEN)).toHaveLength(0);
    expect(flat(screen.getByTestId('t-dots', HIDDEN))).toMatchObject({ height: 6, marginTop: 10, marginBottom: 8 });
  });
});

describe('ProductTile — lignes alignées', () => {
  it('même hauteur avec ou sans marque, info, prix ou photo', async () => {
    render(wrap(
      <>
        <ProductTile testID="full" metrics={metrics} images={photos(6)} accessibilityLabel="a" imageLabel="a" brand="Nike Sportswear" name="NIKE SPORTSWEAR HERREN COURT VISION LO" meta="Prix conseillé 79,99" price="37,90 TND" onOpen={jest.fn()} />
        <ProductTile testID="bare" metrics={metrics} images={[]} accessibilityLabel="b" imageLabel="b" name="B" onOpen={jest.fn()} />
      </>,
    ));
    await act(async () => {});
    const full = flat(screen.getByTestId('full'));
    const bare = flat(screen.getByTestId('bare'));
    expect(full.height).toBe(metrics.height);
    expect(bare.height).toBe(metrics.height);
    expect(flat(screen.getByTestId('full-copy')).height).toBe(metrics.textHeight);
    expect(flat(screen.getByTestId('bare-copy')).height).toBe(metrics.textHeight);
    expect(flat(screen.getByTestId('full-media')).height).toBe(metrics.mediaHeight);
    // Le texte long est coupé sur UNE ligne, jamais deux.
    expect(screen.getByTestId('full-name').props.numberOfLines).toBe(1);
    expect(screen.getByTestId('full-brand').props.numberOfLines).toBe(1);
    expect(flat(screen.getByTestId('full-meta')).height).toBe(metrics.lines.meta);
    expect(flat(screen.getByTestId('bare-price')).height).toBe(metrics.lines.price);
  });
});

const product = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'PUMA SNEAKERS HERREN 401622', description: '', image: '/main.jpg', additionalImages: ['/side.jpg', '/sole.jpg'],
  brandId: 'b', brandName: 'Puma', category: '', sourceUrl: '', sourcePlatform: '', originalPrice: 0, currency: 'TND',
  convertedPrice: 0, customsFee: 0, shippingFee: 0, serviceFee: 0, finalPrice: 30.9, compareAtPrice: null,
  expressAvailable: false, stockStatus: 'AVAILABLE', arrivalIds: [], sheet: null, family: null, attributes: [], ficheLabels: null,
  ...overrides,
}) as never;

describe('ProductCard — boutique', () => {
  beforeEach(() => { mockAddToCart.mockClear(); });

  it('lignes (Privé, 14/11) : marque · nom · info · prix ; plus de panier ni de « En stock »', async () => {
    render(wrap(<ProductCard product={product()} onOpen={jest.fn()} metrics={metrics} />));
    await act(async () => {});
    expect(screen.getByTestId('product-card-p1-brand').props.children).toBe('Puma');
    expect(screen.getByText('PUMA SNEAKERS HERREN 401622')).toBeTruthy();
    expect(screen.queryByText('En stock')).toBeNull();
    expect(screen.queryByTestId('product-card-cart-p1')).toBeNull();
    expect(screen.getAllByTestId(/^product-card-p1-dot-/, HIDDEN)).toHaveLength(3);
    expect(flat(screen.getByTestId('product-card-p1')).height).toBe(metrics.height);
  });

  it('prix conseillé barré seulement s’il vient du CRM et dépasse le prix ; sinon le stock utile', async () => {
    const view = render(wrap(<ProductCard product={product({ compareAtPrice: 49.9 })} onOpen={jest.fn()} metrics={metrics} />));
    await act(async () => {});
    expect(screen.getByText(/Prix conseillé/)).toBeTruthy();
    expect(screen.getByText('49.90 TND')).toBeTruthy();
    view.unmount();
    render(wrap(<ProductCard product={product({ compareAtPrice: 20, stockStatus: 'LIMITED' })} onOpen={jest.fn()} metrics={metrics} />));
    await act(async () => {});
    expect(screen.queryByText(/Prix conseillé/)).toBeNull();
    expect(screen.getByText('Stock limité')).toBeTruthy();
  });

  it('un appui ouvre la fiche sur la photo regardée', async () => {
    const onOpen = jest.fn();
    render(wrap(<ProductCard product={product()} onOpen={onOpen} metrics={metrics} />));
    await act(async () => {});
    fireEvent.press(screen.getByTestId('product-card-p1-photo-1'));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p1' }), 1);
  });

  it('sans prix ni marque : « Sans tarif », même hauteur', async () => {
    render(wrap(<ProductCard product={product({ id: 'p2', finalPrice: 0, brandName: '', stockStatus: 'weird' })} onOpen={jest.fn()} metrics={metrics} />));
    await act(async () => {});
    expect(screen.getByText('Sans tarif')).toBeTruthy();
    expect(screen.getByText('Disponibilité non confirmée')).toBeTruthy();
    expect(screen.queryByTestId('product-card-cart-p2')).toBeNull();
    expect(flat(screen.getByTestId('product-card-p2')).height).toBe(metrics.height);
  });

  it('Promo et Combinaisons deviennent des pastilles sur la photo (la carte ne grandit pas)', async () => {
    render(wrap(<ProductCard product={product()} onOpen={jest.fn()} metrics={metrics} promo hasCombinations />));
    await act(async () => {});
    expect(screen.getByText('Promo')).toBeTruthy();
    expect(flat(screen.getByTestId('product-card-p1')).height).toBe(metrics.height);
  });
});

describe('Boutique — grille et bascule grandes / petites photos', () => {
  it('compteur, bascule enregistrée, colonnes qui changent, fiche ouverte sur la photo', async () => {
    mockPush.mockClear();
    const client = newClient();
    client.setQueryData(['catalog', 'products', ''], [product(), product({ id: 'p2', name: 'Autre' }), product({ id: 'p3', name: 'Encore' })]);
    client.setQueryData(['catalog', 'arrivals'], []);
    render(wrap(<CatalogScreen />, client));
    await act(async () => {});

    expect(screen.getByTestId('product-grid-bar-count').props.children).toBe('3 articles');
    // Fenêtre de test : 750 dp (tablette) ⇒ 3 colonnes en petites photos, 2 en grandes.
    expect(grid().props.numColumns).toBe(3);
    const toggle = screen.getByTestId('product-density-toggle');
    expect(toggle.props.accessibilityLabel).toBe('Afficher en grandes photos');
    await act(async () => { fireEvent.press(toggle); });
    expect(grid().props.numColumns).toBe(2);
    expect(screen.getByTestId('product-density-toggle').props.accessibilityLabel).toBe('Afficher en petites photos');
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const saved = JSON.parse((await AsyncStorage.getItem('ayrovi.prefs.v1')) ?? '{}');
    expect(saved.productDensity).toBe('large');

    // Toutes les cartes de la grille ont la même hauteur.
    const heights = ['p1', 'p2', 'p3'].map((id) => flat(screen.getByTestId(`product-card-${id}`)).height);
    expect(new Set(heights).size).toBe(1);

    fireEvent.press(screen.getByTestId('product-card-p1-photo-0'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'p1' } });
    fireEvent.press(screen.getByTestId('product-card-p2-photo-1'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'p2', photo: '1' } });

    await act(async () => { fireEvent.press(screen.getByTestId('product-density-toggle')); });
    expect(grid().props.numColumns).toBe(3);
  });
});
