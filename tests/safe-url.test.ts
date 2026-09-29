import { describe, expect, test, vi } from 'vitest';
import {
  createPinnedLookup,
  fetchSafeRemote,
  isUnsafeIpAddress,
  parsePublicHttpUrl,
  resolveSafeHttpUrl,
  UnsafeUrlError,
  type HostResolver,
  type ResolvedSafeUrl,
  type SafeRemoteTransport,
} from '../src/services/safeUrl';

describe('safe remote URL resolution and pinned transport', () => {
  test('blocks private, loopback, link-local, mapped and reserved IPs', () => {
    for (const address of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.2',
      '169.254.169.254', '100.64.0.1', '::1', 'fc00::1', 'fe80::1',
      '::ffff:127.0.0.1', '2001:db8::1',
    ]) expect(isUnsafeIpAddress(address), address).toBe(true);
    expect(isUnsafeIpAddress('1.1.1.1')).toBe(false);
    expect(isUnsafeIpAddress('2606:4700:4700::1111')).toBe(false);
  });

  test('rejects credentials, local names, non-HTTP protocols and nonstandard ports', () => {
    for (const value of [
      'file:///etc/passwd', 'ftp://example.com/a', 'http://user:pass@example.com/',
      'http://localhost/', 'http://api.internal/', 'http://example.com:8080/',
      'https://example.com:8443/',
    ]) expect(() => parsePublicHttpUrl(value), value).toThrow(UnsafeUrlError);
    expect(parsePublicHttpUrl('https://www.example.com/item?x=1').hostname).toBe('www.example.com');
  });

  test('rejects the entire DNS answer set if even one answer is private', async () => {
    const resolver: HostResolver = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.7', family: 4 },
    ];
    await expect(resolveSafeHttpUrl('https://merchant.example.com/product', resolver)).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  test('pins Node lookup to the complete validated address set', () => {
    const lookup = createPinnedLookup(['1.1.1.1', '2606:4700:4700::1111']);
    const cbAll = vi.fn();
    lookup('attacker.example', { all: true }, cbAll);
    expect(cbAll).toHaveBeenCalledWith(null, [
      { address: '1.1.1.1', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
    const cbOne = vi.fn();
    lookup('attacker.example', {}, cbOne);
    expect(cbOne).toHaveBeenCalledWith(null, '1.1.1.1', 4);
    const cbV6 = vi.fn();
    lookup('attacker.example', { family: 6 }, cbV6);
    expect(cbV6).toHaveBeenCalledWith(null, '2606:4700:4700::1111', 6);
    expect(() => createPinnedLookup(['127.0.0.1'])).toThrow(UnsafeUrlError);
  });

  test('checks and pins every redirect target; strips credentials across origins', async () => {
    const lookups: string[] = [];
    const resolver: HostResolver = async (hostname) => {
      lookups.push(hostname);
      return [{ address: hostname === 'merchant.example.com' ? '93.184.216.34' : '1.1.1.1', family: 4 }];
    };
    const observed: Array<{ target: ResolvedSafeUrl; headers: Headers }> = [];
    const transport: SafeRemoteTransport = async (target, init) => {
      observed.push({ target, headers: new Headers(init.headers) });
      if (observed.length === 1) {
        return new Response(null, { status: 302, headers: { location: 'https://images.example.com/product.jpg' } });
      }
      return new Response('ok', { status: 200 });
    };

    const response = await fetchSafeRemote('https://merchant.example.com/item', {
      headers: { authorization: 'Bearer secret', cookie: 'session=secret', 'user-agent': 'AYROVI-test' },
    }, 3, resolver, transport);

    expect(await response.text()).toBe('ok');
    expect(lookups).toEqual(['merchant.example.com', 'images.example.com']);
    expect(observed[0].target.addresses).toEqual(['93.184.216.34']);
    expect(observed[1].target.addresses).toEqual(['1.1.1.1']);
    expect(observed[1].headers.has('authorization')).toBe(false);
    expect(observed[1].headers.has('cookie')).toBe(false);
    expect(observed[1].headers.get('user-agent')).toBe('AYROVI-test');
  });

  test('a DNS rebinding answer change cannot replace the IP pinned for the socket', async () => {
    let resolverCalls = 0;
    const resolver: HostResolver = async () => {
      resolverCalls += 1;
      return [{ address: resolverCalls === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
    };
    let connectedTo = '';
    const transport: SafeRemoteTransport = async (target) => {
      // Simulate Node's later socket lookup: it is serviced only by the checked
      // address set and never calls the changing system resolver again.
      createPinnedLookup(target.addresses)('rebound.example.com', {}, (_error: unknown, address: string) => { connectedTo = address; });
      return new Response('ok');
    };
    const response = await fetchSafeRemote('https://rebound.example.com/item', {}, 3, resolver, transport);
    expect(await response.text()).toBe('ok');
    expect(resolverCalls).toBe(1);
    expect(connectedTo).toBe('93.184.216.34');
  });

  test('rejects a redirect to loopback before issuing a second request', async () => {
    const transport = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/latest' } }));
    const resolver: HostResolver = async () => [{ address: '93.184.216.34', family: 4 }];
    await expect(fetchSafeRemote('https://merchant.example.com/item', {}, 3, resolver, transport)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test('never invokes transport when DNS resolves to a private address', async () => {
    const transport = vi.fn(async () => new Response('should not run'));
    const resolver: HostResolver = async () => [{ address: '169.254.169.254', family: 4 }];
    await expect(fetchSafeRemote('http://metadata.example.com/latest', {}, 3, resolver, transport)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(transport).not.toHaveBeenCalled();
  });
});
