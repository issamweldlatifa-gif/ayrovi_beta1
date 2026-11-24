import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useStories, useStoriesShowcase } from '@/api/hooks';
import { mediaUrl } from '@/api/client';
import type { StoryItem } from '@/api/sections';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useReduceMotion } from '@/design/motion';
import { goBack } from '@/design/navigation';
import { NavigationIcon } from '@/design/NavigationIcon';
import { useTheme } from '@/design/theme';
import { HERO_COPY as C, RADIUS, veil } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';
import { useI18n } from '@/i18n';
import { OFFICIAL_PUBLISHER_ID } from '@/features/publications/officialPublisher';
import { usePublisherFollow } from '@/features/publications/usePublisherFollow';
import { STORY_GALLERY as G, storiesGalleryContent, storiesGalleryMeasures, storyArchiveRows } from './storiesGalleryLayout';

const TYPE = { title: 30, titleLine: 36, section: 26, sectionLine: 30, caption: 24, captionLine: 28, small: 14, smallLine: 16, subtitle: 16, subtitleLine: 23 };
const ARCHIVE_BATCH = 9;
type ArchiveRow = ReturnType<typeof storyArchiveRows>[number];
type Row = { kind: 'feature'; story: StoryItem } | { kind: 'archive'; row: ArchiveRow } | { kind: 'new' | 'follow' | 'archive-title' };

export function StoryCard({ story, width, height, small = false }: { story: StoryItem; width: number; height?: number; small?: boolean }) {
  const { locale, t } = useI18n();
  const title = (locale === 'ar' && story.titleAr) || story.title;
  const subtitle = (locale === 'ar' && story.descriptionAr) || story.description;
  return <Pressable accessibilityRole="link" accessibilityLabel={title || t('sections.stories')}
    onPress={() => router.push({ pathname: '/stories', params: { id: story.id } })}
    style={[styles.card, { width, height: height ?? width / G.aspect }]} testID={`stories-gallery-card-${story.id}`}>
    <AppImage uri={mediaUrl(story.mediaUrl)} contentFit="cover" decorative style={StyleSheet.absoluteFill} />
    {(title || subtitle) ? <LinearGradient colors={['transparent', veil(0.66)]} style={[styles.shade, small && styles.shadeSmall]}>
      {title ? <AppText color={C.white} numberOfLines={small ? 3 : 2}
        style={[small ? styles.smallTitle : styles.cardTitle, locale !== 'ar' && styles.uppercase]}>{title}</AppText> : null}
      {!small && subtitle ? <AppText color={C.white} numberOfLines={2} style={styles.subtitle}>{subtitle}</AppText> : null}
    </LinearGradient> : null}
  </Pressable>;
}

export function FollowStories({ light = false }: { light?: boolean }) {
  const { t } = useI18n();
  const { isRTL } = useTheme();
  const follow = usePublisherFollow(OFFICIAL_PUBLISHER_ID, () => router.push('/sign-in'));
  const label = t(follow.state === 'following' ? 'storiesGallery.alertsOn' : follow.state === 'error' ? 'publication.followRetry' : 'storiesGallery.follow');
  const ink = light ? C.black : C.white;
  return <View style={styles.followSection} testID="stories-alerts">
    <AppText accessibilityRole="header" color={ink} style={styles.title}>{t('storiesGallery.followTitle')}</AppText>
    <AppText color={ink} style={styles.subtitle}>{t('storiesGallery.followHint')}</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={follow.disabled} onPress={follow.press}
      accessibilityState={{ selected: follow.state === 'following', disabled: follow.disabled }} style={[styles.follow, { flexDirection: rowDirectionFor(isRTL), borderColor: ink }]}>
      <NavigationIcon name={follow.state === 'following' ? 'checkmark-outline' : 'notifications-outline'} size={20} color={ink} />
      <AppText color={ink}>{follow.state === 'pending' ? '…' : label}</AppText>
    </Pressable>
    {follow.writeFailed ? <AppText accessibilityRole="alert" color={ink}>{t('publication.followError')}</AppText> : null}
  </View>;
}

