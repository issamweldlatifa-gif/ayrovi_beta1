import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from 'node:dns/promises';
import { Agent } from 'undici';
import { createPinnedLookup, fetchSafeRemote, UnsafeUrlError } from '../src/services/safeUrl';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('remote product fetching pins validated addresses', () => {
  it('never accepts a private address even if a resolver returned it', () => {
    expect(() => createPinnedLookup('127.0.0.1')).toThrow(UnsafeUrlError);
    expect(() => createPinnedLookup('::1')).toThrow(UnsafeUrlError);
    expect(() => createPinnedLookup('169.254.169.254')).toThrow(UnsafeUrlError);
  });
  it('uses the vetted address at connection time, regardless of later DNS changes', () => {
    const lookup = createPinnedLookup('8.8.8.8');
    const answer = vi.fn();
    lookup('rebinding.shop.com', {}, answer);
    lookup('rebinding.shop.com', { family: 6 }, answer);
    expect(answer).toHaveBeenCalledTimes(2);
    expect(answer).toHaveBeenNthCalledWith(1, null, '8.8.8.8', 4);
    expect(answer).toHaveBeenNthCalledWith(2, null, '8.8.8.8', 4);
  });
  it('passes a private pinned dispatcher to fetch and closes it after the body is read', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any);
    let pinned: Agent | null = null;
    const fetcher = vi.fn(async (_url, init) => {
      pinned = init.dispatcher;
      return new Response('merchant page');
    });
    vi.stubGlobal('fetch', fetcher);
    expect(await (await fetchSafeRemote('https://rebinding.shop.com/item')).text()).toBe('merchant page');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(pinned).toBeInstanceOf(Agent);
    expect((pinned as any).closed || (pinned as any).destroyed).toBe(true);
  });
  it('rejects a redirect into a private service before opening a second connection', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any);
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchSafeRemote('https://rebinding.shop.com/product')).rejects.toThrow(UnsafeUrlError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
