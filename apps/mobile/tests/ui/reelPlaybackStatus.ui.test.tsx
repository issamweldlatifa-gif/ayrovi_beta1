import { act, renderHook } from "@testing-library/react-native";
import type { VideoPlayer } from "expo-video";
import {
  REEL_LOAD_DEADLINE_MS,
  useReelPlaybackStatus,
} from "../../src/features/reels/useReelPlaybackStatus";

function fixture() {
  let listener: ((event: { status: string }) => void) | undefined;
  const remove = jest.fn(() => {
    listener = undefined;
  });
  const replaceAsync = jest.fn().mockResolvedValue(undefined);
  const player = {
    status: "loading",
    addListener: jest.fn((_: string, fn: typeof listener) => {
      listener = fn;
      return { remove };
    }),
    replaceAsync,
  } as unknown as VideoPlayer;
  return {
    player,
    remove,
    replaceAsync,
    emit: (status: string) => listener?.({ status }),
  };
}
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it("reports loading, real native errors and successful recovery after an explicit retry", async () => {
  const f = fixture();
  const { result, unmount } = renderHook(() =>
    useReelPlaybackStatus(f.player, true, "/real.mp4")
  );
  expect(result.current.status).toBe("loading");
  act(() => f.emit("error"));
  expect(result.current.status).toBe("error");
  await act(async () => {
    await result.current.retry();
  });
  expect(f.replaceAsync).toHaveBeenCalledWith({ uri: "/real.mp4" });
  expect(result.current.status).toBe("loading");
  act(() => f.emit("readyToPlay"));
  expect(result.current.status).toBe("readyToPlay");
  unmount();
  expect(f.remove).toHaveBeenCalledTimes(1);
});
it("does not leave a stalled request as an endless black screen, and clears deadlines on unmount", () => {
  jest.useFakeTimers();
  const f = fixture();
  const { result, unmount } = renderHook(() =>
    useReelPlaybackStatus(f.player, true, "/real.mp4")
  );
  act(() => jest.advanceTimersByTime(REEL_LOAD_DEADLINE_MS));
  expect(result.current.status).toBe("error");
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});
it("does not keep listening/loading/retrying while its page is inactive", async () => {
  jest.useFakeTimers();
  const f = fixture();
  const { result, rerender } = renderHook(
    ({ active }: { active: boolean }) =>
      useReelPlaybackStatus(f.player, active, "/real.mp4"),
    { initialProps: { active: true } }
  );
  rerender({ active: false });
  expect(result.current.status).toBe("idle");
  expect(f.remove).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  await act(async () => {
    await result.current.retry();
  });
  expect(f.replaceAsync).not.toHaveBeenCalled();
});
it("handles an explicit retry rejection instead of throwing or pretending playback succeeded", async () => {
  const f = fixture();
  f.replaceAsync.mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() =>
    useReelPlaybackStatus(f.player, true, "/real.mp4")
  );
  await act(async () => {
    await result.current.retry();
  });
  expect(result.current.status).toBe("error");
});
