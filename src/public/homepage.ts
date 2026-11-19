import express from 'express';
import { accessSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { landingHtml } from '../../web/landing/lib/landing.mjs';
import { originFrom } from '../../web/runtime/config.mjs';
import { sitemapRoutes } from '../../shared/publicSeo';

const returns = ['customerAuth', 'cardPayment', 'orderId', 'transaction', 'session_id'];
export const isLegacyReturn = (url: string) => {
  const i = url.indexOf('?');
  if (i < 0) return false;
  const params = new URLSearchParams(url.slice(i + 1));
  return returns.some(key => params.has(key));
};

/** Existing-host cutover: replace the public homepage only; keep the legacy
 * runtime installed for real callbacks, routes, and assets that still need it. */
export function publicHomepageRouter(webOrigin: string, buildDir: string) {
  const origin = originFrom(webOrigin);
  if (!origin) throw new Error('Public homepage requires an HTTPS origin.');
  // Fail deployment health rather than quietly publish the old site or a draft.
  const info = JSON.parse(readFileSync(path.join(buildDir, 'build-info.json'), 'utf8'));
  if (info.drafts !== false) throw new Error('Publishable landing build required (legal drafts disabled).');
  for (const asset of ['site.css', 'site.js', 'mark.svg']) accessSync(path.join(buildDir, 'site-assets', asset));
  const router = express.Router({ caseSensitive: true, strict: true });
  const noStore = { 'Cache-Control': 'no-store' };
  const send = (body: string) => (_req: express.Request, res: express.Response) => res.set(noStore).type('html').send(body);
  const french = send(landingHtml('fr', origin));
  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let decoded: string;
    try { decoded = decodeURIComponent(req.path); } catch { return next(); }
    if (!/^\/+$/u.test(decoded) && !/^\/index\.html\/*$/iu.test(decoded)) return next();
    if (isLegacyReturn(req.originalUrl)) {
      res.set({ ...noStore, 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
      return next();
    }
    if (req.path === '/') return french(req, res);
    // Reversible: clients should not permanently cache a rollout redirect.
    return res.set(noStore).redirect(302, '/');
  });
  router.get('/ar', (_req, res) => res.set(noStore).redirect(308, '/ar/'));
  router.get('/ar/', send(landingHtml('ar', origin)));
  router.use('/site-assets', express.static(path.join(buildDir, 'site-assets'), {
    index: false, redirect: false, setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate'),
  }), (_req, res) => res.set(noStore).sendStatus(404));
  router.get('/sitemap.xml', (_req, res) => {
    const paths = [...new Set([...sitemapRoutes().map(route => route.path), '/ar/'])];
    res.set(noStore).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(route => `<url><loc>${origin}${route}</loc></url>`).join('')}</urlset>`);
  });
  router.get('/robots.txt', (_req, res) => res.set(noStore).type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml\n`));
  return router;
}
