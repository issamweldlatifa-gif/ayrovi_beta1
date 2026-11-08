import { expect, it, vi } from 'vitest';
import { createImageScheduler, ImageBusyError, writeImageCache } from '../src/services/imageWork';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
it('shares identical work and forgets both success and rejection', async () => {
  const work = createImageScheduler();
  let calls = 0;
  const run = () => work.share('image', async () => { calls++; throw new Error('offline'); });
  const a = run(), b = run();
  expect(a).toBe(b);
  await expect(a).rejects.toThrow('offline');
  expect(calls).toBe(1);
  expect(await work.share('image', async () => { calls++; return 'recovered'; })).toBe('recovered');
  expect(calls).toBe(2);
});
it('bounds heavy work, rejects overflow and releases a failed slot to the queue', async () => {
  const work = createImageScheduler(1, 1);
  let release!: () => void;
  const first = work.limit(async () => { await new Promise<void>(r => { release = r; }); throw Error('failed'); });
  let secondStarted = false;
  const second = work.limit(async () => { secondStarted = true; return 2; });
  await expect(work.limit(async () => 3)).rejects.toBeInstanceOf(ImageBusyError);
  expect(secondStarted).toBe(false);
  const firstCheck = expect(first).rejects.toThrow('failed');
  release();
  await firstCheck;
  expect(await second).toBe(2);
  expect(await work.limit(async () => 4)).toBe(4);
});
it('writes complete files atomically and leaves no temporary files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-atomic-'));
  try {
    const file = path.join(dir, 'image.png');
    writeImageCache(file, Buffer.from('complete'));
    writeImageCache(file, Buffer.from('replacement'));
    expect(fs.readFileSync(file, 'utf8')).toBe('replacement');
    expect(fs.readdirSync(dir)).toEqual(['image.png']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

it('expires queued work instead of processing it long after the client deadline', async () => {
  vi.useFakeTimers();
  try {
    const work = createImageScheduler(1, 1, 10);
    let release!: () => void;
    const running = work.limit(() => new Promise<void>(r => { release = r; }));
    const queuedTask = vi.fn(async () => 2);
    const check = expect(work.limit(queuedTask)).rejects.toBeInstanceOf(ImageBusyError);
    await vi.advanceTimersByTimeAsync(10);
    await check;
    expect(queuedTask).not.toHaveBeenCalled();
    release(); await running;
    expect(await work.limit(async () => 3)).toBe(3);
  } finally { vi.useRealTimers(); }
});
