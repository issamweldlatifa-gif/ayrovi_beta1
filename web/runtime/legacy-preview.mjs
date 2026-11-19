import { request } from 'node:http';

const hopByHop = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];
function clean(headers) {
  const out = { ...headers };
  for (const header of [...hopByHop, ...String(out.connection || '').toLowerCase().split(',').map(x => x.trim())]) delete out[header];
  return out;
}

// Local/Arena composition only. In production the trusted ingress routes legacy
// requests directly so the backend's client-IP, cookie and rate-limit semantics remain unchanged.
export function previewProxy(req, res, origin) {
  const headers = clean(req.headers);
  for (const header of Object.keys(headers)) if (header === 'forwarded' || header.startsWith('x-forwarded-')) delete headers[header];
  headers.host = new URL(origin).host;
  const upstream = request(origin, { path: req.url, method: req.method, headers, timeout: 30_000 }, reply => {
    res.writeHead(reply.statusCode, clean(reply.headers));
    reply.on('error', () => res.destroy());
    reply.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => {
    if (res.headersSent) res.destroy();
    else res.status(502).type('text').send('Aperçu API indisponible.');
  });
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}
