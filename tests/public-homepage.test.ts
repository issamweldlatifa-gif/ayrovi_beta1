import express from 'express';
import request from 'supertest';
import { expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicHomepageRouter } from '../src/public/homepage';

it('retires the public legacy homepage alias only, preserving checkout, login, and all other surfaces', async () => {
  const build = mkdtempSync(join(tmpdir(), 'zayrovi-cutover-'));
  try {
    const manifest = join(build, 'build-info.json');
    mkdirSync(join(build, 'site-assets'));
    for (const file of ['site.css', 'site.js', 'mark.svg']) writeFileSync(join(build, 'site-assets', file), 'test asset');
    writeFileSync(manifest, '{"drafts":true}');
    expect(() => publicHomepageRouter('https://example.test', build)).toThrow(/draft/);
    writeFileSync(manifest, '{"drafts":false}');
    const app = express();
    app.use(publicHomepageRouter('https://example.test', build));
    app.get('/api/probe', (_req, res) => res.json({ ok: true }));
    app.get('*', (_req, res) => res.send('legacy compatibility'));
    const get = (path: string) => request(app).get(path);
    expect((await get('/').expect(200)).text).toContain('https://example.test/');
    expect((await get('/?utm_source=link').expect(200)).text).toContain('/site-assets/site.css');
    expect((await get('/ar/').expect(200)).text).toContain('lang="ar" dir="rtl"');
    for (const alias of ['/index.html', '/%69ndex.html', '/INDEX.HTML']) await get(alias).expect(302).expect('location', '/');
    for (const path of ['/?%63ustomerAuth=success', '/?cardPayment=verify&orderId=x', '/index.html?cardPayment=cancel']) {
      await get(path).expect(200, 'legacy compatibility').expect('cache-control', 'no-store').expect('referrer-policy', 'no-referrer');
    }
    for (const path of ['/admin', '/auth/native-done.html', '/reset-password', '/privacy.html', '/publications?post=1', '/.well-known/assetlinks.json']) await get(path).expect(200, 'legacy compatibility');
    await get('/api/probe').expect(200, { ok: true });
    await get('/site-assets/missing.css').expect(404);
    await get('/site-assets/site.css').expect(200, 'test asset');
  } finally { rmSync(build, { recursive: true, force: true }); }
});
