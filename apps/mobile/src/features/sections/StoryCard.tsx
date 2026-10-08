/**
 * بطاقة ستوري (Q2، 08/10/2026).
 *
 * الشكل **أصلي**: بطاقة عمودية 9:16 بإطار برتقالي (علامة «قابل للمس») — موش
 * نسخة من ستوريهات الموقع. والعارض الكامل (تقدّم زمني، لمس، إغلاق) ⇒ **Q3**.
 *
 * القاعدة هنا: **ما فمّاش زر ميّت**. البطاقة تفتح الهدف الحقيقي للستوري:
 * منتوج ⇒ صفحتو؛ وصولة ⇒ المتجر مفلتر عليها؛ رابط خارجي ⇒ المتصفّح.
 * وكي ما فمّاش هدف ⇒ **ما فمّاش لمس** (موّش لمس يفتح والو).
 */
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import type { StoryItem } from '@/api/sections';

/**
 * النصّ فوق البرتقالي AYROVI.
 *
 * البرتقالي `#FF7900` لون فاتح: الأسود فوقو يعطي تباين ~7:1 والأبيض ~2.9:1.
 * «الأسود ديما» قرار مقروئية، موش قرار نمط ليلي — والسبب مكتوب هنا باش
 * ما يتحولّش لقيمة سحرية يبدّلها واحد وما يعرفش علاش.
 */


export interface StoryCardProps {
  story: StoryItem;
  onOpen: (story: StoryItem) => void;
  /**
   * هل شافو المستعمل من قبل؟
   *
   * لماذا بدّلنا «قابل للمس»: المشاهدة متاحة **ديماً** (العارض يفتح)، أمّا
   * الإجراء داخل الستوري (منتوج · وصولة · رابط) فهو اللي ينجم ما يكونش موجود.
   * فالحالة البصرية تقول «فِت» موش «تتلمس» — وهي الحقيقة المفيدة.
   */
  viewed?: boolean;
}

export function StoryCard({ story, onOpen, viewed = false }: StoryCardProps) {
  const theme = useTheme();
  const t = useT();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={story.title || t('sections.stories')}
      onPress={() => onOpen(story)}
      style={[
        styles.card,
        { borderRadius: theme.radius.card },
        // الإطار يقول الحالة: جديد ⇒ برتقالي؛ مُشاهَد ⇒ باهت.
        viewed
          ? { borderColor: theme.colors.line, borderWidth: 1 }
          : { borderColor: theme.colors.accent, borderWidth: 2 },
      ]}
    >
      <View style={[styles.frame, { backgroundColor: theme.colors.surface }]}>
        {story.mediaUrl ? (
          <Image source={{ uri: mediaUrl(story.mediaUrl) }} style={styles.image} resizeMode="cover" />
        ) : (
          <AppText variant="caption" color={theme.colors.muted}>{story.title || t('sections.stories')}</AppText>
        )}
      </View>

      <View style={styles.footer}>
        {story.title ? (
          <AppText variant="caption" weight="bold" numberOfLines={2}>{story.title}</AppText>
        ) : null}
        {story.cta ? (
          <View style={[styles.cta, { backgroundColor: theme.colors.accent, borderRadius: theme.radius.cta }]}>
            <AppText variant="caption" weight="bold" color={theme.colors.onAccent} numberOfLines={1}>{story.cta}</AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 132, marginInlineEnd: 10, overflow: 'hidden' },
  frame: { aspectRatio: 9 / 16, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  footer: { padding: 8, gap: 6 },
  cta: { paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
});
