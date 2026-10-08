/**
 * شاشة الستوريهات (Q2) — شبكة عمودية، والعارض الكامل في **Q3**.
 *
 * سبب التأجيل مكتوب: العارض الكامل يعني تقدّماً زمنياً، لمس يمين/يسار، وإغلاقاً،
 * وتعليقات وإعجابات — أي **Q3**. هنا كل ستوري يفتح **هدفو الحقيقي** (منتوج،
 * وصولة، رابط). وكي ما فمّاش هدف: **ما فمّاش لمس** — موش لمس يفتح والو.
 */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { AppText } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { useStories } from '@/api/hooks';
import { StoryCard } from '@/features/sections/StoryCard';
import type { StoryItem } from '@/api/sections';

export function openStoryTarget(story: StoryItem) {
  if (story.productId) {
    router.push({ pathname: '/product/[id]', params: { id: story.productId } });
    return;
  }
  if (story.arrivalId) {
    router.push({ pathname: '/catalog', params: { arrivalId: story.arrivalId } });
    return;
  }
  if (story.targetUrl) Linking.openURL(story.targetUrl).catch(() => null);
}

/** «قابل للمس» = عندو هدف. نفس القاعدة المستعملة في البطاقة. */
export function storyIsActionable(story: StoryItem): boolean {
  return Boolean(story.productId || story.arrivalId || story.targetUrl);
}

export default function StoriesScreen() {
  const theme = useTheme();
  const t = useT();
  const stories = useStories();

  /** الأوّليّة: الأولوية الإدارية، ثم الأحدث نشراً. */
  const rows = [...(stories.data ?? [])].sort(
    (a, b) => b.priority - a.priority || String(b.publishAt).localeCompare(String(a.publishAt)),
  );

  return (
    <SubScreen
      title={t('sections.stories')}
      onRefresh={() => stories.refetch()}
      refreshing={stories.isFetching}
      fallback="/(tabs)"
    >
      {stories.isPending ? <LoadingBlock /> : null}
      {stories.isError ? <ErrorBlock error={stories.error} onRetry={() => stories.refetch()} /> : null}

      {!stories.isPending && !stories.isError && rows.length === 0 ? (
        <EmptyBlock>{t('sections.empty')}</EmptyBlock>
      ) : null}

      <View style={styles.grid}>
        {rows.map((story) => (
          <StoryCard key={story.id} story={story} onOpen={openStoryTarget} actionable={storyIsActionable(story)} />
        ))}
      </View>

      <AppText variant="caption" color={theme.colors.muted}>{`${rows.length} · ${t('sections.stories')}`}</AppText>
      <View style={styles.spacer} />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  spacer: { height: 24 },
});
