/**
 * Lecteur d'un Reel. Monté pour la carte ACTIVE et pour la SUIVANTE (`preload`) :
 * au plus deux lecteurs natifs vivants. La suivante charge sa source et son
 * premier image en pause — quand on glisse, la vidéo part tout de suite, sans
 * indicateur (correctif du 11/11 : la roue apparaissait sur chaque Reel).
 * A null source STILL allocates a native player: never mount it for far cards.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Pressable, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useReduceMotion } from '@/design/motion';
import { useDoubleTap } from '@/design/reactions/useDoubleTap';
import { useI18n, useT } from '@/i18n';
import { veil, VIDEO_BACKDROP } from '@/design/tokens.mobile';
import { playReelVideo, reloadReelVideo } from './playReelVideo';
import { reelPlaybackTiming } from './reelPlaybackTiming';
import { REEL_LOAD_DEADLINE_MS, useReelPlaybackStatus } from './useReelPlaybackStatus';

/** Attente RÉELLE avant de montrer quoi que ce soit : un chargement normal reste invisible. */
export const REEL_BUFFER_HINT_MS = 700;

export function ReelPlayback({ id, uri, paused, onPausedChange, soundOn, blocked, contentFit = 'contain', onVideoViewReady, preload = false, onDoubleTap }: {
  id: string; uri: string; paused: boolean; onPausedChange: (paused: boolean) => void;
  soundOn: boolean; blocked: boolean; contentFit?: 'cover' | 'contain';
  /** Expose la VideoView à l'appelant (plein écran natif, mesures). */
  onVideoViewReady?: (view: VideoView | null) => void;
  /** Carte SUIVANTE : charge source + premier image, reste en pause, aucun chrome. */
  preload?: boolean;
  /** Double-tap sur la vidéo (J'adore + cœurs) — position du doigt dans la vidéo. */
  onDoubleTap?: (x: number, y: number) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const view = useRef<VideoView>(null);
  // Enregistrement de la VideoView : le rail appelle enterFullscreen() dessus.
  // La ref est peuplée avant les effets — l'appelant reçoit la vue réelle.
  const ready = useRef(onVideoViewReady);
  ready.current = onVideoViewReady;
  useEffect(() => {
    ready.current?.(view.current);
    return () => ready.current?.(null);
  }, []);
  const [showLoading, setShowLoading] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);
  const finishTiming = useRef<((firstFrame: boolean) => void) | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  const player = useVideoPlayer(null, instance => {
    instance.loop = true;
    instance.muted = true;
  });
  const playback = useReelPlaybackStatus(player, !preload, uri, view);
  useEffect(() => {
    if (!player) return;
    setFirstFrame(false);
    const finish = reelPlaybackTiming.start();
    finishTiming.current = finish;
    void reloadReelVideo(player, view.current, uri).catch(playback.reportError);
    return () => { finishTiming.current?.(false); finishTiming.current = null; };
  }, [player, uri, playback.reportError]);
  // readyToPlay means buffered, not that a frame was actually displayed.
  useEffect(() => {
    if (preload || firstFrame || paused || blocked || !foreground || playback.status !== 'readyToPlay') return;
    const timer = setTimeout(playback.reportError, REEL_LOAD_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [firstFrame, paused, blocked, foreground, playback.status, playback.reportError]);
  useEffect(() => {
    if (!player) return;
    if (!preload && playback.status === 'readyToPlay' && !paused && foreground && !blocked)
      playReelVideo(player, view.current, playback.reportError);
    else player.pause();
  }, [player, playback.status, playback.reportError, paused, foreground, blocked, preload]);
  useEffect(() => { if (player) player.muted = !soundOn; }, [player, soundOn]);
  const waiting = !preload && foreground && !paused && !blocked && (playback.status === 'loading' || playback.status === 'idle' || (!firstFrame && playback.status === 'readyToPlay'));
  useEffect(() => {
    setShowLoading(false);
    if (!waiting) return;
    const timer = setTimeout(() => setShowLoading(true), REEL_BUFFER_HINT_MS);
    return () => clearTimeout(timer);
  }, [waiting, uri]);
  const onTap = useDoubleTap({ onSingle: () => onPausedChange(!paused), onDouble: onDoubleTap });
  return <>
    {player ? <View testID={`reel-video-surface-${id}`} pointerEvents="none" collapsable={false} style={[StyleSheet.absoluteFill, { opacity: firstFrame ? 1 : 0 }]}><VideoView ref={view} player={player} pointerEvents="none" surfaceType="textureView"
      onFirstFrameRender={() => { setFirstFrame(true); finishTiming.current?.(true); }}
      style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', backgroundColor: VIDEO_BACKDROP }]} contentFit={contentFit} nativeControls={false} /></View> : null}
    {preload ? null : <Pressable testID={`reel-tap-${id}`} accessibilityRole="button" accessibilityLabel={paused ? t('social.play') : t('social.pause')}
      accessibilityHint={onDoubleTap ? t('social.doubleTapLove') : undefined}
      onPress={onTap} style={StyleSheet.absoluteFill} />}
    {waiting && showLoading && <ReelBufferLine testID={`reel-loading-${id}`} color={theme.colors.onMedia} />}
    {playback.status === 'error' && <View testID={`reel-playback-error-${id}`}
      style={[StyleSheet.absoluteFill, styles.center, { padding: 24, gap: 16, backgroundColor: veil(0.75) }]}>
      <AppText color={theme.colors.onMedia} align="center">{locale === 'ar'
        ? 'تعذّر تشغيل الفيديو. ثبّت في الاتصال وعاود جرّب.'
        : 'Impossible de lire la vidéo. Vérifiez votre connexion et réessayez.'}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')}
        onPress={() => {
          finishTiming.current?.(false);
          finishTiming.current = reelPlaybackTiming.start();
          setFirstFrame(false);
          onPausedChange(false);
          void playback.retry();
        }}
        style={{ minHeight: 44, minWidth: 120, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.canvas, borderRadius: theme.radius.card }}>
        <AppText color={theme.colors.ink}>{t('common.retry')}</AppText>
      </Pressable>
    </View>}
  </>;
}
/**
 * Mise en mémoire tampon : un FILET au bas de la vidéo qui s'ouvre depuis le
 * centre (comme TikTok) — plus de roue au milieu de l'image. Le poster reste
 * visible dessous ; ce filet n'apparaît qu'après `REEL_BUFFER_HINT_MS`.
 */
function ReelBufferLine({ testID, color }: { testID: string; color: string }) {
  const reduce = useReduceMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduce, sweep]);
  return <View testID={testID} pointerEvents="none" accessibilityRole="progressbar" style={styles.bufferTrack}>
    {reduce
      // Moins de mouvement : un filet fixe, sans boucle.
      ? <View style={[styles.bufferLine, { backgroundColor: color }]} />
      : <Animated.View style={[styles.bufferLine, { backgroundColor: color,
          opacity: sweep.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.9, 0.5, 0] }),
          transform: [{ scaleX: sweep.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) }] }]} />}
  </View>;
}
const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  bufferTrack: { position: 'absolute', start: 0, end: 0, bottom: 0, height: 2, overflow: 'hidden' },
  bufferLine: { height: 2, width: '100%' },
});
