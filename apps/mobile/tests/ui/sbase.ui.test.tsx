/**
 * S BASE — le banc marchand doit dire la vérité, ou ne rien dire.
 *
 * Ce que ces tests montrent (rendu réel, réseau simulé) :
 *   1. le hub liste les boutiques du serveur et n'affiche QUE les capacités
 *      réellement fournies (aucun chip « Image »/« URL »/« Code-barres ») ;
 *   2. sans clé côté serveur, l'écran annonce « non configuré » — pas de faux
 *      résultats pour faire joli ;
 *   3. une recherche réelle affiche résultats, prix de la source, temps de
 *      réponse mesuré et les champs que la source n'a pas fournis ;
 *   4. une erreur SandBase affiche son code, et aucun produit.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { fetchSbaseSources, searchSbase } from '../../src/api/sbase';

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

jest.mock('../../src/api/sbase', () => ({
  fetchSbaseSources: jest.fn(),
  searchSbase: jest.fn(),
}));

const sourcesMock = fetchSbaseSources as unknown as jest.Mock;
const searchMock = searchSbase as unknown as jest.Mock;

const SOURCES = {
  provider: 'sandbase',
  configured: true,
  sources: [
    {
      id: 'aliexpress', label: 'AliExpress', vendor: 'aliexpress.com',
      supports: { keyword: true, url: false, image: false, details: false, price: true, variants: false, barcode: false },
      fields: ['title', 'price', 'image', 'link'], markets: [], defaultMarket: null,
      costUsd: 0.014286, async: false, configured: true,
    },
    {
      id: 'amazon', label: 'Amazon', vendor: 'amazon.fr',
      supports: { keyword: true, url: false, image: false, details: false, price: true, variants: false, barcode: false },
      fields: ['title', 'price', 'image', 'link', 'store'], markets: [{ code: 'FR', label: 'France' }],
      defaultMarket: 'FR', costUsd: 0.014286, async: false, configured: true,
    },
  ],
};

const RESULT = {
  source: { id: 'aliexpress', label: 'AliExpress', vendor: 'aliexpress.com', supports: SOURCES.sources[0].supports },
  query: 'casque bluetooth',
  market: null,
  status: 'ok' as const,
  items: [{
    id: '1001', title: 'Casque Bluetooth sans fil', url: 'https://ae/1', image: null,
    priceText: '89,99 €', amount: 89.99, currency: 'EUR', store: null, rating: null,
    reviews: null, shipping: null, condition: null, missing: ['image', 'store'],
  }],
  count: 1,
  missingFields: ['image', 'store'],
  durationMs: 812,
  cached: false,
  async: false,
  polls: 0,
  runId: null,
  costUsd: 0.014286,
  fetchedAt: new Date().toISOString(),
};

function mount(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <QueryClientProvider client={client}>{node}</QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
}

function mountHub() {
  const Hub = require('../../app/(tabs)/sbase').default;
  return mount(<Hub />);
}

function mountMerchant(id: string) {
  const { SbaseMerchantSearch } = require('../../src/features/sbase/SbaseScreens');
  return mount(<SbaseMerchantSearch merchant={id} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  sourcesMock.mockResolvedValue(SOURCES);
});

describe('S Base — hub', () => {
  it('liste les boutiques et ouvre la recherche de la boutique choisie', async () => {
    const view = mountHub();
    const card = await screen.findByTestId('sbase-source-aliexpress');
    expect(await screen.findByText('AliExpress')).toBeTruthy();
    expect(await screen.findByText('Amazon')).toBeTruthy();

    // Capacités réelles uniquement : « Mots-clés » et « Prix », jamais « Image ».
    expect(screen.getAllByText('Mots-clés').length).toBeGreaterThan(0);
    expect(screen.queryByText('Image')).toBeNull();
    expect(screen.queryByText('Code-barres')).toBeNull();

    fireEvent.press(card);
    expect(router.push).toHaveBeenCalledWith('/sbase/aliexpress');
    view.unmount();
  });

  it('sans clé SandBase : la page l’annonce au lieu d’inventer des résultats', async () => {
    sourcesMock.mockResolvedValue({ ...SOURCES, configured: false });
    const view = mountHub();
    expect(await screen.findByTestId('sbase-unconfigured')).toBeTruthy();
    expect(screen.getByText(/n'est pas encore activé|غير مفعّل/)).toBeTruthy();
    view.unmount();
  });
});

describe('S Base — recherche par boutique', () => {
  it('affiche les résultats réels, le prix de la source et le temps de réponse', async () => {
    searchMock.mockResolvedValue(RESULT);
    const view = mountMerchant('aliexpress');

    const field = await screen.findByTestId('sbase-query');
    fireEvent.changeText(field, 'casque bluetooth');
    fireEvent.press(screen.getByTestId('sbase-submit'));

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith({
      source: 'aliexpress', q: 'casque bluetooth', market: null,
    }));

    expect(await screen.findByText('Casque Bluetooth sans fil')).toBeTruthy();
    expect(screen.getByText('89,99 €')).toBeTruthy();
    // Temps mesuré côté serveur, affiché tel quel.
    expect(await screen.findByTestId('sbase-response-time')).toHaveTextContent(/812 ms/);
    // Champs manquants nommés (la source n'a pas donné de boutique ni d'image).
    expect(screen.getByText('Boutique')).toBeTruthy();
    view.unmount();
  });

  it('une erreur SandBase affiche son code et aucun produit', async () => {
    searchMock.mockRejectedValue(Object.assign(new Error('SandBase n’a pas répondu.'), { code: 'SANDBASE_TIMEOUT' }));
    const view = mountMerchant('amazon');

    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'casque');
    fireEvent.press(screen.getByTestId('sbase-submit'));

    const error = await screen.findByTestId('sbase-error');
    expect(error).toBeTruthy();
    expect(screen.getByText('SANDBASE_TIMEOUT')).toBeTruthy();
    expect(screen.queryByTestId('sbase-item-0')).toBeNull();
    view.unmount();
  });

  it('le bouton reste inactif tant que la requête est trop courte', async () => {
    const view = mountMerchant('amazon');
    fireEvent.changeText(await screen.findByTestId('sbase-query'), 'a');
    fireEvent.press(screen.getByTestId('sbase-submit'));
    await waitFor(() => expect(searchMock).not.toHaveBeenCalled());
    view.unmount();
  });
});
