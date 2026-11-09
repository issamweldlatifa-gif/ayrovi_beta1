import { memo } from 'react';
/** Official Stories extension: editorial gallery only. No legacy circles or viewer.
 * Geometry is shared with Hero; section spacing is owned by AppScreen/SectionRule.
 * The Explore label is deliberately non-interactive until its destination is specified.
 */
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useStories, useStoriesShowcase } from '@/api/hooks';
import { mediaUrl } from '@/api/client';
import { AppText } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { FullBleed, useResponsive } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { FOOTER_THEME, veil } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import { CARD_ASPECT, CARD_GAP, carouselGeometry, carouselSnapOffsets } from './heroCarouselLogic';

export const StoriesSection = memo(function StoriesSection() {
  const theme = useTheme();
  const { locale, t } = useI18n();
  const { gutter } = useResponsive();
  const { width } = useWindowDimensions();
  const stories = useStories();
  const showcase = useStoriesShowcase();
  const settings = showcase.data;
  const rows = (stories.data ?? []).filter(row => row.mediaType === 'IMAGE' && row.mediaUrl).slice(0, settings?.cardCount ?? 0);
  // Même géométrie que le Hero : gouttière d'écran = espace entre cartes,
  // cartes intérieures centrées à chaque arrêt.
  const { cardWidth, stride, startInset, endInset, centeringOffset, maxScroll } = carouselGeometry(width, rows.length);
  const local = (fr: string, ar?: string) => locale === 'ar' && ar ? ar : fr;

  if (!settings?.enabled || !rows.length || showcase.isError || stories.isError) return null;

  return <FullBleed>
    <View testID="home-stories" style={styles.section}>
      <View style={[styles.heading, { paddingHorizontal: gutter }]}>
        {settings.title ? <AppText variant="h2" color={FOOTER_THEME.paper}>{local(settings.title, settings.titleAr)}</AppText> : null}
        {settings.subtitle ? <AppText variant="h2" color={FOOTER_THEME.paper}>{local(settings.subtitle, settings.subtitleAr)}</AppText> : null}
        {settings.ctaLabel ? <View testID="stories-explore-placeholder" accessible accessibilityState={{ disabled: true }} style={styles.cta}>
          <AppText variant="body" color={FOOTER_THEME.paper}>{local(settings.ctaLabel, settings.ctaLabelAr)} {theme.isRTL ? '←' : '→'}</AppText>
        </View> : null}
      </View>
      <FlatList horizontal data={rows} keyExtractor={item => item.id}
        testID="stories-editorial-rail" accessibilityLabel={t('sections.stories')}
        showsHorizontalScrollIndicator={false} inverted={theme.isRTL}
        snapToOffsets={carouselSnapOffsets(rows.length, stride, centeringOffset, maxScroll)}
        decelerationRate="fast" disableIntervalMomentum
        contentContainerStyle={{ paddingStart: startInset, paddingEnd: endInset, gap: CARD_GAP }}
        renderItem={({ item }) => <View testID={`editorial-story-${item.id}`}
          style={[styles.card, { width: cardWidth, aspectRatio: CARD_ASPECT, borderRadius: theme.radius.card }]}>
          <AppImage uri={mediaUrl(item.mediaUrl)} contentFit="cover" style={StyleSheet.absoluteFill}
            accessibilityLabel={local(item.title, item.titleAr)} />
          <LinearGradient colors={['transparent', veil(0.76)]} style={styles.caption}>
            <AppText variant="h3" color={FOOTER_THEME.paper} numberOfLines={2}>{local(item.title, item.titleAr)}</AppText>
            {item.description ? <AppText variant="body" color={FOOTER_THEME.paper} numberOfLines={3}>{local(item.description, item.descriptionAr)}</AppText> : null}
          </LinearGradient>
        </View>} />
    </View>
  </FullBleed>;
});

const styles = StyleSheet.create({
  section: { backgroundColor: FOOTER_THEME.ink, paddingVertical: 24, gap: 24 },
  heading: { gap: 2 },
  cta: { marginTop: 16, minHeight: 44, justifyContent: 'center' },
  card: { overflow: 'hidden', justifyContent: 'flex-end' },
  caption: { paddingTop: 64, paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
});
