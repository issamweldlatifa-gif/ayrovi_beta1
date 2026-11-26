/**
 * S BASE — un seul champ (mot-clé ou photo), des groupes par boutique, un filtre.
 *
 * Ce que ces tests montrent (rendu réel, réseau simulé) :
 *   1. le champ unique + la caméra remplacent la grille de boutiques ;
 *   2. le filtre = la sélection des boutiques interrogées (défaut décidé serveur) ;
 *   3. chaque groupe porte SON temps et SON code d'erreur : un échec n'efface pas
 *      les résultats des autres ;
 *   4. une photo lance la recherche visuelle et le filtre se construit sur les
 *      boutiques réellement présentes dans les résultats ;
 *   5. changer la sélection après coup ne relance rien en silence : on le dit.
 */
import React from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { fetchSbaseItem, fetchSbaseSources, searchSbase, searchSbaseImage } from '../../src/api/sbase';
import { SbaseItemScreen } from '../../src/features/sbase/SbaseItemScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../src/features/shell/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('../../src/state/session', () => ({ useSession: () => ({ status: 'signedOut', account: null }) }));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' }],
  })),
}));

jest.mock('../../src/api/sbase', () => ({
  fetchSbaseSources: jest.fn(),
  searchSbase: jest.fn(),
  searchSbaseImage: jest.fn(),
  fetchSbaseItem: jest.fn(),
}));

const sourcesMock = fetchSbaseSources as unknown as jest.Mock;
const searchMock = searchSbase as unknown as jest.Mock;
const imageMock = searchSbaseImage as unknown as jest.Mock;
const itemMock = fetchSbaseItem as unknown as jest.Mock;

const supports = { keyword: true, url: false, image: false, details: false, price: true, variants: false, barcode: false };

const source = (id: string, label: string, defaultEnabled: boolean) => ({
  id, label, vendor: `${id}.com`, supports, fields: ['title', 'price'], markets: [], defaultMarket: null,
  costUsd: 0.014286, async: false, defaultEnabled, configured: true,
});

const SOURCES = {
  provider: 'sandbase',
  configured: true,
  sources: [
    source('aliexpress', 'AliExpress', true),
    source('amazon', 'Amazon', true),
    source('ebay', 'eBay', true),
    source('google-shopping', 'Google Shopping', true),
    source('bing-shopping', 'Bing Shopping', false),
    source('taobao', 'Taobao', false),
    source('1688', '1688', false),
  ],
  image: {
    id: 'google-lens', label: 'Google Lens', vendor: 'google.com',
    supports: { ...supports, image: true }, storeFromResults: true, configured: true,
  },
};

const item = (title: string, extra: Record<string, unknown> = {}) => ({
  id: 'x', title, url: 'https://shop/1', image: null, priceText: '89,99 €', amount: 89.99,
  currency: 'EUR', store: 'Amazon', rating: null, reviews: null, shipping: null, condition: null,
  missing: ['image'], ...extra,
});

const supportsDetails = { ...supports, details: true };

const GROUP_OK = {
  source: { id: 'amazon', label: 'Amazon', vendor: 'amazon.fr', supports: supportsDetails },
  status: 'ok' as const, items: [item('Casque Bluetooth')], count: 1,
  durationMs: 812, cached: false, async: false, error: null, costUsd: 0.014286, billedPerResult: false,
};

const GROUP_ERROR = {
  source: { id: 'ebay', label: 'eBay', vendor: 'ebay.fr', supports },
  status: 'error' as const, items: [], count: 0, durationMs: 0,
  cached: false, async: false, error: { code: 'SANDBASE_UNAUTHORIZED', message: 'clé refusée' }, costUsd: 0.015,
  billedPerResult: false,
};

const GROUP_NO_DETAILS = {
  source: { id: 'aliexpress', label: 'AliExpress', vendor: 'aliexpress.com', supports },
  status: 'ok' as const, items: [item('Coque iPhone', { url: 'https://ae/9', store: null })], count: 1,
  durationMs: 640, cached: false, async: false, error: null, costUsd: 0.014286, billedPerResult: false,
};