export function StoriesGallery({ focus }: { focus?: string }) {
  const { t } = useI18n();
  const { isRTL } = useTheme();
  const reduced = useReduceMotion();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const stories = useStories();
  const settings = useStoriesShowcase();
  const list = useRef<FlatList<Row>>(null);
  const [limit, setLimit] = useState(ARCHIVE_BATCH);
  const [showTop, setShowTop] = useState(false);
  const { featured, newest, archive } = useMemo(() => storiesGalleryContent(stories.data ?? [], settings.data?.cardCount ?? 7, focus), [stories.data, settings.data?.cardCount, focus]);
  // Chaque bloc n'existe que s'il a du contenu : un titre « nouveaux » ou
  // « archives » sans rien dessous est un mensonge d'interface.
  const rows: Row[] = settings.data?.enabled === false || !featured.length ? [] : [
    ...featured.map(story => ({ kind: 'feature' as const, story })),
    ...(newest.length ? [{ kind: 'new' as const }] : []),
    { kind: 'follow' as const },
    ...(archive.length ? [{ kind: 'archive-title' as const }] : []),
    ...storyArchiveRows(archive.slice(0, limit)).map(row => ({ kind: 'archive' as const, row })),
  ];
  const m = storiesGalleryMeasures(width);
  const direction = rowDirectionFor(isRTL);
  const back = () => goBack('/(tabs)');
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="stories-gallery-page">
    {focused ? <StatusBar style="light" /> : null}
    <FlatList testID="stories-gallery-list" ref={list} style={{ width: m.page }} data={rows}
      keyExtractor={item => item.kind === 'feature' ? `featured-${item.story.id}` : item.kind === 'archive' ? `archive-${item.row.cards[0]?.id}` : item.kind}
      initialNumToRender={3} maxToRenderPerBatch={4} windowSize={5} onScroll={event => setShowTop(event.nativeEvent.contentOffset.y > 420)}
      scrollEventThrottle={64} onRefresh={() => { void stories.refetch(); void settings.refetch(); }} refreshing={stories.isRefetching || settings.isRefetching}
      ListHeaderComponent={<View style={styles.intro}>
        <Pressable testID="stories-gallery-back" accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={back} style={styles.back}>
          <NavigationIcon name={isRTL ? 'arrow-forward' : 'arrow-back'} color={C.white} size={20} />
        </Pressable>
        <AppText color={C.white} accessibilityRole="header" style={styles.title}>{t('storiesGallery.featured')}</AppText>
        {/* Le sous-titre n'est pas un second titre : même taille = deux titres
            concurrents, exactement ce qui faisait « titre répété ». */}
        <AppText color={C.white} style={styles.introNote}>{t('storiesGallery.intro')}</AppText>
      </View>}
      ListEmptyComponent={<View style={styles.empty}>
        <AppText color={C.white} style={styles.notice} accessibilityRole={stories.isError ? 'alert' : undefined}>
          {t(stories.isError ? 'storiesGallery.unavailable' : stories.isPending ? 'storiesGallery.loading' : 'social.empty')}
        </AppText>
        {/* Une consigne « tirez vers le bas » sans bouton est un piège sur une
            liste vide : le geste n'y est pas découvrable. */}
        {stories.isError ? <Pressable accessibilityRole="button" testID="stories-gallery-retry"
          onPress={() => { void stories.refetch(); void settings.refetch(); }} style={styles.retry}>
          <AppText color={C.white}>{t('common.retry')}</AppText>
        </Pressable> : null}
      </View>}
      ListFooterComponent={rows.length && archive.length > limit ? <Pressable accessibilityRole="button" onPress={() => setLimit(value => value + ARCHIVE_BATCH)} style={styles.more}>
        <AppText color={C.white}>{t('storiesGallery.more')}</AppText>
      </Pressable> : null}
      renderItem={({ item }) => {
        if (item.kind === 'feature') return <View style={styles.feature}><StoryCard story={item.story} width={m.featured} /></View>;
        if (item.kind === 'new') return <View style={styles.newSection} testID="stories-gallery-new">
          <AppText color={C.white} accessibilityRole="header" style={[styles.section, styles.inset]}>{t('storiesGallery.new')}</AppText>
          <FlatList horizontal inverted={isRTL} data={newest} keyExtractor={story => story.id} showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail} snapToInterval={m.rail + G.gap} decelerationRate="fast" disableIntervalMomentum
            renderItem={({ item: story }) => <StoryCard story={story} width={m.rail} />} />
        </View>;
        if (item.kind === 'follow') return <FollowStories />;
        if (item.kind === 'archive-title') return <AppText color={C.white} accessibilityRole="header" style={[styles.section, styles.archiveTitle]}>{t('storiesGallery.archive')}</AppText>;
        if (item.kind !== 'archive') return null;
        const { cards, layout } = item.row;
        if (layout === 'wide') return <View style={styles.feature}><StoryCard story={cards[0]!} width={m.featured} /></View>;
        if (layout === 'tiles') return <View style={[styles.archiveRow, { flexDirection: direction }]}>
          {cards.map(story => <StoryCard key={story.id} story={story} width={m.small} small />)}
        </View>;
        const heroOnLeft = layout === 'hero-left';
        const hero = <StoryCard story={cards[heroOnLeft ? 0 : 2]!} width={m.large} height={2 * m.small / G.aspect + G.rowGap} />;
        const stack = <View style={styles.archiveStack}>
          {cards.slice(heroOnLeft ? 1 : 0, heroOnLeft ? 3 : 2).map(story => <StoryCard key={story.id} story={story} width={m.small} small />)}
        </View>;
        return <View testID={`stories-gallery-${layout}`} style={[styles.archiveRow, { flexDirection: direction }]}>
          {heroOnLeft ? <>{hero}{stack}</> : <>{stack}{hero}</>}
        </View>;
      }} />
    {showTop ? <Pressable accessibilityRole="button" accessibilityLabel={t('storiesGallery.top')} style={styles.top}
      onPress={() => list.current?.scrollToOffset({ offset: 0, animated: !reduced })}>
      <NavigationIcon name="arrow-up-outline" size={20} color={C.white} />
    </Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.black, alignItems: 'center' },
  intro: { paddingHorizontal: G.inset, paddingBottom: 24, paddingTop: 4 },
  back: { width: 44, height: 44, justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: TYPE.title, lineHeight: TYPE.titleLine },
  introNote: { fontSize: TYPE.subtitle, lineHeight: TYPE.subtitleLine },
  empty: { paddingHorizontal: G.inset, gap: 8 },
  retry: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 20, marginTop: 8, borderWidth: 1, borderColor: C.white, borderRadius: RADIUS.full },
  feature: { paddingHorizontal: G.inset, marginBottom: G.rowGap },
  card: { backgroundColor: veil(0.42), borderRadius: RADIUS.md, overflow: 'hidden', justifyContent: 'flex-end' },
  shade: { paddingHorizontal: 8, paddingTop: 64, paddingBottom: 10, gap: 2 },
  shadeSmall: { paddingTop: 40 },
  cardTitle: { fontSize: TYPE.caption, lineHeight: TYPE.captionLine },
  smallTitle: { fontSize: TYPE.small, lineHeight: TYPE.smallLine },
  uppercase: { textTransform: 'uppercase' },
  subtitle: { fontSize: TYPE.subtitle, lineHeight: TYPE.subtitleLine },
  section: { fontSize: TYPE.section, lineHeight: TYPE.sectionLine },
  newSection: { paddingTop: 40, gap: 24 },
  inset: { paddingHorizontal: G.inset },
  rail: { paddingHorizontal: G.inset, gap: G.gap },
  followSection: { marginHorizontal: G.followInset, paddingVertical: 64, gap: 16 },
  follow: { minHeight: 48, marginTop: 8, borderWidth: 1, borderColor: C.white, borderRadius: RADIUS.full, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  archiveTitle: { paddingHorizontal: G.inset, paddingBottom: 24, paddingTop: 24 },
  archiveRow: { paddingHorizontal: G.inset, gap: G.gap, marginBottom: G.rowGap },
  archiveStack: { gap: G.rowGap },
  more: { margin: 12, minHeight: 48, borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.white, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', bottom: 24, end: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: C.black, justifyContent: 'center', alignItems: 'center' },
  notice: { paddingHorizontal: G.inset },
});
