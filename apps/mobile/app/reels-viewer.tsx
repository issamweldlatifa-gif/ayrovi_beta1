import { ReelPageFooter } from '@/features/reels/ReelPageFooter';
import { useHiddenReels } from "@/features/reels/reelVisibility";
import { BackButton } from "@/design/BackButton";
/**
 * Visionneuse Reels plein écran (ouverte depuis l'accueil).
 *
 * • Une vidéo par page, défilement vertical « page par page » (style Facebook).
 * • En-tête TRANSPARENT et FIXE, au-dessus de la liste : il ne défile pas avec les
 *   Reels. Il ne porte plus que le grand bouton retour — le libellé
 *   « ▶ Reels • Shop » a été retiré de la visionneuse (demande du propriétaire,
 *   24/10/2026) : sur une vidéo plein écran, le titre de section ne fait que
 *   manger l'image ; la marque reste sur l'accueil, au-dessus de la section.
 * • Deux lecteurs vivants au plus : la page réellement visible (`viewabilityConfig`)
 *   qui joue, et la SUIVANTE qui précharge en pause (11/11). Les autres attendent.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { goBack } from "@/design/navigation";
import {
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useIsFocused } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { useReels, useSocialCounts } from "@/api/hooks";
import { useTheme } from "@/design/theme";
import { rowDirectionFor } from "@/design/layoutLogic";
import { useT } from "@/i18n";
import { AppText } from "@/design/ui";
import { ErrorBlock } from "@/design/states";
import { BrandLoadingIndicator } from "@/design/LoadingScreen";
import { ReelCard } from "@/features/social/ReelCard";
import { ReelCommentsModal } from "@/features/social/ReelCommentsModal";
import { VIDEO_BACKDROP, veil } from "@/design/tokens.mobile";
import type { Reel } from "@/api/social";

const BACK_HIT = 48;

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from "@/design/AppErrorBoundary";

export default function ReelsViewerScreen() {
  const focused = useIsFocused();
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [{ width, height }, setViewport] = useState({ width: window.width, height: window.height });
  const listRef = useRef<FlatList<Reel>>(null);
  const previousHeight = useRef(height);
  const { id } = useLocalSearchParams<{ id?: string }>();

  const reels = useReels(true, id);
  const hidden = useHiddenReels();
  const rows = useMemo(() => {
    const excluded = new Set(hidden);
    return (reels.data ?? []).filter(reel => !excluded.has(reel.id));
  }, [reels.data, hidden]);

  const initialIndex = Math.max(
    0,
    rows.findIndex((reel) => reel.id === id)
  );
  const [activeId, setActiveId] = useState<string | null>(id ?? null);
  const [commentsFor, setCommentsFor] = useState<Reel | null>(null);
  // Cold links / removed or unknown IDs still select the first available real Reel.
  const playingId = rows.some((reel) => reel.id === activeId)
    ? activeId
    : rows[initialIndex]?.id;
  const visibleIndex = Math.max(0, rows.findIndex(reel => reel.id === playingId));
  const counts = useSocialCounts(rows.slice(Math.max(0, visibleIndex - 1), visibleIndex + 3).map(reel => reel.id));

  useEffect(() => {
    if (activeId && hidden.includes(activeId) && rows.length === 0 && !reels.isPending && !reels.hasNextPage && !reels.isError) goBack("/");
  }, [activeId, hidden, rows.length, reels.isPending, reels.hasNextPage, reels.isError]);

  useEffect(() => {
    // Hidden items must not make the viewer claim there is no content while more pages exist.
    if (focused && rows.length === 0 && reels.hasNextPage && !reels.isFetching && !reels.isFetchNextPageError)
      void reels.fetchNextPage();
  }, [focused, rows.length, reels.hasNextPage, reels.isFetching, reels.isFetchNextPageError, reels.fetchNextPage]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item?: unknown }> }) => {
      const first = viewableItems[0]?.item as Reel | undefined;
      if (first) setActiveId(first.id);
    }
  ).current;

  const back = useCallback(() => goBack("/"), []);

  const closeComments = useCallback(() => setCommentsFor(null), []);

  const fill = useMemo(() => ({ width, height }), [width, height]);
  // Lecture fluide (11/11) : la carte visible JOUE, la suivante PRÉCHARGE en
  // pause (au plus deux lecteurs natifs), et ouvrir les commentaires SUSPEND
  // le lecteur au lieu de le démonter — plus de roue à chaque Reel.
  const live = focused && !reels.isPlaceholderData;
  const renderItem = useCallback(({ item, index }: { item: Reel; index: number }) => (
    <ReelCard reel={item} active={live && playingId === item.id}
      preload={live && index === visibleIndex + 1}
      suspended={Boolean(commentsFor)}
      counts={counts.data?.[item.id]} onOpenComments={setCommentsFor} fill={fill} />
  ), [live, commentsFor, playingId, visibleIndex, counts.data, fill]);
  useEffect(() => {
    if (previousHeight.current !== height) {
      previousHeight.current = height;
      listRef.current?.scrollToIndex({ index: visibleIndex, animated: false });
    }
  }, [height, visibleIndex]);
  const getItemLayout = useCallback((_: unknown, index: number) => (
    { length: height, offset: height * index, index }
  ), [height]);

  return (
    <View testID="reels-viewer" style={styles.root} onLayout={({ nativeEvent: { layout } }) => {
      if (layout.width > 0 && layout.height > 0)
        setViewport(current => current.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height });
    }}>
      {/* Wait for rows before mounting: initialScrollIndex is only honored at mount. */}
      {rows.length > 0 ? <FlatList
        ref={listRef}
        testID="reels-viewer-list"
        accessibilityLabel={t("social.reels")}
        refreshing={Boolean(reels.isRefetching)}
        onRefresh={() => { void reels.refetch(); void counts.refetch(); }}
        data={rows}
        keyExtractor={(item) => item.id}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
        // Android : les cartes hors fenêtre sont détachées de la vue native
        // (mémoire et composition GPU allégées). iOS garde son rendu : le
        // détachement y peut laisser un VideoView noir au retour.
        removeClippedSubviews={Platform.OS === "android"}
        extraData={{ playingId, focused, commentsFor, visibleIndex }}
        onEndReached={() => { if (reels.hasNextPage && !reels.isFetching && !reels.isFetchNextPageError) void reels.fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={<ReelPageFooter query={reels} onMedia />}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        initialScrollIndex={initialIndex}
        getItemLayout={getItemLayout}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={renderItem}
      /> : null}

      {reels.isPending || reels.isPlaceholderData || (rows.length === 0 && reels.hasNextPage && !reels.isFetchNextPageError) ? (
        <View testID="reels-viewer-loading" style={styles.feedback}>
          <BrandLoadingIndicator />
        </View>
      ) : null}
      {reels.isError && rows.length === 0 && !reels.isFetchNextPageError ? (
        <View testID="reels-viewer-error" style={styles.feedback}>
          <ErrorBlock error={reels.error} onRetry={() => reels.refetch()} />
        </View>
      ) : null}
      {!reels.isPending && !reels.isError && !reels.hasNextPage && rows.length === 0 ? (
        <View testID="reels-viewer-empty" style={styles.feedback}>
          <AppText color={theme.colors.onMedia}>{t("social.empty")}</AppText>
        </View>
      ) : null}

      {rows.length === 0 && reels.isFetchNextPageError ? <View style={styles.feedback}>
        <ReelPageFooter query={reels} onMedia />
      </View> : null}

      {/* Barre d'état claire et translucide : les icônes (heure, réseau, batterie) restent lisibles sur la vidéo. */}
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      {/* Dégradé discret sous la barre d'état et l'en-tête : lisibilité sans bandeau opaque. */}
      <LinearGradient
        pointerEvents="none"
        colors={[veil(0.55), veil(0)]}
        style={[styles.scrim, { height: insets.top + 96 }]}
      />

      {/* En-tête fixe et transparent : par-dessus la liste, il ne bouge pas au défilement. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            flexDirection: rowDirectionFor(theme.isRTL),
          },
        ]}
      >
        <BackButton
          onPress={back}
          label={t("common.back")}
          color={theme.colors.onMedia}
        />
      </View>

      {commentsFor ? (
        <ReelCommentsModal reel={commentsFor} onClose={closeComments} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: VIDEO_BACKDROP },
  feedback: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  header: {
    position: "absolute",
    top: 0,
    start: 0,
    end: 0,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: "transparent",
  },
  back: {
    width: BACK_HIT,
    height: BACK_HIT,
    alignItems: "center",
    justifyContent: "center",
  },
  scrim: { position: "absolute", top: 0, start: 0, end: 0 },
});
