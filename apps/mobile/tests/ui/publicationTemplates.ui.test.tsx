/** Publication feed, collection detail, live product links, and engagement UI. */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { PublicationTemplatesScreen, PublicationBlockView } from '@/features/publications/PublicationTemplatesScreen';
import { PublicationCollectionScreen } from '@/features/publications/PublicationCollectionScreen';
import { parsePublicationBlocks, type PublicationBlock } from '@/api/publicationBlocks';
import { editorialFeedRail } from '../../../../shared/publicationEditorial';
import { publicationTemplateMetrics } from '@/features/publications/templates/templateMetrics';
import { publicationSoundOn, resetPublicationSound } from '@/features/publications/publicationSound';

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
const mockRouteParams = { id: 'collection' };
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), canGoBack: () => false, replace: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockQuery = jest.fn();
const mockCollectionQuery = jest.fn();
/** Engagement (14/11) : compteurs + réaction du compte, par bloc. */
const mockEngagement = { counts: {} as Record<string, any>, mine: {} as Record<string, string> };
const mockComments = jest.fn(() => ({ data: [], isPending: false, isError: false, refetch: jest.fn() }));
const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'publication-blocks') return mockQuery();
    if (queryKey[0] === 'publication-collection') return mockCollectionQuery();
    if (queryKey[1] === 'engagement') return { data: mockEngagement, dataUpdatedAt: 1 };
    return mockComments();
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate, setQueryData: jest.fn() }),
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/session/session', () => ({ useSessionId: () => 'guest-session-0001', getSessionId: async () => 'guest-session-0001' }));
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
  mockEngagement.counts = {};
  mockEngagement.mine = {};
  mockInvalidate.mockClear();
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

  it('pairs the collection cover with three compact photo-only product links', () => {
    const metrics = publicationTemplateMetrics(360);
    const rail = editorialFeedRail(metrics.width, 3);
    const block: PublicationBlock = { ...BLOCKS[0], id: 'collection', media: BLOCKS[2].media };
    wrap(<PublicationBlockView block={block} metrics={metrics} active />);
    const style = (id: string) => StyleSheet.flatten(screen.getByTestId(`publication-block-collection-${id}`).props.style);
    expect(style('media').height).toBe(290);
    expect(style('product-p1-frame').height).toBe(rail.imageHeight);
    expect(screen.queryByTestId('publication-block-collection-product-p1-brand')).toBeNull();
    expect(screen.queryByTestId('publication-block-collection-product-p1-price')).toBeNull();
    fireEvent.press(screen.getByTestId('publication-block-collection-cover'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/publication-collection/[id]', params: { id: 'collection' } }));
    expect(screen.getByTestId('publication-block-collection-row').props.snapToInterval).toBe(rail.snap);
    fireEvent.press(screen.getByTestId('publication-block-collection-product-p3'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/product/[id]', params: { id: 'p3' } }));
  });

  it('publisher ZAYROVI and one sponsor disclosure per sponsored block', () => {
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getAllByText('ZAYROVI').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('publication-block-box-sponsored')).toBeTruthy();
    expect(screen.getByTestId('publication-block-pair-sponsored')).toBeTruthy();
    expect(screen.queryByTestId('publication-block-video-sponsored')).toBeNull();
    expect(screen.getAllByText('Sponsorisé').length).toBe(2);
  });

  it('uses the same compact follow line, with the real publisher identity and engagement', () => {
    wrap(<PublicationTemplatesScreen />);
    const pill = screen.getByTestId('publication-block-box-follow');
    expect(pill.props.accessibilityLabel).toBe('Suivre ZAYROVI');
    expect(screen.getByTestId('publication-block-box-follow-name')).toBeTruthy();
    expect(screen.getByTestId('publication-block-video-follow')).toBeTruthy();
    // 16/11 : « chaque publication » a son éditeur — le duo aussi (« zayrovi team • Suivre » sur le bandeau).
    expect(screen.getByTestId('publication-block-pair-follow')).toBeTruthy();
    // Le bouton suit l'éditeur officiel.
    expect(mockFollowCalls.every(([id]) => id === 'pub_zayrovi')).toBe(true);
    fireEvent.press(pill);
    expect(mockFollowPress).toHaveBeenCalledTimes(1);
    // 16/11 : J'aime · Commenter · Partager sous CHAQUE bloc, sponsorisé compris.
    for (const label of [/^j’aime$/i, /^commenter$/i, /^partager$/i]) {
      expect(screen.queryAllByLabelText(label)).toHaveLength(3);
    }
    for (const id of ['video', 'box', 'pair']) expect(screen.getByTestId(`publication-bar-${id}`)).toBeTruthy();
    // 14/11 : les seuls « favoris » sont les cœurs des cartes produit (3 + 2 + 2).
    expect(screen.queryAllByLabelText(/favoris/i)).toHaveLength(7);
    expect(screen.queryAllByText(/Découvrir plus|Discover more/i)).toHaveLength(0);
  });

  it('« Suivi » une fois l’éditeur suivi, libellé d’accessibilité inversé', () => {
    mockFollow.state = 'following';
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('publication-block-box-follow').props.accessibilityLabel).toBe('Ne plus suivre ZAYROVI');
    expect(screen.getAllByText('Suivi').length).toBe(3);
  });

  it('keeps the entire photo, compact copy, price and favorite on campaign cards', () => {
    wrap(<PublicationTemplatesScreen />);
    const frame = screen.getByTestId('publication-block-box-product-p4-frame');
    const photo = Array.isArray(frame.props.children) ? frame.props.children[0] : frame.props.children;
    expect(photo.props.contentFit).toBe('contain');
    // Fenêtre de test 750 dp : les cotes suivent les métriques (360 dp ⇒ 152 × 219, verrouillé côté vitest).
    const metrics = publicationTemplateMetrics(750);
    expect(StyleSheet.flatten(frame.props.style).height).toBe(metrics.container.cardImageHeight);
    const style = (id: string) => StyleSheet.flatten(screen.getByTestId(`publication-block-box-product-p4-${id}`).props.style);
    expect(style('name').fontSize).toBe(12);
    for (const id of ['brand', 'price']) expect(style(id).fontSize).toBe(14);
    expect(style('brand').fontFamily).toBe('ZayroviExtracted-Bold');
    expect(style('name').fontFamily).toBe('ZayroviExtracted-Regular');
    const heart = StyleSheet.flatten(screen.getByTestId('publication-block-box-product-p4-heart').props.style);
    // 13/11 — système de cartes : cœur nu (cible 40, aucun rond blanc qui cache la photo).
    expect([heart.width, heart.height, heart.top]).toEqual([40, 40, 2]);
    expect(heart.backgroundColor).toBeUndefined();
    // Titre du bandeau : plus grand que tout le reste du bloc, coupe « Heading ».
    const title = StyleSheet.flatten(screen.getByTestId('publication-block-box-title').props.style);
    expect(title.fontSize).toBeGreaterThan(16);
    expect(title.fontFamily).toBe('ZayroviExtracted-Heading');
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
    // 13/11 : l'ancien prix a SA ligne, barrée ; la voisine réserve la ligne (cartes alignées).
    const reference = screen.getByTestId('publication-block-pair-product-p7-reference');
    expect(StyleSheet.flatten(reference.props.style).textDecorationLine).toBe('line-through');
    expect(screen.getByTestId('publication-block-pair-product-p7-price').props.children).not.toContain('150.00 TND');
    expect(screen.getByTestId('publication-block-pair-product-p6-reference-slot')).toBeTruthy();
    expect(screen.queryByTestId('publication-block-box-product-p4-reference-slot')).toBeNull();
  });

  it('les couleurs viennent du CRM (bandeau, panneau, encart)', () => {
    wrap(<PublicationTemplatesScreen />);
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-box-band').props.style).backgroundColor).toBe('#F2AD11');
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-box-panel').props.style).backgroundColor).toBe('#F7CE70');
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-pair-band').props.style).backgroundColor).toBe('#4262AD');
  });

  it('uses a short inset banner and two equal tiles for the sponsored duo', () => {
    wrap(<PublicationTemplatesScreen />);
    // Fenêtre de test 750 dp : mêmes formules qu'à 360 dp (336 × 161, cartes 160 × 230 — verrouillé côté vitest).
    const metrics = publicationTemplateMetrics(750);
    const media = StyleSheet.flatten(screen.getByTestId('publication-block-pair-sponsor').props.style);
    expect([media.width, media.height]).toEqual([metrics.pair.mediaWidth, metrics.pair.mediaHeight]);
    expect(media.width / media.height).toBeCloseTo(2.5, 1);
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

  it('vidéo : commandes pause / son — 15/11 : son ACTIF au départ, un geste le coupe pour toute la session', () => {
    resetPublicationSound();
    const metrics = publicationTemplateMetrics(360);
    const first = wrap(<PublicationBlockView block={BLOCKS[0]} metrics={metrics} active />);
    const pause = screen.getByTestId('publication-block-video-video-pause');
    expect(pause.props.accessibilityLabel).toBe('Mettre la vidéo en pause');
    fireEvent.press(pause);
    expect(screen.getByTestId('publication-block-video-video-pause').props.accessibilityLabel).toBe('Lire la vidéo');
    const mute = screen.getByTestId('publication-block-video-video-mute');
    expect(mute.props.accessibilityLabel).toBe('Couper le son');
    expect(mute.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(mute);
    expect(screen.getByTestId('publication-block-video-video-mute').props.accessibilityLabel).toBe('Activer le son');
    expect(publicationSoundOn()).toBe(false);
    // Une autre vidéo montée ensuite reste muette : le choix du client vaut pour la session.
    first.unmount();
    wrap(<PublicationBlockView block={BLOCKS[0]} metrics={metrics} active />);
    expect(screen.getByTestId('publication-block-video-video-mute').props.accessibilityLabel).toBe('Activer le son');
    resetPublicationSound();
  });

  it('cinema keeps an edge-to-edge dark panel and centered headline in a shorter frame', () => {
    const [cinema] = parsePublicationBlocks([{
      id: 'cine', kind: 'cinema', title: 'Vivez chargé.', subtitle: 'Regarder la vidéo', bgColor: '#000000', panelColor: '',
      sponsored: false, media: { type: 'video', url: '/media/reels-owned/accessories-v1.mp4', poster: '/media/reels-owned/accessories-v1.jpg' },
      products: [product('c1', 'Anker'), product('c2', 'Anker')], publisher: { name: 'zayrovi team' },
    }]);
    mockQuery.mockReturnValue(query({ data: [cinema] }));
    wrap(<PublicationTemplatesScreen />);
    const metrics = publicationTemplateMetrics(750);
    const media = StyleSheet.flatten(screen.getByTestId('publication-block-cine-media').props.style);
    expect(media.width).toBe('100%');
    expect(media.height).toBe(metrics.cinema.videoHeight);
    const title = StyleSheet.flatten(screen.getByTestId('publication-block-cine-title').props.style);
    expect(title.color).toBe('#FFFFFF');
    expect(title.textAlign).toBe('center');
    expect(title.textShadowColor).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-cine').props.style).backgroundColor).toBe('#000000');
    expect(screen.getByTestId('publication-block-cine-pair')).toBeTruthy();
    expect(screen.queryByTestId('publication-block-cine-row')).toBeNull();
    expect(screen.getByTestId('publication-block-cine-follow')).toBeTruthy();
    expect(screen.getByTestId('publication-bar-cine')).toBeTruthy();
  });

  it('16/11 : cinema au-delà de deux produits → rangée défilante', () => {
    const [cinema] = parsePublicationBlocks([{
      id: 'cine', kind: 'cinema', title: 'Vivez chargé.', subtitle: '', bgColor: '#000000', panelColor: '',
      sponsored: true, media: { type: 'video', url: '/media/v.mp4', poster: '' },
      products: [product('c1'), product('c2'), product('c3')], publisher: { name: 'zayrovi team' },
    }]);
    mockQuery.mockReturnValue(query({ data: [cinema] }));
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('publication-block-cine-row')).toBeTruthy();
    expect(screen.getByTestId('publication-block-cine-sponsored')).toBeTruthy();
  });

  it('16/11 (capture 031932) : « zayrovi team / Suivre » en encre NOIRE sur un panneau clair, blanc sur panneau sombre', () => {
    wrap(<PublicationTemplatesScreen />);
    // panneau #F7CE70 (clair) → encre sombre, pas de blanc illisible
    const light = StyleSheet.flatten(screen.getByTestId('publication-block-box-follow-name').props.style);
    expect(light.color).not.toBe('#FFFFFF');
    expect(light.textShadowColor).toBeUndefined();
    // le compte est au-dessus de la vidéo éditoriale, sur fond clair
    const onMedia = StyleSheet.flatten(screen.getByTestId('publication-block-video-follow-name').props.style);
    expect(onMedia.color).not.toBe('#FFFFFF');
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

describe('barre Publication (redessinée après l’essai sur appareil, 14/11)', () => {
  it('rangée d’icônes : compteurs collés, masqués à zéro', () => {
    const view = wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('publication-like-video')).toBeTruthy();
    expect(screen.queryByText('12')).toBeNull();
    view.unmount();
    mockEngagement.counts = { video: { likes: 9, loves: 3, comments: 3, views: 0, shares: 1 } };
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    // Le compteur reste lisible au lecteur d’écran.
    expect(screen.getByTestId('publication-comment-video').props.accessibilityLabel).toBe('Commenter, 3 commentaires');
    // Plus de libellés en tiers ni de résumé séparé.
    expect(screen.queryByText('J’aime')).toBeNull();
    expect(screen.queryByTestId('publication-summary-video')).toBeNull();
  });

  it('J’aime posé : pouce plein bleu, compteur à l’encre ; visiteur : la connexion s’ouvre', () => {
    mockEngagement.counts = { video: { likes: 1, loves: 0, comments: 0, views: 0, shares: 0 } };
    mockEngagement.mine = { video: 'like' };
    const view = wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('publication-like-video').props.accessibilityState).toMatchObject({ selected: true });
    expect(String(StyleSheet.flatten(screen.getByText('1').props.style).color).toUpperCase()).toBe('#101010');
    view.unmount();
    mockEngagement.mine = {};
    wrap(<PublicationTemplatesScreen />);
    expect(screen.queryByTestId('publication-auth-sheet')).toBeNull();
    fireEvent.press(screen.getByTestId('publication-like-video'));
    expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
  });

  it('Enregistrer : invité ⇒ connexion ; compte ⇒ bascule immédiate', () => {
    const view = wrap(<PublicationTemplatesScreen />);
    fireEvent.press(screen.getByTestId('publication-save-video'));
    expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
    view.unmount();
    mockSession.status = 'signedIn';
    mockSession.account = { id: 'acc-1' };
    wrap(<PublicationTemplatesScreen />);
    const save = () => screen.getByTestId('publication-save-video');
    expect(save().props.accessibilityState).toMatchObject({ selected: false });
    expect(save().props.accessibilityLabel).toBe('Enregistrer');
    fireEvent.press(save());
    expect(save().props.accessibilityState).toMatchObject({ selected: true });
    expect(save().props.accessibilityLabel).toBe('Retirer des enregistrements');
    // 16/11 : le bloc sponsorisé a lui aussi sa barre, donc son signet.
    expect(screen.getByTestId('publication-save-box')).toBeTruthy();
  });

  it('Commenter ouvre la feuille DANS l’hôte de l’écran (pas dans la rangée) : invitation, tri, état vide, champ', () => {
    wrap(<PublicationTemplatesScreen />);
    expect(screen.queryByTestId('sheet-portal-host')).toBeNull();
    fireEvent.press(screen.getByTestId('publication-comment-video'));
    const host = screen.getByTestId('sheet-portal-host');
    const bar = screen.getByTestId('publication-bar-video');
    // La feuille vit sous l’hôte, plus sous la barre du bloc.
    expect(host.findAllByProps({ testID: 'publication-comment-input' }).length).toBeGreaterThan(0);
    expect(bar.findAllByProps({ testID: 'publication-comment-input' })).toHaveLength(0);
    expect(screen.getByText('Soyez la première personne à aimer ça')).toBeTruthy();
    expect(screen.getByText('Plus pertinents')).toBeTruthy();
    expect(screen.getByText('Aucun commentaire pour l’instant')).toBeTruthy();
    expect(screen.getByText('Soyez le premier à commenter.')).toBeTruthy();
    expect(screen.getByTestId('publication-comment-input').props.placeholder).toBe('Rédigez un commentaire…');
    fireEvent.press(screen.getByTestId('publication-comments-sort'));
    expect(screen.getByText('Plus récents')).toBeTruthy();
    // Envoi désactivé tant que le champ est vide.
    expect(screen.getByTestId('publication-comment-send').props.accessibilityState).toMatchObject({ disabled: true });
  });
});


describe('collection detail', () => {
  it('shows the full CRM copy, filters the actual products, and links list rows to product pages', () => {
    mockCollectionQuery.mockReturnValue(query({ data: {
      ...BLOCKS[0], id: 'collection', media: BLOCKS[2].media,
      description: 'Description complète depuis le CRM.', updatedAt: '2026-11-19T00:00:00.000Z',
      products: [BLOCKS[0].products[0], ...BLOCKS[2].products],
    } }));
    wrap(<PublicationCollectionScreen />);
    expect(screen.getByText('Description complète depuis le CRM.')).toBeTruthy();
    expect(screen.getByText(/Mis à jour le/)).toBeTruthy();
    expect(screen.getByTestId('collection-products-grid')).toBeTruthy();
    expect(screen.getByText('Produits : 3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('collection-filters'));
    fireEvent.press(screen.getByText('Calvin Klein Jeans'));
    expect(screen.getByText('Produits : 1')).toBeTruthy();
    expect(screen.queryByTestId('collection-product-p1')).toBeNull();
    fireEvent.press(screen.getByTestId('collection-list'));
    expect(screen.queryByTestId('collection-products-grid')).toBeNull();
    fireEvent.press(screen.getByTestId('collection-product-p6'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'p6' } });
  });
});