const DETAIL = {
  source: { id: 'amazon', label: 'Amazon', vendor: 'amazon.fr', supports: supportsDetails },
  detail: {
    title: 'Casque Bluetooth', brand: 'SONY', priceText: null, amount: 89.99, currency: 'EUR',
    oldPriceText: '129,00 €', rating: 4.6, reviews: 1200, availability: 'En stock', seller: 'Amazon.fr',
    url: 'https://amazon.fr/dp/B01', images: ['https://img/1.jpg', 'https://img/2.jpg'],
    description: 'Casque à réduction de bruit.',
    specs: [{ name: 'Autonomie', value: '30 h' }],
    variants: [
      { name: 'Couleur', values: [{ label: 'Noir', available: true, image: null }, { label: 'Blanc', available: false, image: null }] },
      { name: 'Taille', values: [{ label: 'M', available: null, image: null }] },
    ],
    missing: ['rating'],
  },
  durationMs: 1500, cached: false, costUsd: 0.015, billedPerResult: false,
  fetchedAt: new Date().toISOString(),
};

const RESULT = {
  query: 'mini traceur gps',
  totalMs: 1240,
  groups: [GROUP_OK, GROUP_ERROR, GROUP_NO_DETAILS],
  count: 1,
  missingFields: ['image'],
  fetchedAt: new Date().toISOString(),
};

const IMAGE_RESULT = {
  mode: 'image' as const,
  channel: SOURCES.image,
  status: 'ok' as const,
  items: [
    item('Traceur GPS Amazon', { store: 'Amazon' }),
    item('Traceur GPS SHEIN', { store: 'SHEIN', url: 'https://shein/p/2' }),
  ],
  count: 2,
  stores: ['Amazon', 'SHEIN'],
  missingFields: ['image'],
  durationMs: 900,
  totalMs: 1100,
  fetchedAt: new Date().toISOString(),
};

function mount() {
  const SbaseTab = require('../../app/(tabs)/sbase').default;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <QueryClientProvider client={client}>
            <SbaseTab />
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  sourcesMock.mockResolvedValue(SOURCES);
});

