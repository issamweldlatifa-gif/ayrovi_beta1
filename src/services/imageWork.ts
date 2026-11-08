/** Process-local single-flight and bounded heavy work. Composition may call other
 * media helpers: only leaf pipelines acquire slots, preventing nested deadlocks. */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
export class ImageBusyError extends Error {
  readonly code = 'IMAGE_BUSY';
  constructor() { super('Image processing queue is full'); }
}
export function createImageScheduler(concurrency = 2, maxQueued = 24, maxWaitMs = 8_000) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(maxQueued) || maxQueued < 0 || !Number.isFinite(maxWaitMs) || maxWaitMs < 1)
    throw new Error('Invalid image scheduler limits');
  const pending = new Map<string, Promise<unknown>>();
  const queue: Array<() => void> = [];
  let active = 0;
  function share<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;
    if (pending.size >= 128) return Promise.reject(new ImageBusyError());
    const task = Promise.resolve().then(work).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  async function limit<T>(work: () => Promise<T>): Promise<T> {
    if (active < concurrency) active++;
    else {
      if (queue.length >= maxQueued) throw new ImageBusyError();
      await new Promise<void>((resolve, reject) => {
        const grant = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          const index = queue.indexOf(grant);
          if (index !== -1) queue.splice(index, 1);
          reject(new ImageBusyError());
        }, maxWaitMs);
        queue.push(grant);
      });
    }
    try { return await work(); }
    finally {
      const next = queue.shift();
      if (next) next(); // transfer this slot, without a race with new arrivals
      else active--;
    }
  }
  return { share, limit };
}
export const imageWork = createImageScheduler();
/** Readers never see partially written cache files, including across processes. */
export function writeImageCache(file: string, bytes: Buffer | string): void {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch { /* rename already consumed it */ }
  }
}
