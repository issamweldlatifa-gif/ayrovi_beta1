import { ApiError } from '../../api/errors';

/** Bounds the whole operation, including bridge callbacks and response bodies.
 * Aborting alone is not enough: some native promises never reject on abort. */
export function withReadDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs: number },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (error) {
        reject(error);
        controller.abort();
      } else resolve(value as T);
    };
    const onAbort = () => finish(new ApiError('aborted', 'Lecture annulée.'));
    if (options.signal?.aborted) { onAbort(); return; }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(new ApiError('timeout', 'La lecture ne répond pas. Réessayez.')), options.timeoutMs);
    Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new ApiError('aborted', 'Lecture annulée.');
      return run(controller.signal);
    }).then((value) => finish(null, value), (error) => finish(error ?? new ApiError('device', 'Lecture impossible.')));
  });
}
