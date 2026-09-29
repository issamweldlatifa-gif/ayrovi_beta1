import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { pruneDiskCache } from '../src/services/diskCache';

const tempDirs: string[] = [];
afterEach(() => {
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function tempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-cache-'));
  tempDirs.push(directory);
  return directory;
}

describe('bounded disk cache maintenance', () => {
  test('evicts oldest regular files to stay below byte and file caps', () => {
    const directory = tempDir();
    for (let index = 0; index < 6; index += 1) {
      const file = path.join(directory, `${index}.cache`);
      fs.writeFileSync(file, Buffer.alloc(20, index));
      const time = new Date(1_700_000_000_000 + index * 1_000);
      fs.utimesSync(file, time, time);
    }

    pruneDiskCache(directory, { maxBytes: 100, maxFiles: 4, minIntervalMs: 0 });
    const remaining = fs.readdirSync(directory).sort();
    expect(remaining).toEqual(['3.cache', '4.cache', '5.cache']);
    expect(remaining.reduce((sum, file) => sum + fs.statSync(path.join(directory, file)).size, 0)).toBeLessThanOrEqual(90);
  });

  test('does not recurse into or delete symlinks and subdirectories', () => {
    const directory = tempDir();
    const outside = tempDir();
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
    fs.symlinkSync(outside, path.join(directory, 'external-link'));
    fs.mkdirSync(path.join(directory, 'subdirectory'));
    fs.writeFileSync(path.join(directory, 'subdirectory', 'keep.txt'), 'keep');
    for (let index = 0; index < 4; index += 1) fs.writeFileSync(path.join(directory, `${index}.cache`), 'data');

    pruneDiskCache(directory, { maxBytes: 1, maxFiles: 1, minIntervalMs: 0 });
    expect(fs.existsSync(path.join(directory, 'external-link'))).toBe(true);
    expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe('keep');
    expect(fs.readFileSync(path.join(directory, 'subdirectory', 'keep.txt'), 'utf8')).toBe('keep');
  });
});
