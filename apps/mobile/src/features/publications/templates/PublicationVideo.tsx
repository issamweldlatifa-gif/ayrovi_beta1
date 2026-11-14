/**
 * Vidéo d'un bloc Publication (modèle `media`) — lecture en boucle, muette au
 * départ, seulement quand le bloc est le plus visible de la page. Deux commandes
 * posées en bas à droite comme sur la planche Zalando : pause/lecture et son.
 * Ce sont des commandes du lecteur, pas des boutons d'interaction sociale.
 *
 * L'affiche (`poster`) reste dessous tant que la vidéo n'est pas prête : jamais
 * de rectangle noir au défilement.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { veil } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { playReelVideo, reloadReelVideo } from '@/features/reels/playReelVideo';
import { useReelPlaybackStatus } from '@/features/reels/useReelPlaybackStatus';
import { ReelGlyph } from '@/features/reels/ReelIcons';
import { PUBLICATION_PALETTE as P, PublicationIcon } from '../publicationDesign';

const CONTROL = 40;

export function PublicationVideo({
  uri,
  poster,
  active,
  label,
  testID,
}: {
  uri: string;
  poster: string;
  /** Bloc le plus visible ET écran au premier plan. */
  active: boolean;
  label: string;
  testID: string;
}) {
  const theme = useTheme();
  const t = useT();
  const view = useRef<VideoView>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const source = mediaUrl(uri);
  const player = useVideoPlayer(null, (instance) => {
    instance.muted = true;
    instance.loop = true;
  });
  const playback = useReelPlaybackStatus(player, active, source, view);

  useEffect(() => {
    if (!player) return;
    void reloadReelVideo(player, view.current, source).catch(playback.reportError);
  }, [player, source, playback.reportError]);

  useEffect(() => {
    if (!player) return;
    if (active && !paused && playback.status === 'readyToPlay') playReelVideo(player, view.current, playback.reportError);
    else player.pause();
  }, [player, active, paused, playback.status, playback.reportError]);

  useEffect(() => {
    if (player) player.muted = muted;
  }, [player, muted]);

  const ready = playback.status === 'readyToPlay';

  return (
    <View testID={testID} style={styles.fill}>
      {poster ? (
        <AppImage uri={mediaUrl(poster)} accessibilityLabel={label} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : null}
      {player ? (
        <VideoView
          ref={view}
          testID={`${testID}-player`}
          pointerEvents="none"
          surfaceType="textureView"
          player={player}
          nativeControls={false}
          contentFit="cover"
          style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]}
        />
      ) : null}
      <View style={[styles.controls, { right: theme.space[2], bottom: theme.space[2] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paused ? t('publication.videoPlay') : t('publication.videoPause')}
          testID={`${testID}-pause`}
          onPress={() => setPaused((value) => !value)}
          style={styles.control}
        >
          <PublicationIcon name={paused ? 'play-outline' : 'pause-outline'} size={theme.iconSize.sm} color={P.paper} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={muted ? t('publication.videoUnmute') : t('publication.videoMute')}
          testID={`${testID}-mute`}
          onPress={() => setMuted((value) => !value)}
          style={styles.control}
        >
          {/* 14/11 : le même haut-parleur PLEIN que le rail des Reels (une seule famille). */}
          <ReelGlyph name={muted ? 'muted' : 'sound'} size={theme.iconSize.sm} color={P.paper} filled />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  controls: { position: 'absolute', gap: 8 },
  control: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: CONTROL / 2,
    backgroundColor: veil(0.55),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
