/**
 * Visionneuse Reels plein écran (ouverte depuis l'accueil).
 *
 * • Une vidéo par page, défilement vertical « page par page » (style Facebook).
 * • En-tête TRANSPARENT et FIXE, au-dessus de la liste : il ne défile pas avec les
 *   Reels. Il porte le logo « ▶ Reels • Shop » et un grand bouton retour.
 * • Un seul lecteur vivant : la page réellement visible (`viewabilityConfig`), comme
 *   la page Reels. Les autres pages attendent (règle de `ReelCard`).
 */
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useReels, useSocialCounts } from '@/api/hooks';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useT } from '@/i18n';
import { ReelCard } from '@/features/social/ReelCard';
import { ReelCommentsModal } from '@/features/social/ReelCommentsModal';
import { ReelsShopMark } from '@/features/reels/ReelsShopMark';
import { VIDEO_BACKDROP } from '@/design/tokens.mobile';
import type { Reel } from '@/api/social';

const BACK_HIT = 48;

export default function ReelsViewerScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const reels = useReels();
  const rows = reels.data ?? [];
  const counts = useSocialCounts(rows.map((reel) => reel.id));

  const initialIndex = Math.max(0, rows.findIndex((reel) => reel.id === id));
  const [activeId, setActiveId] = useState<string | null>(id ?? null);
  const [commentsFor, setCommentsFor] = useState<Reel | null>(null);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item?: unknown }> }) => {
    const first = viewableItems[0]?.item as Reel | undefined;
    if (first) setActiveId(first.id);
  }).current;

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  const closeComments = useCallback(() => setCommentsFor(null), []);

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        pagingEnabled
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item }) => (
          <ReelCard
            reel={item}
            active={activeId === item.id}
            counts={counts.data?.[item.id]}
            onOpenComments={setCommentsFor}
            fill={{ width, height }}
          />
        )}
      />

      {/* En-tête fixe et transparent : par-dessus la liste, il ne bouge pas au défilement. */}
      <View
        pointerEvents="box-none"
        style={[styles.header, { paddingTop: insets.top, flexDirection: rowDirectionFor(theme.isRTL) }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={back}
          hitSlop={8}
          style={styles.back}
        >
          <Ionicons name={theme.isRTL ? 'chevron-forward' : 'chevron-back'} size={30} color={theme.colors.onMedia} accessibilityElementsHidden />
        </Pressable>
        <ReelsShopMark tone="onMedia" />
      </View>

      {commentsFor ? <ReelCommentsModal reel={commentsFor} onClose={closeComments} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: VIDEO_BACKDROP },
  header: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  back: { width: BACK_HIT, height: BACK_HIT, alignItems: 'center', justifyContent: 'center' },
});
