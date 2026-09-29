import { promises as dns } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();
const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');

// Private, loopback, link-local, carrier-grade NAT, documentation, multicast
// and otherwise non-routable IPv4 ranges.
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as Array<[string, number]>) blockedIpv4.addSubnet(network, prefix, 'ipv4');

// Unspecified/loopback, IPv4-mapped, discard-only, documentation, unique-local,
// link-local and multicast IPv6 ranges.
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96],
  ['100::', 64], ['2001::', 23], ['2001:db8::', 32], ['2001:20::', 28],
  ['2002::', 16], ['3fff::', 20], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as Array<[string, number]>) blockedIpv6.addSubnet(network, prefix, 'ipv6');

const BLOCKED_HOST_SUFFIXES = [
  '.localhost', '.local', '.internal', '.lan', '.home', '.home.arpa', '.test', '.invalid', '.example',
];

export class UnsafeUrlError extends Error {
  readonly code = 'UNSAFE_URL';

  constructor(message = 'Cette adresse Web ne peut pas être analysée.') {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export interface ResolvedSafeUrl {
  url: URL;
  addresses: string[];
}

export type HostResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
const systemResolver: HostResolver = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

function unbracket(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

export function isUnsafeIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedIpv4.check(address, 'ipv4');
  if (family === 6) return !globalIpv6.check(address, 'ipv6') || blockedIpv6.check(address, 'ipv6');
  return true;
}

export function isUnsafeHostname(rawHostname: string): boolean {
  const hostname = unbracket(rawHostname);
  if (!hostname || hostname === 'localhost') return true;
  if (isIP(hostname)) return isUnsafeIpAddress(hostname);
  if (!hostname.includes('.') || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  return false;
}

function validatePort(url: URL): void {
  const expected = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== expected) {
    throw new UnsafeUrlError('Les ports Web non standards ne sont pas autorisés.');
  }
}

export function parsePublicHttpUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) throw new UnsafeUrlError();
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError('Veuillez fournir une URL Web valide.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) {
    throw new UnsafeUrlError();
  }
  validatePort(parsed);
  return parsed;
}

/** Resolve every address before a server-side request and reject the whole host
 * if any answer is private/reserved. The validated address list is then pinned
 * into the socket lookup below; the HTTP client never resolves the hostname a
 * second time (closing the DNS-rebinding TOCTOU window). */
export async function resolveSafeHttpUrl(raw: unknown, resolver: HostResolver = systemResolver): Promise<ResolvedSafeUrl> {
  const url = parsePublicHttpUrl(raw);
  const hostname = unbracket(url.hostname);
  if (isIP(hostname)) return { url, addresses: [hostname] };

  let answers: Array<{ address: string; family: number }>;
  try {
    answers = await resolver(hostname);
  } catch {
    throw new UnsafeUrlError('Ce domaine est introuvable ou inaccessible.');
  }
  const addresses = [...new Set(answers.map((answer) => String(answer.address || '')))].filter(Boolean);
  if (!addresses.length || addresses.some(isUnsafeIpAddress)) throw new UnsafeUrlError();
  return { url, addresses };
}

/** Build a Node lookup callback that can return ONLY the DNS addresses that
 * were validated above. Supports Node's single-address and `all: true` forms. */
export function createPinnedLookup(addresses: string[]): (hostname: string, options: any, callback: (...args: any[]) => void) => void {
  if (!addresses.length || addresses.some(isUnsafeIpAddress)) throw new UnsafeUrlError();
  const checked = addresses.map((address) => ({ address, family: isIP(address) }));
  return (_hostname, options, callback) => {
    if (options && typeof options === 'object' && options.all) {
      const family = Number(options.family || 0);
      const selected = family ? checked.filter((entry) => entry.family === family) : checked;
      if (!selected.length) return callback(Object.assign(new Error('No validated address for requested family'), { code: 'ENOTFOUND' }));
      callback(null, selected);
      return;
    }
    const family = Number(options && typeof options === 'object' ? options.family || 0 : 0);
    const selected = family ? checked.find((entry) => entry.family === family) : checked[0];
    if (!selected) return callback(Object.assign(new Error('No validated address for requested family'), { code: 'ENOTFOUND' }));
    callback(null, selected.address, selected.family);
  };
}

const FORBIDDEN_REQUEST_HEADERS = new Set([
  'host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'expect',
  'keep-alive', 'proxy-connection', 'proxy-authorization', 'te', 'trailer',
]);

function nodeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const normalized = Object.fromEntries(new Headers(headers).entries());
  for (const name of FORBIDDEN_REQUEST_HEADERS) delete normalized[name];
  return normalized;
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException('The operation was aborted', 'AbortError');
}

/** A minimal GET/HEAD transport with a pinned DNS lookup. TLS still receives
 * the original hostname for SNI/certificate validation; only the socket IP is
 * fixed to a validated address. */
function requestPinned(safe: ResolvedSafeUrl, init: RequestInit = {}): Promise<Response> {
  const method = String(init.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method) || init.body != null) {
    return Promise.reject(new UnsafeUrlError('Seuls les téléchargements GET/HEAD sont autorisés.'));
  }
  const signal = init.signal || undefined;
  if (signal?.aborted) return Promise.reject(abortError(signal));

  const hostname = unbracket(safe.url.hostname);
  const options: any = {
    protocol: safe.url.protocol,
    hostname,
    port: safe.url.port ? Number(safe.url.port) : (safe.url.protocol === 'https:' ? 443 : 80),
    path: `${safe.url.pathname}${safe.url.search}`,
    method,
    headers: nodeHeaders(init.headers),
    lookup: createPinnedLookup(safe.addresses),
    // Keep the URL hostname for TLS verification, never the pinned IP.
    ...(safe.url.protocol === 'https:' && !isIP(hostname) ? { servername: hostname } : {}),
  };
  const makeRequest = safe.url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const req = makeRequest(options, (incoming) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value == null) continue;
        if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        else headers.append(name, String(value));
      }
      const noBody = method === 'HEAD' || [204, 205, 304].includes(incoming.statusCode || 0);
      const body = noBody ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      if (noBody) incoming.resume();
      const cleanup = () => signal?.removeEventListener('abort', onAbort);
      incoming.once('end', cleanup);
      incoming.once('close', cleanup);
      resolve(new Response(body, {
        status: incoming.statusCode || 502,
        statusText: incoming.statusMessage,
        headers,
      }));
    });
    const onAbort = () => req.destroy(abortError(signal!));
    signal?.addEventListener('abort', onAbort, { once: true });
    req.once('error', (error) => {
      signal?.removeEventListener('abort', onAbort);
      reject(error);
    });
    req.end();
  });
}

export type SafeRemoteTransport = (target: ResolvedSafeUrl, init: RequestInit) => Promise<Response>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_SAFE_REMOTE_REQUEST_MS = 15_000;
const SENSITIVE_REDIRECT_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

/** Validate DNS before each hop and pin each actual connection to that checked
 * address. Sensitive headers are stripped if a redirect changes origin. */
export async function fetchSafeRemote(
  raw: string,
  init: RequestInit = {},
  maxRedirects = 3,
  resolver: HostResolver = systemResolver,
  transport: SafeRemoteTransport = requestPinned,
): Promise<Response> {
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
    throw new UnsafeUrlError('Nombre de redirections invalide.');
  }
  const overallTimeout = AbortSignal.timeout(MAX_SAFE_REMOTE_REQUEST_MS);
  const suppliedSignal = init.signal || undefined;
  const signal = suppliedSignal ? AbortSignal.any([suppliedSignal, overallTimeout]) : overallTimeout;
  let current = raw;
  let currentInit: RequestInit = { ...init, signal };
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const safe = await resolveSafeHttpUrl(current, resolver);
    const response = await transport(safe, currentInit);
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    if (!location || redirect === maxRedirects) throw new UnsafeUrlError('Trop de redirections externes.');
    const next = new URL(location, safe.url);
    if (next.origin !== safe.url.origin) {
      const headers = new Headers(currentInit.headers);
      for (const header of SENSITIVE_REDIRECT_HEADERS) headers.delete(header);
      currentInit = { ...currentInit, headers };
    }
    current = next.toString();
  }
  throw new UnsafeUrlError();
}

export async function readLimitedText(response: Response, maxBytes = 2_000_000): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('REMOTE_RESPONSE_TOO_LARGE');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error('REMOTE_RESPONSE_TOO_LARGE');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    if (received > maxBytes) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function readLimitedBuffer(response: Response, maxBytes = 5_000_000): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('REMOTE_RESPONSE_TOO_LARGE');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error('REMOTE_RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, received);
  } finally {
    if (received > maxBytes) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
