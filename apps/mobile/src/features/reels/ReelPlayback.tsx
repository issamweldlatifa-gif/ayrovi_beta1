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
import { useReelPlaybackStatus } from './useReelPlaybackStatus';

export function ReelPlayback({ id, uri, paused, onPausedChange, soundOn, blocked, contentFit = 'contain' }: {
  id: string; uri: string; paused: boolean; onPausedChange: (paused: boolean) => void;
  soundOn: boolean; blocked: boolean; contentFit?: 'cover' | 'contain';
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const view = useRef<VideoView>(null);
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
    void reloadReelVideo(player, view.current, uri).catch(playback.reportError);
  }, [player, uri, playback.reportError]);
  useEffect(() => {
    if (!player) return;
    if (playback.status === 'readyToPlay' && !paused && foreground && !blocked)
      playReelVideo(player, view.current, playback.reportError);
    else player.pause();
  }, [player, playback.status, playback.reportError, paused, foreground, blocked]);
  useEffect(() => { if (player) player.muted = !soundOn; }, [player, soundOn]);
  return <>
    {player ? <VideoView ref={view} player={player} pointerEvents="none" surfaceType="textureView"
      style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', backgroundColor: VIDEO_BACKDROP }]} contentFit={contentFit} nativeControls={false} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={paused ? t('social.play') : t('social.pause')}
      onPress={() => onPausedChange(!paused)} style={StyleSheet.absoluteFill} />
    {(playback.status === 'loading' || playback.status === 'idle') && <View pointerEvents="none"
      testID={`reel-loading-${id}`} style={[StyleSheet.absoluteFill, styles.center]} accessibilityRole="progressbar">
      <BrandLoadingIndicator size={64} />
    </View>}
    {playback.status === 'error' && <View testID={`reel-playback-error-${id}`}
      style={[StyleSheet.absoluteFill, styles.center, { padding: 24, gap: 16, backgroundColor: veil(0.75) }]}>
      <AppText color={theme.colors.onMedia} align="center">{locale === 'ar'
        ? 'تعذّر تشغيل الفيديو. ثبّت في الاتصال وعاود جرّب.'
        : 'Impossible de lire la vidéo. Vérifiez votre connexion et réessayez.'}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')}
        onPress={() => { onPausedChange(false); void playback.retry(); }}
        style={{ minHeight: 44, minWidth: 120, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.canvas, borderRadius: theme.radius.card }}>
        <AppText color={theme.colors.ink}>{t('common.retry')}</AppText>
      </Pressable>
    </View>}
  </>;
}
const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
