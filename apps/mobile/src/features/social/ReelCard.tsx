import { PublicationAuthSheet } from "@/features/publications/PublicationAuthSheet";
import { ReelPublisher } from "@/features/reels/ReelPublisher";
import { ReelOptions } from "@/features/reels/ReelOptions";
import { shareReel } from "@/features/reels/shareReel";
/**
 * بطاقة ريلز (Q3، 08/10/2026).
 *
 * قاعدتان تقنيّتان تمنعان «تطبيـق يعلّق»:
 *  • **مشغّل واحد للبطاقة الظاهرة فقط** (`active`): عشرة مشغّلات دفعة وحدة
 *    جهاز متوسّط يخنق. البطاقات البعيدة تعرض إطاراً وتنتظر.
 *  • **الصوت مطفي افتراضياً**: ريلز يبدأ يصرخ في الأماكن العامة أسوأ من ريلز
 *    ينتظر لمسة.
 *
 * وقاعدة الصدق: **الإعجاب يحتاج حساباً** ⇒ الزر معطّل بسبب مكتوب.
 */
import { memo, useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ReelPlayback } from "@/features/reels/ReelPlayback";
import type { VideoView } from "expo-video";

import { AppText } from "@/design/ui";
import { useTheme } from "@/design/theme";
import { useT } from "@/i18n";
import {
  MEDIA_RATIO,
  RADIUS,
  VIDEO_BACKDROP,
  veil,
} from "@/design/tokens.mobile";
import { ReelShopTray } from "@/features/reels/ReelShopTray";
import { useProductFavorites } from "@/features/reels/useProductFavorites";
import { mediaUrl } from "@/api/client";
import { AppImage } from "@/design/appImage";
import { useSession } from "@/state/session";
import { sendInteraction, type Reel } from "@/api/social";
import { useSessionId } from "@/session/session";

export interface ReelCardProps {
  reel: Reel;
  /** هل هذه البطاقة هي الظاهرة؟ المشغّل يُنشأ لها وحدها. */
  active: boolean;
  counts?: { likes: number; comments: number; views: number; shares: number };
  onOpenComments: (reel: Reel) => void;
  /**
   * Mode plein écran (visionneuse) : la vidéo remplit `width`×`height`, le texte
   * et les actions se posent par-dessus en blanc. Absent ⇒ carte de la liste.
   */
  fill?: { width: number; height: number };
}

