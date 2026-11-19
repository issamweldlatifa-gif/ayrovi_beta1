import express from 'express';
import compression from 'compression';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { originFrom } from './config.mjs';
import { itemID, routeSurface, shareRoute } from './routes.mjs';
import { legalPaths } from '../landing/lib/legal.mjs';
import { shareHtml } from '../landing/lib/share.mjs';
import { previewProxy } from './legacy-preview.mjs';

const mode = process.argv[2];
if (!['landing', 'admin', 'preview'].includes(mode)) throw new Error('Expected landing, admin or preview');
const preview = process.env.NODE_ENV !== 'production' && !process.env.RENDER;
if (!preview && mode === 'preview') throw new Error('Do not use the preview proxy in production.');
const api = originFrom(process.env.ZAYROVI_API_ORIGIN, { local: preview });
const mediaOrigin = originFrom(process.env.ZAYROVI_SHARE_MEDIA_ORIGIN);
const legacy = mode === 'preview' ? originFrom(process.env.ZAYROVI_PREVIEW_LEGACY_ORIGIN || 'http://127.0.0.1:3000', { local: true }) : null;
if (legacy && !/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(legacy)) throw new Error('Preview legacy must be local HTTP.');
const dist = name => fileURLToPath(new URL(`../../dist/${name}/`, import.meta.url));
const buildFiles = { landing: `${dist('landing')}index.html`, admin: `${dist('admin')}admin.html` };
for (const surface of mode === 'preview' ? ['landing', 'admin'] : [mode]) {
  if (!existsSync(buildFiles[surface])) throw new Error(`Build ${surface} first.`);
}
const build = mode === 'admin' ? null : JSON.parse(readFileSync(`${dist('landing')}build-info.json`, 'utf8'));
const origin = originFrom(build?.origin, { local: preview });
const drafts = preview && process.env.ZAYROVI_LEGAL_DRAFTS === '1';
if (build && Boolean(build.drafts) !== drafts) throw new Error('Rebuild the landing with the same legal-draft setting. Drafts are forbidden in production.');
const shares = mode !== 'admin' && Boolean(api) && (preview || process.env.ZAYROVI_SHARE_PAGES === '1');
if (mode === 'landing' && process.env.ZAYROVI_SHARE_PAGES === '1' && !api) throw new Error('Share pages require ZAYROVI_API_ORIGIN.');
const app = express();
app.disable('x-powered-by');
app.enable('case sensitive routing');
app.use((req, res, next) => {
  // HTTP origin-form only; never route a supplied authority or normalize a forwarded URL.
  if (!req.url.startsWith('/') || req.url.startsWith('//') || req.url.split('?')[0].includes('\\')) return res.sendStatus(400);
  const url = new URL(req.url, 'https://router.invalid');
  if (url.pathname !== req.url.split('?')[0]) return res.sendStatus(400);
  let surface = routeSurface(url);
  const isOldReel = ['GET', 'HEAD'].includes(req.method) && mode !== 'admin' && shares && url.pathname === '/reels-viewer' && itemID.test(url.searchParams.get('id') || '');
  if (isOldReel) surface = 'landing';
  if (url.pathname !== '/healthz' && (surface === 'legacy' || (mode !== 'preview' && mode !== surface))) {
    if (legacy && surface === 'legacy') return previewProxy(req, res, legacy);
    return res.sendStatus(404);
  }
  const admin = surface === 'admin';
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-DNS-Prefetch-Control': 'off',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Permissions-Policy': admin ? 'camera=(self), microphone=(self), geolocation=(), payment=()' : 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': ["default-src 'self'", "script-src 'self'", admin ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
      "font-src 'self' data:", `img-src 'self'${admin ? ' data: blob: https:' : mediaOrigin ? ` ${mediaOrigin}` : ''}`,
      admin ? "media-src 'self' blob: https:; frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com" : "frame-src 'none'",
      "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
      ...(!preview ? [`frame-ancestors ${admin ? "'none'" : "'self'"}`] : []),
    ].join('; '),
  });
  if (!preview) res.set({ 'X-Frame-Options': admin ? 'DENY' : 'SAMEORIGIN', 'Strict-Transport-Security': 'max-age=15552000; includeSubDomains' });
  if (preview || admin) res.set('X-Robots-Tag', 'noindex, nofollow');
  if (isOldReel) return res.redirect(302, `/r/${url.searchParams.get('id')}`);
  next();
});
app.use(compression());
app.get('/healthz', (_req, res) => res.json({ status: 'ok', surface: mode }));
if (mode !== 'landing') {
  app.use('/admin-build/assets', express.static(`${dist('admin')}assets`, { fallthrough: false, index: false, redirect: false, cacheControl: false,
    setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') }));
  app.get(['/admin', '/admin/*'], (_req, res) => res.sendFile(buildFiles.admin));
}
if (mode !== 'admin') {
  app.use('/site-assets', express.static(`${dist('landing')}site-assets`, { index: false, redirect: false, cacheControl: false,
    setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate') }));
  app.get('/', (_req, res) => res.sendFile(buildFiles.landing));
  app.get('/ar', (req, res) => req.path === '/ar' ? res.redirect(308, '/ar/') : res.sendFile(`${dist('landing')}ar/index.html`));
  for (const file of ['robots.txt', 'sitemap.xml']) app.get(`/${file}`, (_req, res) => res.sendFile(`${dist('landing')}${file}`));
  if (drafts) for (const dir of ['', 'ar/']) for (const slug of legalPaths) {
    app.get(`/${dir}${slug}`, (_req, res) => res.sendFile(`${dist('landing')}${dir}${slug}.html`));
  }
  app.get(/^\/(?:ar\/)?[prs]\/[^/]+\/?$/, async (req, res) => {
    const item = shareRoute(req.path);
    let card, unavailable = false;
    if (item && shares) {
      try {
        const result = await fetch(`${api}/api/public/share/${item.kind}/${item.id}`, { signal: AbortSignal.timeout(3500), redirect: 'error' });
        if (result.ok) {
          const payload = await result.json();
          if (payload?.success && typeof payload.data?.title === 'string') card = payload.data;
          else unavailable = true;
        } else {
          unavailable = result.status !== 404;
          await result.body?.cancel();
        }
      } catch { unavailable = true; }
    }
    res.status(card ? 200 : unavailable ? 503 : 404).type('html').send(shareHtml({ ...item, locale: req.path.startsWith('/ar/') ? 'ar' : 'fr', card, origin, apiOrigin: api, mediaOrigin, unavailable, preview }));
  });
}
app.use((_req, res) => res.sendStatus(404));
app.use((error, _req, res, next) => { if (res.headersSent) return next(error); res.sendStatus(error.status === 404 ? 404 : 500); });
const server = app.listen(Number(process.env.PORT || 4173), '0.0.0.0', () => console.log(`${mode} listening on :${server.address().port}`));
