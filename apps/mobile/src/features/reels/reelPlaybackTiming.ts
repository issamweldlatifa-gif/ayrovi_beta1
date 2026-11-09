/** Bounded process-local diagnostics. No URLs, IDs, account data or payloads. */
export function createReelPlaybackTiming(now = () => performance.now(), sink = (line: string) => console.info(line), enabled = () => process.env.EXPO_PUBLIC_REEL_TIMING_LOGS === 'true') {
  const totals = { firstFrames: 0, abandoned: 0, totalFirstFrameMs: 0, maxFirstFrameMs: 0 };
  return {
    start() {
      const started = now();
      let finished = false;
      return (firstFrame: boolean) => {
        if (finished) return;
        finished = true;
        const durationMs = Math.max(0, Math.round((now() - started) * 100) / 100);
        if (firstFrame) {
          totals.firstFrames++;
          totals.totalFirstFrameMs += durationMs;
          totals.maxFirstFrameMs = Math.max(totals.maxFirstFrameMs, durationMs);
        } else totals.abandoned++;
        try {
          if (enabled()) sink(JSON.stringify({ event: 'reel_playback_timing', outcome: firstFrame ? 'first_frame' : 'abandoned', durationMs }));
        } catch { /* Diagnostics must not break playback. */ }
      };
    },
    snapshot: () => ({ ...totals }),
  };
}
export const reelPlaybackTiming = createReelPlaybackTiming();
