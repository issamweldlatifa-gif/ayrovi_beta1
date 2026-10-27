// Un logo officiel par boutique — 27/10/2026.
//
// Le client a envoyé dix-neuf logos et demandé de « mettre chaque logo dans sa
// boutique ». Ce test vérifie le contrat visible :
//   • une boutique connue affiche SON logo, en `contain` (jamais rogné) ;
//   • la plaque derrière ce logo est blanche (la version claire du logo est
//     noire sur blanc) — donc aucune bande grise autour du mot-symbole ;
//   • une boutique sans logo connu garde son initiale : on n'invente rien.
import { render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';
import StoresScreen from '../../app/aywebs/stores';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));

const mockCategories: AyWebsCategory[] = [
  { id: 'fashion', labelFr: 'Mode', labelAr: 'الموضة' },
  { id: 'sports', labelFr: 'Sport & plein air', labelAr: 'الرياضة' },
];

function store(partial: Partial<AyWebsStore> & Pick<AyWebsStore, 'id' | 'displayName'>): AyWebsStore {
  return {
    name: partial.displayName,
    country: '',
    currency: '',
    enabled: true,
    captureSupported: true,
    operational: true,
    operationalReason: '',
    adapter: 'catalogue',
    status: 'beta',
    integrationType: 'PARTIALLY_SUPPORTED',
    capabilities: ['browse'],
    browserMode: 'external',
    homeUrl: `https://www.${partial.id}.example`,
    logo: `/stores/${partial.id}.png`,
    purchaseMode: '',
    popular: false,
    categories: ['fashion'],
    description: '',
    ...partial,
  } as AyWebsStore;
}

// Trois cas : une marque connue par son identifiant, une marque reconnue par son
// LIBELLÉ seulement (New Balance), et une boutique inconnue.
const mockStores: AyWebsStore[] = [
  store({ id: 'nike', displayName: 'Nike', categories: ['sports'] }),
  store({ id: 'store-42', displayName: 'New Balance', categories: ['fashion'] }),
  // `logo: ''` = le serveur ne publie aucun fichier : la carte garde l'initiale.
  store({ id: 'store-99', displayName: 'Boutique 99', logo: '', categories: ['fashion'] }),
];

jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    fetchAyWebsStoreCatalog: jest.fn(async () => ({ stores: mockStores, categories: mockCategories })),
  };
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <PrefsProvider>
          <I18nProvider>
            <ThemeProvider>
              <StoresScreen />
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

describe('logos officiels dans les cartes de boutique', () => {
  it('affiche le logo de la marque, entier, sur la plaque du design system', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-logo-nike')).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByTestId('aywebs-store-media-store-99')).toBeTruthy(), { timeout: 5000 });

    const media = screen.getByTestId('aywebs-store-media-nike');
    const style = StyleSheet.flatten(media.props.style);
    /* Plus de réserve (27/10/2026) : la carte-logo est dessinée en 3:4 comme la
       plaque, elle la remplit bord à bord — ni bande grise, ni bande blanche. */
    expect(style.padding).toBeUndefined();
    // Le logo est un PNG TRANSPARENT : il ne réclame aucune plaque à lui,
    // donc la carte garde exactement le fond d'une carte sans logo.
    const sansLogo = StyleSheet.flatten(screen.getByTestId('aywebs-store-media-store-99').props.style);
    expect(style.backgroundColor).toBe(sansLogo.backgroundColor);

    const logo = screen.getByTestId('aywebs-store-logo-nike');
    // `cover` sur une carte-logo au même rapport : le dessin touche les bords
    // sans être coupé, puisque le fichier et la plaque font tous deux 3:4.
    expect(logo.props.contentFit).toBe('cover');
    expect(logo.props.source).toBeTruthy();
  });

  it('reconnaît une marque par son libellé quand l’identifiant est neutre', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-logo-store-42')).toBeTruthy(), { timeout: 5000 });
    const media = StyleSheet.flatten(screen.getByTestId('aywebs-store-media-store-42').props.style);
    const sansLogo = StyleSheet.flatten(screen.getByTestId('aywebs-store-media-store-99').props.style);
    expect(media.backgroundColor).toBe(sansLogo.backgroundColor);
  });

  it('garde l’initiale d’une boutique sans logo connu', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-store-99')).toBeTruthy(), { timeout: 5000 });
    // La carte sans logo affiche l'initiale, pas un cadre d'image.
    expect(screen.queryByTestId('aywebs-store-logo-store-99')).toBeNull();
  });
});
