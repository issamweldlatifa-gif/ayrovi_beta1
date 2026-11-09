/** Only mount for the active card: a null source STILL allocates a native player. */
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { BrandLoadingIndicator } from '@/design/LoadingScreen';
import { useI18n, useT } from '@/i18n';
import { veil, VIDEO_BACKDROP } from '@/design/tokens.mobile';
import { playReelVideo, reloadReelVideo } from './playReelVideo';
import { reelPlaybackTiming } from './reelPlaybackTiming';
import { REEL_LOAD_DEADLINE_MS, useReelPlaybackStatus } from './useReelPlaybackStatus';

export function ReelPlayback({ id, uri, paused, onPausedChange, soundOn, blocked, contentFit = 'contain' }: {
  id: string; uri: string; paused: boolean; onPausedChange: (paused: boolean) => void;
  soundOn: boolean; blocked: boolean; contentFit?: 'cover' | 'contain';
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const view = useRef<VideoView>(null);
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
  const playback = useReelPlaybackStatus(player, true, uri, view);
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
    if (firstFrame || paused || blocked || !foreground || playback.status !== 'readyToPlay') return;
    const timer = setTimeout(playback.reportError, REEL_LOAD_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [firstFrame, paused, blocked, foreground, playback.status, playback.reportError]);
  useEffect(() => {
    if (!player) return;
    if (playback.status === 'readyToPlay' && !paused && foreground && !blocked)
      playReelVideo(player, view.current, playback.reportError);
    else player.pause();
  }, [player, playback.status, playback.reportError, paused, foreground, blocked]);
  useEffect(() => { if (player) player.muted = !soundOn; }, [player, soundOn]);
  const waiting = foreground && !paused && !blocked && (playback.status === 'loading' || playback.status === 'idle' || (!firstFrame && playback.status === 'readyToPlay'));
  useEffect(() => {
    setShowLoading(false);
    if (!waiting) return;
    const timer = setTimeout(() => setShowLoading(true), 250);
    return () => clearTimeout(timer);
  }, [waiting, uri]);
  return <>
    {player ? <View testID={`reel-video-surface-${id}`} pointerEvents="none" collapsable={false} style={[StyleSheet.absoluteFill, { opacity: firstFrame ? 1 : 0 }]}><VideoView ref={view} player={player} pointerEvents="none" surfaceType="textureView"
      onFirstFrameRender={() => { setFirstFrame(true); finishTiming.current?.(true); }}
      style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', backgroundColor: VIDEO_BACKDROP }]} contentFit={contentFit} nativeControls={false} /></View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={paused ? t('social.play') : t('social.pause')}
      onPress={() => onPausedChange(!paused)} style={StyleSheet.absoluteFill} />
    {waiting && showLoading && <View pointerEvents="none"
      testID={`reel-loading-${id}`} style={[StyleSheet.absoluteFill, styles.center]} accessibilityRole="progressbar">
      <BrandLoadingIndicator size={64} />
    </View>}
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
const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
