import { isApiError } from './errors';
/** One bounded recovery, not three full timeouts or retries of terminal errors. */
export function shouldRetryQuery(failures: number, error: unknown): boolean {
  if (failures >= 1 || !isApiError(error)) return false;
  if (error.kind === 'network' || error.kind === 'timeout') return true;
  return error.kind === 'http' && [408, 429, 500, 502, 503, 504].includes(error.status)
    && error.retryAfterMs <= 30_000;
}
export function queryRetryDelay(_attempt: number, error: unknown): number {
  return isApiError(error) && error.retryAfterMs > 0 ? error.retryAfterMs : 1_000;
}
