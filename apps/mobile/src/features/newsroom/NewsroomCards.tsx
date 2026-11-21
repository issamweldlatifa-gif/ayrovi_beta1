import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { NewsCard, NewsCopy, NewsTool } from '../../../../../shared/zayroviNews';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppText, Button } from '@/design/ui';
import { useI18n } from '@/i18n';

export const newsroomCopy = (value: NewsCopy, locale: 'fr' | 'ar') => value[locale] || value.fr;
const toolLinks: Record<NewsTool, { route: Href; title: string; icon: keyof typeof Ionicons.glyphMap }> = {
  lens: { route: '/z-lens', title: 'Z Lens', icon: 'scan-outline' },
  clean: { route: '/sonim-assistant', title: 'Clean', icon: 'chatbubble-ellipses-outline' },
  aywebs: { route: '/(tabs)/aywebs', title: 'AYWEBs', icon: 'bag-handle-outline' },
};

export function openNewsroomCard(item: NewsCard) {
  const id = item.targetId;
  if (id && item.kind === 'story') router.push({ pathname: '/stories', params: { id } });
  else if (id && item.kind === 'reel') router.push({ pathname: '/reels-viewer', params: { id, shared: '1' } });
  else if (id && item.kind === 'publication') router.push({ pathname: '/publication-look/[id]', params: { id } });
  else if (id && item.kind === 'article') router.push({ pathname: '/news/[id]', params: { id } });
  else router.push(`/zayrovi-news?item=${encodeURIComponent(item.id)}` as Href);
}

export function NewsroomCard({ item, featured = false, onPress = () => openNewsroomCard(item), testID }: {
  item: NewsCard; featured?: boolean; onPress?: () => void; testID?: string;
}) {
  const { locale, t } = useI18n();
  const theme = useTheme();
  const title = newsroomCopy(item.title, locale);
  const teaser = item.summary ? newsroomCopy(item.summary, locale) : (item.kind !== 'notice' ? newsroomCopy(item.body, locale) : '');
  const row = { flexDirection: rowDirectionFor(theme.isRTL) };
  const showThumb = Boolean(item.image || item.tool);
  const thumbnail = item.image ? <AppImage decorative uri={mediaUrl(item.image)} contentFit="cover"
    style={[featured ? styles.hero : styles.thumbnail, { borderRadius: theme.radius.card }]} />
    : item.tool ? <View style={[styles.thumbnail, styles.center, { borderRadius: theme.radius.card, backgroundColor: theme.colors.surface }]}>
      <Ionicons name={toolLinks[item.tool]?.icon ?? 'information-circle-outline'} size={theme.iconSize.lg} color={theme.colors.ink} accessibilityElementsHidden />
    </View> : null;
  return <Pressable testID={testID ?? `zayrovi-news-entry-${item.id}`} accessibilityRole="link" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => [featured ? styles.featured : [styles.row, row, !showThumb && { borderTopColor: theme.colors.line, borderTopWidth: StyleSheet.hairlineWidth }], { opacity: pressed ? theme.opacity.subtle : 1 }]}>
    {thumbnail}
    <View style={featured ? styles.featureCopy : styles.copy}>
      <AppText variant="captionStrong" color={theme.colors.muted}>{featured ? t('zNews.featured') : t(`zNews.${item.kind}`)}</AppText>
      <AppText variant={featured ? 'h2' : 'bodyStrong'}>{title}</AppText>
      {teaser ? <AppText variant={featured ? 'body' : 'caption'} numberOfLines={featured ? 3 : 2} color={theme.colors.muted}>{teaser}</AppText> : null}
      {featured ? <View style={[styles.cta, row]}>
        <AppText variant="label">{t('zNews.read')}</AppText>
        <Ionicons name={theme.isRTL ? 'arrow-back-outline' : 'arrow-forward-outline'} size={theme.iconSize.sm} color={theme.colors.accentText} accessibilityElementsHidden />
      </View> : null}
    </View>
  </Pressable>;
}

/** Plain body copy + explicit intertitles only; never render HTML from the CRM. */
export function NewsroomBody({ body }: { body: string }) {
  return <View style={styles.articleBody}>
    {body.split(/\n/).map((part, index) => {
      const line = part.trim();
      if (!line) return null;
      return line.startsWith('## ') ? <AppText key={index} variant="h3" accessibilityRole="header" style={styles.intertitle}>{line.slice(3)}</AppText>
        : <AppText key={index} variant="body">{line}</AppText>;
    })}
  </View>;
}

export function NewsroomArticle({ item }: { item: NewsCard }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const tool = item.tool ? toolLinks[item.tool] : undefined;
  return <View style={styles.articleBody} testID="zayrovi-news-article">
    {item.image ? <AppImage uri={mediaUrl(item.image)} contentFit="cover" decorative style={[styles.hero, { borderRadius: theme.radius.card }]} /> : null}
    <AppText variant="h2" accessibilityRole="header">{newsroomCopy(item.title, locale)}</AppText>
    {item.summary ? <AppText variant="bodyStrong" color={theme.colors.muted}>{newsroomCopy(item.summary, locale)}</AppText> : null}
    <View style={[styles.rule, { backgroundColor: theme.colors.line }]} />
    <NewsroomBody body={newsroomCopy(item.body, locale)} />
    {tool ? <Button label={t('zNews.openTool', { name: tool.title })} onPress={() => router.push(tool.route)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  featured: { gap: 12 }, hero: { width: '100%', aspectRatio: 16 / 9 },
  featureCopy: { gap: 8 }, copy: { flex: 1, minWidth: 0, gap: 4 },
  row: { alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  thumbnail: { width: '36%', maxWidth: 152, aspectRatio: 1 }, center: { justifyContent: 'center', alignItems: 'center' },
  cta: { alignItems: 'center', gap: 6, minHeight: 44 },
  articleBody: { gap: 12 }, intertitle: { marginTop: 8 }, rule: { height: StyleSheet.hairlineWidth },
});
