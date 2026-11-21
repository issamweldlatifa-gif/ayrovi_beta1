import { useCallback, useEffect, useEffectEvent, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { AppState, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { mediaUrl } from "@/api/client";
import type { ReferencePublication } from "@/api/referencePublications";
import { AppImage } from "@/design/appImage";
import { OFFICIAL_AVATAR, OfficialAvatar } from "@/design/OfficialAvatar";
import { rowDirectionFor } from "@/design/layoutLogic";
import { useTheme } from "@/design/theme";
import { RADIUS, veil } from "@/design/tokens.mobile";
import { useI18n } from "@/i18n";
import { PublicationIcon, PublicationText } from "./publicationDesign";
import { PublicationPlayerActions, PublicationPlayerPanel, type PlayerPanel, type RelatedStatus } from "./PublicationPlayerPanels";
import { PUBLICATION_PALETTE as P, PUBLICATION_PLAYER as C } from "./publicationTokens";
import { PublicationPlayerSettings, type PlayerMenu } from "./PublicationPlayerSettings";
import { OFFICIAL_PUBLISHER_ID, OFFICIAL_PUBLISHER_NAME } from "./officialPublisher";
import { PublicationPauseGlyph, PublicationSkipGlyph } from "./PublicationTransportGlyphs";
import { isPublicationDismissSwipe, UP_NEXT_MS, videoClock } from "./publicationVideoQueue";

export type PublicationPlayback = { time: number; muted: boolean };
const TOP_BUTTON_SIZE = 44;
const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max);

export function PublicationFullscreenVideo({ post, media, start, videos, relatedStatus, back, next,
  onClose, onLearnMore, onProduct, onSelectVideo, onRetryRelated,
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
}) {
  const { t, locale } = useI18n();
  const { isRTL } = useTheme();
  const { top, bottom, left, right } = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 450;
  const direction = rowDirectionFor(isRTL);
  const [ready, setReady] = useState(false);
  const [footerHeight, setFooterHeight] = useState(bottom + 62);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [muted, setMuted] = useState(start.muted);
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<PlayerPanel | null>(null);
  const [menu, setMenu] = useState<PlayerMenu | null>(null);
  const [time, setTime] = useState(start.time);
  const [duration, setDuration] = useState(0);
  const [resolution, setResolution] = useState(0);
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
  const title = post.title || post.subtitle;
  const caption = post.description || (post.subtitle !== title ? post.subtitle : "");
  const official = post.channelId === OFFICIAL_PUBLISHER_ID;
  const publisher = official ? OFFICIAL_PUBLISHER_NAME : post.channelName;
  const hasProducts = post.products.length > 0;
  const canFindRelated = post.products.some(product => product.available);
  const player = useVideoPlayer({ uri: mediaUrl(url) }, instance => {
    instance.muted = start.muted;
    instance.currentTime = start.time;
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.25;
  });
  useEffect(() => {
    const refresh = () => {
      const receivedDuration = player.duration;
      setDuration(Number.isFinite(receivedDuration) && receivedDuration > 0 ? receivedDuration : 0);
      const size = player.videoTrack?.size;
      setResolution(size ? Math.min(size.width, size.height) : 0);
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
        updateTime(player.duration);
        setEnded(true);
        setVisible(true);
        setMenu(null);
      }),
    ];
    return () => subs.forEach(item => item.remove());
  }, [player]);
  useEffect(() => { player.muted = muted; }, [muted, player]);
  useEffect(() => {
    if (foreground && !paused && !ended) player.play();
    else player.pause();
  }, [foreground, paused, player, ended]);
  useEffect(() => { player.playbackRate = speed; }, [speed, player]);

  const playback = useCallback((): PublicationPlayback => ({ time: playhead.current, muted }), [muted]);
  const upNext = ended && !cancelled && status !== "error" ? next : undefined;
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
  const topEdge = { top: top + 12, ...edge(0) };
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
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: footerHeight }]}>
        {poster && !ready ? <AppImage uri={mediaUrl(poster)} decorative contentFit="contain" style={StyleSheet.absoluteFill} /> : null}
        <VideoView player={player} style={[StyleSheet.absoluteFill, !ready && styles.buffering]}
          surfaceType="textureView" nativeControls={false} contentFit="contain" testID="publication-player-video"
          onFirstFrameRender={() => setReady(true)} />
      </View>
      {controls || upNext ? <LinearGradient pointerEvents="none" colors={[veil(0.42), veil(0.03), veil(0.25)]} style={StyleSheet.absoluteFill} /> : null}
      <View style={StyleSheet.absoluteFill} testID="publication-player-dismiss-region" {...(!panel && !menu ? swipe.panHandlers : {})}>
        <Pressable onPress={toggleControls} accessibilityRole="button"
          accessibilityLabel={t(panel || menu || visible ? "publication.playerHide" : "publication.playerShow")}
          style={StyleSheet.absoluteFill} testID="publication-player-surface" />
      </View>
      {status === "error" ? <PublicationText accessibilityRole="alert" color={P.paper} style={[styles.error, { marginTop: top + 60 }]}>{t("publication.videoError")}</PublicationText> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={t("publication.playerExit")} testID="publication-player-exit"
        onPress={close} style={[styles.topButton, topEdge]}>
        <PublicationIcon name="close" color={P.paper} size={24} />
      </Pressable>
      {controls ? <>
        {hasSubtitles ? <Pressable accessibilityRole="togglebutton" accessibilityLabel={t("publication.playerSubtitles")}
          accessibilityState={{ checked: subtitlesOn }} testID="publication-player-cc" onPress={toggleSubtitles}
          style={[styles.topButton, topEdge, edge(TOP_BUTTON_SIZE)]}>
          <View style={[styles.ccBadge, subtitlesOn && styles.ccOn]}><PublicationText color={subtitlesOn ? P.ink : P.paper} variant="captionStrong">CC</PublicationText></View>
        </Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t("publication.playerSettings")} testID="publication-player-options"
          accessibilityState={{ expanded: !!menu }} onPress={() => setMenu(value => value ? null : "settings")}
          style={[styles.topButton, topEdge, edge(TOP_BUTTON_SIZE * optionsOffset)]}>
          <PublicationIcon name="ellipsis-horizontal-outline" color={P.paper} size={22} />
        </Pressable>
      </> : null}
      {controls && !menu && !compact && status !== "error" ? <View pointerEvents="box-none" style={[styles.info, { top: top + 56, left: left + 12, right: right + 12 }]}>
        {title ? <PublicationText testID="publication-player-title" color={P.paper} variant="h2" numberOfLines={2}>{title}</PublicationText> : null}
        {publisher ? <View style={[styles.byline, { flexDirection: direction }]}>
          {official ? <OfficialAvatar size={OFFICIAL_AVATAR.publication} testID="publication-player-official-avatar" /> : post.channelAvatar ?
            <AppImage uri={mediaUrl(post.channelAvatar)} decorative contentFit="cover" style={styles.avatar} /> : null}
          <View style={styles.publisherCopy}>
            <PublicationText color={P.paper} variant="body" numberOfLines={1}>{publisher}</PublicationText>
            {post.sponsored ? <PublicationText color={P.paper} variant="caption" numberOfLines={2}>{post.sponsorName ? t("publication.sponsoredBy", { name: post.sponsorName }) : t("publication.sponsoredInfo")}</PublicationText> : null}
          </View>
        </View> : post.sponsored ? <PublicationText color={P.paper} variant="caption" numberOfLines={2}>{post.sponsorName ? t("publication.sponsoredBy", { name: post.sponsorName }) : t("publication.sponsoredInfo")}</PublicationText> : null}
        {caption ? <Pressable accessibilityRole="button" accessibilityLabel={caption} accessibilityState={{ expanded }}
          testID="publication-player-caption" onPress={() => setExpanded(value => !value)} style={styles.caption}>
          <PublicationText testID="publication-player-description" color={P.paper} variant="caption" numberOfLines={expanded ? 5 : 1}>{caption}</PublicationText>
          <PublicationText color={P.paper} variant="caption">{t(expanded ? "publication.captionLess" : "reel.captionMore")}</PublicationText>
        </Pressable> : null}
      </View> : null}
      {controls && !menu && status !== "error" ? <View pointerEvents="box-none" style={[styles.middle, { top: top + TOP_BUTTON_SIZE, bottom: footerHeight, left, right }]}>
        {upNext ? <View style={styles.upNext} testID="publication-player-up-next">
          <PublicationText variant="label" color={C.progress}>{t("publication.playerUpNext")}</PublicationText>
          <PublicationText color={P.paper} align="center" numberOfLines={2} variant="bodyStrong">{nextTitle}</PublicationText>
          {upNext.channelName ? <PublicationText color={P.paper} variant="caption">{upNext.channelName}</PublicationText> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t("publication.playerPlayNext")} onPress={() => advance(upNext)} style={styles.play}>
            <PublicationIcon name="play-outline" color={P.paper} size={26} />
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
            {!ended && !paused ? <PublicationPauseGlyph /> : <PublicationIcon name={ended ? "refresh-outline" : "play-outline"} color={P.paper} size={26} />}
          </Pressable>
          {skipButton(10, "publication-player-forward", t("publication.playerForward"))}
        </View>}
      </View> : null}
      <View pointerEvents="box-none" onLayout={event => setFooterHeight(event.nativeEvent.layout.height)} style={[styles.footer, { paddingBottom: bottom, paddingLeft: left, paddingRight: right }]}>
        {controls ? <>
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
            <PublicationText color={P.paper} variant="caption" style={styles.clock}>−{videoClock(duration * (1 - progress))}</PublicationText>
            <Pressable accessibilityRole="button" accessibilityLabel={t(muted ? "publication.unmute" : "publication.mute")}
              onPress={() => setMuted(value => !value)} style={styles.button} testID="publication-player-mute">
              <PublicationIcon name={muted ? "volume-mute-outline" : "volume-high-outline"} color={P.paper} size={20} />
            </Pressable>
          </View>
        </> : null}
        {panel ? <PublicationPlayerPanel key={panel} panel={panel} post={post} videos={videos} status={relatedStatus} compact={compact}
          onDismiss={() => setPanel(null)} onRetry={onRetryRelated} onVideo={advance} onProduct={id => exitWith(state => onProduct(id, state))} /> : null}
        <PublicationPlayerActions panel={panel} hasProducts={hasProducts} showVideos={canFindRelated}
          onPanel={togglePanel} onLearnMore={() => exitWith(onLearnMore)} />
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.backdrop },
  buffering: { opacity: 0 },
  topButton: { position: "absolute", zIndex: 1, width: TOP_BUTTON_SIZE, height: TOP_BUTTON_SIZE,
    borderRadius: TOP_BUTTON_SIZE / 2, justifyContent: "center", alignItems: "center" },
  ccBadge: { borderWidth: 1, borderColor: P.paper, borderRadius: RADIUS.xs, paddingHorizontal: 4 },
  ccOn: { backgroundColor: P.paper },
  info: { position: "absolute", gap: 8 },
  byline: { alignItems: "flex-start", gap: 8 },
  publisherCopy: { flex: 1, gap: 2 },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  caption: { minHeight: 36, alignSelf: "stretch", justifyContent: "center" },
  middle: { ...StyleSheet.absoluteFill, justifyContent: "center", alignItems: "center" },
  transport: { flexDirection: "row", direction: "ltr", alignItems: "center", gap: 12 },
  play: { width: 52, height: 52, borderRadius: 26, borderWidth: 2,
    borderColor: P.paper, alignItems: "center", justifyContent: "center" },
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
  track: { height: 4, backgroundColor: C.seekTrack, borderRadius: 2, overflow: "hidden" },
  played: { height: "100%", backgroundColor: P.paper },
  progress: { height: "100%", backgroundColor: C.progress },
  error: { alignSelf: "center", padding: 8, backgroundColor: C.menu },
});
