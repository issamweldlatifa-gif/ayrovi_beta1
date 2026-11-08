import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { mediaUrl } from "@/api/client";
import { playReelVideo } from "./playReelVideo";
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
  const player = useVideoPlayer({ uri: mediaUrl(uri) }, (instance) => {
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
    if (playing && playback.status === "readyToPlay")
      playReelVideo(player, videoView.current, playback.reportError);
    else player.pause();
  }, [player, playing, playback.status, playback.reportError]);
  return player ? (
    <VideoView
      ref={videoView}
      testID="reel-preview-video"
      player={player}
      nativeControls={false}
      contentFit="cover"
      style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
    />
  ) : null;
}
