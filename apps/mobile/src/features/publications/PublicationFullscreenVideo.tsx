import { useCallback, useEffect, useEffectEvent, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { AppState, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { VideoView, useVideoPlayer } from "expo-video";
import { mediaUrl } from "@/api/client";
import type { ReferencePublication } from "@/api/referencePublications";
import { AppImage } from "@/design/appImage";
import { OFFICIAL_AVATAR, OfficialAvatar } from "@/design/OfficialAvatar";
import { rowDirectionFor } from "@/design/layoutLogic";
import { useTheme } from "@/design/theme";
import { RADIUS, veil } from "@/design/tokens.mobile";
import { useI18n } from "@/i18n";
import { PublicationText } from "./publicationDesign";
import { PublicationPlayerActions, PublicationPlayerPanel, type PlayerPanel, type RelatedStatus } from "./PublicationPlayerPanels";
import { PUBLICATION_PALETTE as P, PUBLICATION_PLAYER as C, PUBLICATION_OVERLAY_TEXT } from "./publicationTokens";
import { PublicationPlayerSettings, type PlayerMenu } from "./PublicationPlayerSettings";
import { OFFICIAL_PUBLISHER_ID, OFFICIAL_PUBLISHER_NAME } from "./officialPublisher";
import { PublicationSkipGlyph } from "./PublicationTransportGlyphs";
import { isPublicationDismissSwipe, UP_NEXT_MS, videoClock } from "./publicationVideoQueue";

export type PublicationPlayback = { time: number; muted: boolean };
const TOP_BUTTON_SIZE = 44;
const FIRST_FRAME_TIMEOUT_MS = 8_000;
const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max);

export function PublicationFullscreenVideo({ post, media, start, videos, relatedStatus, back, next,
  onClose, onLearnMore, onProduct, onSelectVideo, onRetryRelated, onRetryPlayback,
}: {
  post: ReferencePublication;
  media: NonNullable<ReferencePublication["media"]>;
  start: PublicationPlayback;
  videos: ReferencePublication[];
  relatedStatus: RelatedStatus;
  back: Ref<() => void>;
  next?: ReferencePublication;
  onClose: (state: PublicationPlayback) => void;
  onLearnMore: (state: PublicationPlayback) => void;
  onProduct: (id: string, state: PublicationPlayback) => void;
  onSelectVideo: (item: ReferencePublication, state: PublicationPlayback) => void;
  onRetryRelated: () => void;
  onRetryPlayback: (muted: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const { isRTL, iconSize } = useTheme();
  const { top, bottom, left, right } = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = height < 450;
  const direction = rowDirectionFor(isRTL);
  const [ready, setReady] = useState(false);
  const frameRendered = useRef(false);
  const restored = useRef(false);
  const [frameFailed, setFrameFailed] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState == null || AppState.currentState === "active");
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [muted, setMuted] = useState(start.muted);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<PlayerPanel | null>(null);
  const [menu, setMenu] = useState<PlayerMenu | null>(null);
  const [time, setTime] = useState(start.time);
  const [duration, setDuration] = useState(0);
  const [trackSize, setTrackSize] = useState<{ width: number; height: number } | null>(null);
  const [hasSubtitles, setHasSubtitles] = useState(false);
  const [subtitlesOn, setSubtitlesOn] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const seekPageStart = useRef(0);
  const playhead = useRef(start.time);
  const [speed, setSpeed] = useState(1);
  const [status, setStatus] = useState("idle");
  const [countdown, setCountdown] = useState(1);
  const advanceBlocked = useRef(false);
  const { url, poster } = media;
  const videoWidth = trackSize?.width || media.width || 0;
  const videoHeight = trackSize?.height || media.height || 0;
  // Portrait media fills the upright viewport. Keep landscape/square sources whole;
  // use their poster (when authored) behind any space due to the aspect ratio.
  const fit = width <= height && videoWidth > 0 && videoHeight > videoWidth ? "cover" : "contain";
  const resolution = trackSize ? Math.min(trackSize.width, trackSize.height) : 0;
  const title = post.title.trim() || post.subtitle.trim();
  const description = [post.description, post.subtitle].map(value => value?.trim()).find(value => value && value !== title);
  const caption = description || post.products.find(product => product.name.trim() && product.name.trim() !== title)?.name.trim();
  const official = post.channelId === OFFICIAL_PUBLISHER_ID;
  const publisher = official ? OFFICIAL_PUBLISHER_NAME : post.channelName;
  const hasProducts = post.products.length > 0;
  const canFindRelated = post.products.some(product => product.available);
  const player = useVideoPlayer({ uri: mediaUrl(url) }, instance => {
    instance.muted = true;
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.25;
  });
  useEffect(() => {
    const refresh = () => {
      const receivedDuration = player.duration;
      setDuration(Number.isFinite(receivedDuration) && receivedDuration > 0 ? receivedDuration : 0);
      const size = player.videoTrack?.size;
      setTrackSize(size && size.width > 0 && size.height > 0 ? size : null);
    };
    const refreshSubtitles = () => {
      setHasSubtitles(player.availableSubtitleTracks.length > 0);
      setSubtitlesOn(Boolean(player.subtitleTrack));
    };
    const updateTime = (value: number) => {
      if (!Number.isFinite(value)) return;
      playhead.current = value;
      setTime(value);
    };
    setStatus(player.status);
    refresh();
    refreshSubtitles();
    const subs = [
      AppState.addEventListener("change", value => setForeground(value === "active")),
      player.addListener("statusChange", ({ status: nextStatus }) => {
        setStatus(nextStatus);
        refresh();
      }),
      player.addListener("sourceLoad", () => { refresh(); refreshSubtitles(); }),
      player.addListener("availableSubtitleTracksChange", ({ availableSubtitleTracks }) => setHasSubtitles(availableSubtitleTracks.length > 0)),
      player.addListener("subtitleTrackChange", ({ subtitleTrack }) => setSubtitlesOn(Boolean(subtitleTrack))),
      player.addListener("videoTrackChange", refresh),
      player.addListener("timeUpdate", ({ currentTime }) => updateTime(currentTime)),
      player.addListener("playToEnd", () => {
        if (!frameRendered.current) {
          setFrameFailed(true);
          return;
        }
        updateTime(player.duration);
        setEnded(true);
        setVisible(true);
        setMenu(null);
      }),
    ];
    return () => subs.forEach(item => item.remove());
  }, [player]);
  const failed = frameFailed || status === "error";
  const waiting = foreground && !paused && !ready && !failed;
  useEffect(() => {
    if (!waiting) { setShowLoading(false); return; }
    const hint = setTimeout(() => setShowLoading(true), 650);
    const deadline = setTimeout(() => setFrameFailed(true), FIRST_FRAME_TIMEOUT_MS);
    return () => { clearTimeout(hint); clearTimeout(deadline); };
  }, [waiting]);
  // A decoder that hasn't shown a frame must never become an audio-only player.
  useEffect(() => { player.muted = muted || !ready || failed || status !== "readyToPlay"; }, [muted, ready, failed, status, player]);
  useEffect(() => {
    if (status !== "readyToPlay" || restored.current) return;
    restored.current = true;
    const saved = start.time;
    // The inline loop can hand us its last frame; don't immediately end the fullscreen clip.
    if (player.duration > 0 && saved > 0) {
      const position = saved >= player.duration - 0.5 ? 0 : clamp(saved, player.duration);
      player.currentTime = position;
      playhead.current = position;
      setTime(position);
    }
  }, [player, start.time, status]);
  useEffect(() => {
    // Queue play during loading; readiness is only required for restoring a seek.
    if (foreground && !paused && !ended && !failed) player.play();
    else player.pause();
  }, [foreground, paused, player, ended, failed]);
  useEffect(() => { player.playbackRate = speed; }, [speed, player]);

  const playback = useCallback((): PublicationPlayback => ({ time: playhead.current, muted }), [muted]);
  const upNext = ended && !cancelled && !failed ? next : undefined;
  const advance = (item: ReferencePublication) => {
    advanceBlocked.current = true;
    onSelectVideo(item, playback());
  };
  const advanceIfActive = useEffectEvent(() => {
    if (!advanceBlocked.current && AppState.currentState === "active" && upNext && !panel && !menu) advance(upNext);
  });
  useEffect(() => {
    if (!upNext?.id || !foreground || panel || menu) return;
    const started = Date.now();
    setCountdown(1);
    const interval = setInterval(() => setCountdown(clamp(1 - (Date.now() - started) / UP_NEXT_MS, 1)), 100);
    const timer = setTimeout(() => advanceIfActive(), UP_NEXT_MS);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [upNext?.id, foreground, panel, menu]);

  const seek = (position: number) => {
    if (!duration || !Number.isFinite(position)) return;
    const value = clamp(position, duration);
    player.currentTime = value;
    playhead.current = value;
    setTime(value);
    if (ended) {
      setEnded(false);
      setPaused(true);
    }
  };
  const skip = (delta: number) => seek(playhead.current + delta);
  const cancelNext = () => { advanceBlocked.current = true; setCancelled(true); };
  const togglePlayback = () => {
    if (ended) {
      advanceBlocked.current = false;
      setCancelled(false);
      seek(0);
      setEnded(false);
      setPaused(false);
    } else setPaused(value => !value);
  };
  const exitWith = useCallback((action: (state: PublicationPlayback) => void) => { advanceBlocked.current = true; action(playback()); }, [playback]);
  const close = useCallback(() => exitWith(onClose), [exitWith, onClose]);
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, { dx, dy, numberActiveTouches }) => numberActiveTouches === 1 && isPublicationDismissSwipe(dx, dy, 12),
    onPanResponderRelease: (_event, { dx, dy, vy }) => {
      if (isPublicationDismissSwipe(dx, dy, vy > 0.65 ? 48 : 84)) close();
    },
  }), [close]);
  useImperativeHandle(back, () => () => {
    if (panel) setPanel(null);
    else if (menu) setMenu(menu === "quality" || menu === "diagnostics" ? "settings" : null);
    else if (upNext) cancelNext();
    else close();
  });
  const toggleControls = () => {
    if (panel) { setPanel(null); return; }
    if (menu) { setMenu(null); return; }
    if (upNext) return;
    setVisible(value => !value);
  };
  const togglePanel = (value: PlayerPanel) => {
    setMenu(null);
    setPanel(current => current === value ? null : value);
  };
  const toggleSubtitles = () => {
    if (player.subtitleTrack) { player.subtitleTrack = null; return; }
    const tracks = player.availableSubtitleTracks;
    const aliases = locale === "ar" ? ["ar", "ara"] : ["fr", "fra", "fre"];
    const preferred = tracks.find(({ language }) => aliases.includes(language.toLowerCase().split(/[-_]/)[0]!));
    const track = preferred ?? tracks.find(({ isDefault }) => isDefault) ?? tracks[0];
    if (track) player.subtitleTrack = track;
  };
  const edge = (offset: number) => isRTL ? { left: left + 12 + offset } : { right: right + 12 + offset };
  const topEdge = { top: top + 4, ...edge(0) };
  const controls = visible && !panel;
  const progress = dragProgress ?? (duration ? clamp(time, duration) / duration : 0);
  const fraction = (x: number) => trackWidth ? clamp(x / trackWidth, 1) : 0;
  const optionsOffset = hasSubtitles ? 2 : 1;
  const nextTitle = upNext?.title || upNext?.subtitle || t("publication.playerVideo");
  const skipButton = (delta: number, id: string, label: string) => (
    <Pressable testID={id} accessibilityRole="button" accessibilityLabel={label} disabled={!duration}
      onPress={() => skip(delta)} style={styles.skip}>
      <PublicationSkipGlyph forward={delta > 0} />
    </Pressable>
  );

  return <View style={styles.screen} testID="publication-player-window">
    <View style={styles.screen} testID="publication-fullscreen-player">
      <StatusBar hidden style="light" />
      <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="publication-player-media-layer">
        {poster && fit === "contain" ? <AppImage uri={mediaUrl(poster)} decorative contentFit="cover" blurRadius={24}
          testID="publication-player-aspect-backdrop" style={StyleSheet.absoluteFill} /> : null}
        {poster && fit === "cover" ? <AppImage uri={mediaUrl(poster)} decorative contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
        <VideoView player={player} style={StyleSheet.absoluteFill}
          surfaceType="textureView" nativeControls={false} useExoShutter={false} contentFit={fit} testID="publication-player-video"
          onFirstFrameRender={() => { frameRendered.current = true; setReady(true); }} />
      </View>
      <View style={StyleSheet.absoluteFill} testID="publication-player-dismiss-region" {...(!panel && !menu ? swipe.panHandlers : {})}>
        <Pressable onPress={toggleControls} accessibilityRole="button"
          accessibilityLabel={t(panel || menu || visible ? "publication.playerHide" : "publication.playerShow")}
          style={StyleSheet.absoluteFill} testID="publication-player-surface" />
      </View>
      <LinearGradient pointerEvents="none" colors={[veil(0.64), veil(0)]}
        style={[styles.topWash, { height: top + (compact ? 132 : 220) }]} />
      {controls || panel ? <LinearGradient pointerEvents="none" colors={[veil(0), veil(0.64)]}
        style={[styles.bottomWash, { height: bottom + 144 }]} /> : null}
      {failed || (showLoading && waiting) ? <View pointerEvents="box-none" style={styles.middle}>
        <View pointerEvents={failed ? "auto" : "none"} style={styles.message}>
          <PublicationText accessibilityRole={failed ? "alert" : "text"} align="center" variant="bodyStrong" color={P.paper} style={PUBLICATION_OVERLAY_TEXT}>
            {t(failed ? "publication.videoError" : "publication.videoLoading")}
          </PublicationText>
          {failed ? <Pressable testID="publication-player-retry" accessibilityRole="button" onPress={() => onRetryPlayback(muted)} style={styles.button}>
            <PublicationText variant="bodyStrong" color={P.paper} style={PUBLICATION_OVERLAY_TEXT}>{t("common.retry")}</PublicationText>
          </Pressable> : null}
        </View>
      </View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={t("publication.playerExit")} testID="publication-player-exit"
        onPress={close} style={[styles.topButton, topEdge]}>
        <Ionicons name="close-outline" color={P.paper} size={iconSize.lg} accessibilityElementsHidden />
      </Pressable>
      {controls && !failed ? <>
        {hasSubtitles ? <Pressable accessibilityRole="togglebutton" accessibilityLabel={t("publication.playerSubtitles")}
          accessibilityState={{ checked: subtitlesOn }} testID="publication-player-cc" onPress={toggleSubtitles}
          style={[styles.topButton, topEdge, edge(TOP_BUTTON_SIZE)]}>
          <View style={[styles.ccBadge, subtitlesOn && styles.ccOn]}><PublicationText color={subtitlesOn ? P.ink : P.paper} variant="captionStrong">CC</PublicationText></View>
        </Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t("publication.playerSettings")} testID="publication-player-options"
          accessibilityState={{ expanded: !!menu }} onPress={() => setMenu(value => value ? null : "settings")}
          style={[styles.topButton, topEdge, edge(TOP_BUTTON_SIZE * optionsOffset)]}>
          <Ionicons name="ellipsis-horizontal-outline" color={P.paper} size={iconSize.md} accessibilityElementsHidden />
        </Pressable>
      </> : null}
      {title || publisher || post.sponsored || caption ? <View pointerEvents="box-none"
        testID="publication-player-editorial" style={[styles.info, compact && styles.compactInfo, { top: top + 48, left: left + 12, right: right + 12 }]}>
        {title ? <PublicationText testID="publication-player-title" color={P.paper} variant="h2" style={PUBLICATION_OVERLAY_TEXT} numberOfLines={compact ? 1 : 2}>{title}</PublicationText> : null}
        {publisher ? <View style={[styles.byline, { flexDirection: direction }]}>
          {official ? <OfficialAvatar size={OFFICIAL_AVATAR.publication} testID="publication-player-official-avatar" /> : post.channelAvatar ?
            <AppImage uri={mediaUrl(post.channelAvatar)} decorative contentFit="cover" style={styles.avatar} /> : null}
          <View style={styles.publisherCopy}>
            <PublicationText color={P.paper} variant="body" style={PUBLICATION_OVERLAY_TEXT} numberOfLines={1}>{publisher}</PublicationText>
            {post.sponsored ? <PublicationText color={P.paper} variant="caption" style={PUBLICATION_OVERLAY_TEXT} numberOfLines={2}>{post.sponsorName ? t("publication.sponsoredBy", { name: post.sponsorName }) : t("publication.sponsoredInfo")}</PublicationText> : null}
          </View>
        </View> : post.sponsored ? <PublicationText color={P.paper} variant="caption" style={PUBLICATION_OVERLAY_TEXT} numberOfLines={2}>{post.sponsorName ? t("publication.sponsoredBy", { name: post.sponsorName }) : t("publication.sponsoredInfo")}</PublicationText> : null}
        {caption ? controls && description && !menu && !compact ? <Pressable accessibilityRole="button"
          accessibilityLabel={caption} accessibilityState={{ expanded }} testID="publication-player-caption"
          onPress={() => setExpanded(value => !value)} style={styles.caption}>
          <PublicationText testID="publication-player-description" color={P.paper} variant="caption" style={PUBLICATION_OVERLAY_TEXT} numberOfLines={expanded ? 5 : 1}>{caption}</PublicationText>
          <PublicationText color={P.paper} variant="caption" style={PUBLICATION_OVERLAY_TEXT}>{t(expanded ? "publication.captionLess" : "reel.captionMore")}</PublicationText>
        </Pressable> : <PublicationText testID="publication-player-description" color={P.paper} variant="caption"
          style={PUBLICATION_OVERLAY_TEXT} numberOfLines={compact ? 1 : 2}>{caption}</PublicationText> : null}
      </View> : null}
      {controls && !menu && !failed ? <View pointerEvents="box-none" style={[styles.middle, { top: top + TOP_BUTTON_SIZE, bottom, left, right }]}>
        {upNext ? <View style={styles.upNext} testID="publication-player-up-next">
          <PublicationText variant="label" color={C.progress}>{t("publication.playerUpNext")}</PublicationText>
          <PublicationText color={P.paper} align="center" numberOfLines={2} variant="bodyStrong">{nextTitle}</PublicationText>
          {upNext.channelName ? <PublicationText color={P.paper} variant="caption">{upNext.channelName}</PublicationText> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t("publication.playerPlayNext")} onPress={() => advance(upNext)} style={styles.play}>
            <Ionicons name="play-outline" color={P.paper} size={iconSize.lg} accessibilityElementsHidden />
          </Pressable>
          <View style={styles.countdown}><View style={[styles.progress, { width: `${100 * countdown}%` }]} /></View>
          <Pressable accessibilityRole="button" onPress={cancelNext} style={styles.button} testID="publication-player-cancel-next">
            <PublicationText color={P.paper} variant="bodyStrong">{t("common.cancel")}</PublicationText>
          </Pressable>
        </View> : <View style={styles.transport}>
          {skipButton(-10, "publication-player-rewind", t("publication.playerRewind"))}
          <Pressable testID="publication-player-play" accessibilityRole="button"
            accessibilityLabel={t(ended ? "publication.playerReplay" : paused ? "social.play" : "social.pause")}
            onPress={togglePlayback} style={styles.play}>
            <Ionicons name={ended ? "refresh-outline" : paused ? "play-outline" : "pause-outline"} color={P.paper} size={iconSize.xl} accessibilityElementsHidden />
          </Pressable>
          {skipButton(10, "publication-player-forward", t("publication.playerForward"))}
        </View>}
      </View> : null}
      {!failed && (controls || panel) ? <View pointerEvents="box-none" testID="publication-player-footer"
        style={[styles.footer, { paddingBottom: bottom, paddingLeft: left, paddingRight: right }]}>
        {controls && !failed ? <>
          {menu ? <PublicationPlayerSettings menu={menu} resolution={resolution} speed={speed} status={status}
            onMenu={setMenu} onSpeed={value => { setSpeed(value); setMenu(null); }} /> : null}
          <View style={styles.bar}>
            <View
              style={styles.seek}
              onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => Boolean(duration && trackWidth)}
              onResponderGrant={({ nativeEvent: event }) => {
                seekPageStart.current = event.pageX - event.locationX;
                setDragProgress(fraction(event.locationX));
              }}
              onResponderMove={(event) => setDragProgress(fraction(event.nativeEvent.pageX - seekPageStart.current))}
              onResponderRelease={(event) => {
                seek(fraction(event.nativeEvent.pageX - seekPageStart.current) * duration);
                setDragProgress(null);
              }}
              onResponderTerminate={() => setDragProgress(null)}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={t("publication.playerProgress")}
              accessibilityState={{ disabled: !duration }}
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(progress * 100),
              }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => skip(event.nativeEvent.actionName === "increment" ? 10 : -10)}
              testID="publication-player-seek"
            >
              <View pointerEvents="none" style={styles.seekLine}>
                <View style={styles.track}><View style={[styles.played, { width: `${progress * 100}%` }]} /></View>
                {duration > 0 ? <View style={[styles.thumb, { left: `${progress * 100}%` }]} /> : null}
              </View>
            </View>
            <PublicationText color={P.paper} variant="caption" style={[styles.clock, PUBLICATION_OVERLAY_TEXT]}>−{videoClock(duration * (1 - progress))}</PublicationText>
            <Pressable accessibilityRole="button" accessibilityLabel={t(muted ? "publication.unmute" : "publication.mute")}
              onPress={() => setMuted(value => !value)} style={styles.button} testID="publication-player-mute">
              <Ionicons name={muted ? "volume-mute-outline" : "volume-high-outline"} color={P.paper} size={iconSize.md} accessibilityElementsHidden />
            </Pressable>
          </View>
        </> : null}
        {panel ? <PublicationPlayerPanel key={panel} panel={panel} post={post} videos={videos} status={relatedStatus} compact={compact}
          onDismiss={() => setPanel(null)} onRetry={onRetryRelated} onVideo={advance} onProduct={id => exitWith(state => onProduct(id, state))} /> : null}
        <PublicationPlayerActions panel={panel} hasProducts={hasProducts} showVideos={canFindRelated}
          onPanel={togglePanel} onLearnMore={() => exitWith(onLearnMore)} />
      </View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.backdrop },
  topWash: { ...StyleSheet.absoluteFill, bottom: undefined },
  bottomWash: { ...StyleSheet.absoluteFill, top: undefined },
  topButton: { position: "absolute", zIndex: 1, width: TOP_BUTTON_SIZE, height: TOP_BUTTON_SIZE,
    borderRadius: TOP_BUTTON_SIZE / 2, justifyContent: "center", alignItems: "center" },
  ccBadge: { borderWidth: 1, borderColor: P.paper, borderRadius: RADIUS.xs, paddingHorizontal: 4 },
  ccOn: { backgroundColor: P.paper },
  info: { position: "absolute", gap: 6 },
  compactInfo: { gap: 2 },
  byline: { alignItems: "flex-start", gap: 8 },
  publisherCopy: { flex: 1, gap: 2 },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  caption: { minHeight: 36, alignSelf: "stretch", justifyContent: "center" },
  middle: { ...StyleSheet.absoluteFill, justifyContent: "center", alignItems: "center" },
  transport: { flexDirection: "row", direction: "ltr", alignItems: "center", gap: 12 },
  play: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  skip: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  upNext: { alignItems: "center", borderRadius: RADIUS.sm, backgroundColor: veil(0.82), width: "78%", maxWidth: 300, gap: 4, padding: 8 },
  countdown: { width: 64, height: 3, overflow: "hidden", borderRadius: 2, backgroundColor: C.track },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0 },
  bar: { flexDirection: "row", direction: "ltr", alignItems: "center", gap: 4, paddingHorizontal: 10 },
  button: { minWidth: 44, minHeight: 44, paddingHorizontal: 4, justifyContent: "center", alignItems: "center" },
  seek: { flex: 1, height: 44, justifyContent: "center", marginHorizontal: 6 },
  seekLine: { justifyContent: "center" },
  thumb: { position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: P.paper, transform: [{ translateX: -6 }] },
  clock: { fontVariant: ["tabular-nums"] },
  track: { height: 5, backgroundColor: C.seekTrack, borderRadius: 2, overflow: "hidden" },
  played: { height: "100%", backgroundColor: P.paper },
  progress: { height: "100%", backgroundColor: C.progress },
  message: { alignItems: "center", gap: 4, padding: 12, borderRadius: RADIUS.md, backgroundColor: veil(0.54) },
});
