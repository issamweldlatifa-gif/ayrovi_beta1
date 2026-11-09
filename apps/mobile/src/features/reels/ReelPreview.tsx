import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { mediaUrl } from "@/api/client";
import { playReelVideo, reloadReelVideo } from "./playReelVideo";
import { useReelPlaybackStatus } from "./useReelPlaybackStatus";

/** Mounted only for the visible preview. No sound and no fake impression mutation. */
export function ReelPreview({
  uri,
  playing,
}: {
  uri: string;
  playing: boolean;
}) {
  const videoView = useRef<VideoView>(null);
  const player = useVideoPlayer(null, (instance) => {
    instance.muted = true;
    instance.loop = true;
  });
  const playback = useReelPlaybackStatus(
    player,
    playing,
    mediaUrl(uri),
    videoView
  );
  useEffect(() => {
    if (!player) return;
    void reloadReelVideo(player, videoView.current, mediaUrl(uri)).catch(playback.reportError);
  }, [player, uri, playback.reportError]);
  useEffect(() => {
    if (!player) return;
    if (playing && playback.status === "readyToPlay")
      playReelVideo(player, videoView.current, playback.reportError);
    else player.pause();
  }, [player, playing, playback.status, playback.reportError]);
  return player ? (
    <View testID="reel-preview-surface" pointerEvents="none" collapsable={false} style={StyleSheet.absoluteFill}>
      <VideoView
        ref={videoView}
        pointerEvents="none"
        surfaceType="textureView"
        testID="reel-preview-video"
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
      />
    </View>
  ) : null;
}
