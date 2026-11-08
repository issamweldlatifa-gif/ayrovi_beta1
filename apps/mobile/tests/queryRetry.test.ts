import { expect, it } from 'vitest';
import { ApiError } from '../src/api/errors';
import { shouldRetryQuery, queryRetryDelay } from '../src/api/queryRetry';
it('retries transient failures once, not authentication, cancellation or contract errors', () => {
  for (const status of [400, 401, 403, 404, 422]) expect(shouldRetryQuery(0, new ApiError('http', '', { status }))).toBe(false);
  for (const kind of ['aborted', 'device', 'malformed'] as const) expect(shouldRetryQuery(0, new ApiError(kind, ''))).toBe(false);
  for (const error of [new ApiError('network', ''), new ApiError('timeout', ''), new ApiError('http', '', { status: 503 })]) {
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(false);
  }
  expect(shouldRetryQuery(0, new Error('unknown'))).toBe(false);
});
it('honors Retry-After without shortening it and refuses an unbounded automatic wait', () => {
  const rate = new ApiError('http', '', { status: 429, retryAfterMs: 20_000 });
  expect(shouldRetryQuery(0, rate)).toBe(true);
  expect(queryRetryDelay(0, rate)).toBe(20_000);
  expect(shouldRetryQuery(0, new ApiError('http', '', { status: 429, retryAfterMs: 120_000 }))).toBe(false);
});
