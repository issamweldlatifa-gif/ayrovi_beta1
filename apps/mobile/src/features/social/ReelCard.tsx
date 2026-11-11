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
import { Animated, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ReelPlayback } from "@/features/reels/ReelPlayback";
import { ReactionButton } from "@/design/reactions/ReactionButton";
import { DoubleTapHearts, type DoubleTapHeartsHandle } from "@/design/reactions/DoubleTapHearts";
import { useContentReaction } from "@/design/reactions/useContentReaction";
import { formatRailCount } from "@/features/reels/reelTray";

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
import type { Reel } from "@/api/social";
import { useSessionId } from "@/session/session";

export interface ReelCardProps {
  reel: Reel;
  /** هل هذه البطاقة هي الظاهرة؟ المشغّل يُنشأ لها (وللموالية في وضع التحميل المسبق). */
  active: boolean;
  /**
   * Carte SUIVANTE de la visionneuse : son lecteur charge la vidéo en pause
   * pour qu'elle démarre sans attente au prochain glissement (11/11).
   */
  preload?: boolean;
  /**
   * Feuille de commentaires ouverte par-dessus : le lecteur RESTE monté et se
   * met seulement en pause — fermer la feuille ne recharge plus la vidéo.
   */
  suspended?: boolean;
  counts?: { likes: number; loves?: number; comments: number; views: number; shares: number };
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
  preload = false,
  suspended = false,
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

  const [options, setOptions] = useState(false);
  const [auth, setAuth] = useState(false);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const favourites = useProductFavorites(
    fill ? signedIn : false,
    session.account?.id || ""
  );

  /**
   * Z-Reactions (11/11) : UN bouton (J'aime · J'adore · Je n'aime pas), état
   * initial venu du serveur (`myReaction`), optimiste, « le dernier geste gagne ».
   * Compteur affiché = J'aime + J'adore.
   */
  const reactionCount = counts ? counts.likes + (counts.loves ?? 0) : reel.likes;
  const requireAccount = useCallback(() => setAuth(true), []);
  const reaction = useContentReaction({
    targetId: reel.id,
    initial: reel.myReaction ?? null,
    initialCount: reactionCount,
    signedIn,
    sessionId: guestSession || undefined,
    onAuthRequired: requireAccount,
  });
  // Double-tap sur la vidéo : J'adore + cœurs ROUGES sous le doigt.
  const hearts = useRef<DoubleTapHeartsHandle>(null);
  const loveFromDoubleTap = useCallback((x: number, y: number) => {
    if (reaction.love()) hearts.current?.burst(x, y);
  }, [reaction]);
  const visibleError = error || (reaction.error ? t("common.retry") : "");
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
      {active || preload ? (
        <ReelPlayback
          key={reel.id}
          id={reel.id}
          contentFit={fill ? "cover" : "contain"}
          uri={mediaUrl(reel.videoUrl)}
          paused={paused}
          onPausedChange={setPaused}
          soundOn={soundOn}
          blocked={options || auth || suspended}
          preload={!active}
          onDoubleTap={active ? loveFromDoubleTap : undefined}
        />
      ) : !reel.posterUrl ? (
        <View style={[StyleSheet.absoluteFill, styles.poster]}>
          <Ionicons name="play-circle-outline" size={theme.iconSize.xl} color={muted} accessibilityElementsHidden />
        </View>
      ) : null}

      {active ? <DoubleTapHearts ref={hearts} testID={`reel-hearts-${reel.id}`} /> : null}

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
  const body = (bottom?: number, lift?: Animated.AnimatedInterpolation<number>) => (
    <Animated.View
      pointerEvents="box-none"
      style={[
        fill ? styles.fillBody : styles.body,
        fill && bottom !== undefined ? { bottom } : null,
        fill && lift ? { transform: [{ translateY: lift }] } : null,
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

      {visibleError ? (
        <AppText accessibilityRole="alert" variant="caption" color={muted}>
          {visibleError}
        </AppText>
      ) : null}
      {/* En plein écran, partage/son/commentaire vivent dans le rail posé sur la
          vidéo (accroché à la pastille) : pas de doublon ici. */}
      {!fill ? (
        <View style={styles.actions}>
          <ReactionButton
            testID={`reel-reaction-${reel.id}`}
            variant="inline"
            reaction={reaction.reaction}
            count={formatRailCount(reaction.count)}
            onTap={reaction.tap}
            onPick={reaction.pick}
            guest={!signedIn}
            ink={muted}
          />

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
    </Animated.View>
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
          onLike={reaction.tap}
          onComment={() => onOpenComments(reel)}
          liked={reaction.reaction !== null}
          canLike={signedIn}
          interactionError={visibleError}
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
            // Z-Reactions (11/11) : un bouton unique remplace pouces + cœur ;
            // le plein écran est retiré du rail.
            reaction: reaction.reaction,
            reactionsCount: reaction.count,
            onReactionTap: reaction.tap,
            onReactionPick: reaction.pick,
            reactionEnabled: signedIn,
            commentsCount: counts?.comments ?? 0,
          }}
          favourites={
            signedIn
              ? favourites
              : { isFavorite: () => false, toggle: () => setAuth(true) }
          }
        >
          {({ bottom, lift }) => body(bottom, lift)}
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
  && previous.preload === next.preload
  && previous.suspended === next.suspended
  && previous.onOpenComments === next.onOpenComments
  && Boolean(previous.fill) === Boolean(next.fill)
  && previous.fill?.width === next.fill?.width
  && previous.fill?.height === next.fill?.height
  && previous.counts?.likes === next.counts?.likes
  && previous.counts?.loves === next.counts?.loves
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
