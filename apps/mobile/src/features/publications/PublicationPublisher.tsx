import {
  PUBLICATION_PALETTE as P,
  PUBLICATION_TYPE,
} from "./publicationDesign";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { PublicationIcon as Ionicons } from "./publicationDesign";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useI18n } from "@/i18n";
import { useSession } from "@/state/session";
import { isApiError, userMessage } from "@/api/errors";
import { PublicationAuthSheet } from "./PublicationAuthSheet";
import { BrandSymbol } from "@/design/BrandMark";
import { AppImage } from "@/design/appImage";
import { PublicationText as AppText } from "./publicationDesign";
import { mediaUrl } from "@/api/client";
import { PUBLICATION_PUBLISHER as H } from "./publicationDesign";
import {
  PUBLICATION_METRICS as PM,
  RADIUS,
  OPACITY,
  ICON_SIZE,
} from "@/design/tokens.mobile";
import {
  followPublisher,
  type FeedPost,
  type FeedPage,
} from "@/api/publicationFeed";

/** One write per account/publisher, even when several cards of that publisher are visible. */
const writes = new Set<string>();
export function PublicationVerifiedBadge() {
  const { locale } = useI18n();
  return (
    <View
      testID="publication-verified-badge"
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        locale === "ar" ? "ناشر رسمي موثّق" : "Éditeur officiel vérifié"
      }
    >
      <MaterialIcons
        name="verified"
        size={PM.verified}
        color={P.verified}
        accessible={false}
      />
    </View>
  );
}
export function PublicationPublisher({
  post,
  dark = false,
  children,
  onOptions,
  detail = false,
}: {
  post: FeedPost;
  dark?: boolean;
  children?: ReactNode;
  onOptions?: () => void;
  detail?: boolean;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const session = useSession();
  const client = useQueryClient();
  const owner =
    session.status === "signedIn" ? session.account?.id || "guest" : "guest";
  const identity = `${owner}:${post.channelId}`;
  const latest = useRef(identity);
  latest.current = identity;
  const [following, setFollowing] = useState(!!post.following);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState(false);
  useEffect(() => {
    if (!writes.has(identity)) setFollowing(!!post.following);
  }, [post.following, identity]);
  useEffect(() => {
    setBusy(false);
    setError("");
    setAuth(false);
  }, [identity]);
  const follow = async () => {
    if (session.status !== "signedIn") {
      setAuth(true);
      return;
    }
    if (writes.has(identity)) return;
    writes.add(identity);
    setBusy(true);
    setError("");
    try {
      const result = await followPublisher(post.channelId, !following);
      if (typeof result.following !== "boolean")
        throw new Error("Unconfirmed follow response");
      if (latest.current === identity) setFollowing(result.following);
      client.setQueriesData<InfiniteData<FeedPage>>(
        { queryKey: ["publication-feed", owner] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.channelId === post.channelId
                      ? { ...item, following: result.following }
                      : item
                  ),
                })),
              }
            : old
      );
      void client.invalidateQueries({ queryKey: ["publication-feed", owner] });
    } catch (e) {
      if (latest.current === identity) {
        if (isApiError(e) && e.status === 401) setAuth(true);
        else
          setError(
            isApiError(e)
              ? userMessage(e)[ar ? "ar" : "fr"]
              : ar
              ? "تعذّرت المتابعة. أعد المحاولة."
              : "Suivi non enregistré. Réessayez."
          );
      }
    } finally {
      writes.delete(identity);
      if (latest.current === identity) setBusy(false);
    }
  };
  const ownBrand = /^zayrovi(?:\s+(?:official|team))?$/i.test(
    post.channelName.trim()
  );
  const name =
    ownBrand || !post.channelName.trim() ? "Zayrovi Team" : post.channelName;
  const ink = dark ? P.paper : P.ink;
  const followControl = (
    <Pressable
      testID={`publication-follow-${post.id}`}
      accessibilityRole="button"
      accessibilityLabel={
        following
          ? ar
            ? "إلغاء متابعة الناشر"
            : "Ne plus suivre cet éditeur"
          : ar
          ? "متابعة الناشر"
          : "Suivre cet éditeur"
      }
      accessibilityState={{
        selected: following,
        disabled: busy || session.status === "loading",
        busy,
      }}
      disabled={busy || session.status === "loading"}
      onPress={() => void follow()}
      style={({ pressed }) => [
        detail ? styles.detailFollow : styles.followTarget,
        {
          opacity: busy ? OPACITY.disabled : pressed ? OPACITY.subtle : 1,
        },
      ]}
    >
      {detail ? (
        <View
          style={{
            borderRadius: RADIUS.full,
            paddingHorizontal: 12,
            paddingVertical: 6,
            backgroundColor: following ? P.neutral : P.ink,
          }}
        >
          <AppText variant="label" color={following ? P.ink : P.paper}>
            {following ? (ar ? "متابَع" : "Suivi") : ar ? "متابعة" : "Suivre"}
          </AppText>
        </View>
      ) : (
        <View testID="publication-follow-disc" style={styles.followDisc}>
          <Ionicons
            name={following ? "checkmark-outline" : "add-outline"}
            size={ICON_SIZE.sm}
            color={P.paper}
            accessibilityElementsHidden
          />
        </View>
      )}
    </Pressable>
  );
  return (
    <View style={{ gap: 4 }}>
      <View testID="publication-publisher-header" style={styles.row}>
        <View
          testID="publication-publisher-column"
          style={[
            styles.name,
            detail
              ? { marginRight: 96, minHeight: 44, justifyContent: "center" }
              : undefined,
          ]}
        >
          <View
            style={[
              styles.identity,
              onOptions ? { paddingRight: PUBLICATION_TYPE.touch } : undefined,
            ]}
          >
            <AppText
              testID="publication-publisher-name"
              variant="bodyStrong"
              numberOfLines={1}
              color={ink}
              style={{
                flexShrink: 1,
                fontFamily: /[\u0600-\u06FF]/.test(name)
                  ? "NotoSansArabic-Bold"
                  : H.font,
                fontSize: H.nameSize,
                lineHeight: H.lineHeight,
              }}
            >
              {name}
            </AppText>
            {post.publisherOfficial ? <PublicationVerifiedBadge /> : null}
          </View>
          {post.content?.sponsored ? (
            <AppText variant="caption" color={dark ? P.paper : P.muted}>{`${
              ar ? "إعلان" : "Sponsorisé"
            }${
              post.content.sponsorName ? ` · ${post.content.sponsorName}` : ""
            }`}</AppText>
          ) : null}
          {children}
        </View>
        <View
          testID="publication-publisher-avatar-slot"
          style={styles.avatarWrap}
        >
          <View testID="publication-publisher-avatar" style={styles.avatar}>
            {post.publisherAvatar ? (
              <AppImage
                uri={mediaUrl(post.publisherAvatar)}
                style={styles.image}
                contentFit="cover"
                accessibilityLabel={name}
              />
            ) : ownBrand ? (
              <BrandSymbol width={H.mark} color={P.ink} />
            ) : (
              <AppText
                testID="publication-publisher-initial"
                variant="captionStrong"
                color={P.ink}
              >
                {name.trim().slice(0, 1).toUpperCase() || "?"}
              </AppText>
            )}
          </View>
          {!detail ? followControl : null}
        </View>
        {detail ? followControl : null}
        {onOptions ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              ar ? "خيارات المنشور" : "Options de la publication"
            }
            onPress={onOptions}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "flex-start",
            }}
          >
            <Ionicons
              name="ellipsis-horizontal-outline"
              size={ICON_SIZE.md}
              color={P.muted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          variant="caption"
          color={P.reactionError}
        >
          {error}
        </AppText>
      ) : null}
      <PublicationAuthSheet visible={auth} onClose={() => setAuth(false)} />
    </View>
  );
}
const styles = StyleSheet.create({
  row: { minHeight: PUBLICATION_TYPE.column, minWidth: 0 },
  name: { marginLeft: PUBLICATION_TYPE.column, minWidth: 0, gap: 4 },
  identity: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  detailFollow: {
    position: "absolute",
    top: 0,
    right: 0,
    minHeight: 44,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  followTarget: {
    position: "absolute",
    right: 0,
    bottom: 0,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  followDisc: {
    width: H.follow,
    height: H.follow,
    borderRadius: RADIUS.full,
    backgroundColor: P.ink,
    transform: [{ translateX: 4 }, { translateY: 4 }],
    borderWidth: 2,
    borderColor: P.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: PUBLICATION_TYPE.column,
    height: PUBLICATION_TYPE.column,
    flexShrink: 0,
  },
  avatar: {
    width: H.avatar,
    height: H.avatar,
    borderRadius: RADIUS.full,
    backgroundColor: P.neutral,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
});
