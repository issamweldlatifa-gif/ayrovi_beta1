import { expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';
import { app } from '../src/server';
import { appleAppLinksForHost, IOS_APP_LINK_APP_ID_ENV, IOS_APP_LINK_BUNDLE_ID, IOS_APP_LINK_HOSTS_ENV } from '../shared/appleAppLinks';
import paths from '../shared/shareLinkPaths.json';
import manifest from '../apps/mobile/app.json';
const require = createRequire(`${process.cwd()}/package.json`);
const configureExpo = require('./apps/mobile/app.config.js');
const fixtureID = `DEMO000001.${manifest.expo.ios.bundleIdentifier}`;
const env = { [IOS_APP_LINK_APP_ID_ENV]: fixtureID, [IOS_APP_LINK_HOSTS_ENV]: 'share.example.test, www.share.example.test' };

it('publishes real configured identifiers only for allowlisted hosts and share paths', () => {
  expect(IOS_APP_LINK_BUNDLE_ID).toBe(manifest.expo.ios.bundleIdentifier);
  expect(appleAppLinksForHost(env, 'share.example.test')).toEqual({
    applinks: { details: [{ appIDs: [fixtureID], components: paths.map(path => ({ '/': path })) }] },
  });
  for (const host of [undefined, 'api.example.test', 'share.example.test:8443']) expect(appleAppLinksForHost(env, host)).toBeNull();
  expect(appleAppLinksForHost({}, 'share.example.test')).toBeNull();
  expect(appleAppLinksForHost({ ...env, IOS_APP_LINK_APP_ID: 'DEMO000001.app.other.mobile' }, 'share.example.test')).toBeNull();
  expect(appleAppLinksForHost({ ...env, IOS_APP_LINK_HOSTS: 'https://share.example.test' }, 'share.example.test')).toBeNull();
});

it('serves extensionless association JSON with no redirect; missing deployment config is an explicit 404', async () => {
  try {
    vi.stubEnv(IOS_APP_LINK_APP_ID_ENV, '');
    await request(app).get('/.well-known/apple-app-site-association').set('Host', 'share.example.test')
      .expect(404).expect('content-type', /json/).expect('cache-control', 'no-store');
    vi.stubEnv(IOS_APP_LINK_APP_ID_ENV, fixtureID);
    vi.stubEnv(IOS_APP_LINK_HOSTS_ENV, env.IOS_APP_LINK_HOSTS);
    for (const path of ['/.well-known/apple-app-site-association', '/apple-app-site-association']) {
      const result = await request(app).get(path).set('Host', 'share.example.test').expect(200).expect('content-type', /json/);
      expect(result.headers.location).toBeUndefined();
      expect(result.body).toEqual(appleAppLinksForHost(env, 'share.example.test'));
    }
    await request(app).get('/.well-known/apple-app-site-association').set('Host', 'api.example.test')
      .set('X-Forwarded-Host', 'share.example.test').expect(404);
  } finally { vi.unstubAllEnvs(); }
});

it('preserves Expo defaults, scopes a new Android host, and opts iOS in separately', () => {
  const config = manifest.expo;
  try {
    vi.stubEnv('EXPO_PUBLIC_SHARE_WEB_ORIGIN', '');
    vi.stubEnv('ZAYROVI_IOS_UNIVERSAL_LINKS', '');
    expect(configureExpo({ config })).toBe(config);
    vi.stubEnv('ZAYROVI_IOS_UNIVERSAL_LINKS', '1');
    expect(() => configureExpo({ config })).toThrow(/require EXPO_PUBLIC_SHARE_WEB_ORIGIN/);
    vi.stubEnv('EXPO_PUBLIC_SHARE_WEB_ORIGIN', 'https://share.example.test');
    const configured = configureExpo({ config });
    expect(configured.android.intentFilters.slice(0, -1)).toEqual(config.android.intentFilters);
    expect(configured.android.intentFilters.at(-1).data).toEqual(paths.map(path => ({ scheme: 'https', host: 'share.example.test', pathPrefix: path.slice(0, -1) })));
    expect(configured.ios.associatedDomains).toEqual(['applinks:share.example.test']);
    vi.stubEnv('EXPO_PUBLIC_SHARE_WEB_ORIGIN', 'https://zayrovi.com');
    expect(configureExpo({ config }).android.intentFilters).toEqual(config.android.intentFilters);
    vi.stubEnv('EXPO_PUBLIC_SHARE_WEB_ORIGIN', 'https://share.example.test/something');
    expect(() => configureExpo({ config })).toThrow(/HTTPS website origin/);
  } finally { vi.unstubAllEnvs(); }
});
