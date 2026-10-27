// Rendu de l'écran Magasins (page AYWEBs) avec le catalogue complet (380 boutiques).
// Sert de filet de sécurité contre les plantages au montage : une erreur de rendu
// dans la grille, une carte ou le lien « Visiter le site » fait échouer ce test.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';
import StoresScreen, { ErrorBoundary } from '../../app/aywebs/stores';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { MEDIA_RATIO } from '@/design/tokens.mobile';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));

const CATEGORY_IDS = [
  'marketplace', 'fashion', 'shoes', 'electronics', 'gaming', 'beauty', 'perfumes', 'home',
  'kitchen', 'sports', 'luxury', 'kids', 'travel', 'accessories', 'arts',
] as const;

const mockCategories: AyWebsCategory[] = CATEGORY_IDS.map((id) => ({
  id, labelFr: id, labelAr: id,
}));

/** 380 boutiques, dont la moitié avec logo, l'autre moitié avec `logo: ''` (lettre). */
const mockStores: AyWebsStore[] = Array.from({ length: 380 }, (_, i) => {
  const id = `store-${i}`;
  const cat = CATEGORY_IDS[i % CATEGORY_IDS.length];
  const second = CATEGORY_IDS[(i + 3) % CATEGORY_IDS.length];
  return {
    id,
    name: id,
    displayName: `Boutique ${i}`,
    country: '',
    currency: '',
    enabled: false,
    captureSupported: false,
    operational: false,
    operationalReason: '',
    adapter: 'generic',
    status: 'planned',
    integrationType: 'URL_REQUEST',
    capabilities: ['browse'],
    browserMode: 'external',
    homeUrl: `https://www.store${i}.example`,
    logo: i % 2 === 0 ? `/stores/${id}.png` : '',
    purchaseMode: '',
    popular: false,
    categories: [cat, second],
    description: '',
  };
});

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

describe('écran Magasins — catalogue complet', () => {
  beforeEach(() => mockPush.mockClear());

  it('les boutiques sont des grandes cartes 3:4 remplies par le logo, sans réserve', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-media-store-0')).toBeTruthy(), { timeout: 5000 });

    const media = StyleSheet.flatten(screen.getByTestId('aywebs-store-media-store-0').props.style);
    expect(media.aspectRatio).toBe(MEDIA_RATIO.storeCard);
    expect(media.width).toBe('100%');

    /* ── Corrigé le 27/10/2026 ───────────────────────────────────────────────
       Le client a tranché sur la capture : « صورة الشعار قد البطاقة بالظبط،
       بلا مسحات رمادية ولا بيضاء ». La réserve de 24 pt laissait justement
       une bande autour du logo. Les cartes-logo embarquées font 3:4 comme la
       plaque, donc `cover` les fait toucher les bords. Un logo serveur d'un
       autre format garde `contain` : ces boutiques-là (380 ici) n'ont pas de
       carte-logo, et les rogner serait pire que la bande. */
    expect(media.padding).toBeUndefined();

    const logo = screen.getByTestId('aywebs-store-logo-store-0');
    expect(logo.props.contentFit).toBe('contain');
  });

  it('se monte avec les 380 boutiques sans erreur', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-store-0')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('aywebs-store-store-379')).toBeTruthy();
  });

  it('affiche le lien « Visiter le site » sur les cartes (y compris catalogue)', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-visit-store-1')).toBeTruthy(), { timeout: 5000 });
  });

  it('une erreur de rendu affiche le bloc d\'erreur avec « Réessayer » au lieu de fermer l\'app', async () => {
    const retry = jest.fn();
    render(
      <PrefsProvider>
        <ThemeProvider>
          <I18nProvider>
            <ErrorBoundary error={new Error('boom')} retry={retry} />
          </I18nProvider>
        </ThemeProvider>
      </PrefsProvider>,
    );
    expect(screen.getByText(/erreur inattendue/i)).toBeTruthy();
    fireEvent.press(screen.getByRole('button'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('toucher une boutique du catalogue l\'ouvre dans le navigateur intégré (barre AYWEBs)', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-store-1')).toBeTruthy(), { timeout: 5000 });
    await act(async () => { fireEvent.press(screen.getByTestId('aywebs-store-store-1')); });
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/aywebs/browser' }));
  });

  it('ouvre la liste complète sans erreur', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-store-0')).toBeTruthy(), { timeout: 5000 });
    await act(async () => { fireEvent.press(screen.getByTestId('aywebs-stores-list')); });
    expect(screen.getByTestId('aywebs-store-store-379')).toBeTruthy();
  });
});
