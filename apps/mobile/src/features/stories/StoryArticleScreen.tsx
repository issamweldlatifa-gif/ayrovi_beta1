import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { storyPresentation, useEditorialStory, type EditorialStory } from '@/api/storyEditorial';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { BackButton } from '@/design/BackButton';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { goBack } from '@/design/navigation';
import { useReduceMotion } from '@/design/motion';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { ICON_SIZE, RADIUS, PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { BRAND } from '@/design/tokens.generated';
import { AppText } from '@/design/ui';
import { useI18n } from '@/i18n';
import { OFFICIAL_PUBLISHER_NAME, OFFICIAL_PUBLISHER_ID } from '@/features/publications/officialPublisher';
import { usePublisherFollow } from '@/features/publications/usePublisherFollow';
import type { StoryArticle } from '../../../../../shared/storyEditorial';
import { StoryEditorialProduct, useStoryFavorites } from './StoryEditorialProduct';

const ARTICLE = { maxWidth: 640, heading: 26, headingLine: 30, bodyLine: 24, heroAspect: 2 / 3, imageAspect: 4 / 5, railInset: 12, railGap: 8, railPeek: 28 } as const;
export function StoryArticleScreen({ id, discover }: { id: string; discover: boolean }) {
  const query = useEditorialStory(id);
  const story = query.story;
  const article = story && storyPresentation(story)?.article;
  return <StoryArticlePage id={id} discover={discover} story={story ?? null} article={article ?? null}
    pending={query.isPending} error={query.error} onRetry={() => void query.refetch()} />;
}

function StoryArticlePage({ id, discover, story, article, pending, error, onRetry }: {
  id: string; discover: boolean; story: EditorialStory | null; article: StoryArticle | null;
  pending: boolean; error: unknown; onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  const { isRTL } = useTheme();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const favorites = useStoryFavorites();
  const follow = usePublisherFollow(discover ? OFFICIAL_PUBLISHER_ID : '', () => router.push('/sign-in'));
  const followLabel = t(follow.state === 'following' ? 'publication.following' : follow.state === 'error' ? 'publication.followRetry' : 'publication.follow');
  const scroll = useRef<ScrollView>(null);
  const [showTop, setShowTop] = useState(false);
  const back = () => goBack(`/stories?id=${encodeURIComponent(id)}`);
  const local = (value: { text: string; textAr?: string }) => (locale === 'ar' && value.textAr) || value.text;
  const date = Date.parse(story?.publishAt || '');
  const dateLabel = Number.isFinite(date) ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', { dateStyle: 'long' }).format(date) : '';
  const direction = rowDirectionFor(isRTL);
  const pageWidth = Math.min(width, ARTICLE.maxWidth);
  const hasMoreTiles = (story?.products.length ?? 0) > 2;
  const tileWidth = Math.max(0, (pageWidth - 2 * ARTICLE.railInset - ARTICLE.railGap - (hasMoreTiles ? ARTICLE.railPeek : 0)) / 2);
  const title = article && (local(article.title) || (locale === 'ar' && story?.titleAr) || story?.title);
  const intro = article && local(article.intro);
  const words = article ? [intro, ...article.blocks.flatMap(block => block.type === 'text' ? [local(block.content)] : [])]
    .join(' ').match(/[\p{L}\p{N}]+/gu)?.length ?? 0 : 0;
  const readTime = words >= 30 ? t('storiesEditorial.readTime', { minutes: Math.ceil(words / 200) }) : '';
  const cover = article?.cover || (story?.legacyMedia?.kind !== 'video' ? story?.legacyMedia?.url : undefined);
  const selectionTitle = article && (local(article.selectionTitle) || t('storiesEditorial.selection'));
  return <View testID="editorial-story-article" style={[styles.page, { paddingTop: insets.top, backgroundColor: discover ? BRAND.black : BRAND.white }]}>
    {focused ? <StatusBar style={discover ? 'light' : 'dark'} /> : null}
    <View style={[styles.toolbar, { flexDirection: direction }, discover && styles.discovery]}>
      <BackButton onPress={back} label={t('common.back')} color={discover ? BRAND.white : P.ink} />
      {discover ? <>
        <AppText variant="bodyStrong" color={BRAND.white} numberOfLines={1} style={styles.flex}>{OFFICIAL_PUBLISHER_NAME}</AppText>
        {article && story ? <Pressable accessibilityRole="button" accessibilityLabel={followLabel} disabled={follow.disabled} onPress={follow.press}
          accessibilityState={{ selected: follow.state === 'following', disabled: follow.disabled }} style={[styles.follow, { flexDirection: direction }]}>
          <Ionicons name={follow.state === 'following' ? 'checkmark-outline' : 'add-outline'} color={BRAND.white} size={ICON_SIZE.md} />
          <AppText color={BRAND.white}>{follow.state === 'pending' ? '…' : followLabel}</AppText>
        </Pressable> : null}
      </> : null}
    </View>
    {pending ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={onRetry} /> : !article || !story ? <EmptyBlock>{t('social.empty')}</EmptyBlock> :
      <ScrollView testID="story-article-scroll" style={{ width: pageWidth, backgroundColor: BRAND.white }} ref={scroll}
        onScroll={event => setShowTop(event.nativeEvent.contentOffset.y > 480)} scrollEventThrottle={80} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        {cover ? <AppImage testID="story-article-cover" uri={mediaUrl(cover)} decorative style={styles.hero} /> : null}
        <View style={styles.heading}>
          {title ? <AppText accessibilityRole="header" color={P.ink} style={styles.title}>{title}</AppText> : null}
          {intro ? <AppText color={P.ink} style={styles.body}>{intro}</AppText> : null}
        </View>
        <View style={styles.byline}>
          {article.author ? <AppText color={P.ink}>{t('storiesEditorial.by', { name: article.author })}</AppText> : null}
          {dateLabel ? <AppText color={P.ink}>{dateLabel}</AppText> : null}
          {readTime ? <AppText color={P.ink}>{readTime}</AppText> : null}
          {discover && follow.writeFailed ? <AppText accessibilityRole="alert" color={P.ink}>{t('publication.followError')}</AppText> : null}
        </View>
        {article.blocks.length ? <View style={styles.blocks}>
          {article.blocks.map((block, index) => block.type === 'text' ? <AppText key={index} color={P.ink} style={styles.body}>{local(block.content)}</AppText>
            : <AppImage key={index} uri={mediaUrl(block.url)} accessibilityLabel={local(block.alt)} decorative={!local(block.alt)} style={styles.articleImage} />)}
        </View> : null}
        {story.products.length ? <View style={styles.selection}>
          <View style={[styles.selectionHeading, { flexDirection: direction }]}>
            <AppText accessibilityRole="header" color={P.ink} style={[styles.title, styles.flex]}>{selectionTitle}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('publisher.about')} style={styles.icon} onPress={() => Alert.alert(t('publisher.about'), t('storiesEditorial.about'))}>
              <Ionicons name="information-circle-outline" color={P.ink} size={ICON_SIZE.md} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.rail, { direction: isRTL ? 'rtl' : 'ltr' }]}>
            {story.products.map(item => <StoryEditorialProduct key={item.id} item={item} width={tileWidth} saved={favorites.isFavorite(item.id)} onFavorite={() => favorites.toggle(item.id)} />)}
          </ScrollView>
        </View> : null}
      </ScrollView>}
    {showTop ? <Pressable accessibilityRole="button" accessibilityLabel={t('storiesGallery.top')} style={[styles.top, { bottom: insets.bottom + 16 }]}
      onPress={() => scroll.current?.scrollTo({ y: 0, animated: !reduce })}><Ionicons name="arrow-up-outline" size={ICON_SIZE.md} color={BRAND.white} /></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', backgroundColor: BRAND.white },
  toolbar: { alignSelf: 'stretch', alignItems: 'center', minHeight: 48, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: P.line },
  discovery: { backgroundColor: BRAND.black, borderColor: BRAND.black },
  flex: { flex: 1 },
  follow: { minHeight: 44, alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  hero: { width: '100%', aspectRatio: ARTICLE.heroAspect, borderRadius: RADIUS.lg, overflow: 'hidden' },
  heading: { padding: 24, gap: 24 },
  title: { fontSize: ARTICLE.heading, lineHeight: ARTICLE.headingLine },
  body: { lineHeight: ARTICLE.bodyLine },
  byline: { gap: 4, paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: P.line },
  blocks: { paddingHorizontal: ARTICLE.railInset, paddingTop: 48, gap: 32 },
  articleImage: { width: '100%', aspectRatio: ARTICLE.imageAspect, borderRadius: RADIUS.lg, overflow: 'hidden' },
  selection: { paddingTop: 48, gap: 24 },
  selectionHeading: { paddingHorizontal: ARTICLE.railInset, alignItems: 'flex-start' },
  rail: { gap: ARTICLE.railGap, paddingHorizontal: ARTICLE.railInset },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', end: 16, width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: BRAND.black, alignItems: 'center', justifyContent: 'center' },
});
