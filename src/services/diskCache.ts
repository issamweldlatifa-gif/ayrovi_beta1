import fs from 'node:fs';
import path from 'node:path';

export interface DiskCacheLimits {
  maxBytes: number;
  maxFiles: number;
  minIntervalMs?: number;
}

const lastPruneAt = new Map<string, number>();

/**
 * Best-effort, bounded direct-file cache cleanup. Oldest regular files are
 * removed first; symlinks and subdirectories are never traversed. The
 * per-directory throttle keeps cleanup off the hot path while bounding growth.
 */
export function pruneDiskCache(directory: string, limits: DiskCacheLimits): void {
  const now = Date.now();
  const key = path.resolve(directory);
  if (now - (lastPruneAt.get(key) || 0) < (limits.minIntervalMs ?? 60_000)) return;
  lastPruneAt.set(key, now);

  let entries: Array<{ file: string; bytes: number; mtimeMs: number }>;
  try {
    entries = fs.readdirSync(key, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile()) return [];
      const file = path.join(key, entry.name);
      try {
        const stat = fs.lstatSync(file);
        return stat.isFile() ? [{ file, bytes: stat.size, mtimeMs: stat.mtimeMs }] : [];
      } catch { return []; }
    });
  } catch { return; }

  let totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  let count = entries.length;
  if (totalBytes <= limits.maxBytes && count <= limits.maxFiles) return;

  const targetBytes = Math.floor(limits.maxBytes * 0.9);
  const targetFiles = Math.floor(limits.maxFiles * 0.9);
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const entry of entries) {
    if (totalBytes <= targetBytes && count <= targetFiles) break;
    try {
      fs.unlinkSync(entry.file);
      totalBytes -= entry.bytes;
      count -= 1;
    } catch { /* cleanup is best effort; the next write retries */ }
  }
}
