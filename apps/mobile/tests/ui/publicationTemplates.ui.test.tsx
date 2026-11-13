/**
 * Page Publication refondue (13/11/2026) — rendu réel des trois modèles.
 *  • l'en-tête reste (retour, titre, compte) ; le corps = les blocs du CRM ;
 *  • aucun bouton d'interaction (réaction, commentaire, partage) SAUF « Suivre » (13/11)
 *    et, depuis le 14/11 (planches GBox), le cœur des cartes relié aux vrais favoris ;
 *  • le duo sponsorisé : une image puis deux cartes de MÊME taille ;
 *  • l'appui sur un produit ouvre la fiche de l'application ;
 *  • la vidéo ne tourne que pour le bloc actif, avec pause et son.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { PublicationTemplatesScreen, PublicationBlockView } from '@/features/publications/PublicationTemplatesScreen';
import { parsePublicationBlocks, type PublicationBlock } from '@/api/publicationBlocks';
import { publicationTemplateMetrics } from '@/features/publications/templates/templateMetrics';

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  replaceAsync: jest.fn(() => Promise.resolve()),
  muted: true,
  loop: true,
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};
jest.mock('expo-video', () => ({
  useVideoPlayer: () => mockPlayer,
  VideoView: 'VideoView',
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), canGoBack: () => false, replace: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockQuery = jest.fn();
jest.mock('@tanstack/react-query', () => ({ useQuery: () => mockQuery() }));
/** « Suivre » : la relation (serveur + session) est testée ailleurs ; ici, son rendu. */
const mockFollowPress = jest.fn();
const mockFollow = { state: 'idle', writeFailed: false, disabled: false, press: () => mockFollowPress() };
const mockFollowCalls: Array<[string]> = [];
jest.mock('@/features/publications/usePublisherFollow', () => ({
  usePublisherFollow: (id: string) => { mockFollowCalls.push([id]); return mockFollow; },
}));
/** Cœurs (14/11) : la session et les favoris sont testés ailleurs ; ici, leur branchement. */
const mockSession = { status: 'signedOut' as string, account: null as null | { id: string } };
jest.mock('@/state/session', () => ({ useSession: () => mockSession }));
const mockFavourites = new Set<string>();
const mockToggle = jest.fn();
jest.mock('@/features/reels/useProductFavorites', () => ({
  useProductFavorites: (enabled: boolean) => ({
    isFavorite: (id: string) => enabled && mockFavourites.has(id),
    toggle: (id: string) => mockToggle(id),
  }),
}));
jest.mock('@/features/publications/PublicationAuthSheet', () => ({
  PublicationAuthSheet: () => {
    const { View } = require('react-native');
    return <View testID="publication-auth-sheet" />;
  },
}));
jest.mock('@/design/appImage', () => ({
  AppImage: (props: any) => {
    const { View } = require('react-native');
    return <View {...props} />;
  },
}));

const product = (id: string, brand = 'Kérastase') => ({
  id, name: `Produit ${id}`, brand, image: `/media/${id}.jpg`, price: 100.959, currency: 'TND', stockStatus: 'AVAILABLE', available: true,
});

const BLOCKS: PublicationBlock[] = parsePublicationBlocks([
  {
    id: 'video', kind: 'media', title: 'Accessoires', subtitle: 'Les détails qui signent une allure.', bgColor: '#FFFFFF', panelColor: '',
    sponsored: false, media: { type: 'video', url: '/media/reels-owned/accessories-v1.mp4', poster: '/media/reels-owned/accessories-v1.jpg' },
    products: [product('p1'), product('p2'), product('p3')], publisher: { name: 'zayrovi team' },
  },
  {
    id: 'box', kind: 'container', title: 'Kérastase', subtitle: 'Prêt pour le volume ?', bgColor: '#F2AD11', panelColor: '#F7CE70',
    sponsored: true, media: null, products: [product('p4'), product('p5')], publisher: { name: 'zayrovi team' },
  },
  {
    id: 'pair', kind: 'sponsored_pair', title: 'Calvin Klein Jeans', subtitle: 'Les dernières nouveautés', bgColor: '#4262AD', panelColor: '',
    sponsored: true, media: { type: 'image', url: '/media/publications/editorial-style.jpg', poster: '' },
    products: [product('p6', 'Calvin Klein Jeans'), { ...product('p7', 'Calvin Klein'), isNew: true, compareAtPrice: 150 }], publisher: { name: 'zayrovi team' },
  },
]);

const query = (extra: Record<string, unknown> = {}) => ({
  data: BLOCKS, isPending: false, isError: false, isRefetching: false, error: null, refetch: jest.fn(), ...extra,
});

