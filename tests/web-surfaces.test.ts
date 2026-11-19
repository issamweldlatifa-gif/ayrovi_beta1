import { expect, it } from 'vitest';
import { routeSurface, shareRoute } from '../web/runtime/routes.mjs';
import { shareHtml, shareImage } from '../web/landing/lib/share.mjs';
import { landingHtml } from '../web/landing/lib/landing.mjs';
const origin = 'https://zayrovi.com';
const apiOrigin = 'https://api.example.test';
const route = (path: string) => routeSurface(new URL(path, origin));

it('routes only the landing, its assets and share paths to the public web', () => {
  for (const path of ['/', '/?utm_source=foo', '/ar/', '/site-assets/site.css', '/ar/s/official_id', '/sitemap.xml', '/ar/contact']) {
    expect(route(path), path).toBe('landing');
  }
  for (const path of ['/admin', '/admin/orders', '/admin-build/assets/admin-123.js']) expect(route(path), path).toBe('admin');
  for (const path of ['/api/admin/auth/me', '/api/public/missing', '/auth/native-done.html', '/reset-password',
    '/publications?post=42', '/.well-known/assetlinks.json', '/.well-known/apple-app-site-association', '/privacy.html', '/terms.html',
    '/uploads/invoices/1.pdf', '/media/catalogue/blah.jpg', '/assets/old.js', '/administer', '/catalog', '/reels-viewer?id=42']) {
    expect(route(path), path).toBe('legacy');
  }
  for (const param of ['customerAuth=success', 'cardPayment=verify&orderId=a&transaction=b', '%63ustomerAuth=error', 'session_id=42']) {
    expect(route(`/?${param}`)).toBe('legacy');
  }
});

it('renders a bilingual landing with clearly illustrative pricing and gated legal drafts', () => {
  const fr = landingHtml('fr', origin), ar = landingHtml('ar', origin);
  expect(fr).toContain('lang="fr" dir="ltr"');
  expect(ar).toContain('lang="ar" dir="rtl"');
  expect(fr).toContain('19/11/2026');
  expect(fr).toContain('142,368 TND');
  expect(ar).toContain('28,474 TND');
  expect(ar).toContain('/privacy.html');
  expect(ar).not.toContain('/ar/contact');
  expect(landingHtml('ar', origin, { drafts: true })).toContain('/ar/contact');
});

it('requires one safe item ID and renders text/metadata without interpolating CMS markup', () => {
  expect(shareRoute('/ar/r/reel_12')).toEqual({ locale: 'ar', prefix: 'r', kind: 'reel', id: 'reel_12' });
  for (const path of ['/r/a/b', '/s/%2Ftest', '/p/' + 'a'.repeat(151)]) expect(shareRoute(path)).toBeNull();
  const html = shareHtml({ locale: 'ar', prefix: 'r', id: 'reel_12', card: {
    title: 'Title', title_ar: '<script>alert(1)</script>', description: 'quote "', image: 'javascript:alert(1)',
  }, origin, apiOrigin, preview: true });
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('https://zayrovi.com/site-assets/og.png');
  expect(html).toContain('zayrovi://reels-viewer?id=reel_12&amp;shared=1');
  expect(html).toContain('content="noindex,follow"');
  expect(shareHtml({ locale: 'fr', card: undefined, origin, apiOrigin, unavailable: true })).not.toContain('zayrovi://');
});

it('uses only public media routes or a specifically configured image origin', () => {
  expect(shareImage(`${apiOrigin}/media/image.jpg?v=2`, origin, apiOrigin)).toBe(`${origin}/media/image.jpg?v=2`);
  expect(shareImage('/api/customer/self', origin, apiOrigin)).toBeNull();
  expect(shareImage('/media/foo%2fbar.jpg', origin, apiOrigin)).toBeNull();
  expect(shareImage('//external.test/image.jpg', origin, apiOrigin)).toBeNull();
  expect(shareImage('https://cdn.test/image.jpg', origin, apiOrigin, 'https://cdn.test')).toBe('https://cdn.test/image.jpg');
});
