import { afterEach, expect, test, vi } from "vitest";
import type { VideoPlayer, VideoView } from "expo-video";
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
import {
  playReelVideo,
  reloadReelVideo,
} from "../src/features/reels/playReelVideo";
afterEach(() => vi.restoreAllMocks());
const player = () =>
  ({ play: vi.fn(), replaceAsync: vi.fn() } as unknown as VideoPlayer);
const view = (video: object) =>
  ({ nativeRef: { current: video } } as unknown as VideoView);
test("owns web play promises and ignores only intentional pause/unmount AbortErrors", async () => {
  const failure = vi.fn();
  const play = vi
    .fn()
    .mockRejectedValue(
      Object.assign(new Error("paused"), { name: "AbortError" })
    );
  playReelVideo(player(), view({ play }), failure);
  await Promise.resolve();
  expect(play).toHaveBeenCalledTimes(1);
  expect(failure).not.toHaveBeenCalled();
  play.mockRejectedValue(
    Object.assign(new Error("blocked"), { name: "NotAllowedError" })
  );
  playReelVideo(player(), view({ play }), failure);
  await Promise.resolve();
  expect(failure).toHaveBeenCalledTimes(1);
});
test("retry reloads the same source without Expo web replaceAsync eager autoplay", async () => {
  const p = player(),
    video = { pause: vi.fn(), load: vi.fn(), play: vi.fn(), src: "" };
  await reloadReelVideo(p, view(video), "/real.mp4");
  expect(video.src).toBe("/real.mp4");
  expect(video.pause).toHaveBeenCalledTimes(1);
  expect(video.load).toHaveBeenCalledTimes(1);
  expect(video.play).not.toHaveBeenCalled();
  expect(p.replaceAsync).not.toHaveBeenCalled();
});
test("a missing view cannot turn a retry into a false success", async () => {
  await expect(reloadReelVideo(player(), null, "/real.mp4")).rejects.toThrow(
    "not mounted"
  );
});
