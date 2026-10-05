import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../client/src/services/nativeShell', () => ({ isNativeApp: vi.fn(() => true), getNativeSessionToken: () => 'session-test-only' }));
import { isNativeApp } from '../client/src/services/nativeShell';
import { installNativeApiOrigin } from '../client/src/services/nativeApiOrigin';
import { normalizeApiOrigin } from '../client/src/services/apiOrigin';
const API = 'https://api.ayrovi.test';
class Xhr { open(..._args: any[]) {} setRequestHeader(..._args: any[]) {} }
vi.stubGlobal('XMLHttpRequest', Xhr);
vi.stubGlobal('location', { href: 'https://localhost/' });
vi.stubGlobal('window', { fetch: globalThis.fetch });
const originalOpen = XMLHttpRequest.prototype.open;
const originalGlobals = { Request: globalThis.Request, Headers: globalThis.Headers };
beforeEach(() => {
  Object.assign(globalThis, { Request, Headers });
  delete (window as any).__ayroviApiOriginPatched;
  vi.mocked(isNativeApp).mockReturnValue(true);
  window.fetch = vi.fn(async () => new Response('{}')) as any;
});
afterEach(() => { XMLHttpRequest.prototype.open = originalOpen; Object.assign(globalThis, originalGlobals); vi.restoreAllMocks(); });

describe('native API trust boundary', () => {
  it.each(['/api/cart', new URL('/api/cart', location.href), () => new Request(new URL('/api/cart', location.href))])('rewrites API input %s', async input => {
    const spy = window.fetch;
    installNativeApiOrigin(API);
    await window.fetch(typeof input === 'function' ? input() as any : input as any);
    const request = vi.mocked(spy).mock.calls[0][0] as Request;
    expect(request.url).toBe(API + '/api/cart');
    expect(request.headers.get('authorization')).toBe('Bearer session-test-only');
    expect(request.headers.get('x-ayrovi-native')).toBe('1');
    expect(request.redirect).toBe('error');
  });
  it('preserves Request method, body, original headers and caller body', async () => {
    const spy = window.fetch;
    installNativeApiOrigin(API);
    const r = new Request(new URL('/api/cart', location.href), { method: 'POST', body: '{"x":1}', headers: { 'x-custom': 'ok' } });
    await window.fetch(r as any);
    const sent = vi.mocked(spy).mock.calls[0][0] as Request;
    expect(sent.method).toBe('POST'); expect(await sent.text()).toBe('{"x":1}');
    expect(sent.headers.get('x-custom')).toBe('ok'); expect(await r.text()).toBe('{"x":1}');
    expect(r.headers.has('authorization')).toBe(false);
  });
  it.each(['https://api.ayrovi.test.evil/api/x', 'https://sub.api.ayrovi.test/api/x', 'https://api.ayrovi.test:444/api/x', 'http://api.ayrovi.test/api/x', 'https://external.test', '/assets/a.png', '//external.test/api/x'])('does not inject credentials into %s', async url => {
    const spy = window.fetch; installNativeApiOrigin(API);
    const init = { headers: { 'x-own': 'value' } };
    await window.fetch(url, init);
    expect(spy).toHaveBeenCalledWith(url, init);
  });
  it('rejects user-info and invalid origin configuration', () => {
    expect(normalizeApiOrigin('http://api.ayrovi.test')).toBe('');
    expect(normalizeApiOrigin('https://user:pass@api.ayrovi.test')).toBe('');
    const spy = window.fetch; installNativeApiOrigin(API);
    expect(() => window.fetch('https://user:pass@api.ayrovi.test/api')).toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
  it('XHR rewrites API only, never injects headers; supports reused objects', () => {
    const open = vi.fn(); XMLHttpRequest.prototype.open = open;
    installNativeApiOrigin(API);
    const xhr = new XMLHttpRequest(); const header = vi.spyOn(xhr, 'setRequestHeader');
    xhr.open('GET', '/api/x'); xhr.open('GET', 'https://external.test/x');
    expect(open.mock.calls.map(c => c[1])).toEqual([API + '/api/x', 'https://external.test/x']);
    expect(header).not.toHaveBeenCalled();
  });
  it('ordinary web is unchanged', () => {
    vi.mocked(isNativeApp).mockReturnValue(false); const spy = window.fetch;
    installNativeApiOrigin(API); expect(window.fetch).toBe(spy);
  });
});
