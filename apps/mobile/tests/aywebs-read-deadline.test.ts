import { afterEach, describe, expect, it, vi } from 'vitest';
import { withReadDeadline } from '../src/features/aywebs/readDeadline';
import { apiGet, apiGetText } from '../src/api/client';
import { buildAyWebsCaptureInjection } from '../src/api/aywebs';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('bounded AYWEBs reads', () => {
  it('settles a missing bridge response and aborts its resources', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const operation = withReadDeadline((s) => { signal = s; return new Promise(() => {}); }, { timeoutMs: 15_000 });
    const assertion = expect(operation).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('navigation cancels immediately even if the native operation ignores abort', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const operation = withReadDeadline(() => new Promise(() => {}), { signal: controller.signal, timeoutMs: 15_000 });
    const assertion = expect(operation).rejects.toMatchObject({ kind: 'aborted' });
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up a successful read and ignores a subsequent abort', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    await expect(withReadDeadline(async () => 'ready', { signal: controller.signal, timeoutMs: 15_000 })).resolves.toBe('ready');
    controller.abort();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start work when already cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    const run = vi.fn();
    await expect(withReadDeadline(run, { signal: controller.signal, timeoutMs: 15_000 })).rejects.toMatchObject({ kind: 'aborted' });
    expect(run).not.toHaveBeenCalled();
  });

  it('tags both successful capture and script errors for the owning request', () => {
    const postMessage = vi.fn();
    const window = { ReactNativeWebView: { postMessage } };
    new Function('window', buildAyWebsCaptureInjection('JSON.stringify({v:1})', 'read-1'))(window);
    expect(JSON.parse(postMessage.mock.calls[0][0])).toMatchObject({ v: 1, __aywebs_requestId: 'read-1' });
    new Function('window', buildAyWebsCaptureInjection('(function(){throw new Error("failed")})()', 'read-2'))(window);
    expect(JSON.parse(postMessage.mock.calls[1][0])).toMatchObject({ __aywebs_requestId: 'read-2', __aywebs_error: 'failed' });
  });
});

describe('API deadline includes body, not just successful headers', () => {
  it.each(['json', 'text'])('aborts stalled %s response bodies', async (format) => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal;
      return {
        ok: true, status: 200, headers: new Headers(),
        text: () => new Promise<string>((_resolve, reject) => {
          const onAbort = () => reject(new Error('native aborted body'));
          if (requestSignal!.aborted) onAbort();
          else requestSignal!.addEventListener('abort', onAbort, { once: true });
        }),
      };
    }));
    const operation = format === 'text'
      ? apiGetText('/api/v1/aywebs/capture/script.js', { timeoutMs: 1000 })
      : apiGet('/api/v1/aywebs/page/analyze', { timeoutMs: 1000 });
    const assertion = expect(operation).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
