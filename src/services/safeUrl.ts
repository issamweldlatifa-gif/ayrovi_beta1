import { promises as dns } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Agent } from 'undici';

const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();

// Private, loopback, link-local, carrier-grade NAT, documentation, multicast
// and otherwise non-routable IPv4 ranges.
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as Array<[string, number]>) blockedIpv4.addSubnet(network, prefix, 'ipv4');

// Unspecified/loopback, IPv4-mapped, discard-only, documentation, unique-local,
// link-local and multicast IPv6 ranges.
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96],
  ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
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

export function isUnsafeIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedIpv4.check(address, 'ipv4');
  if (family === 6) return blockedIpv6.check(address, 'ipv6');
  return true;
}

export function isUnsafeHostname(rawHostname: string): boolean {
  const hostname = rawHostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || hostname === 'localhost') return true;
  if (isIP(hostname)) return isUnsafeIpAddress(hostname);
  if (!hostname.includes('.') || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  return false;
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
  return parsed;
}

/** Resolve every address before a server-side request and reject the whole host
 * if any answer is private/reserved. A custom resolver keeps security tests hermetic. */
export async function resolveSafeHttpUrl(raw: unknown, resolver: HostResolver = systemResolver): Promise<ResolvedSafeUrl> {
  const url = parsePublicHttpUrl(raw);
  if (isIP(url.hostname)) return { url, addresses: [url.hostname] };

  let answers: Array<{ address: string; family: number }>;
  try {
    answers = await resolver(url.hostname);
  } catch {
    throw new UnsafeUrlError('Ce domaine est introuvable ou inaccessible.');
  }
  const addresses = [...new Set(answers.map((answer) => String(answer.address || '')).filter(Boolean))];
  if (!addresses.length || addresses.some(isUnsafeIpAddress)) throw new UnsafeUrlError();
  return { url, addresses };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Pin the connection to an address that passed validation. Validating DNS and
 * then letting fetch resolve the host again is vulnerable to DNS rebinding.
 * Return a streaming response that closes its private dispatcher when consumed
 * or cancelled, rather than leaving open sockets after an image/page fetch.
 */
function closeWithResponse(response: Response, agent: Agent): Response {
  if (!response.body) { void agent.close().catch(() => agent.destroy()); return response; }
  const reader = response.body.getReader();
  let finished = false;
  const release = (destroy = false) => {
    if (finished) return;
    finished = true;
    reader.releaseLock();
    if (destroy) agent.destroy();
    else void agent.close().catch(() => agent.destroy());
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { controller.close(); release(); }
        else controller.enqueue(value);
      } catch (error) { controller.error(error); release(true); }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } finally { release(true); }
    },
  });
  return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** Called by the HTTP dispatcher at connection time, NOT by the system DNS.
 * Repeated DNS queries by an attacker cannot replace this validated address.
 */
export function createPinnedLookup(address: string) {
  if (isUnsafeIpAddress(address)) throw new UnsafeUrlError();
  return (_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: 4 | 6) => void) => {
    callback(null, address, isIP(address) as 4 | 6);
  };
}

/** Validate DNS on every redirect, and use ONLY the validated address for that
 * hop's TCP connection. The URL (Host header and TLS SNI) remains the source URL.
 */
export async function fetchSafeRemote(
  raw: string,
  init: RequestInit = {},
  maxRedirects = 3,
): Promise<Response> {
  let current = raw;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const safe = await resolveSafeHttpUrl(current);
    const pinnedAddress = safe.addresses[0];
    const agent = new Agent({ connect: { lookup: createPinnedLookup(pinnedAddress) } });
    let response: Response;
    try {
      response = await fetch(safe.url, { ...init, redirect: 'manual', dispatcher: agent } as RequestInit);
    } catch (error) {
      agent.destroy();
      throw error;
    }
    if (!REDIRECT_STATUSES.has(response.status)) return closeWithResponse(response, agent);
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    agent.destroy();
    if (!location || redirect === maxRedirects) throw new UnsafeUrlError('Trop de redirections externes.');
    current = new URL(location, safe.url).toString();
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
