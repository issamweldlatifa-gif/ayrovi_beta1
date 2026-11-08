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
 * • Un seul lecteur vivant : la page réellement visible (`viewabilityConfig`), comme
 *   la page Reels. Les autres pages attendent (règle de `ReelCard`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { goBack } from "@/design/navigation";
import {
  FlatList,
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
  const { id } = useLocalSearchParams<{ id?: string }>();

  const reels = useReels();
  const hidden = useHiddenReels();
  const rows = (reels.data ?? []).filter((reel) => !hidden.includes(reel.id));
  const counts = useSocialCounts(rows.map((reel) => reel.id));

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

  useEffect(() => {
    if (activeId && hidden.includes(activeId) && rows.length === 0) goBack("/");
  }, [activeId, hidden, rows.length]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item?: unknown }> }) => {
      const first = viewableItems[0]?.item as Reel | undefined;
      if (first) setActiveId(first.id);
    }
  ).current;

  const back = useCallback(() => goBack("/"), []);

  const closeComments = useCallback(() => setCommentsFor(null), []);

  return (
    <View testID="reels-viewer" style={styles.root} onLayout={({ nativeEvent: { layout } }) => {
      if (layout.width > 0 && layout.height > 0)
        setViewport(current => current.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height });
    }}>
      {/* Wait for rows before mounting: initialScrollIndex is only honored at mount. */}
      {rows.length > 0 ? <FlatList
        testID="reels-viewer-list"
        data={rows}
        keyExtractor={(item) => item.id}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        extraData={{ playingId, focused, commentsFor }}
        pagingEnabled
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item }) => (
          <ReelCard
            reel={item}
            active={focused && !commentsFor && playingId === item.id}
            counts={counts.data?.[item.id]}
            onOpenComments={setCommentsFor}
            fill={{ width, height }}
          />
        )}
      /> : null}

      {reels.isPending ? (
        <View testID="reels-viewer-loading" style={styles.feedback}>
          <BrandLoadingIndicator />
        </View>
      ) : null}
      {reels.isError ? (
        <View testID="reels-viewer-error" style={styles.feedback}>
          <ErrorBlock error={reels.error} onRetry={() => reels.refetch()} />
        </View>
      ) : null}
      {!reels.isPending && !reels.isError && rows.length === 0 ? (
        <View testID="reels-viewer-empty" style={styles.feedback}>
          <AppText color={theme.colors.onMedia}>{t("social.empty")}</AppText>
        </View>
      ) : null}

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