function wrap(node: React.ReactNode) {
  return render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>{node}</ThemeProvider>
      </I18nProvider>
    </PrefsProvider>
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockPlayer.play.mockClear();
  mockPlayer.pause.mockClear();
  mockQuery.mockReturnValue(query());
  mockFollowPress.mockClear();
  mockFollowCalls.length = 0;
  mockFollow.state = 'idle';
  mockSession.status = 'signedOut';
  mockSession.account = null;
  mockFavourites.clear();
  mockToggle.mockClear();
});

describe('page Publication : en-tête seul + modèles du CRM', () => {
  it('garde l’en-tête (retour, titre, compte) et rend les trois modèles', () => {
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('publication-header')).toBeTruthy();
    expect(screen.getByTestId('publication-header-title')).toBeTruthy();
    expect(screen.getByTestId('publication-header-account')).toBeTruthy();
    for (const id of ['video', 'box', 'pair']) expect(screen.getByTestId(`publication-block-${id}`)).toBeTruthy();
    expect(screen.getByTestId('publication-block-video-video')).toBeTruthy();
    expect(screen.getByTestId('publication-block-box-band')).toBeTruthy();
  });

  it('éditeur « zayrovi team » sur les blocs ; « Sponsorisé » seulement si coché', () => {
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getAllByText('zayrovi team').length).toBeGreaterThanOrEqual(2);
    // « Sponsorisé ⓘ » : bandeau + chaque carte du container, bandeau + chaque carte du duo.
    expect(screen.getByTestId('publication-block-box-sponsored')).toBeTruthy();
    expect(screen.getByTestId('publication-block-pair-sponsored')).toBeTruthy();
    expect(screen.queryByTestId('publication-block-video-sponsored')).toBeNull();
    expect(screen.getAllByText('Sponsorisé').length).toBe(1 + 2 + 1 + 2);
  });

  it('« Suivre » (13/11) : pilule sous le container, en ligne dans l’en-tête media ; rien d’autre', () => {
    wrap(<PublicationTemplatesScreen />);
    const pill = screen.getByTestId('publication-block-box-follow');
    expect(pill.props.accessibilityLabel).toBe('Suivre zayrovi team');
    expect(screen.getByTestId('publication-block-box-follow-name')).toBeTruthy();
    expect(screen.getByTestId('publication-block-video-follow')).toBeTruthy();
    // Le duo n'a pas de « Suivre » (planche Fred Perry / GUESS).
    expect(screen.queryByTestId('publication-block-pair-follow')).toBeNull();
    // Le bouton suit l'éditeur officiel.
    expect(mockFollowCalls.every(([id]) => id === 'pub_ayrovi')).toBe(true);
    fireEvent.press(pill);
    expect(mockFollowPress).toHaveBeenCalledTimes(1);
    for (const label of [/j’aime/i, /commenter/i, /partager/i]) {
      expect(screen.queryAllByLabelText(label)).toHaveLength(0);
    }
    // 14/11 : les seuls « favoris » sont les cœurs des cartes produit (3 + 2 + 2).
    expect(screen.queryAllByLabelText(/favoris/i)).toHaveLength(7);
    expect(screen.queryAllByText(/Découvrir plus|Discover more/i)).toHaveLength(0);
  });

  it('« Suivi » une fois l’éditeur suivi, libellé d’accessibilité inversé', () => {
    mockFollow.state = 'following';
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('publication-block-box-follow').props.accessibilityLabel).toBe('Ne plus suivre zayrovi team');
    expect(screen.getAllByText('Suivi').length).toBe(2);
  });

  it('carte du container (GBox) : photo ENTIÈRE, rond du cœur, marque grasse, texte 16 sous le cadre', () => {
    wrap(<PublicationTemplatesScreen />);
    const frame = screen.getByTestId('publication-block-box-product-p4-frame');
    const photo = Array.isArray(frame.props.children) ? frame.props.children[0] : frame.props.children;
    expect(photo.props.contentFit).toBe('contain');
    // Fenêtre de test 750 dp : les cotes suivent les métriques (360 dp ⇒ 152 × 219, verrouillé côté vitest).
    const metrics = publicationTemplateMetrics(750);
    expect(StyleSheet.flatten(frame.props.style).height).toBe(metrics.container.cardImageHeight);
    const style = (id: string) => StyleSheet.flatten(screen.getByTestId(`publication-block-box-product-p4-${id}`).props.style);
    for (const id of ['brand', 'name', 'price']) expect(style(id).fontSize).toBe(16);
    expect(style('brand').fontFamily).toBe('AyroviExtracted-Bold');
    expect(style('name').fontFamily).toBe('AyroviExtracted-Regular');
    const heart = StyleSheet.flatten(screen.getByTestId('publication-block-box-product-p4-heart').props.style);
    expect([heart.width, heart.height, heart.top]).toEqual([40, 40, 8]);
    // Titre du bandeau : plus grand que tout le reste du bloc, coupe « Heading ».
    const title = StyleSheet.flatten(screen.getByTestId('publication-block-box-title').props.style);
    expect(title.fontSize).toBeGreaterThan(16);
    expect(title.fontFamily).toBe('AyroviExtracted-Heading');
  });

  it('cœur : un invité reçoit la feuille de connexion, un client bascule son vrai favori', () => {
    const guest = wrap(<PublicationTemplatesScreen />);
    fireEvent.press(screen.getByTestId('publication-block-video-product-p1-heart'));
    expect(mockToggle).not.toHaveBeenCalled();
    expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
    guest.unmount();
    mockSession.status = 'signedIn';
    mockSession.account = { id: 'acc_1' };
    mockFavourites.add('p5');
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('publication-block-box-product-p5-heart').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId('publication-block-box-product-p4-heart'));
    expect(mockToggle).toHaveBeenCalledWith('p4');
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId('publication-auth-sheet')).toBeNull();
  });

  it('« Nouveau » et prix barré : seulement quand le CRM les donne', () => {
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('publication-block-pair-product-p7-new')).toBeTruthy();
    expect(screen.queryByTestId('publication-block-pair-product-p6-new')).toBeNull();
    expect(screen.getByText('150.00 TND')).toBeTruthy();
  });

  it('les couleurs viennent du CRM (bandeau, panneau, encart)', () => {
    wrap(<PublicationTemplatesScreen />);
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-box-band').props.style).backgroundColor).toBe('#F2AD11');
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-box-panel').props.style).backgroundColor).toBe('#F7CE70');
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-pair-band').props.style).backgroundColor).toBe('#4262AD');
  });

  it('duo sponsorisé (GBox) : image qui déborde (2,09:1), puis deux cartes de même taille', () => {
    wrap(<PublicationTemplatesScreen />);
    // Fenêtre de test 750 dp : mêmes formules qu'à 360 dp (336 × 161, cartes 160 × 230 — verrouillé côté vitest).
    const metrics = publicationTemplateMetrics(750);
    const media = StyleSheet.flatten(screen.getByTestId('publication-block-pair-sponsor').props.style);
    expect([media.width, media.height]).toEqual([metrics.pair.mediaWidth, metrics.pair.mediaHeight]);
    expect(media.width / media.height).toBeCloseTo(2.09, 1);
    const left = StyleSheet.flatten(screen.getByTestId('publication-block-pair-product-p6-frame').props.style);
    const right = StyleSheet.flatten(screen.getByTestId('publication-block-pair-product-p7-frame').props.style);
    expect(left.height).toBe(metrics.pair.cardImageHeight);
    expect(left.height).toBe(right.height);
  });

  it('un produit ouvre la fiche de l’application', () => {
    wrap(<PublicationTemplatesScreen />);
    fireEvent.press(screen.getByTestId('publication-block-video-product-p2'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'p2' } });
    fireEvent.press(screen.getByTestId('publication-block-box-product-p4'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'p4' } });
    fireEvent.press(screen.getByTestId('publication-block-pair-sponsor'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'p6' } });
  });

  it('vidéo : commandes pause / son, libellés qui suivent l’état', () => {
    const metrics = publicationTemplateMetrics(360);
    wrap(<PublicationBlockView block={BLOCKS[0]} metrics={metrics} active />);
    const pause = screen.getByTestId('publication-block-video-video-pause');
    expect(pause.props.accessibilityLabel).toBe('Mettre la vidéo en pause');
    fireEvent.press(pause);
    expect(screen.getByTestId('publication-block-video-video-pause').props.accessibilityLabel).toBe('Lire la vidéo');
    const mute = screen.getByTestId('publication-block-video-video-mute');
    expect(mute.props.accessibilityLabel).toBe('Activer le son');
    fireEvent.press(mute);
    expect(screen.getByTestId('publication-block-video-video-mute').props.accessibilityLabel).toBe('Couper le son');
  });

  it('états : chargement, erreur avec réessai, liste vide', () => {
    mockQuery.mockReturnValue(query({ data: undefined, isPending: true }));
    const view = wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('loading-spinner', { includeHiddenElements: true })).toBeTruthy();
    view.unmount();
    const refetch = jest.fn();
    mockQuery.mockReturnValue(query({ data: undefined, isError: true, error: new Error('network'), refetch }));
    const failed = wrap(<PublicationTemplatesScreen />);
    fireEvent.press(screen.getByRole('button', { name: /réessayer/i }));
    expect(refetch).toHaveBeenCalled();
    failed.unmount();
    mockQuery.mockReturnValue(query({ data: [] }));
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getByText('Aucune publication pour le moment.')).toBeTruthy();
  });
});