export const ReelCard = memo(function ReelCard({
  reel,
  active,
  counts,
  onOpenComments,
  fill,
}: ReelCardProps) {
  const theme = useTheme();
  const t = useT();
  const session = useSession();
  const guestSession = useSessionId();
  const signedIn = session.status === "signedIn";
  // En plein écran le texte est posé sur la vidéo : blanc, pas la couleur de carte.
  const ink = fill ? theme.colors.onMedia : theme.colors.ink;
  const muted = fill ? theme.colors.onMedia : theme.colors.muted;

  const [liked, setLiked] = useState(false);
  // Pouce bas (rail plein écran, référence 10/11) : publications ET reels.
  const [disliked, setDisliked] = useState(false);
  // Cœur favori du rail : état local du Reel (affichage fidèle à la référence).
  const [favourited, setFavourited] = useState(false);
  const [options, setOptions] = useState(false);
  const [auth, setAuth] = useState(false);
  const [error, setError] = useState("");
  const likeLock = useRef(false);
  // VideoView du lecteur actif : le bouton plein écran du rail appelle
  // `enterFullscreen()` dessus (contrôles natifs toujours activés en plein écran).
  const videoView = useRef<VideoView | null>(null);
  const onVideoViewReady = useCallback((view: VideoView | null) => {
    videoView.current = view;
  }, []);
  const enterFullscreen = useCallback(() => {
    const view = videoView.current;
    if (!view) return;
    view.enterFullscreen().catch(() => setError(t("common.retry")));
  }, [t]);
  const [paused, setPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const favourites = useProductFavorites(
    fill ? signedIn : false,
    session.account?.id || ""
  );

  const toggleLike = useCallback(async () => {
    if (!signedIn) return;
    if (likeLock.current) return;
    likeLock.current = true;
    setError("");
    // Optimiste (référence 11/11) : le pouce vert et ses éclats partent AU
    // TOUCHER, pas après l'aller-retour serveur ; l'état serveur s'applique
    // ensuite, et un échec remet l'état d'avant.
    const before = { liked, disliked };
    setLiked(!liked);
    if (!liked) setDisliked(false);
    try {
      const result = await sendInteraction({
        type: "like",
        targetId: reel.id,
        sessionId: guestSession || undefined,
      });
      if (typeof result.liked === "boolean") setLiked(result.liked);
      // Le serveur est exclusif : un like efface le pouce bas.
      setDisliked(result.disliked === true);
    } catch {
      setLiked(before.liked);
      setDisliked(before.disliked);
      setError(t("common.retry"));
    } finally {
      likeLock.current = false;
    }
  }, [signedIn, liked, disliked, reel.id, guestSession, t]);
  const toggleDislike = useCallback(async () => {
    if (!signedIn || likeLock.current) return;
    likeLock.current = true;
    setError("");
    // Optimiste, comme le pouce haut : le pouce rouge bascule au toucher.
    const before = { liked, disliked };
    setDisliked(!disliked);
    if (!disliked) setLiked(false);
    try {
      const result = await sendInteraction({
        type: "reaction",
        reaction: disliked ? null : "dislike",
        targetId: reel.id,
        sessionId: guestSession || undefined,
      });
      setDisliked(result.reaction === "dislike");
      setLiked(result.liked === true);
    } catch {
      setLiked(before.liked);
      setDisliked(before.disliked);
      setError(t("common.retry"));
    } finally {
      likeLock.current = false;
    }
  }, [signedIn, liked, disliked, reel.id, guestSession, t]);
  const share = useCallback(() => shareReel(reel), [reel]);
  const shareWithFeedback = () => {
    setError("");
    share().catch(() => setError(t("common.retry")));
  };

  /** Média : couverture, lecteur (un seul vivant), bouton pause. */
  const media = (
    <View
      style={
        fill
          ? styles.fillMedia
          : [styles.media, { backgroundColor: theme.colors.canvas }]
      }
    >
      {reel.posterUrl ? (
        // Couverture derrière la vidéo : elle reste visible tant que la vidéo n'a pas d'image.
        <AppImage
          uri={mediaUrl(reel.posterUrl)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          decorative
        />
      ) : null}
      {active ? (
        <ReelPlayback
          key={reel.id}
          id={reel.id}
          contentFit={fill ? "cover" : "contain"}
          uri={mediaUrl(reel.videoUrl)}
          paused={paused}
          onPausedChange={setPaused}
          soundOn={soundOn}
          blocked={options || auth}
          onVideoViewReady={fill ? onVideoViewReady : undefined}
        />
      ) : !reel.posterUrl ? (
        <View style={[StyleSheet.absoluteFill, styles.poster]}>
          <Ionicons name="play-circle-outline" size={theme.iconSize.xl} color={muted} accessibilityElementsHidden />
        </View>
      ) : null}

      {!fill && reel.durationSeconds > 0 ? (
        <View style={styles.duration}>
          <AppText variant="caption" color={theme.colors.onMedia}>{`0:${String(
            reel.durationSeconds % 60
          ).padStart(2, "0")}`}</AppText>
        </View>
      ) : null}
    </View>
  );

  /**
   * Corps de la carte (légende, actions, état de connexion).
   *
   * En plein écran il est POSITIONNÉ au-dessus du tiroir : quand les articles
   * sortent, la légende et les actions montent avec eux au lieu de passer
   * dessous. `bottom` est calculé par le tiroir — une seule géométrie.
   */
  const body = (bottom?: number) => (
    <View
      style={[
        fill ? styles.fillBody : styles.body,
        fill && bottom !== undefined ? { bottom } : null,
      ]}
    >
      {fill ? <ReelPublisher onMedia /> : null}
      {!fill && reel.title ? (
        <AppText variant="label" color={ink} numberOfLines={1}>
          {reel.title}
        </AppText>
      ) : null}
      {!fill && reel.description ? (
        <AppText variant="caption" color={muted} numberOfLines={2}>
          {reel.description}
        </AppText>
      ) : null}

      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={muted}>
          {error}
        </AppText>
      ) : null}
      {/* En plein écran, partage/son/commentaire vivent dans le rail posé sur la
          vidéo (accroché à la pastille) : pas de doublon ici. */}
      {!fill ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? t("social.liked") : t("social.like")}
            accessibilityState={{ disabled: !signedIn }}
            disabled={!signedIn}
            onPress={toggleLike}
            style={[styles.action, { opacity: signedIn ? 1 : 0.45 }]}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={theme.iconSize.md}
              color={
                liked
                  ? fill
                    ? theme.colors.accentOnMedia
                    : theme.colors.accentText
                  : muted
              }
              accessibilityElementsHidden
            />
            <AppText variant="caption" color={muted}>
              {String(counts?.likes ?? reel.likes)}
            </AppText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("social.comments")}
            onPress={() => onOpenComments(reel)}
            style={styles.action}
          >
            <Ionicons
              name="chatbubble-outline"
              size={theme.iconSize.md}
              color={muted}
              accessibilityElementsHidden
            />
            <AppText variant="caption" color={muted}>
              {String(counts?.comments ?? 0)}
            </AppText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("social.share")}
            onPress={shareWithFeedback}
            style={styles.action}
          >
            <Ionicons
              name="share-social-outline"
              size={theme.iconSize.md}
              color={muted}
              accessibilityElementsHidden
            />
            <AppText variant="caption" color={muted}>
              {String(counts?.shares ?? 0)}
            </AppText>
          </Pressable>

          {counts && counts.views > 0 ? (
            <AppText variant="caption" color={muted}>
              {t("social.views", { value: String(counts.views) })}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {!fill && !signedIn ? (
        <AppText variant="caption" color={muted}>
          {t("social.needAccount")}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <View
      style={
        fill
          ? [
              styles.card,
              styles.fillCard,
              { width: fill.width, height: fill.height },
            ]
          : [
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.card,
              },
            ]
      }
    >
      {media}
      {auth ? (
        <PublicationAuthSheet visible onClose={() => setAuth(false)} />
      ) : null}
      {options ? (
        <ReelOptions
          reel={reel}
          onClose={() => setOptions(false)}
          onShare={share}
          onLike={toggleLike}
          onComment={() => onOpenComments(reel)}
          liked={liked}
          canLike={signedIn}
          interactionError={error}
        />
      ) : null}
      {fill ? (
        // Plein écran : tiroir par-dessus la vidéo. Le lecteur n'est pas démonté,
        // donc ouvrir les articles ne met PAS le Reel en pause.
        <ReelShopTray
          reel={reel}
          mode="overlay"
          surface={theme.colors.canvas}
          onMedia={theme.colors.onMedia}
          rail={{
            muted: !soundOn,
            onToggleMute: () => setSoundOn((value) => !value),
            onShare: shareWithFeedback,
            onComment: () => onOpenComments(reel),
            onOptions: () => setOptions(true),
            // Rail complet (référence 10/11) : pouces, cœur, plein écran.
            liked,
            likesCount: counts?.likes ?? reel.likes,
            likeEnabled: signedIn,
            onLike: toggleLike,
            disliked,
            onDislike: signedIn ? toggleDislike : undefined,
            commentsCount: counts?.comments ?? 0,
            favourited,
            onFavourite: signedIn
              ? () => setFavourited((value) => !value)
              : () => setAuth(true),
            onFullscreen: enterFullscreen,
          }}
          favourites={
            signedIn
              ? favourites
              : { isFavorite: () => false, toggle: () => setAuth(true) }
          }
        >
          {({ bottom }) => body(bottom)}
        </ReelShopTray>
      ) : (
        <>
          {body()}
          <ReelShopTray
            reel={reel}
            mode="inline"
            surface={theme.colors.canvas}
            onMedia={theme.colors.onMedia}
          >
            {() => null}
          </ReelShopTray>
        </>
      )}
    </View>
  );
}, (previous, next) => previous.reel === next.reel
  && previous.active === next.active
  && previous.onOpenComments === next.onOpenComments
  && Boolean(previous.fill) === Boolean(next.fill)
  && previous.fill?.width === next.fill?.width
  && previous.fill?.height === next.fill?.height
  && previous.counts?.likes === next.counts?.likes
  && previous.counts?.comments === next.counts?.comments
  && previous.counts?.views === next.counts?.views
  && previous.counts?.shares === next.counts?.shares);

const styles = StyleSheet.create({
  card: { marginBottom: 12, overflow: "hidden" },
  media: {
    width: "100%",
    aspectRatio: MEDIA_RATIO.reel,
    justifyContent: "flex-end",
  },
  fillCard: {
    marginBottom: 0,
    borderRadius: 0,
    backgroundColor: VIDEO_BACKDROP,
  },
  fillMedia: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: VIDEO_BACKDROP,
  },
  // `paddingEnd` réserve la colonne du rail (44 de cible + 8 de marge) : la légende
  // ne passe jamais sous les icônes, comme sur la planche `mockup-v4-24-10.png`.
  fillBody: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    padding: 16,
    paddingEnd: 64,
    paddingBottom: 20,
    gap: 6,
  },
  poster: { alignItems: "center", justifyContent: "center" },
  duration: {
    position: "absolute",
    top: 10,
    start: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: veil(0.55),
  },
  body: { padding: 12, gap: 4 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 6,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 4 },
});
