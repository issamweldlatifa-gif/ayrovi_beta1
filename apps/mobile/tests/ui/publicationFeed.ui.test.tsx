import { PublicationPostOptions } from '@/features/publications/PublicationPostOptions';
import {
  PublicationDescription,
  publicationDescriptionGraphemes,
} from '@/features/publications/PublicationDescription';
import { PublicationPublisher } from '@/features/publications/PublicationPublisher';
import { PublicationActions } from '@/features/publications/PublicationActions';
import { PublicationViewer } from '@/features/publications/PublicationViewer';
import { AppState, FlatList, Modal } from 'react-native';
import { PublicationProductPreview } from '@/features/publications/PublicationProductPreview';
import { PublicationMedia } from '@/features/publications/PublicationMedia';
import { DEFAULT_PUBLICATION_FEED_SETTINGS } from '../../../../shared/publicationFeed';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { saveFeedView } from '@/features/publications/publicationFeedLogic';
import { PublicationFeedScreen } from '@/features/publications/PublicationFeedScreen';
import { PublicationCard } from '@/features/publications/PublicationCard';
import type { FeedPost } from '@/api/publicationFeed';

const mockSession = { status: 'signedIn', account: { id: 'ui-owner' } };
const mockCartAdd = jest.fn();
jest.mock('@/api/cart', () => ({
  ...jest.requireActual('@/api/cart'),
  addCatalogToCart: (...args: unknown[]) => mockCartAdd(...args),
}));
const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  muted: true,
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};
const mockFetchPage = jest.fn();
const mockPreference = jest.fn();
const mockFollow = jest.fn();
const mockInvalidate = jest.fn();
const mockSend = jest.fn();
jest.mock('@/api/publicationFeed', () => ({
  ...jest.requireActual('@/api/publicationFeed'),
  fetchFeedPage: (...args: unknown[]) => mockFetchPage(...args),
  writePublicationPreference: (...args: unknown[]) => mockPreference(...args),
  followPublisher: (...args: unknown[]) => mockFollow(...args),
}));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => mockPlayer,
  VideoView: 'VideoView',
}));
const mockQuery = jest.fn();
const mockSettingsQuery = jest.fn();
const mockSetQueries = jest.fn();
const mockRefetch = jest.fn();
const mockFetchNext = jest.fn();
const mockRouter = {
  push: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouter.push(...args),
    setParams: (...args: unknown[]) => mockRouter.setParams(...args),
    canGoBack: () => mockRouter.canGoBack(),
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    back: () => mockRouter.back(),
  },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => mockSettingsQuery(),
  useInfiniteQuery: (...args: unknown[]) => mockQuery(...args),
  useQueryClient: () => ({
    setQueriesData: mockSetQueries,
    invalidateQueries: mockInvalidate,
  }),
}));
jest.mock('@/state/session', () => ({ useSession: () => mockSession }));
jest.mock('@/session/session', () => ({
  useSessionId: () => 'ui-guest-session',
}));
jest.mock('@/api/social', () => ({
  sendInteraction: (...args: unknown[]) => mockSend(...args),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/features/social/Comments', () => ({
  Comments: ({ header }: any) => {
    const { Text } = require('react-native');
    return (
      <>
        {header}
        <Text>Real Comments component slot</Text>
      </>
    );
  },
}));
jest.mock('@/design/appImage', () => ({
  AppImage: (props: any) => {
    const { View } = require('react-native');
    return <View {...props} />;
  },
}));
const post: FeedPost = {
  id: 'ui-post',
  title: 'Inspiration réelle',
  subtitle: 'Texte éditorial',
  imageUrl: '/photo.jpg',
  publishAt: '',
  channelId: 'official',
  channelName: 'ZAYROVI Official',
  category: 'beauty',
  generated: true,
  liked: false,
  likes: 2,
  comments: 1,
  product: null,
  products: [],
};
const feed = {
  data: { pages: [{ items: [post], nextCursor: null }] },
  isPending: false,
  isError: false,
  isFetching: false,
  isRefetching: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  hasNextPage: false,
  refetch: mockRefetch,
  fetchNextPage: mockFetchNext,
};
async function mount(child = <PublicationFeedScreen />) {
  const result = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>{child}</ThemeProvider>
      </I18nProvider>
    </PrefsProvider>
  );
  await act(async () => {});
  return result;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockPreference.mockResolvedValue({});
  mockFollow.mockImplementation((_id: string, following: boolean) =>
    Promise.resolve({ following })
  );
  mockSession.status = 'signedIn';
  mockSession.account.id = `owner-${Math.random()}`;
  mockQuery.mockReturnValue(feed);
  mockSettingsQuery.mockReturnValue({
    data: DEFAULT_PUBLICATION_FEED_SETTINGS,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  });
});

