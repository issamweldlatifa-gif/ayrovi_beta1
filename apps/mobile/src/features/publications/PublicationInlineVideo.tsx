import { useEffect, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { mediaUrl } from '@/api/client';
import { PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import type { PublicationPlayback } from './PublicationFullscreenVideo';
import { PublicationText } from './publicationDesign';

export function PublicationInlineVideo({ url, fit, muted, paused, position }: {
  url: string; fit: 'contain' | 'cover'; muted: boolean; paused: boolean; position?: RefObject<PublicationPlayback>;
}) {
  const t = useT();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = useVideoPlayer({ uri: mediaUrl(url) }, instance => {
    instance.loop = true;
    instance.muted = true;
    if (position) {
      instance.currentTime = position.current.time;
      instance.timeUpdateEventInterval = 0.25;
    }
  });
  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status }) => setFailed(status === 'error'));
    const progressSub = position && player.addListener('timeUpdate', ({ currentTime }) => {
      if (Number.isFinite(currentTime)) position.current = { ...position.current, time: currentTime };
    });
    return () => { statusSub.remove(); progressSub?.remove(); };
  }, [player, position]);
  useEffect(() => {
    player.muted = muted;
    if (paused) player.pause(); else player.play();
  }, [player, muted, paused]);
  return <>
    <VideoView player={player} style={[StyleSheet.absoluteFill, !ready && styles.buffering]} surfaceType="textureView"
      pointerEvents="none" nativeControls={false} contentFit={fit} onFirstFrameRender={() => setReady(true)} />
    {failed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.error]}>
      <PublicationText variant="caption" color={P.paper} style={styles.message}>{t('publication.videoError')}</PublicationText>
    </View> : null}
  </>;
}

const styles = StyleSheet.create({
  buffering: { opacity: 0 },
  error: { justifyContent: 'flex-end' },
  message: { padding: 8, backgroundColor: P.viewerDarkSurface },
});
