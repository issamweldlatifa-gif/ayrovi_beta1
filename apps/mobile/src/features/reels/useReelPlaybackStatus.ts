import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Platform } from "react-native";
import { reloadReelVideo } from "./playReelVideo";
import type { VideoPlayer, VideoPlayerStatus, VideoView } from "expo-video";

export const REEL_LOAD_DEADLINE_MS = 20_000;

/** Native player events + bounded waiting. No fake success and no automatic retry loop. */
export function useReelPlaybackStatus(
  player: VideoPlayer | null,
  active: boolean,
  uri: string,
  view?: RefObject<VideoView | null>
) {
  const [status, setStatus] = useState<VideoPlayerStatus>("loading");
  const current = useRef({ player, active, uri });
  current.current = { player, active, uri };
  const mounted = useRef(false);
  const request = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  useEffect(() => {
    request.current++;
    if (!player || !active) {
      setStatus("idle");
      return;
    }
    const subscription = player.addListener("statusChange", (event) =>
      setStatus(event.status)
    );
    setStatus(player.status);
    const video =
      Platform.OS === "web"
        ? (view?.current?.nativeRef.current as HTMLVideoElement | undefined)
        : undefined;
    const ready = () => setStatus("readyToPlay");
    const failed = () => setStatus("error");
    video?.addEventListener("canplay", ready);
    video?.addEventListener("error", failed);
    return () => {
      subscription.remove();
      video?.removeEventListener("canplay", ready);
      video?.removeEventListener("error", failed);
    };
  }, [player, active, uri, view]);
  useEffect(() => {
    if (!active || !player || (status !== "loading" && status !== "idle"))
      return;
    const timeout = setTimeout(() => setStatus("error"), REEL_LOAD_DEADLINE_MS);
    return () => clearTimeout(timeout);
  }, [active, player, status]);
  const retry = useCallback(async () => {
    if (!player || !active) return;
    const attempt = ++request.current;
    setStatus("loading");
    try {
      await reloadReelVideo(player, view?.current ?? null, uri);
    } catch {
      if (
        mounted.current &&
        request.current === attempt &&
        current.current.player === player &&
        current.current.active
      )
        setStatus("error");
    }
  }, [player, active, uri, view]);
  const reportError = useCallback(() => {
    if (
      mounted.current &&
      current.current.active &&
      current.current.player === player &&
      current.current.uri === uri
    )
      setStatus("error");
  }, [player, uri]);
  return { status, retry, reportError };
}
