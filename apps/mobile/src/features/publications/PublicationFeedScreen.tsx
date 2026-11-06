import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchFeedPage, fetchFeedSettings, type FeedPost, type FeedPage, writePublicationPreference } from '@/api/publicationFeed';
import { BrandMark } from '@/design/BrandMark';
import { AppText } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { PUBLICATION_THEME as P, RADIUS, veil } from '@/design/tokens.mobile';
import { useResponsive } from '@/design/layout';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';
import { sendInteraction } from '@/api/social';
import { Comments } from '@/features/social/Comments';
import { PublicationSparkIcon } from './PublicationReactionIcon';
import { PublicationViewer } from './PublicationViewer';
import { PublicationCard } from './PublicationCard';
import { readFeedView, saveFeedView, uniqueFeedPosts } from './publicationFeedLogic';

export function PublicationFeedScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const configuration = useQuery({ queryKey: ['publication-feed-settings'], queryFn: ({ signal }) => fetchFeedSettings({ signal }), staleTime: 0, refetchInterval: 30000 });
  const settings = configuration.data;
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('dark');
    return () => setStatusBarStyle(theme.mode === 'dark' ? 'light' : 'dark');
  }, [theme.mode]));
  const { locale, t } = useI18n();
  const ar = locale === 'ar';
  const session = useSession();
  const owner = session.account?.id || 'guest';
  const params = useLocalSearchParams<{ post?: string }>();
  const post = typeof params.post === 'string' ? params.post : '';
  const initial = useRef(post ? { category: '', q: '', offset: 0 } : readFeedView(owner));
  const [category, setCategory] = useState(initial.current.category);
  const [searchOpen, setSearchOpen] = useState(!!initial.current.q);
  const [search, setSearch] = useState(initial.current.q);
  const [q, setQ] = useState(initial.current.q);
  const [viewer, setViewer] = useState<FeedPost | null>(null);
  const [activeId, setActiveId] = useState('');
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const viewed = useRef(new Set<string>());
  const sessionId = useSessionId();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const viewability = useRef({ itemVisiblePercentThreshold: 40 }).current;
  const visibleChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: FeedPost }> }) => { setActiveId(viewableItems.find(row => row.item.content?.type === 'video')?.item.id || ''); setVisibleIds(viewableItems.map(row => row.item.id)); }).current;
  const [filter, setFilter] = useState('');
  const [lastHidden, setLastHidden] = useState('');
  const [undoError, setUndoError] = useState(false);
  const [comments, setComments] = useState<FeedPost | null>(null);
  const list = useRef<FlatList<FeedPost>>(null);
  const offset = useRef(initial.current.offset);
  const restored = useRef(false);
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();
  useEffect(() => { const timer = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { saveFeedView(owner, { category, q, offset: offset.current }); }, [owner, category, q]);
  const feed = useInfiniteQuery({
    queryKey: ['publication-feed', owner, category, q, post, filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchFeedPage({ category: post ? '' : category, q: post ? '' : q, post, type: ['image','carousel','video','product','collection','editorial'].includes(filter) ? filter : '', saved: filter === 'saved', following: filter === 'following', hasProducts: filter === 'shop', audience: ['men','women','unisex'].includes(filter) ? filter : '', topic: ['shoes','accessories','new-trends'].includes(filter) ? filter : '', cursor: pageParam }, { signal }),
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: session.status !== 'loading' && !!settings?.enabled, staleTime: 30000,
  });
  const rows = settings?.enabled ? uniqueFeedPosts(feed.data?.pages ?? []) : [];
  useEffect(() => {
    if (settings && !settings.categories.some(c => c.key === category && c.enabled)) setCategory('');
  }, [settings, category]);
  const reset = () => { offset.current = 0; restored.current = true; list.current?.scrollToOffset({ offset: 0, animated: false }); };
  useEffect(() => { setViewer(null); setLastHidden(''); }, [owner]);
  useEffect(() => {
    if (!focused || comments || viewer || (!sessionId && owner === 'guest')) return;
    const timer = setTimeout(() => {
      if (AppState.currentState !== 'active') return;
      for (const id of visibleIds) {
        const key = `${owner}:${id}`; if (viewed.current.has(key)) continue;
        viewed.current.add(key);
        void sendInteraction({ type: 'view', targetId: id, sessionId: sessionId || undefined }).catch(() => viewed.current.delete(key));
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [visibleIds, focused, comments, viewer, owner, sessionId]);
  const closeComments = () => { setComments(null); void feed.refetch(); };
  const preferenceChanged = (action: string, id: string) => { if (action === 'hidden' || action === 'not_interested') setLastHidden(id); void queryClient.invalidateQueries({ queryKey: ['publication-feed', owner] }); };
  return <View testID="publication-feed" style={[styles.screen, { paddingTop: insets.top }]}>
    <View style={[styles.header, { paddingHorizontal: gutter, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'رجوع' : 'Retour'} onPress={() => goBack('/(tabs)')} style={styles.icon}>
        <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={theme.iconSize.md} color={P.ink} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'الرئيسية ZAYROVI' : 'Accueil ZAYROVI'} onPress={() => router.push('/(tabs)')}><BrandMark nameSize={12} color={P.ink} /></Pressable>
      <View style={styles.title}><AppText numberOfLines={1} variant="label" color={P.ink}>{settings ? (ar ? settings.titleAr : settings.titleFr) : t('social.publications')}</AppText></View>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'البحث في المنشورات' : 'Rechercher des publications'} accessibilityState={{ expanded: searchOpen }} onPress={() => setSearchOpen(!searchOpen)} style={styles.icon}>
        <Ionicons name="search-outline" size={theme.iconSize.md} color={P.ink} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'إشعارات الحساب' : 'Notifications du compte'} onPress={() => router.push('/account/notifications')} style={styles.icon}>
        <Ionicons name="notifications-outline" size={theme.iconSize.md} color={P.ink} />
      </Pressable>
    </View>
    {searchOpen ? <View style={[styles.search, { marginHorizontal: gutter }]}>
      <TextInput testID="publication-search" accessibilityLabel={ar ? 'البحث في المنشورات' : 'Recherche Publication'} maxLength={100}
        placeholder={ar ? 'ابحث عن إلهام…' : 'Rechercher une inspiration…'} placeholderTextColor={P.muted} value={search}
        onChangeText={value => { reset(); if (post) router.setParams({ post: undefined }); setSearch(value); }} style={[styles.input, theme.text('body')]} />
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'مسح البحث' : 'Effacer la recherche'} onPress={() => { reset(); setSearch(''); }} style={styles.icon}><Ionicons name="close" size={theme.iconSize.md} color={P.ink} /></Pressable>
    </View> : null}
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.categories, { paddingHorizontal: gutter, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
      {(settings?.categories ?? []).filter(c => c.enabled).map(({ key, labelFr, labelAr }) => <Pressable key={key} testID={`publication-category-${key || 'all'}`}
        accessibilityRole="button" accessibilityLabel={(ar ? labelAr : labelFr)} accessibilityState={{ selected: category === key }}
        onPress={() => { reset(); if (post) router.setParams({ post: undefined }); setCategory(key); }} style={[styles.chip, { backgroundColor: category === key ? P.accent : P.neutral }]}>
        <AppText variant="captionStrong" color={category === key ? P.paper : P.ink}>{(ar ? labelAr : labelFr)}</AppText>
      </Pressable>)}
    </ScrollView></View>
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.categories, { paddingHorizontal: gutter }]}>
      {[['', ar ? 'الكل' : 'Tout'], ['following', ar ? 'المتابَعون' : 'Abonnements'], ['saved', ar ? 'المحفوظات' : 'Enregistrés'], ['video', ar ? 'فيديو' : 'Vidéos'], ['carousel', ar ? 'صور متعددة' : 'Carrousels'], ['shop', ar ? 'للتسوق' : 'À acheter'], ['men', ar ? 'رجال' : 'Homme'], ['women', ar ? 'نساء' : 'Femme'], ['shoes', ar ? 'أحذية' : 'Chaussures'], ['accessories', ar ? 'إكسسوارات' : 'Accessoires'], ['new-trends', ar ? 'الجديد' : 'Nouveautés']].map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => { reset(); setFilter(value); }} style={[styles.chip, { backgroundColor: filter === value ? P.ink : P.neutral }]}><AppText variant="captionStrong" color={filter === value ? P.paper : P.ink}>{label}</AppText></Pressable>)}
    </ScrollView></View>
    {lastHidden ? <View style={styles.sheetHeader}><AppText color={P.muted}>{undoError ? (ar ? 'تعذّر التراجع، أعد المحاولة' : 'Échec de l’annulation. Réessayez.') : (ar ? 'تم إخفاء المنشور' : 'Publication masquée')}</AppText><Pressable accessibilityRole="button" style={styles.icon} onPress={() => { void writePublicationPreference(lastHidden, { feedback: '' }).then(() => { setLastHidden(''); setUndoError(false); return queryClient.invalidateQueries({ queryKey: ['publication-feed', owner] }); }).catch(() => setUndoError(true)); }}><AppText color={P.accent}>{ar ? 'تراجع' : 'Annuler'}</AppText></Pressable></View> : null}
    {post ? <Pressable accessibilityRole="button" style={[styles.all, { paddingHorizontal: gutter }]} onPress={() => { reset(); setCategory(''); setSearch(''); router.setParams({ post: undefined }); }}>
      <AppText variant="label" color={P.accent}>{ar ? 'كل المنشورات' : 'Toutes les publications'}</AppText>
    </Pressable> : null}
    <FlatList viewabilityConfig={viewability} onViewableItemsChanged={visibleChanged} extraData={activeId + String(!!viewer)} ref={list} testID="publication-feed-list" data={rows} keyExtractor={item => item.id}
      contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + 24, paddingTop: 12 }}
      keyboardShouldPersistTaps="handled" initialNumToRender={4} maxToRenderPerBatch={4} windowSize={5}
      refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => { reset(); void configuration.refetch(); if (settings?.enabled) void feed.refetch(); }}
      onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; saveFeedView(owner, { category, q, offset: offset.current }); }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (!restored.current && rows.length) { restored.current = true; list.current?.scrollToOffset({ offset: initial.current.offset, animated: false }); } }}
      onEndReachedThreshold={0.5} onEndReached={() => { if (feed.hasNextPage && !feed.isFetching && !feed.isFetchNextPageError) void feed.fetchNextPage(); }}
      renderItem={({ item, index }) => <PublicationCard key={`${owner}:${item.id}`} post={item} active={focused && !viewer && !comments && activeId === item.id} onOpen={() => setViewer(item)} onPreference={preferenceChanged} compact={settings?.layout === 'compact' || (settings?.layout === 'mixed' && index % 3 === 1)} onReaction={(id, liked, likes) => queryClient.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ['publication-feed', owner] }, old => old ? { ...old, pages: old.pages.map(page => ({ ...page, items: page.items.map(row => row.id === id ? { ...row, liked, likes } : row) })) } : old)} onComments={() => setComments(item)} />}
      ListEmptyComponent={configuration.isError ? <ErrorBlock error={configuration.error} onRetry={() => void configuration.refetch()} /> : configuration.isPending ? <LoadingBlock /> : !settings?.enabled ? <EmptyBlock><AppText color={P.muted}>{ar ? 'المنشورات غير متاحة حاليًا.' : 'Les publications sont temporairement indisponibles.'}</AppText></EmptyBlock> : feed.isPending ? <LoadingBlock /> : feed.isError ? <ErrorBlock error={feed.error} onRetry={() => void feed.refetch()} /> : <EmptyBlock><PublicationSparkIcon /><AppText color={P.muted}>{ar ? 'ما فماش منشورات مطابقة حاليًا.' : 'Aucune publication pour cette sélection.'}</AppText></EmptyBlock>}
      ListFooterComponent={feed.isFetchingNextPage ? <LoadingBlock /> : feed.isError && rows.length > 0 ? <ErrorBlock error={feed.error} onRetry={() => { if (feed.isFetchNextPageError) void feed.fetchNextPage(); else void feed.refetch(); }} /> : rows.length > 0 && !feed.hasNextPage ? <AppText variant="caption" color={P.muted} align="center">{ar ? 'وصلت لآخر المنشورات' : 'Vous avez tout découvert'}</AppText> : null}
    />
    {viewer ? <PublicationViewer post={viewer} owner={owner} onClose={() => { setViewer(null); void feed.refetch(); }} onPreference={preferenceChanged} /> : null}
    <Modal visible={comments !== null} transparent animationType="slide" onRequestClose={closeComments}>
      <View style={[styles.modal, { paddingTop: insets.top + 48 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'إغلاق التعليقات' : 'Fermer les commentaires'} onPress={closeComments} style={styles.backdrop} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.canvas, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHeader}><AppText variant="h3" color={theme.colors.ink}>{ar ? 'التعليقات' : 'Commentaires'}</AppText><Pressable accessibilityRole="button" accessibilityLabel={ar ? 'إغلاق' : 'Fermer'} onPress={closeComments} style={styles.icon}><Ionicons name="close" size={theme.iconSize.md} color={theme.colors.ink} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled">{comments ? <Comments targetId={comments.id} /> : null}</ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.paper }, header: { minHeight: 44, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.line },
  title: { flex: 1, alignItems: 'center' }, icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: P.neutral, borderRadius: RADIUS.md }, input: { flex: 1, color: P.ink, padding: 12, minHeight: 44 },
  categories: { paddingVertical: 4, gap: 8 }, chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: RADIUS.xl, justifyContent: 'center' },
  all: { minHeight: 44, justifyContent: 'center' }, modal: { flex: 1, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: veil(0.5) },
  sheet: { maxHeight: '85%', backgroundColor: P.paper, padding: 16, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
