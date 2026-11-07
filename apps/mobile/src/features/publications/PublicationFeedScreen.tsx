import { BackButton } from '@/design/BackButton';
import { PublicationCommentsSheet } from './PublicationCommentsSheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import { NavigationIcon as Ionicons } from '@/design/NavigationIcon';
import {
  fetchFeedPage,
  fetchFeedSettings,
  type FeedPost,
  type FeedPage,
  writePublicationPreference,
} from '@/api/publicationFeed';
import { AppText } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import {
  PUBLICATION_THEME as P,
  PUBLICATION_METRICS as PM,
  RADIUS,
  veil,
} from '@/design/tokens.mobile';
import { useResponsive } from '@/design/layout';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';
import { sendInteraction } from '@/api/social';
import { PublicationSparkIcon } from './PublicationReactionIcon';
import { PublicationViewer } from './PublicationViewer';
import { useProductFavorites } from '@/features/reels/useProductFavorites';
import { PublicationCard } from './PublicationCard';
import {
  readFeedView,
  saveFeedView,
  uniqueFeedPosts,
} from './publicationFeedLogic';

export function PublicationFeedScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const configuration = useQuery({
    queryKey: ['publication-feed-settings'],
    queryFn: ({ signal }) => fetchFeedSettings({ signal }),
    staleTime: 0,
    refetchInterval: 30000,
  });
  const settings = configuration.data;
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('dark');
      return () => setStatusBarStyle(theme.mode === 'dark' ? 'light' : 'dark');
    }, [theme.mode])
  );
  const { locale, t } = useI18n();
  const ar = locale === 'ar';
  const session = useSession();
  const owner = session.account?.id || 'guest';
  const params = useLocalSearchParams<{ post?: string }>();
  const post = typeof params.post === 'string' ? params.post : '';
  const initial = useRef(
    post ? { category: '', q: '', offset: 0 } : readFeedView(owner)
  );
  // Category/mode strips were explicitly removed, including their hidden query state.
  const category = '';
  const [searchOpen, setSearchOpen] = useState(!!initial.current.q);
  const [search, setSearch] = useState(initial.current.q);
  const [q, setQ] = useState(initial.current.q);
  const [viewerMedia, setViewerMedia] = useState<number | null>(null);
  const [viewer, setViewer] = useState<FeedPost | null>(null);
  const [activeId, setActiveId] = useState('');
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const viewed = useRef(new Set<string>());
  const sessionId = useSessionId();
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  const viewability = useRef({ itemVisiblePercentThreshold: 40 }).current;
  const visibleChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: FeedPost }> }) => {
      setActiveId(
        viewableItems.find((row) => row.item.content?.type === 'video' || row.item.content?.media.some(media => media.type === 'video'))?.item
          .id || ''
      );
      setVisibleIds(viewableItems.map((row) => row.item.id));
    }
  ).current;
  const [lastHidden, setLastHidden] = useState('');
  const [undoError, setUndoError] = useState(false);
  const [comments, setComments] = useState<FeedPost | null>(null);
  const list = useRef<FlatList<FeedPost>>(null);
  const offset = useRef(initial.current.offset);
  const restored = useRef(false);
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    saveFeedView(owner, { category, q, offset: offset.current });
  }, [owner, category, q]);
  const feed = useInfiniteQuery({
    queryKey: ['publication-feed', owner, category, q, post],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchFeedPage(
        { category: '', q: post ? '' : q, post, cursor: pageParam },
        { signal }
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: session.status !== 'loading' && !!settings?.enabled,
    staleTime: 30000,
  });
  const rows = settings?.enabled ? uniqueFeedPosts(feed.data?.pages ?? []) : [];
  const productFavorites = useProductFavorites(
    session.status === 'signedIn' &&
      rows.some((row) => row.content?.template === 'shoppable'),
    owner
  );
  const reset = () => {
    offset.current = 0;
    restored.current = true;
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  useEffect(() => {
    setViewer(null);
    setLastHidden('');
  }, [owner]);
  useEffect(() => {
    if (!focused || comments || viewer || (!sessionId && owner === 'guest'))
      return;
    const timer = setTimeout(() => {
      if (AppState.currentState !== 'active') return;
      for (const id of visibleIds) {
        const key = `${owner}:${id}`;
        if (viewed.current.has(key)) continue;
        viewed.current.add(key);
        void sendInteraction({
          type: 'view',
          targetId: id,
          sessionId: sessionId || undefined,
        }).catch(() => viewed.current.delete(key));
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [visibleIds, focused, comments, viewer, owner, sessionId]);
  const closeComments = () => {
    setComments(null);
    void feed.refetch();
  };
  const preferenceChanged = (action: string, id: string) => {
    if (action === 'hidden' || action === 'not_interested') setLastHidden(id);
    void queryClient.invalidateQueries({
      queryKey: ['publication-feed', owner],
    });
  };
  return (
    <View
      testID="publication-feed"
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: gutter,
            flexDirection: theme.isRTL ? 'row-reverse' : 'row',
          },
        ]}
      >
        <View
          style={[
            styles.headerSide,
            { flexDirection: theme.isRTL ? 'row-reverse' : 'row' },
          ]}
        >
          <BackButton onPress={() => goBack('/(tabs)')} label={ar ? 'رجوع' : 'Retour'} color={P.ink} />
        </View>
        <View style={styles.title}>
          <AppText numberOfLines={1} variant="label" color={P.ink}>
            {settings
              ? ar
                ? settings.titleAr
                : settings.titleFr === 'Publications'
                ? 'Publication'
                : settings.titleFr
              : t('social.publications')}
          </AppText>
        </View>
        <View
          style={[
            styles.headerSide,
            { flexDirection: theme.isRTL ? 'row-reverse' : 'row' },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              ar ? 'البحث في المنشورات' : 'Rechercher des publications'
            }
            accessibilityState={{ expanded: searchOpen }}
            onPress={() => setSearchOpen(!searchOpen)}
            style={styles.icon}
          >
            <Ionicons name="search-outline" size={PM.icon} color={P.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ar ? 'حسابي' : 'Mon compte'}
            onPress={() => router.push('/(tabs)/account')}
            style={styles.icon}
          >
            <Ionicons name="person-outline" size={PM.icon} color={P.ink} />
          </Pressable>
        </View>
      </View>
      {searchOpen ? (
        <View style={[styles.search, { marginHorizontal: gutter }]}>
          <TextInput
            testID="publication-search"
            accessibilityLabel={
              ar ? 'البحث في المنشورات' : 'Recherche Publication'
            }
            maxLength={100}
            placeholder={ar ? 'ابحث عن إلهام…' : 'Rechercher une inspiration…'}
            placeholderTextColor={P.muted}
            value={search}
            onChangeText={(value) => {
              reset();
              if (post) router.setParams({ post: undefined });
              setSearch(value);
            }}
            style={[styles.input, theme.text('body')]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ar ? 'مسح البحث' : 'Effacer la recherche'}
            onPress={() => {
              reset();
              setSearch('');
            }}
            style={styles.icon}
          >
            <Ionicons name="close" size={PM.icon} color={P.ink} />
          </Pressable>
        </View>
      ) : null}
      {lastHidden ? (
        <View style={styles.sheetHeader}>
          <AppText color={P.muted}>
            {undoError
              ? ar
                ? 'تعذّر التراجع، أعد المحاولة'
                : 'Échec de l’annulation. Réessayez.'
              : ar
              ? 'تم إخفاء المنشور'
              : 'Publication masquée'}
          </AppText>
          <Pressable
            accessibilityRole="button"
            style={styles.icon}
            onPress={() => {
              void writePublicationPreference(lastHidden, { feedback: '' })
                .then(() => {
                  setLastHidden('');
                  setUndoError(false);
                  return queryClient.invalidateQueries({
                    queryKey: ['publication-feed', owner],
                  });
                })
                .catch(() => setUndoError(true));
            }}
          >
            <AppText color={P.accent}>{ar ? 'تراجع' : 'Annuler'}</AppText>
          </Pressable>
        </View>
      ) : null}
      {post ? (
        <Pressable
          accessibilityRole="button"
          style={[styles.all, { paddingHorizontal: gutter }]}
          onPress={() => {
            reset();
            setSearch('');
            router.setParams({ post: undefined });
          }}
        >
          <AppText variant="label" color={P.accent}>
            {ar ? 'كل المنشورات' : 'Toutes les publications'}
          </AppText>
        </Pressable>
      ) : null}
      <FlatList
        viewabilityConfig={viewability}
        onViewableItemsChanged={visibleChanged}
        extraData={activeId + String(!!viewer)}
        ref={list}
        testID="publication-feed-list"
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + 24,
          paddingTop: 12,
        }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage}
        onRefresh={() => {
          reset();
          void configuration.refetch();
          if (settings?.enabled) void feed.refetch();
        }}
        onScroll={(event) => {
          offset.current = event.nativeEvent.contentOffset.y;
          saveFeedView(owner, { category, q, offset: offset.current });
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (!restored.current && rows.length) {
            restored.current = true;
            list.current?.scrollToOffset({
              offset: initial.current.category ? 0 : initial.current.offset,
              animated: false,
            });
          }
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (
            feed.hasNextPage &&
            !feed.isFetching &&
            !feed.isFetchNextPageError
          )
            void feed.fetchNextPage();
        }}
        renderItem={({ item, index }) => (
          <PublicationCard
            key={`${owner}:${item.id}`}
            post={item}
            active={focused && !viewer && !comments && activeId === item.id}
            onOpen={() => {
              setViewerMedia(null);
              setViewer(item);
            }}
            mediaInset={gutter}
            productFavorites={productFavorites}
            onMediaOpen={(index) => {
              setViewerMedia(index);
              setViewer(item);
            }}
            onPreference={preferenceChanged}
            compact={
              settings?.layout === 'compact' ||
              (settings?.layout === 'mixed' && index % 3 === 1)
            }
            onReaction={(id, liked, likes, disliked) =>
              queryClient.setQueriesData<InfiniteData<FeedPage>>(
                { queryKey: ['publication-feed', owner] },
                (old) =>
                  old
                    ? {
                        ...old,
                        pages: old.pages.map((page) => ({
                          ...page,
                          items: page.items.map((row) =>
                            row.id === id ? { ...row, liked, likes, disliked } : row
                          ),
                        })),
                      }
                    : old
              )
            }
            onComments={() => setComments(item)}
          />
        )}
        ListEmptyComponent={
          configuration.isError ? (
            <ErrorBlock
              error={configuration.error}
              onRetry={() => void configuration.refetch()}
            />
          ) : configuration.isPending ? (
            <LoadingBlock />
          ) : !settings?.enabled ? (
            <EmptyBlock>
              <AppText color={P.muted}>
                {ar
                  ? 'المنشورات غير متاحة حاليًا.'
                  : 'Les publications sont temporairement indisponibles.'}
              </AppText>
            </EmptyBlock>
          ) : feed.isPending ? (
            <LoadingBlock />
          ) : feed.isError ? (
            <ErrorBlock
              error={feed.error}
              onRetry={() => void feed.refetch()}
            />
          ) : (
            <EmptyBlock>
              <PublicationSparkIcon />
              <AppText color={P.muted}>
                {ar
                  ? 'ما فماش منشورات مطابقة حاليًا.'
                  : 'Aucune publication pour le moment.'}
              </AppText>
            </EmptyBlock>
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <LoadingBlock />
          ) : feed.isError && rows.length > 0 ? (
            <ErrorBlock
              error={feed.error}
              onRetry={() => {
                if (feed.isFetchNextPageError) void feed.fetchNextPage();
                else void feed.refetch();
              }}
            />
          ) : rows.length > 0 && !feed.hasNextPage ? (
            <AppText variant="caption" color={P.muted} align="center">
              {ar ? 'وصلت لآخر المنشورات' : 'Vous avez tout découvert'}
            </AppText>
          ) : null
        }
      />
      {viewer ? (
        <PublicationViewer
          post={feed.data?.pages.flatMap(page => page.items).find(row => row.id === viewer.id) || viewer}
          initialMediaIndex={viewerMedia}
          owner={owner}
          onClose={() => {
            setViewer(null);
            void feed.refetch();
          }}
          onPreference={preferenceChanged}
        />
      ) : null}
      {comments ? <PublicationCommentsSheet targetId={comments.id} onClose={closeComments} /> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.paper },
  header: {
    minHeight: 52,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.line,
  },
  headerSide: { width: 88, alignItems: 'center' },
  title: { flex: 1, alignItems: 'center' },
  icon: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.neutral,
    borderRadius: RADIUS.md,
  },
  input: { flex: 1, color: P.ink, padding: 12, minHeight: 44 },
  all: { minHeight: 44, justifyContent: 'center' },
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: veil(0.5) },
  sheet: {
    maxHeight: '85%',
    backgroundColor: P.paper,
    padding: 16,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