describe('S Base — un champ, des boutiques en filtre', () => {
  it('affiche le champ unique, la caméra et les boutiques (défaut = grand public)', async () => {
    const view = mount();
    expect(await screen.findByTestId('sbase-query')).toBeTruthy();
    expect(screen.getByTestId('sbase-photo')).toBeTruthy();

    const aliexpress = await screen.findByTestId('sbase-source-aliexpress');
    // Sélection par défaut décidée par le serveur (4 boutiques grand public).
    expect(aliexpress.props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('sbase-source-amazon').props.accessibilityState.selected).toBe(true);
    // Les sources « sourcing » existent mais ne partent pas d'office.
    expect(screen.getByTestId('sbase-source-1688').props.accessibilityState.selected).toBe(false);
    view.unmount();
  });

  it('cherche par mot-clé sur les boutiques cochées et montre le temps par groupe', async () => {
    searchMock.mockResolvedValue(RESULT);
    const view = mount();

    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'mini traceur gps');
    fireEvent.press(screen.getByTestId('sbase-submit'));

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith({
      q: 'mini traceur gps',
      sources: ['aliexpress', 'amazon', 'ebay', 'google-shopping'],
    }));

    expect(await screen.findByText('Casque Bluetooth')).toBeTruthy();
    expect(await screen.findByTestId('sbase-response-time')).toHaveTextContent(/1,2 s/);
    // Le groupe Amazon porte son propre temps ; eBay porte son code d'erreur.
    expect(screen.getByTestId('sbase-group-amazon-meta')).toHaveTextContent(/812 ms/);
    expect(screen.getByTestId('sbase-group-ebay-meta')).toHaveTextContent(/SANDBASE_UNAUTHORIZED/);
    view.unmount();
  });

  it('décocher une boutique masque son groupe immédiatement, sans nouvel appel payant', async () => {
    searchMock.mockResolvedValue(RESULT);
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'casque');
    fireEvent.press(screen.getByTestId('sbase-submit'));
    expect(await screen.findByTestId('sbase-group-amazon')).toBeTruthy();

    // Décocher Amazon → son groupe disparaît du rendu (aucun appel réseau en plus).
    fireEvent.press(screen.getByTestId('sbase-source-amazon'));
    await waitFor(() => expect(screen.queryByTestId('sbase-group-amazon')).toBeNull());
    // Et l'écran prévient qu'il faut relancer pour la nouvelle sélection.
    expect(screen.getByTestId('sbase-stale')).toBeTruthy();
    expect(searchMock).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

describe('S Base — fiche produit', () => {
  it('un résultat de boutique avec fiche ouvre la fiche interne, pas le navigateur', async () => {
    searchMock.mockResolvedValue(RESULT);
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'casque');
    fireEvent.press(screen.getByTestId('sbase-submit'));

    fireEvent.press(await screen.findByText('Casque Bluetooth'));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/sbase/item',
      params: expect.objectContaining({ source: 'amazon', id: 'x' }),
    }));
    view.unmount();
  });

  it('une boutique sans fiche (AliExpress) ouvre le lien d’origine', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    searchMock.mockResolvedValue(RESULT);
    const view = mount();
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'casque');
    fireEvent.press(screen.getByTestId('sbase-submit'));

    fireEvent.press(await screen.findByText('Coque iPhone'));
    expect(open).toHaveBeenCalledWith('https://ae/9');
    open.mockRestore();
    view.unmount();
  });

  it('la fiche affiche prix, marque, tailles/couleurs et champs manquants', async () => {
    itemMock.mockResolvedValue(DETAIL);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <PrefsProvider><I18nProvider><ThemeProvider><QueryClientProvider client={client}>
        <SbaseItemScreen source="amazon" id="B01" title="Casque Bluetooth" url={null} />
      </QueryClientProvider></ThemeProvider></I18nProvider></PrefsProvider>,
    );

    expect(await screen.findByText('Casque Bluetooth')).toBeTruthy();
    expect(screen.getByText(/89,99/)).toBeTruthy();
    expect(screen.getByText('Marque · SONY')).toBeTruthy();
    // Les tailles/couleurs viennent du serveur : rien de fabriqué côté app.
    expect(screen.getByText('Noir')).toBeTruthy();
    expect(screen.getByText('M')).toBeTruthy();
    expect(screen.getByText('Autonomie')).toBeTruthy();
    expect(await screen.findByTestId('sbase-item-response')).toHaveTextContent(/1,5 s/);
    view.unmount();
  });

  it('boutique sans fiche : l’écran le dit au lieu d’afficher du vide', async () => {
    itemMock.mockRejectedValue(Object.assign(new Error('unsupported'), { code: 'DETAILS_UNSUPPORTED' }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <PrefsProvider><I18nProvider><ThemeProvider><QueryClientProvider client={client}>
        <SbaseItemScreen source="aliexpress" id="100500" title={null} url="https://ae/9" />
      </QueryClientProvider></ThemeProvider></I18nProvider></PrefsProvider>,
    );
    expect(await screen.findByTestId('sbase-item-error')).toBeTruthy();
    expect(screen.getByText(/ne publie pas de fiche produit|ما ينشرش فيش منتج/)).toBeTruthy();
    view.unmount();
  });
});

describe('S Base — photo', () => {
  it('la caméra lance une recherche visuelle ; le filtre se construit sur les boutiques reçues', async () => {
    imageMock.mockResolvedValue(IMAGE_RESULT);
    const view = mount();

    // La caméra ne s'active qu'une fois les sources reçues (elle dépend de la
    // configuration du canal image) : on attend une boutique, pas le bouton.
    await screen.findByTestId('sbase-source-aliexpress');
    fireEvent.press(screen.getByTestId('sbase-photo'));

    await waitFor(() => expect(imageMock).toHaveBeenCalledWith({
      uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg',
    }));

    expect(await screen.findByText('Traceur GPS Amazon')).toBeTruthy();
    expect(screen.getByText('Traceur GPS SHEIN')).toBeTruthy();
    expect(screen.getByTestId('sbase-image-summary')).toHaveTextContent(/2 résultats/);

    // Filtre par boutique issue des résultats (SHEIN n'est pas une source SandBase).
    fireEvent.press(screen.getByTestId('sbase-store-SHEIN'));
    await waitFor(() => expect(screen.queryByText('Traceur GPS Amazon')).toBeNull());
    expect(screen.getByText('Traceur GPS SHEIN')).toBeTruthy();
    view.unmount();
  });

  it('sans clé SandBase, la page l’annonce au lieu d’inventer des résultats', async () => {
    sourcesMock.mockResolvedValue({ ...SOURCES, configured: false });
    const view = mount();
    expect(await screen.findByTestId('sbase-unconfigured')).toBeTruthy();
    view.unmount();
  });
});
