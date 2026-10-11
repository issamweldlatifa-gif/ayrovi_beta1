/**
 * شاشة الريلز (Q3، 08/10/2026).
 *
 * لماذا «الريلز» شاشة وحدة موش قسم في الرئيسية: الريلز فيديو، والفيديو يُشغَّل
 * **واحداً في كل مرّة** — خلطو مع أقسام أخرى يعني مشغّلات تشتغل في الخفاء.
 *
 * و«البطاقة الظاهرة» تُحسب بـ`viewabilityConfig` (70 % من البطاقة) ⇒ مشغّل
 * واحد حيّ، والبقية إطارات تنتظر. هذا هو الفرق بين تطبيق يسخّن التلفون
 * وتطبيق يخدم.
 */
import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { useReels, useSocialCounts } from '@/api/hooks';
import { ReelCard } from '@/features/social/ReelCard';
import { ReelCommentsModal } from '@/features/social/ReelCommentsModal';
import type { Reel } from '@/api/social';

export default function ReelsScreen() {
  const theme = useTheme();
  const t = useT();
  const reels = useReels();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<Reel | null>(null);

  const rows = reels.data ?? [];
  const counts = useSocialCounts(rows.map((reel) => reel.id));

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item?: unknown }> }) => {
    const first = viewableItems[0]?.item as Reel | undefined;
    setActiveId(first?.id ?? null);
  }).current;

  const closeComments = useCallback(() => setCommentsFor(null), []);

  return (
    <SubScreen
      title={t('social.reels')}
      subtitle={t('social.title')}
      onRefresh={() => { reels.refetch(); counts.refetch(); }}
      refreshing={reels.isFetching}
      fallback="/(tabs)"
    >
      {reels.isPending ? <LoadingBlock /> : null}
      {reels.isError ? <ErrorBlock error={reels.error} onRetry={() => reels.refetch()} /> : null}
      {!reels.isPending && !reels.isError && rows.length === 0 ? <EmptyBlock>{t('social.empty')}</EmptyBlock> : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item }) => (
          <ReelCard
            reel={item}
            active={activeId === null ? rows[0]?.id === item.id : activeId === item.id}
            counts={counts.data?.[item.id]}
            onOpenComments={setCommentsFor}
          />
        )}
      />

      <AppText variant="caption" color={theme.colors.muted}>{`${rows.length} · ${t('social.reels')}`}</AppText>
      <View style={styles.spacer} />

      {commentsFor ? <ReelCommentsModal reel={commentsFor} onClose={closeComments} /> : null}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  spacer: { height: 24 },
});
