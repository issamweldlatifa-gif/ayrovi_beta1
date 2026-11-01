// Onglet AYWEBs : trois sections, dans l'ordre — catégories, sponsorisé, boutiques.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';
import AyWebsScreen from '../../app/(tabs)/aywebs';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { MEDIA_RATIO } from '@/design/tokens.mobile';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
    Stack: { Screen: () => null },
  };
});
jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('@/features/shell/AppHeader', () => ({
  AppHeader: () => null,
}));

const mockCategories: AyWebsCategory[] = [
  { id: 'marketplace', labelFr: 'Marketplace', labelAr: 'Marketplace' },
  // Les six catégories de la section 1 (référence du 27/10/2026) : le serveur
  // publie leur libellé, l'ordre et les photos viennent de l'application.
  { id: 'beauty', labelFr: 'Beauté et parfum', labelAr: 'الجمال والعطور' },
  { id: 'home', labelFr: 'Meubles', labelAr: 'الأثاث' },
  { id: 'sports', labelFr: 'Sports et loisirs', labelAr: 'الرياضة والأنشطة' },
  { id: 'audio', labelFr: 'Casques et écouteurs', labelAr: 'السماعات والهيدفون' },
  { id: 'outdoor', labelFr: 'Activités de plein air', labelAr: 'أنشطة في الهواء الطلق' },
  { id: 'pets', labelFr: 'Animalerie', labelAr: 'مستلزمات الحيوانات' },
];
const mockStores: AyWebsStore[] = Array.from({ length: 4 }, (_, i) => ({
  id: `store-${i}`,
  name: `store-${i}`,
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
  capabilities: [],
  browserMode: 'external',
  homeUrl: `https://www.store${i}.example`,
  logo: '',
  purchaseMode: '',
  popular: false,
  categories: i === 0 ? ['marketplace', 'beauty'] : ['marketplace'],
  description: '',
}));

jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    fetchAyWebsStoreCatalog: jest.fn(async () => ({ stores: mockStores, categories: mockCategories })),
    fetchAyWebsCart: jest.fn(async () => ({ items: [], units: 0, totalTND: 0 })),
  };
});

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <PrefsProvider>
          <I18nProvider>
            <ThemeProvider>
              <View style={{ flex: 1 }}>
                <AyWebsScreen />
              </View>
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

describe('onglet AYWEBs — accueil en trois sections', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('affiche les catégories, le bloc sponsorisé et les boutiques — sans reprise ni footer promotionnel', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-store-card-store-0')).toBeTruthy(), { timeout: 5000 });

    expect(screen.getByTestId('aywebs-home-content')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-search')).toBeTruthy();

    // 1 — catégories : les SIX tuiles de la référence, avec leur photo.
    expect(screen.getByTestId('aywebs-home-section-categories')).toBeTruthy();
    for (const id of ['beauty', 'home', 'sports', 'audio', 'outdoor', 'pets']) {
      expect(screen.getByTestId(`aywebs-home-category-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`aywebs-home-category-image-${id}`)).toBeTruthy();
    }
    // Une catégorie hors référence n'a pas de tuile : la section n'est plus un
    // tri « six premières du serveur » mais un ordre éditorial fixe.
    expect(screen.queryByTestId('aywebs-home-category-marketplace')).toBeNull();

    // 2 — sponsorisé : visuel, titre et bouton contour
    expect(screen.getByTestId('aywebs-home-section-sponsor')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-sponsor-art')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-sponsor-cta')).toBeTruthy();

    // 3 — boutiques : quatre cartes. La barre « Toutes les boutiques » qui
    // doublait l'entrée de la section est supprimée (28/10/2026) : le titre de
    // section porte le chevron, et rien d'autre ne mène à la liste.
    expect(screen.getByTestId('aywebs-home-section-stores')).toBeTruthy();
    expect(screen.queryByTestId('aywebs-home-all-stores')).toBeNull();
    expect(screen.queryByText('Toutes les boutiques')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('4')).toBeNull();

    // Les anciennes pièces ont quitté la page : trois sections, rien d'autre.
    expect(screen.queryByTestId('aywebs-home-resume')).toBeNull();
    expect(screen.queryByTestId('aywebs-home-promo')).toBeNull();
    expect(screen.queryByTestId('aywebs-analyze')).toBeNull();
    expect(screen.queryByTestId('aywebs-resolve')).toBeNull();
  });

  it('les cartes sont grandes et carrées, en deux colonnes', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-store-card-store-0')).toBeTruthy(), { timeout: 5000 });

    const card = screen.getByTestId('aywebs-home-store-card-store-0');
    expect(StyleSheet.flatten(card.props.style).width).toBe('48%');

    const media = screen.getByTestId('aywebs-home-store-media-store-0');
    const mediaStyle = StyleSheet.flatten(media.props.style);
    expect(mediaStyle.aspectRatio).toBe(MEDIA_RATIO.storeCard);
    expect(mediaStyle.width).toBe('100%');
    /* ── Corrigé le 27/10/2026 ───────────────────────────────────────────────
       Décision du client sur la capture de son téléphone : le logo doit faire
       EXACTEMENT la taille de la carte, « بلا مسحات رمادية ولا بيضاء ». La
       réserve de 24 pt — et la bande blanche des cartes-logo — disparaissent.
       Les logos embarqués sont désormais dessinés en 3:4, comme la plaque. */
    expect(mediaStyle.padding).toBeUndefined();

    const category = screen.getByTestId('aywebs-home-category-beauty');
    expect(StyleSheet.flatten(category.props.style).width).toBe('48%');

    // Carte de CATÉGORIE : paysage 2,72:1 (référence du 27/10/2026), et pas de
    // réserve — c'est une PHOTO, elle remplit la tuile bord à bord. Une réserve
    // de 24 pt ici ramenait le cadre gris corrigé le 27/10/2026.
    const categoryMedia = screen.getByTestId('aywebs-home-category-media-beauty');
    const categoryMediaStyle = StyleSheet.flatten(categoryMedia.props.style);
    expect(categoryMediaStyle.aspectRatio).toBe(MEDIA_RATIO.categoryCard);
    expect(categoryMediaStyle.padding).toBeUndefined();
    expect(screen.getByTestId('aywebs-home-category-image-beauty')).toBeTruthy();
  });

  it('la section catégories ne promet pas d’écran qui n’existe pas', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-category-beauty')).toBeTruthy(), { timeout: 5000 });

    // Titre seul, sans chevron tant que l'écran des catégories n'est pas livré.
    const titres = screen.getAllByTestId('aywebs-section-title');
    expect(titres.length).toBeGreaterThan(0);
    // Le titre de la section catégories est un View, pas un bouton.
    expect(screen.queryByRole('button', { name: 'Explorer les catégories' })).toBeNull();
    expect(screen.getByText('Explorer les catégories')).toBeTruthy();
  });

  it('le titre de la section boutiques mène à la liste complète', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-section-stores')).toBeTruthy(), { timeout: 5000 });
    /* Une seule entrée vers la liste : le titre de section (chevron). La barre
       « Toutes les boutiques » n'existe plus. */
    const entry = screen.getByRole('button', { name: 'Explorer les boutiques' });
    fireEvent.press(entry);
    expect(router.push).toHaveBeenCalledWith('/aywebs/stores');
  });

  it('does not add a separate cart card to the home body', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-content')).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByTestId('aywebs-open-cart')).toBeNull();
    expect(screen.queryByText('Panier d’achat')).toBeNull();
  });
});
