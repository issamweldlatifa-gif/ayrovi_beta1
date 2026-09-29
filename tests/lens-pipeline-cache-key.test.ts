import { describe, expect, test } from 'vitest';
import { pipelineKey } from '../src/ayrovix/routes';

describe('Lens pipeline cache identity', () => {
  test('hashes every image byte and the user intent with a full SHA-256 digest', () => {
    const prefix = Buffer.alloc(8_192, 7);
    const first = Buffer.from(prefix);
    const second = Buffer.from(prefix);
    second[4_096] = 8; // same size and identical first/last slices, different middle byte

    const firstKey = pipelineKey(first, 'red handbag');
    expect(firstKey).toMatch(/^[a-f0-9]{64}$/);
    expect(pipelineKey(first, 'red handbag')).toBe(firstKey);
    expect(pipelineKey(second, 'red handbag')).not.toBe(firstKey);
    expect(pipelineKey(first, 'blue handbag')).not.toBe(firstKey);
  });
});
