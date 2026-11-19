import { expect, it } from 'vitest';
import { checkCutover } from '../verify/public-cutover.mjs';
import { appleAppLinksForHost } from '../shared/appleAppLinks';
import { landingHtml } from '../web/landing/lib/landing.mjs';
import { shareHtml } from '../web/landing/lib/share.mjs';
const origin = 'https://share.example.test';
const appleID = 'DEMO000001.app.zayrovi.mobile';
const androidPackage = 'app.zayrovi.mobile';
const androidFingerprints = '9A'.repeat(32);
const fixtures = { p: 'product_1', r: 'reel_1', s: 'story_1' };
const options = { origin, appleID, androidPackage, androidFingerprints, fixtures };

function getMock(mutate?: (path: string) => Response | undefined) {
  return async (raw: string, init: RequestInit) => {
    expect(init.redirect).toBe('manual');
    expect(init.method).toBeUndefined(); // This is a read-only smoke test.
    const url = new URL(raw);
    const path = url.pathname + url.search;
    const override = mutate?.(path);
    if (override) return override;
    if (path === '/' || path === '/ar/') return new Response(landingHtml(path === '/' ? 'fr' : 'ar', origin));
    if (path === '/admin') return new Response('<script src="/admin-build/assets/admin-1.js"></script>', { headers: {
      'x-frame-options': 'DENY', 'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    } });
    if (path === '/api/admin/auth/me') return Response.json({}, { status: 401 });
    if (path.startsWith('/api/')) return Response.json({}, { status: 404 });
    if (path === '/reset-password') return new Response('Legacy', { headers: { 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' } });
    if (path === '/auth/native-done.html') return new Response('Connexion terminée');
    if (path.startsWith('/?')) return new Response('Legacy return', { headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
    if (path.endsWith('.html')) return new Response('Legal', { headers: { 'content-type': 'text/html' } });
    if (path.startsWith('/publications?')) return new Response('Publication introuvable', { status: 404 });
    if (path === '/.well-known/apple-app-site-association') return Response.json(appleAppLinksForHost({ IOS_APP_LINK_HOSTS: url.host, IOS_APP_LINK_APP_ID: appleID }, url.host));
    if (path === '/.well-known/assetlinks.json') return Response.json([{ relation: ['delegate_permission/common.handle_all_urls'], target: {
      namespace: 'android_app', package_name: androidPackage, sha256_cert_fingerprints: [androidFingerprints.match(/.{2}/g)!.join(':')],
    } }]);
    if (path.includes('%20')) return new Response('<meta name="robots" content="noindex">', { status: 404 });
    const [, ar, prefix, id] = path.match(/^\/(ar\/)?([prs])\/(.+)$/)!;
    return new Response(shareHtml({ locale: ar ? 'ar' : 'fr', prefix, id, card: { title: 'Published' }, origin, apiOrigin: origin }));
  };
}

it('accepts an assembled cutover and explicitly reports checks without signing data as not checked', async () => {
  expect(await checkCutover(options, getMock())).toEqual({ web: 'passed', ios: 'passed', android: 'passed' });
  expect(await checkCutover({ ...options, appleID: undefined, androidFingerprints: undefined }, getMock())).toEqual({ web: 'passed', ios: 'not checked', android: 'not checked' });
});

it('rejects a callback routed to the landing, a redirected AASA, and a mismatched signing fingerprint', async () => {
  await expect(checkCutover(options, getMock(path => path.includes('cardPayment') ? new Response(landingHtml('fr', origin)) : undefined))).rejects.toThrow(/cardPayment/);
  await expect(checkCutover(options, getMock(path => path.endsWith('apple-app-site-association') ? Response.redirect(origin) : undefined))).rejects.toThrow(/expected 200, received 302/);
  await expect(checkCutover({ ...options, androidFingerprints: '9B'.repeat(32) }, getMock())).rejects.toThrow(/assetlinks\.json/);
});
