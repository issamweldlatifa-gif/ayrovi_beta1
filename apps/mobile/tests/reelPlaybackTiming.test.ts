import { expect, it, vi } from 'vitest';
import { createReelPlaybackTiming } from '../src/features/reels/reelPlaybackTiming';
it('records a real first frame once, keeps bounded aggregates and detached snapshots',()=>{
  let now=10;const sink=vi.fn();
  const timing=createReelPlaybackTiming(()=>now,sink,()=>true);
  const finish=timing.start();now=35;finish(true);finish(false);finish(true);
  expect(timing.snapshot()).toEqual({firstFrames:1,abandoned:0,totalFirstFrameMs:25,maxFirstFrameMs:25});
  expect(JSON.parse(sink.mock.calls[0][0])).toEqual({event:'reel_playback_timing',outcome:'first_frame',durationMs:25});
  timing.snapshot().firstFrames=999;
  expect(timing.snapshot().firstFrames).toBe(1);
  timing.start()(false);
  expect(timing.snapshot().abandoned).toBe(1);
});
it('does not log when disabled and survives diagnostic sink failures',()=>{
  const sink=vi.fn();createReelPlaybackTiming(()=>0,sink,()=>false).start()(true);expect(sink).not.toHaveBeenCalled();
  expect(()=>createReelPlaybackTiming(()=>0,()=>{throw Error('sink');},()=>true).start()(true)).not.toThrow();
});
