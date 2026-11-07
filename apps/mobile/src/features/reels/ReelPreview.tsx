import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { mediaUrl } from '@/api/client';

/** Mounted only for the visible preview. No sound and no fake impression mutation. */
export function ReelPreview({
  uri,
  playing,
}: {
  uri: string;
  playing: boolean;
}) {
  const player = useVideoPlayer({ uri: mediaUrl(uri) }, (instance) => {
    instance.muted = true;
    instance.loop = true;
    if (playing) instance.play();
  });
  useEffect(() => {
    if (!player) return;
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);
  return player ? (
    <VideoView
      testID="reel-preview-video"
      player={player}
      nativeControls={false}
      contentFit="cover"
      style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
    />
  ) : null;
}
