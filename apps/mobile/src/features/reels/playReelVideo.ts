import { Platform } from "react-native";
import type { VideoPlayer, VideoView } from "expo-video";

/** Expo's web play() wrapper discards the DOM promise. Own it through the public
 * VideoView nativeRef so normal pause/unmount AbortErrors never become uncaught rejections. */
export function playReelVideo(
  player: VideoPlayer,
  view: VideoView | null,
  onFailure: () => void
) {
  try {
    if (Platform.OS === "web") {
      const video = view?.nativeRef.current as
        | HTMLVideoElement
        | null
        | undefined;
      if (!video) return;
      void video.play().catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") onFailure();
      });
    } else player.play();
  } catch {
    onFailure();
  }
}

/** Retry reloads but never auto-plays before the media is ready (Expo web replace does). */
export async function reloadReelVideo(
  player: VideoPlayer,
  view: VideoView | null,
  uri: string
) {
  if (Platform.OS !== "web") {
    await player.replaceAsync({ uri });
    return;
  }
  const video = view?.nativeRef.current as HTMLVideoElement | null | undefined;
  if (!video) throw new Error("Video view is not mounted");
  video.pause();
  video.src = uri;
  video.load();
}
