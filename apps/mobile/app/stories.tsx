/**
 * شاشة الستوريهات (Q3، 08/10/2026).
 *
 * التغيير عن Q2: الدقّة كانت توصل **للهدف** (منتوج/وصولة/رابط). توّا الدقّة
 * تفتح **العارض الكامل** — أشرطة تقدّم، تمرير، توقيف بالضغط المطوّل —
 * والـCTA داخل الستوري هو اللي يوصل للهدف.
 *
 * و«المُشاهَد» يُتذكَّر في الشاشة: ستوري فات ⇒ إطارو يبهت. هادي حالة **عرض**
 * (موّش حقيقة محفوظة في الخادم)، ونقولها بصراحة باش ما تنقراش كأنّها مزامنة.
 */
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { useStories } from '@/api/hooks';
import { StoryCard } from '@/features/sections/StoryCard';
import { StoryViewer } from '@/features/social/StoryViewer';
import { openStoryTarget, storyHasTarget } from '@/features/social/storyTarget';
import type { StoryItem } from '@/api/sections';

export default function StoriesScreen() {
  const theme = useTheme();
  const t = useT();
  const stories = useStories();

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewed, setViewed] = useState<Set<string>>(new Set());

  /** الأوّليّة: الأولوية الإدارية، ثم الأحدث نشراً. */
  const rows = [...(stories.data ?? [])].sort(
    (a, b) => b.priority - a.priority || String(b.publishAt).localeCompare(String(a.publishAt)),
  );

  const openViewer = useCallback((story: StoryItem) => {
    const position = rows.findIndex((entry) => entry.id === story.id);
    setViewerIndex(position < 0 ? 0 : position);
  }, [rows]);

  const markViewed = useCallback((story: StoryItem) => {
    setViewed((previous) => new Set(previous).add(story.id));
  }, []);

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
          <StoryCard key={story.id} story={story} onOpen={openViewer} viewed={viewed.has(story.id)} />
        ))}
      </View>

      <AppText variant="caption" color={theme.colors.muted}>{`${rows.length} · ${t('sections.stories')}`}</AppText>
      <View style={styles.spacer} />

      <StoryViewer
        stories={rows}
        initialIndex={viewerIndex ?? 0}
        visible={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
        onStorySeen={markViewed}
        onOpenTarget={(story) => {
          if (storyHasTarget(story)) openStoryTarget(story);
        }}
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  spacer: { height: 24 },
});
