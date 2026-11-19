import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { originFrom } from '../web/runtime/config.mjs';
import { itemID } from '../web/runtime/routes.mjs';

const paths = JSON.parse(readFileSync(new URL('../shared/shareLinkPaths.json', import.meta.url), 'utf8'));
const startsWithJSON = value => /^application\/json\b/i.test(value || '');
const sha256 = raw => /^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i.test(raw) ? raw.replaceAll(':', '').toUpperCase()
  : /^[0-9a-f]{64}$/i.test(raw) ? raw.toUpperCase() : '';
const androidRelation = 'delegate_permission/common.handle_all_urls';

/** Read-only check. A passing HTTP preflight is not proof of device association or payment. */
export async function checkCutover({ origin, fixtures, appleID, androidPackage, androidFingerprints }, fetcher = fetch) {
  const base = originFrom(origin);
  if (!base) throw new Error('Provide an HTTPS origin.');
  if (appleID && !/^[A-Z0-9]{10}\.app\.zayrovi\.mobile$/.test(appleID)) throw new Error('Invalid signed iOS application-identifier.');
  const fingerprints = androidFingerprints ? androidFingerprints.split(',').map(value => sha256(value.trim())) : [];
  if (fingerprints.some(value => !value)) throw new Error('Invalid Android signing SHA-256.');
  if (fingerprints.length && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(androidPackage || '')) throw new Error('Invalid Android package.');
  if (!fixtures || ['p', 'r', 's'].some(kind => !itemID.test(fixtures[kind] ?? ''))) throw new Error('Provide one known, currently public ID for Product, Reel and Story.');
  const check = async (path, status, verify) => {
    const response = await fetcher(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    if (response.status !== status) throw new Error(`${path}: expected ${status}, received ${response.status}`);
    if (!await verify(response)) throw new Error(`${path}: route/content/association contract did not match`);
  };
  for (const [path, locale] of [['/', 'fr'], ['/ar/', 'ar']]) {
    await check(path, 200, async r => {
      const body = await r.text();
      return !/noindex/i.test(r.headers.get('x-robots-tag') || '') && body.includes(`<html lang="${locale}"`) &&
        body.includes(`rel="canonical" href="${base}${path}"`) && body.includes('/site-assets/site.css');
    });
  }
  await check('/admin', 200, async r => r.headers.get('x-frame-options') === 'DENY' &&
    /frame-ancestors\s+'none'/i.test(r.headers.get('content-security-policy') || '') && (await r.text()).includes('/admin-build/assets/'));
  await check('/api/admin/auth/me', 401, async r => startsWithJSON(r.headers.get('content-type')));
  await check('/api/__zayrovi_cutover_nonexistent', 404, async r => startsWithJSON(r.headers.get('content-type')));
  await check('/reset-password', 200, async r => r.headers.get('referrer-policy') === 'no-referrer' && /no-store/.test(r.headers.get('cache-control') || ''));
  await check('/auth/native-done.html', 200, async r => (await r.text()).includes('Connexion terminée'));
  for (const path of ['/?customerAuth=error', '/?cardPayment=cancel']) {
    await check(path, 200, async r => /no-store/.test(r.headers.get('cache-control') || '') &&
      /noindex/.test(r.headers.get('x-robots-tag') || '') && !(await r.text()).includes('/site-assets/site.css'));
  }
  for (const path of ['/privacy.html', '/terms.html', '/data-deletion.html']) {
    await check(path, 200, async r => /^text\/html\b/.test(r.headers.get('content-type') || '') && !(await r.text()).includes('/site-assets/site.css'));
  }
  await check('/publications?post=__zayrovi_cutover_nonexistent', 404, async r => (await r.text()).includes('Publication introuvable'));
  for (const kind of ['p', 'r', 's']) for (const locale of ['', 'ar/']) {
    const path = `/${locale}${kind}/${fixtures[kind]}`;
    await check(path, 200, async r => {
      const body = await r.text();
      const scheme = kind === 'p' ? `zayrovi://product/${fixtures[kind]}` : kind === 'r'
        ? `zayrovi://reels-viewer?id=${fixtures[kind]}` : `zayrovi://stories?id=${fixtures[kind]}`;
      return body.includes(`property="og:url" content="${base}${path}"`) && body.includes('property="og:image"') && body.includes(scheme);
    });
  }
  await check('/r/not%20a%20valid%20id', 404, async r => /noindex/.test(await r.text()));
  if (appleID) {
    await check('/.well-known/apple-app-site-association', 200, async r => {
      if (!startsWithJSON(r.headers.get('content-type'))) return false;
      const info = await r.json();
      return Array.isArray(info?.applinks?.details) && info.applinks.details.some(item =>
        JSON.stringify(item.appIDs) === JSON.stringify([appleID]) &&
        JSON.stringify(item.components) === JSON.stringify(paths.map(path => ({ '/': path }))));
    });
  }
  if (fingerprints.length) {
    await check('/.well-known/assetlinks.json', 200, async r => {
      if (!startsWithJSON(r.headers.get('content-type'))) return false;
      const entries = await r.json();
      return Array.isArray(entries) && entries.some(entry => Array.isArray(entry?.relation) && entry.relation.includes(androidRelation) &&
        entry?.target?.namespace === 'android_app' && entry.target.package_name === androidPackage &&
        Array.isArray(entry.target.sha256_cert_fingerprints) && fingerprints.every(fp => entry.target.sha256_cert_fingerprints.map(sha256).includes(fp)));
    });
  }
  return { web: 'passed', ios: appleID ? 'passed' : 'not checked', android: fingerprints.length ? 'passed' : 'not checked' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  try {
    const result = await checkCutover({ origin: process.argv[2], fixtures: { p: env.CUTOVER_PRODUCT_ID, r: env.CUTOVER_REEL_ID, s: env.CUTOVER_STORY_ID },
      appleID: env.IOS_APP_LINK_APP_ID, androidPackage: env.CUTOVER_ANDROID_PACKAGE || 'app.zayrovi.mobile', androidFingerprints: env.ANDROID_APP_LINK_SHA256 });
    console.log(result, '\nHTTP checks only. Signed physical-device acceptance and legal/operations approval are separate.');
  } catch (error) {
    console.error(`Cutover preflight failed: ${error.message}`);
    process.exitCode = 1;
  }
}