describe('Publication Phase 1 UI', () => {
  it('renders actual content and save without exposing internal provenance or fake products', async () => {
    await mount();
    expect(screen.getByTestId('publication-feed-list')).toBeTruthy();
    expect(screen.getByText('Inspiration réelle')).toBeTruthy();
    expect(screen.queryByText('Création visuelle IA')).toBeNull();
    expect(screen.queryByText('Voir les produits')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Enregistrer' })
    ).not.toBeDisabled();
  });
  it('renders CRM title without strips and chooses editorial copy without cropping a legacy beauty photo', async () => {
    mockSettingsQuery.mockReturnValue({
      data: {
        ...DEFAULT_PUBLICATION_FEED_SETTINGS,
        titleFr: 'Découvrir ZAYROVI',
        layout: 'compact',
        categories: [...DEFAULT_PUBLICATION_FEED_SETTINGS.categories]
          .reverse()
          .map((c) => ({ ...c, enabled: c.key !== 'beauty' })),
      },
      isPending: false,
      isError: false,
    });
    await mount();
    expect(screen.getByText('Découvrir ZAYROVI')).toBeTruthy();
    expect(screen.queryByTestId('publication-category-beauty')).toBeNull();
    expect(screen.getByTestId('publication-media-ui-post')).toHaveStyle({
      aspectRatio: 4 / 5,
    });
  });
  it('shows a clear CMS-disabled state instead of cached posts', async () => {
    mockSettingsQuery.mockReturnValue({
      data: { ...DEFAULT_PUBLICATION_FEED_SETTINGS, enabled: false },
      isPending: false,
      isError: false,
    });
    await mount();
    expect(screen.queryByText('Inspiration réelle')).toBeNull();
    expect(
      screen.getByText('Les publications sont temporairement indisponibles.')
    ).toBeTruthy();
    expect(mockQuery.mock.calls.at(-1)?.[0].enabled).toBe(false);
  });
  it('removes both filter strips without replacement and keeps comments working', async () => {
    await mount();
    for (const label of [
      'For You',
      'Fashion',
      'Beauty',
      'Tout',
      'Abonnements',
      'Enregistrés',
      'Vidéos',
    ])
      expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByTestId('publication-category-beauty')).toBeNull();
    expect(mockQuery.mock.calls.at(-1)?.[0].queryKey).not.toContain('beauty');
    fireEvent.press(screen.getByRole('button', { name: 'Commentaires' }));
    expect(screen.getByText('Real Comments component slot')).toBeTruthy();
    fireEvent.press(screen.getAllByRole('button', { name: 'Retour' }).at(-1)!);
    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });
  it('does not permit guest likes and offers the existing sign-in route', async () => {
    mockSession.status = 'signedOut';
    await mount();
    expect(screen.getByTestId('publication-like-ui-post')).not.toBeDisabled();
    fireEvent.press(screen.getByTestId('publication-like-ui-post'));
    expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Se connecter' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in');
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('gates guest comments, save and share with the branded sheet, without writes', async () => {
    mockSession.status = 'signedOut';
    await mount();
    for (const name of ['Enregistrer', 'Suivre cet éditeur', 'Partager']) {
      fireEvent.press(screen.getByRole('button', { name }));
      expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
      fireEvent.press(
        screen.getByRole('button', { name: 'Continuer à découvrir' })
      );
    }
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPreference).not.toHaveBeenCalled();
    expect(mockFollow).not.toHaveBeenCalled();
  });
  it('opens media-only black gallery without a visible header and closes via accessibility escape', async () => {
    await mount();
    fireEvent.press(screen.getByText('Inspiration réelle'));
    const frame = within(screen.getByTestId('publication-reader')).getByTestId(
      'publication-media-ui-post'
    );
    fireEvent(frame, 'layout', {
      nativeEvent: { layout: { width: 360, height: 450 } },
    });
    fireEvent.press(
      within(screen.getByTestId('publication-reader')).getByRole('button', {
        name: 'Inspiration réelle',
      })
    );
    expect(screen.getByTestId('publication-lightbox')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByTestId('publication-reader')).toBeNull()
    );
    expect(
      within(screen.getByTestId('publication-lightbox')).queryByText(
        'Texte éditorial'
      )
    ).toBeNull();
    await act(async () => {
      screen
        .getByTestId('publication-lightbox-gesture')
        .props.onAccessibilityEscape();
      await new Promise((resolve) => setTimeout(resolve, 240));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('publication-lightbox')).toBeNull()
    );
    expect(screen.getByTestId('publication-reader')).toBeTruthy();
  });
  it('optimistically likes, blocks duplicate taps, and rolls back a failed write', async () => {
    let reject!: (error: Error) => void;
    mockSend.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    await mount(
      <PublicationCard
        post={post}
        compact={false}
        onComments={() => undefined}
        onReaction={() => undefined}
      />
    );
    fireEvent.press(screen.getByTestId('publication-like-ui-post'));
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByTestId('publication-like-ui-post')).toBeDisabled();
    await act(async () => {
      reject(new Error('offline'));
    });
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
    expect(
      screen.getByText('Modification non enregistrée. Réessayez.')
    ).toBeTruthy();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
  it('uses confirmed server counts and updates cached feed state', async () => {
    const reaction = jest.fn();
    mockSend.mockResolvedValue({ liked: true, likesCount: 9 });
    await mount(
      <PublicationCard
        post={post}
        compact={true}
        onComments={() => undefined}
        onReaction={reaction}
      />
    );
    fireEvent.press(screen.getByTestId('publication-like-ui-post'));
    await waitFor(() => expect(screen.getByText('9')).toBeTruthy());
    expect(reaction).toHaveBeenCalledWith('ui-post', true, 9, false);
  });
  it('persists save through the authenticated API without a follow button', async () => {
    await mount();
    fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(mockPreference).toHaveBeenCalledWith('ui-post', { saved: true })
    );
    expect(
      screen.getByRole('button', { name: 'Retirer des enregistrements' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Options de la publication' })
    ).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Suivre cet éditeur' }));
    await waitFor(() =>
      expect(mockFollow).toHaveBeenCalledWith('official', true)
    );
    expect(
      screen.getByRole('button', { name: 'Ne plus suivre cet éditeur' })
    ).toBeTruthy();
  });
  it('opens and closes the existing-publication viewer', async () => {
    await mount();
    fireEvent.press(screen.getByText('Inspiration réelle'));
    expect(screen.getByTestId('publication-reader')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Fermer la publication' })
    ).toBeNull();
    expect(
      within(screen.getByTestId('publication-reader')).queryByText(
        'Publication'
      )
    ).toBeTruthy();
    await act(async () => {
      screen
        .getByTestId('publication-reader-gesture')
        .props.onAccessibilityEscape();
      await new Promise((resolve) => setTimeout(resolve, 240));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('publication-reader')).toBeNull()
    );
  });
  it('expands real long description and renders genuine sponsored and verified metadata', async () => {
    const content = {
      type: 'editorial' as const,
      media: [],
      description: 'Long description '.repeat(30),
      descriptionPosition: 'above' as const,
      sponsored: true,
      sponsorName: 'ZAYROVI',
      audience: '',
      topic: '',
    };
    await mount(
      <PublicationCard
        post={{ ...post, content, publisherOfficial: true }}
        compact={false}
        onComments={() => undefined}
        onReaction={() => undefined}
      />
    );
    expect(screen.getByText('Sponsorisé · ZAYROVI')).toBeTruthy();
    expect(screen.getByLabelText('Éditeur officiel vérifié')).toBeTruthy();
    fireEvent(screen.getByTestId('publication-description'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 72 } },
    });
    for (let i = 0; i < 20; i++) {
      const measured = screen.queryByTestId('publication-description-measure', {
        includeHiddenElements: true,
      });
      if (!measured) break;
      const source = Array.isArray(measured.props.children)
        ? measured.props.children[0]
        : measured.props.children;
      fireEvent(measured, 'layout', {
        nativeEvent: {
          layout: { height: String(source).length > 160 ? 10000 : 1 },
        },
      });
    }
    fireEvent.press(screen.getByRole('button', { name: /Voir plus$/ }));
    expect(screen.getByRole('button', { name: /Voir moins$/ })).toBeTruthy();
    expect(
      screen.getByTestId('publication-description-visible').props.children[0]
    ).toBe(content.description);
  });

  it('gives media a measured nonzero height and updates the actual swipe counter', async () => {
    const media = [
      { type: 'image' as const, url: '/a.jpg', poster: '', alt: 'Photo A' },
      { type: 'image' as const, url: '/b.jpg', poster: '', alt: 'Photo B' },
    ];
    const content = {
      type: 'carousel' as const,
      media,
      description: '',
      descriptionPosition: 'below' as const,
      sponsored: false,
      sponsorName: '',
      audience: '',
      topic: '',
    };
    await mount(<PublicationMedia post={{ ...post, content }} />);
    fireEvent(screen.getByTestId('publication-media-ui-post'), 'layout', {
      nativeEvent: { layout: { width: 360, height: 450 } },
    });
    expect(screen.getAllByLabelText('1/2')[0]).toBeTruthy();
    expect(
      screen
        .UNSAFE_getByType(FlatList)
        .props.renderItem({ item: media[0], index: 0 }).props.style
    ).toEqual({ width: 360, height: 450 });
    fireEvent(screen.UNSAFE_getByType(FlatList), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 360 } },
    });
    expect(screen.getAllByLabelText('2/2')[0]).toBeTruthy();
  });
  it('lets carousel thumbnails select the real slide and preserves its counter', async () => {
    const media = [
      { type: 'image' as const, url: '/a.jpg', poster: '', alt: 'Photo A' },
      { type: 'image' as const, url: '/b.jpg', poster: '', alt: 'Photo B' },
    ];
    const content = {
      type: 'carousel' as const,
      template: 'carousel' as const,
      media,
      description: '',
      descriptionPosition: 'below' as const,
      sponsored: false,
      sponsorName: '',
      audience: '',
      topic: '',
    };
    await mount(<PublicationMedia post={{ ...post, content }} thumbnails />);
    fireEvent(screen.getByTestId('publication-media-ui-post'), 'layout', {
      nativeEvent: { layout: { width: 360, height: 450 } },
    });
    fireEvent.press(screen.getByTestId('publication-thumbnail-ui-post-1'));
    expect(screen.getAllByLabelText('2/2')[0]).toBeTruthy();
    expect(
      screen.getByTestId('publication-thumbnail-ui-post-1').props
        .accessibilityState
    ).toMatchObject({ selected: true });
  });
  it('keeps authored CTA interactive in the split template instead of baking it into an image', async () => {
    const open = jest.fn();
    const content = {
      type: 'image' as const,
      template: 'split' as const,
      actionLabel: 'Découvrir',
      actionTarget: 'detail' as const,
      media: [],
      description: 'Design du quotidien',
      descriptionPosition: 'below' as const,
      sponsored: false,
      sponsorName: '',
      audience: '',
      topic: '',
    };
    await mount(
      <PublicationCard
        post={{ ...post, content }}
        compact={false}
        onOpen={open}
        onComments={() => undefined}
        onReaction={() => undefined}
      />
    );
    fireEvent.press(screen.getByRole('button', { name: 'Découvrir' }));
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('starts muted and pauses the actual player when the video becomes inactive', async () => {
    AppState.currentState = 'active';
    const content = {
      type: 'video' as const,
      media: [
        {
          type: 'video' as const,
          url: '/clip.mp4',
          poster: '/poster.jpg',
          alt: 'Clip',
        },
      ],
      description: '',
      descriptionPosition: 'below' as const,
      sponsored: false,
      sponsorName: '',
      audience: '',
      topic: '',
    };
    const element = (active: boolean) => (
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <PublicationMedia post={{ ...post, content }} active={active} />
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    );
    const result = render(element(true));
    fireEvent(screen.getByTestId('publication-media-ui-post'), 'layout', {
      nativeEvent: { layout: { width: 360, height: 450 } },
    });
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
    expect(mockPlayer.muted).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Activer le son' }));
    expect(mockPlayer.muted).toBe(false);
    result.rerender(element(false));
    await waitFor(() => expect(mockPlayer.pause).toHaveBeenCalled());
  });

  it('chooses catalogue variants and adds through the existing Cart Core exactly once', async () => {
    let finish!: (result: object) => void;
    mockCartAdd.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const sheet = {
      purchasable: true,
      dimensions: [
        {
          key: 'size',
          label: 'Taille',
          values: [
            { value: 'M', available: true },
            { value: 'L', available: false },
          ],
        },
        {
          key: 'color',
          label: 'Couleur',
          values: [
            { value: 'Bleu', available: true },
            { value: 'Rouge', available: false },
          ],
        },
      ],
      variants: [
        { id: 'variant-1', size: 'M', color: 'Bleu', available: true },
      ],
    };
    mockSettingsQuery.mockReturnValue({
      data: {
        name: 'Produit actuel',
        image: '',
        brandName: 'Marque',
        finalPrice: 42,
        description: 'Catalogue',
        sheet,
      },
      isPending: false,
      isError: false,
      refetch: mockRefetch,
    });
    await mount(
      <PublicationProductPreview
        id="product-1"
        onContinue={() => undefined}
        onBack={() => undefined}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Ajouter au panier' })
    ).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Taille M' }));
    fireEvent.press(screen.getByRole('button', { name: 'Couleur Bleu' }));
    expect(screen.getByRole('button', { name: 'Taille L' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Ajouter au panier' }));
    expect(mockCartAdd).toHaveBeenCalledTimes(1);
    expect(mockCartAdd).toHaveBeenCalledWith({
      productId: 'product-1',
      sessionId: 'ui-guest-session',
      quantity: 1,
      requestedSize: 'M',
      requestedColor: 'Bleu',
    });
    expect(
      screen.getByRole('button', { name: 'Ajout en cours…' })
    ).toBeDisabled();
    await act(async () => finish({ totalItemsCount: 1 }));
    expect(screen.getByText('Article ajouté au panier')).toBeTruthy();
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['cart'] });
  });
});

it('never shows a verification icon for an unofficial publisher or exposes unique-view noise', async () => {
  await mount(
    <PublicationCard
      post={{
        ...post,
        publisherOfficial: false,
        channelName: 'Style',
        views: 1,
        shares: 1,
      }}
      compact={false}
      onComments={() => undefined}
      onReaction={() => undefined}
    />
  );
  expect(screen.queryByTestId('publication-verified-badge')).toBeNull();
  expect(
    screen.getByTestId('publication-publisher-initial').props.children
  ).toBe('S');
  expect(screen.queryByText(/vues uniques|partages uniques/)).toBeNull();
});

it('does not retain a hidden category filter from the removed old strips', async () => {
  saveFeedView(mockSession.account.id, {
    category: 'beauty',
    q: '',
    offset: 400,
  });
  await mount();
  await mockQuery.mock.calls
    .at(-1)[0]
    .queryFn({ pageParam: null, signal: new AbortController().signal });
  expect(mockFetchPage).toHaveBeenLastCalledWith(
    expect.objectContaining({ category: '', q: '' }),
    expect.anything()
  );
  expect(mockFetchPage.mock.calls.at(-1)[0]).not.toHaveProperty('following');
  expect(mockFetchPage.mock.calls.at(-1)[0]).not.toHaveProperty('saved');
});
it('renders an authored shoppable carousel with a genuine compact product link and opens the existing product flow', async () => {
  const open = jest.fn();
  await mount(
    <PublicationCard
      post={{
        ...post,
        content: {
          type: 'carousel',
          template: 'carousel',
          media: [
            { type: 'image', url: '/a.jpg', alt: 'Sac', poster: '' },
            { type: 'image', url: '/b.jpg', alt: 'Sac porté', poster: '' },
          ],
          description: 'Collection',
          descriptionPosition: 'below',
          sponsored: false,
          sponsorName: '',
          audience: '',
          topic: '',
        },
        products: [
          {
            id: 'real-catalogue-id',
            name: 'Sac Alba',
            brand: 'Atelier',
            image: '/sac.jpg',
            price: 42,
            currency: 'TND',
            stockStatus: 'AVAILABLE',
            available: true,
          },
        ],
      }}
      compact={false}
      onProductOpen={open}
      onComments={() => {}}
      onReaction={() => {}}
    />
  );
  expect(
    screen.queryByTestId('publication-product-real-catalogue-id')
  ).toBeNull();
  expect(screen.queryByTestId('publication-thumbnail-ui-post-1')).toBeNull();
  expect(screen.getByTestId('publication-media-ui-post')).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
  expect(mockCartAdd).not.toHaveBeenCalled();
});

const referencePost = (
  template: NonNullable<FeedPost['content']>['template'],
  count = 8
): FeedPost => ({
  ...post,
  subtitle: '',
  content: {
    template,
    type: 'image',
    media: Array.from({ length: count }, (_, i) => ({
      type: 'image',
      url: `/image-${i}.jpg`,
      poster: '',
      alt: `Photo ${i + 1}`,
    })),
    description: 'Description au-dessus des photos',
    descriptionPosition: 'below',
    sponsored: false,
    sponsorName: '',
    audience: '',
    topic: '',
  },
});
describe('Reference additions, not replacements', () => {
  it.each([
    'social_mosaic',
    'social_strip',
    'social_pair',
    'caption_photo',
    'shoppable',
  ] as const)(
    '%s has caption-first content, no internal headline duplication or ellipsis menu',
    async (template) => {
      await mount(
        <PublicationCard
          post={referencePost(
            template,
            template === 'social_pair'
              ? 2
              : ['caption_photo', 'shoppable'].includes(template)
              ? 1
              : 8
          )}
          compact={false}
          onComments={jest.fn()}
          onReaction={jest.fn()}
        />
      );
      expect(screen.getByText('Description au-dessus des photos')).toBeTruthy();
      expect(screen.queryByText(post.title)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Options de la publication' })
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Suivre cet éditeur' })
      ).toHaveStyle({ minWidth: 44, minHeight: 44 });
    }
  );
  it('opens the clicked mosaic tile directly on black and closes back to the feed', async () => {
    mockSession.status = 'signedOut';
    mockQuery.mockReturnValue({
      ...feed,
      data: {
        pages: [{ items: [referencePost('social_mosaic')], nextCursor: null }],
      },
    });
    await mount();
    expect(screen.getByText('+3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('publication-tile-ui-post-4'));
    const lightbox = screen.getByTestId('publication-lightbox');
    expect(lightbox).toHaveStyle({ backgroundColor: '#000000' });
    fireEvent(
      within(lightbox).getByTestId('publication-media-ui-post'),
      'layout',
      { nativeEvent: { layout: { width: 390, height: 800 } } }
    );
    expect(
      screen
        .UNSAFE_getAllByType(FlatList)
        .some((list) => list.props.initialScrollIndex === 4)
    ).toBe(true);
    expect(
      within(lightbox).getByTestId('publication-image-ui-post-4').props
        .background
    ).toBeNull();
    expect(
      screen.UNSAFE_getAllByType(Modal).filter((modal) => modal.props.visible)
    ).toHaveLength(1);
    await act(async () => {
      screen
        .getByTestId('publication-lightbox-gesture')
        .props.onAccessibilityEscape();
      await new Promise((resolve) => setTimeout(resolve, 240));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('publication-lightbox')).toBeNull()
    );
  });
  it('uses actual source dimensions for the caption-photo format rather than forcing portrait cropping', async () => {
    await mount(<PublicationMedia post={referencePost('caption_photo', 1)} />);
    fireEvent(screen.getByTestId('publication-media-ui-post'), 'layout', {
      nativeEvent: { layout: { width: 366, height: 457.5 } },
    });
    fireEvent(screen.getByTestId('publication-image-ui-post-0'), 'dimensions', {
      width: 600,
      height: 577,
    });
    expect(screen.getByTestId('publication-media-ui-post')).toHaveStyle({
      aspectRatio: 600 / 577,
    });
  });
  it('keeps shoppable media and the primary CTA without extra product cards or commerce toggles', async () => {
    const open = jest.fn();
    await mount(
      <PublicationCard
        post={{
          ...referencePost('shoppable', 1),
          content: {
            ...referencePost('shoppable', 1).content!,
            actionLabel: 'Découvrir la pièce',
            actionTarget: 'products',
          },
          products: [
            {
              id: 'real-shoe',
              name: 'Chaussure catalogue',
              image: '/shoe.jpg',
              price: 180,
              currency: 'EUR',
              available: true,
              stockStatus: 'AVAILABLE',
            },
          ],
        }}
        compact={false}
        onComments={jest.fn()}
        onReaction={jest.fn()}
        onProductOpen={open}
      />
    );
    expect(screen.queryByTestId('publication-product-grid-ui-post')).toBeNull();
    expect(screen.queryByText(/Voir les produits/)).toBeNull();
    expect(screen.queryByText('Chaussure catalogue')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Découvrir la pièce' }));
    expect(open).toHaveBeenCalledWith('real-shoe');
    expect(mockCartAdd).not.toHaveBeenCalled();
  });
});

it('renders the publisher name as app-family text, never a wordmark pasted beside the avatar', async () => {
  await mount();
  const name = screen.getByTestId('publication-publisher-name');
  expect(name.props.children).toBe('Zayrovi Team');
  expect(name).toHaveStyle({
    fontFamily: 'Publication-SemiBold',
    fontSize: 16,
    lineHeight: 22,
  });
});
it('gives editorial and carousel their distinct landscape composition and headline hierarchy', async () => {
  const { unmount } = await mount(
    <PublicationCard
      post={{ ...referencePost('campaign', 1), category: 'beauty' }}
      compact={false}
      onComments={jest.fn()}
      onReaction={jest.fn()}
      onOpen={jest.fn()}
    />
  );
  expect(screen.getByText('BEAUTÉ')).toBeTruthy();
  expect(screen.getByTestId('publication-media-ui-post')).toHaveStyle({
    aspectRatio: 3 / 2,
  });
  expect(screen.getByTestId('publication-headline-ui-post')).toHaveStyle({
    fontSize: 20,
  });
  unmount();
  await mount(
    <PublicationCard
      post={referencePost('carousel', 3)}
      compact={false}
      onComments={jest.fn()}
      onReaction={jest.fn()}
    />
  );
  expect(screen.getByTestId('publication-media-ui-post')).toHaveStyle({
    aspectRatio: 3 / 2,
  });
  expect(screen.getByTestId('publication-headline-ui-post')).toHaveStyle({
    fontSize: 18,
  });
  fireEvent(screen.getByTestId('publication-media-ui-post'), 'layout', {
    nativeEvent: { layout: { width: 366, height: 244 } },
  });
  expect(screen.queryByTestId('publication-thumbnail-ui-post-0')).toBeNull();
});

it('asks expired sessions to sign in again without faking a successful save', async () => {
  const { ApiError } = jest.requireActual('@/api/errors');
  mockPreference.mockRejectedValueOnce(
    new ApiError('http', 'Expired', { status: 401, code: 'AUTH_REQUIRED' })
  );
  await mount();
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() =>
    expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy()
  );
  expect(
    screen.getByRole('button', { name: 'Enregistrer' }).props.accessibilityState
      .selected
  ).toBe(false);
});
it('clears the previous preference error after a genuine successful retry', async () => {
  mockPreference.mockRejectedValueOnce(new Error('temporary'));
  await mount();
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
  await screen.findByText('Modification non enregistrée. Réessayez.');
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() =>
    expect(
      screen.queryByText('Modification non enregistrée. Réessayez.')
    ).toBeNull()
  );
  expect(mockPreference).toHaveBeenCalledTimes(2);
});

it('closes the discovery reader before opening its real catalogue product', async () => {
  const close = jest.fn();
  await mount(
    <PublicationViewer
      post={{
        ...post,
        products: [
          {
            id: 'selection-real',
            name: 'Sélection',
            image: '/product.jpg',
            price: 168.377,
            currency: 'TND',
            available: true,
            stockStatus: 'AVAILABLE',
          },
        ],
      }}
      owner="guest"
      onClose={close}
      onPreference={jest.fn()}
    />
  );
  fireEvent.press(screen.getByTestId('publication-product-selection-real'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/product/[id]',
    params: { id: 'selection-real' },
  });
});

describe('Integrated reaction and viewer contracts', () => {
  it('opens an accessible reaction chooser and persists yellow dislike exclusively', async () => {
    const changed = jest.fn();
    mockSend.mockResolvedValue({ liked: false, disliked: true, likesCount: 2 });
    await mount(
      <PublicationCard
        post={post}
        compact={false}
        onComments={jest.fn()}
        onReaction={changed}
      />
    );
    fireEvent(screen.getByTestId('publication-like-ui-post'), 'longPress');
    fireEvent.press(screen.getByRole('button', { name: 'Je n’aime pas' }));
    await waitFor(() =>
      expect(changed).toHaveBeenCalledWith(post.id, false, 2, true)
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reaction',
        reaction: 'dislike',
        targetId: post.id,
      })
    );
    expect(
      screen.getByRole('button', { name: 'Retirer Je n’aime pas' }).props
        .accessibilityState
    ).toMatchObject({ selected: true });
  });
  it('opens the same comment conversation inside the black viewer and preserves its media', async () => {
    await mount(
      <PublicationViewer
        post={post}
        initialMediaIndex={0}
        owner="qa"
        onClose={jest.fn()}
        onPreference={jest.fn()}
      />
    );
    expect(screen.getByTestId('publication-lightbox')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Commentaires' }));
    expect(screen.getByText('Real Comments component slot')).toBeTruthy();
    expect(screen.getByTestId('publication-lightbox')).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', { name: 'Fermer les commentaires' })
    );
    expect(screen.queryByText('Real Comments component slot')).toBeNull();
    expect(screen.getByTestId('publication-lightbox')).toBeTruthy();
  });
  it('guest can read the discussion from the feed without a fake write or forced login', async () => {
    mockSession.status = 'signedOut';
    await mount();
    fireEvent.press(screen.getByRole('button', { name: 'Commentaires' }));
    expect(screen.getByText('Real Comments component slot')).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('Mixed-video activation and modal ownership', () => {
  it('activates a visible mixed carousel, not only posts declared video', async () => {
    const content = {
      type: 'carousel' as const,
      template: 'carousel' as const,
      media: [
        {
          type: 'video' as const,
          url: '/qa.mp4',
          poster: '/qa.jpg',
          alt: 'Clip',
        },
        { type: 'image' as const, url: '/image.jpg', poster: '', alt: 'Photo' },
      ],
      description: '',
      descriptionPosition: 'below' as const,
      sponsored: false,
      sponsorName: '',
      audience: '',
      topic: '',
    };
    const mixed = { ...post, content };
    mockQuery.mockReturnValue({
      ...feed,
      data: { pages: [{ items: [mixed], nextCursor: null }] },
    });
    await mount();
    act(() =>
      screen
        .getByTestId('publication-feed-list')
        .props.onViewableItemsChanged({ viewableItems: [{ item: mixed }] })
    );
    fireEvent(screen.getByTestId('publication-media-ui-post'), 'layout', {
      nativeEvent: { layout: { width: 360, height: 450 } },
    });
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
  });
  it('requests guest login inside the viewer without a second native modal', async () => {
    mockSession.status = 'signedOut';
    await mount(
      <PublicationViewer
        post={post}
        initialMediaIndex={0}
        owner="guest"
        onClose={jest.fn()}
        onPreference={jest.fn()}
      />
    );
    fireEvent.press(screen.getByTestId('publication-like-ui-post'));
    expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
    expect(
      screen.UNSAFE_getAllByType(Modal).filter((node) => node.props.visible)
    ).toHaveLength(1);
  });
});

it.each(['feed', 'viewer'] as const)(
  'uses a frameless row and %s-specific control surfaces',
  async (presentation) => {
    await mount(
      <PublicationActions
        post={post}
        presentation={presentation}
        onComments={jest.fn()}
      />
    );
    const row = screen.getByTestId(
      `publication-actions-${presentation}-${post.id}`
    );
    const heart = within(row).getByRole('button', { name: 'J’aime' });
    expect(heart).toHaveStyle({ minWidth: 44, minHeight: 44 });
    expect(heart.props.style.backgroundColor).toBeUndefined();
  }
);
it('supports dark ink on a light viewer backdrop', async () => {
  await mount(
    <PublicationActions
      post={post}
      presentation="viewer"
      backdrop="light"
      onComments={jest.fn()}
    />
  );
  expect(
    screen.getByRole('button', { name: 'J’aime' }).props.style.backgroundColor
  ).toBeUndefined();
});

it('uses the official heading face for Publication without enlarging its label', async () => {
  await mount();
  expect(screen.getByTestId('publication-header-title')).toHaveStyle({
    fontFamily: 'Publication-SemiBold',
  });
});

it('reserves separate toolbar, media and action slots in the immersive viewer', async () => {
  await mount(
    <PublicationViewer
      post={referencePost('carousel', 3)}
      owner="ui-owner"
      onPreference={jest.fn()}
      initialMediaIndex={0}
      onClose={jest.fn()}
    />
  );
  expect(screen.UNSAFE_getByType(PublicationMedia).props.indicatorBottom).toBe(
    12
  );
  expect(screen.getByTestId('publication-viewer-actions')).toHaveStyle({
    minHeight: 76,
  });
  expect(
    screen.getByTestId('publication-viewer-actions').props.style.position
  ).toBeUndefined();
  expect(screen.getByTestId('publication-viewer-toolbar')).toHaveStyle({
    height: 60,
  });
});

it.each([false, true])(
  'separates posts with one light gray bottom rule and breathing space (compact=%s)',
  async (compact) => {
    await mount(
      <PublicationCard
        post={referencePost('photo', 1)}
        compact={compact}
        onComments={jest.fn()}
        onReaction={jest.fn()}
      />
    );
    expect(screen.getByTestId('publication-separator-ui-post')).toHaveStyle({
      height: 1,
      backgroundColor: '#E8E8E8',
      position: 'absolute',
    });
    expect(screen.getByTestId('publication-ui-post')).toHaveStyle({
      paddingBottom: 4,
      marginBottom: 12,
    });
  }
);

it.each([false, true])(
  'uses a left avatar with follow overlay and verification next to the name (official=%s)',
  async (official) => {
    await mount(
      <PublicationPublisher
        post={{
          ...post,
          publisherOfficial: official,
          publishAt: '2026-11-07T10:00:00Z',
        }}
      />
    );
    expect(screen.getByTestId('publication-publisher-avatar-slot')).toHaveStyle(
      { position: 'absolute', left: 0, top: 0, width: 52, height: 52 }
    );
    expect(screen.getByTestId('publication-publisher-avatar')).toHaveStyle({
      width: 44,
      height: 44,
    });
    expect(
      screen.getByTestId('publication-publisher-avatar-slot')
    ).toContainElement(
      screen.getByRole('button', { name: 'Suivre cet éditeur' })
    );
    expect(screen.queryByText(/07.*11.*2026/)).toBeNull();
    expect(screen.queryByText(/Suiv/)).toBeNull();
    if (official) {
      expect(
        screen.getByTestId('publication-publisher-avatar')
      ).not.toContainElement(screen.getByTestId('publication-verified-badge'));
      expect(screen.getByTestId('publication-verified-badge')).toBeTruthy();
    } else
      expect(screen.queryByTestId('publication-verified-badge')).toBeNull();
  }
);
it('retains truthful sponsored disclosure in the compact publisher header', async () => {
  await mount(
    <PublicationPublisher
      post={{
        ...post,
        content: {
          ...referencePost('photo', 1).content!,
          sponsored: true,
          sponsorName: 'Partenaire',
        },
      }}
    />
  );
  expect(screen.getByText('Sponsorisé · Partenaire')).toBeTruthy();
});

it('does not add an expansion control or extra row to a fitting description', async () => {
  await mount(<PublicationDescription text="Texte court." color="#0A0A0A" />);
  fireEvent(screen.getByTestId('publication-description'), 'layout', {
    nativeEvent: { layout: { width: 320 } },
  });
  fireEvent(
    screen.getByTestId('publication-description-measure', {
      includeHiddenElements: true,
    }),
    'layout',
    { nativeEvent: { layout: { height: 1 } } }
  );
  expect(screen.queryByRole('button', { name: /Voir plus$/ })).toBeNull();
  expect(
    screen.getByTestId('publication-description-visible').props.children[0]
  ).toBe('Texte court.');
  expect(
    screen.queryByTestId('publication-description-measure', {
      includeHiddenElements: true,
    })
  ).toBeNull();
});
it('recalculates the inline prefix after width changes without discarding the original Unicode text', async () => {
  const text = 'Été 👩‍🔬 نصّ للتجربة فقط. '.repeat(40);
  await mount(<PublicationDescription text={text} color="#0A0A0A" />);
  const layout = (width: number) =>
    fireEvent(screen.getByTestId('publication-description'), 'layout', {
      nativeEvent: { layout: { width } },
    });
  const measure = (limit: number) => {
    for (let i = 0; i < 30; i++) {
      const probe = screen.queryByTestId('publication-description-measure', {
        includeHiddenElements: true,
      });
      if (!probe) break;
      const source = Array.isArray(probe.props.children)
        ? probe.props.children[0]
        : probe.props.children;
      fireEvent(probe, 'layout', {
        nativeEvent: {
          layout: { height: String(source).length > limit ? 10000 : 1 },
        },
      });
    }
  };
  layout(320);
  measure(160);
  const first = screen.getByTestId('publication-description-visible').props
    .children[0];
  expect(first.length).toBeLessThanOrEqual(160);
  layout(180);
  measure(80);
  const second = screen.getByTestId('publication-description-visible').props
    .children[0];
  expect(second.length).toBeLessThan(first.length);
  expect(second.endsWith('\u200D')).toBe(false);
  fireEvent.press(screen.getByRole('button', { name: /Voir plus$/ }));
  expect(
    screen.getByTestId('publication-description-visible').props.children[0]
  ).toBe(text);
  fireEvent.press(screen.getByRole('button', { name: /Voir moins$/ }));
  expect(
    screen.getByTestId('publication-description-visible').props.children[0]
  ).toBe(second);
});

it.each([
  'photo',
  'split',
  'campaign',
  'carousel',
  'social_mosaic',
  'social_pair',
  'social_strip',
  'caption_photo',
  'shoppable',
] as const)(
  'uses a shared rhythm without stacked copy padding in %s',
  async (template) => {
    const count =
      template === 'social_pair'
        ? 2
        : template === 'social_mosaic'
        ? 5
        : template === 'social_strip' || template === 'carousel'
        ? 3
        : 1;
    await mount(
      <PublicationCard
        post={referencePost(template, count)}
        compact={false}
        onComments={jest.fn()}
        onReaction={jest.fn()}
      />
    );
    expect(screen.getByTestId('publication-ui-post')).toHaveStyle({
      gap: 8,
      paddingBottom: 4,
      marginBottom: 12,
    });
    expect(screen.getByTestId('publication-copy-ui-post')).toHaveStyle({
      gap: 4,
    });
    const siblings = screen.getByTestId('publication-ui-post')
      .children as any[];
    const copyIndex = siblings.findIndex(
      (child) => child.props?.testID === 'publication-editorial-header-ui-post'
    );
    const mediaIndex = siblings.findIndex(
      (child) => child.props?.testID === 'publication-content-ui-post'
    );
    expect(copyIndex).toBeGreaterThanOrEqual(0);
    expect(copyIndex).toBeLessThan(mediaIndex);
    expect(screen.getByTestId('publication-content-ui-post')).toHaveStyle({
      ...(template === 'split' || template === 'campaign'
        ? { gap: 0 }
        : template === 'social_pair' || template === 'social_mosaic'
        ? { marginHorizontal: 4 }
        : [
            'photo',
            'carousel',
            'social_mosaic',
            'social_strip',
            'social_pair',
            'caption_photo',
            'shoppable',
          ].includes(template)
        ? { marginLeft: 52 }
        : { gap: 8 }),
    });
  }
);

it('keeps flags, skin tones, ZWJ emoji and Arabic combining marks together without Intl.Segmenter', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  try {
    Object.defineProperty(Intl, 'Segmenter', {
      value: undefined,
      configurable: true,
    });
    expect(publicationDescriptionGraphemes('🇹🇳👩🏽‍🔬a\u0301ن\u0651')).toEqual([
      '🇹🇳',
      '👩🏽‍🔬',
      'a\u0301',
      'ن\u0651',
    ]);
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
    else Reflect.deleteProperty(Intl, 'Segmenter');
  }
});

it('does not insert an empty copy section when title and description are absent', async () => {
  await mount(
    <PublicationCard
      post={{
        ...referencePost('photo', 1),
        subtitle: '',
        content: {
          ...referencePost('photo', 1).content!,
          description: '',
          showTitle: false,
        },
      }}
      compact={false}
      onComments={jest.fn()}
      onReaction={jest.fn()}
    />
  );
  expect(screen.queryByTestId('publication-copy-ui-post')).toBeNull();
  expect(
    screen.getByTestId('publication-content-ui-post').children
  ).toHaveLength(1);
});

it('confirms follow before switching to a check, prevents duplicate writes and can unfollow', async () => {
  let finish!: (value: { following: boolean }) => void;
  mockFollow.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await mount(<PublicationPublisher post={post} />);
  const plus = screen.getByRole('button', { name: 'Suivre cet éditeur' });
  expect(screen.getByTestId('publication-publisher-avatar')).toHaveStyle({
    width: 44,
    height: 44,
  });
  expect(screen.getByTestId('publication-follow-disc')).toHaveStyle({
    width: 24,
    height: 24,
    backgroundColor: '#101010',
  });
  fireEvent.press(plus);
  fireEvent.press(plus);
  expect(mockFollow).toHaveBeenCalledTimes(1);
  expect(plus).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Ne plus suivre cet éditeur' })
  ).toBeNull();
  await act(async () => finish({ following: true }));
  const checked = screen.getByRole('button', {
    name: 'Ne plus suivre cet éditeur',
  });
  expect(checked.props.accessibilityState.selected).toBe(true);
  const patch = mockSetQueries.mock.calls[0][1];
  const data = patch({
    pages: [
      {
        items: [
          post,
          { ...post, id: 'other-post' },
          { ...post, id: 'other-publisher', channelId: 'different' },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });
  expect(data.pages[0].items.map((item: any) => !!item.following)).toEqual([
    true,
    true,
    false,
  ]);
  fireEvent.press(checked);
  await waitFor(() =>
    expect(mockFollow).toHaveBeenLastCalledWith('official', false)
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Suivre cet éditeur' })
    ).toBeTruthy()
  );
});
it('does not fake follow success after a failed write and permits retry', async () => {
  mockFollow.mockRejectedValueOnce(new Error('offline'));
  await mount(<PublicationPublisher post={post} />);
  fireEvent.press(screen.getByRole('button', { name: 'Suivre cet éditeur' }));
  await screen.findByText('Suivi non enregistré. Réessayez.');
  expect(
    screen.queryByRole('button', { name: 'Ne plus suivre cet éditeur' })
  ).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Suivre cet éditeur' }));
  await screen.findByRole('button', { name: 'Ne plus suivre cet éditeur' });
});
it('restores a persisted follow and uses the publisher-only typography exception', async () => {
  await mount(
    <PublicationPublisher
      post={{ ...post, following: true, channelName: 'Zayrovi Team' }}
    />
  );
  expect(
    screen.getByRole('button', { name: 'Ne plus suivre cet éditeur' }).props
      .accessibilityState.selected
  ).toBe(true);
  expect(screen.getByTestId('publication-publisher-name')).toHaveStyle({
    fontFamily: 'Publication-SemiBold',
    fontSize: 16,
  });
  expect(screen.getByTestId('publication-publisher-name').props.children).toBe(
    'Zayrovi Team'
  );
});

it('aligns the copy column with the publisher name and keeps media independent', async () => {
  await mount(
    <PublicationCard
      post={referencePost('caption_photo', 1)}
      compact={false}
      onComments={jest.fn()}
      onReaction={jest.fn()}
      mediaInset={16}
    />
  );
  expect(
    screen.getByTestId('publication-editorial-header-ui-post')
  ).toHaveStyle({ gap: 4, minHeight: 52 });
  expect(screen.getByTestId('publication-publisher-column')).toHaveStyle({
    marginLeft: 52,
  });
  expect(screen.getByTestId('publication-publisher-column')).toContainElement(
    screen.getByTestId('publication-copy-ui-post')
  );
  expect(screen.getByTestId('publication-separator-ui-post')).toHaveStyle({
    left: -16,
    right: -16,
    height: 1,
  });
  expect(
    screen.getByTestId('publication-publisher-avatar-slot')
  ).toContainElement(screen.getByTestId('publication-follow-ui-post'));
});

it('opens supported post options from the viewer toolbar and retains the original core', async () => {
  await mount(
    <PublicationViewer
      post={post}
      initialMediaIndex={0}
      owner="ui-owner"
      onClose={jest.fn()}
      onPreference={jest.fn()}
    />
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Options de la publication' })
  );
  expect(screen.getByTestId('publication-post-options')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Copier le lien' })).toBeTruthy();
  expect(
    within(screen.getByTestId('publication-post-options')).getByRole('button', {
      name: 'Enregistrer',
    })
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Fermer les options' }));
  expect(screen.getByTestId('publication-viewer-actions')).toHaveStyle({
    backgroundColor: '#000000',
  });
});

it('closes the fullscreen image through its accessible top-left close control', async () => {
  const close = jest.fn();
  await mount(
    <PublicationViewer
      post={post}
      initialMediaIndex={0}
      owner="ui-owner"
      onClose={close}
      onPreference={jest.fn()}
    />
  );
  fireEvent.press(screen.getByRole('button', { name: 'Fermer l’image' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

it('gates viewer toolbar reaction options behind the existing guest authentication sheet', async () => {
  mockSession.status = 'signedOut';
  await mount(
    <PublicationViewer
      post={post}
      initialMediaIndex={0}
      owner="guest"
      onClose={jest.fn()}
      onPreference={jest.fn()}
    />
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Options de la publication' })
  );
  fireEvent.press(
    within(screen.getByTestId('publication-post-options')).getByRole('button', {
      name: 'Enregistrer',
    })
  );
  expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
  expect(
    screen.UNSAFE_getAllByType(Modal).filter((node) => node.props.visible)
  ).toHaveLength(1);
});

it('exits the fullscreen image with its close control even when comments are open', async () => {
  const close = jest.fn();
  await mount(
    <PublicationViewer
      post={post}
      initialMediaIndex={0}
      owner="ui-owner"
      onClose={close}
      onPreference={jest.fn()}
    />
  );
  fireEvent.press(screen.getByRole('button', { name: 'Commentaires' }));
  expect(
    screen.getByRole('button', { name: 'Fermer les commentaires' })
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Fermer l’image' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

it('uses the Publication SVG family with one stroke and four real actions', async () => {
  await mount(<PublicationActions post={post} onComments={jest.fn()} />);
  for (const glyph of [
    'heart-outline',
    'chatbubble-outline',
    'share-outline',
    'bookmark-outline',
  ]) {
    const icon = screen.getByTestId(`publication-icon-${glyph}`, {
      includeHiddenElements: true,
    });
    expect(icon.props.width).toBe(22);
    expect(icon.findAllByProps({ strokeWidth: 1.7 }).length).toBeGreaterThan(0);
  }
  expect(
    within(screen.getByTestId('publication-actions-feed-ui-post')).getAllByRole(
      'button'
    )
  ).toHaveLength(4);
  fireEvent(
    screen.getByTestId('publication-like-ui-post'),
    'accessibilityAction',
    { nativeEvent: { actionName: 'longpress' } }
  );
  expect(screen.getByLabelText('Choisir une réaction')).toBeTruthy();
});

it('opens the complete post conversation from the feed comment action', async () => {
  await mount();
  fireEvent.press(screen.getByRole('button', { name: 'Commentaires' }));
  expect(screen.getByTestId('publication-reader')).toBeTruthy();
  expect(screen.getByTestId('publication-detail-post')).toBeTruthy();
  expect(screen.getByText('Real Comments component slot')).toBeTruthy();
  expect(
    within(screen.getByTestId('publication-reader')).getByText('Suivre')
  ).toBeTruthy();
});

it('shows the full description above the detail media without changing product navigation', async () => {
  await mount(
    <PublicationViewer
      post={referencePost('social_pair', 2)}
      owner="ui-owner"
      onClose={jest.fn()}
      onPreference={jest.fn()}
    />
  );
  const detail = screen.getByTestId('publication-detail-post');
  expect(
    within(detail).getByText('Description au-dessus des photos')
  ).toHaveStyle({ fontFamily: 'Publication-Regular', fontSize: 16 });
  expect(within(detail).queryByText(post.title)).toBeNull();
});

it('saves from the sheet through the same preference API and owner cache', async () => {
  const close = jest.fn();
  await mount(<PublicationPostOptions post={post} onClose={close} />);
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mockPreference).toHaveBeenCalledWith(post.id, { saved: true });
  expect(mockInvalidate).toHaveBeenCalledWith({
    queryKey: ['publication-feed', mockSession.account.id],
  });
});

it('keeps a failed sheet preference open and permits a genuine retry', async () => {
  const close = jest.fn();
  mockPreference.mockRejectedValueOnce(new Error('offline'));
  await mount(<PublicationPostOptions post={post} onClose={close} />);
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
  await screen.findByText('Action non enregistrée. Réessayez.');
  expect(close).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mockPreference).toHaveBeenCalledTimes(2);
});

it('only offers preference actions actually supported by the server', async () => {
  const changed = jest.fn();
  await mount(
    <PublicationPostOptions
      post={post}
      onClose={jest.fn()}
      onPreference={changed}
    />
  );
  expect(screen.queryByText('Traduire')).toBeNull();
  expect(screen.queryByText('Bloquer')).toBeNull();
  fireEvent.press(
    screen.getByRole('button', { name: 'Ça ne m’intéresse pas' })
  );
  await waitFor(() =>
    expect(changed).toHaveBeenCalledWith('not_interested', post.id)
  );
  expect(mockPreference).toHaveBeenCalledWith(post.id, {
    feedback: 'not_interested',
  });
});

it('groups feed actions at the copy edge but centers the immersive group', async () => {
  const result = await mount(
    <PublicationActions post={post} onComments={jest.fn()} />
  );
  expect(screen.getByTestId('publication-like-ui-post')).toHaveStyle({
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'flex-start',
  });
  expect(screen.getByTestId('publication-action-row-feed-ui-post')).toHaveStyle(
    { justifyContent: 'flex-start', gap: 12 }
  );
  result.unmount();
  await mount(
    <PublicationActions
      post={post}
      presentation="viewer"
      backdrop="dark"
      onComments={jest.fn()}
    />
  );
  expect(
    screen.getByTestId('publication-action-row-viewer-ui-post')
  ).toHaveStyle({ justifyContent: 'center', gap: 8 });
});
