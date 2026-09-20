/** Settle ownership even when a native decoder/resume or transport ignores abort.
 * Native work may finish later; the caller must check ownership before using it.
 * Attaching both handlers also consumes a late rejection after cancellation.
 */
export function awaitOwned<T>(work: Promise<T>, signal: AbortSignal, disposeLate?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason || new DOMException('Cancelled', 'AbortError'));
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
    work.then(value => {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) {
        try { disposeLate?.(value); } catch { /* Cancellation remains settled even if native cleanup fails. */ }
        return;
      }
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', cancel);
      reject(error);
    });
  });
}
