/**
 * Page Publication refondue (13/11/2026) — rendu réel des trois modèles.
 *  • l'en-tête reste (retour, titre, compte) ; le corps = les blocs du CRM ;
 *  • aucun bouton d'interaction (réaction, commentaire, partage, cœur) SAUF « Suivre » (13/11) ;
 *  • le duo sponsorisé : deux tuiles de MÊME taille ;
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
    products: [product('p6', 'Calvin Klein Jeans')], publisher: { name: 'zayrovi team' },
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
    // « Sponsorisé ⓘ » : sur le bandeau + chaque carte du container, et sur l'encart du duo.
    expect(screen.getByTestId('publication-block-box-sponsored')).toBeTruthy();
    expect(screen.getByTestId('publication-block-pair-sponsored')).toBeTruthy();
    expect(screen.queryByTestId('publication-block-video-sponsored')).toBeNull();
    expect(screen.getAllByText('Sponsorisé').length).toBe(1 + 2 + 1);
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
    for (const label of [/j’aime/i, /commenter/i, /partager/i, /favori/i]) {
      expect(screen.queryAllByLabelText(label)).toHaveLength(0);
    }
    expect(screen.queryAllByText(/Découvrir plus|Discover more/i)).toHaveLength(0);
  });

  it('« Suivi » une fois l’éditeur suivi, libellé d’accessibilité inversé', () => {
    mockFollow.state = 'following';
    wrap(<PublicationTemplatesScreen />);
    expect(screen.getByTestId('publication-block-box-follow').props.accessibilityLabel).toBe('Ne plus suivre zayrovi team');
    expect(screen.getAllByText('Suivi').length).toBe(2);
  });

  it('carte du container : photo qui remplit le cadre, quatre niveaux de texte distincts', () => {
    wrap(<PublicationTemplatesScreen />);
    const frame = screen.getByTestId('publication-block-box-product-p4-frame');
    expect(frame.props.children.props.contentFit).toBe('cover');
    const size = (id: string) => StyleSheet.flatten(screen.getByTestId(`publication-block-box-product-p4-${id}`).props.style).fontSize;
    const sizes = [size('price'), size('brand'), size('name')];
    expect(new Set(sizes).size).toBe(3);
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    expect(sizes[1]).toBeGreaterThan(sizes[2]);
    // Titre du bandeau : plus grand que tout le reste du bloc.
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-box-title').props.style).fontSize).toBeGreaterThan(sizes[0]);
  });

  it('les couleurs viennent du CRM (bandeau, panneau, encart)', () => {
    wrap(<PublicationTemplatesScreen />);
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-box-band').props.style).backgroundColor).toBe('#F2AD11');
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-box-panel').props.style).backgroundColor).toBe('#F7CE70');
    expect(StyleSheet.flatten(screen.getByTestId('publication-block-pair-sponsor-box').props.style).backgroundColor).toBe('#4262AD');
  });

  it('duo sponsorisé : les deux tuiles ont exactement la même taille', () => {
    wrap(<PublicationTemplatesScreen />);
    const left = StyleSheet.flatten(screen.getByTestId('publication-block-pair-sponsor').props.style);
    const right = StyleSheet.flatten(screen.getByTestId('publication-block-pair-product-p6').props.style);
    expect(left.width).toBeGreaterThan(100);
    expect(left.width).toBe(right.width);
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
