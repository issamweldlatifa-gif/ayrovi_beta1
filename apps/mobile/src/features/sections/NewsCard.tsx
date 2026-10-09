/**
 * بطاقة خبر (Q2، 08/10/2026) — صف أفقي: صورة + عنوان + ملخّص + مصدر.
 *
 * لماذا صف موش بطاقة مربّعة: الخبر يُقرأ بسرعة في قائمة، والصورة فيه مرافقة
 * موش موضوع. والتمييز مع «ستوري» و«عرض» يبان في الشكل قبل الكلمة.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/ui';
import { newsCategoryText } from '@/api/labels';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import type { NewsItem } from '@/api/sections';

export interface NewsCardProps {
  item: NewsItem;
  onOpen: (item: NewsItem) => void;
}

/** تاريخ النشر مختصر؛ والمجهول ما يختلقش. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function NewsCard({ item, onOpen }: NewsCardProps) {
  const theme = useTheme();
  const t = useT();
  const category = newsCategoryText(item.category, t);
  const published = shortDate(item.publishedAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => onOpen(item)}
      style={[styles.row, { flexDirection: rowDirectionFor(theme.isRTL) }, { borderColor: theme.colors.line, borderRadius: theme.radius.card }]}
    >
      <View style={[styles.thumb, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
        {item.image ? (
          <AppImage uri={mediaUrl(item.image)} style={styles.image} contentFit="cover" accessibilityLabel={item.title} />
        ) : null}
      </View>

      <View style={styles.body}>
        {category ? (
          <AppText variant="caption" weight="bold" color={theme.status.info.fg}>{category}</AppText>
        ) : null}
        <AppText variant="label" weight="bold" numberOfLines={2}>{item.title}</AppText>
        {item.summary ? (
          <AppText variant="caption" color={theme.colors.muted} numberOfLines={2} style={styles.summary}>
            {item.summary}
          </AppText>
        ) : null}
        {item.author || published ? (
          <AppText variant="caption" color={theme.colors.muted}>
            {[item.author ? `${item.author}` : '', published].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1, padding: 10, marginBottom: 10, gap: 10 },
  thumb: { width: 84, height: 84, overflow: 'hidden', flexShrink: 0 },
  image: { width: '100%', height: '100%' },
  body: { flex: 1, gap: 2 },
  summary: { marginTop: 2 },
});
