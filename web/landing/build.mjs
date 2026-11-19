import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { landingHtml } from './lib/landing.mjs';
import { legalHtml, legalPaths } from './lib/legal.mjs';
import { originFrom } from '../runtime/config.mjs';
const drafts = process.env.NODE_ENV !== 'production' && !process.env.RENDER && process.env.ZAYROVI_LEGAL_DRAFTS === '1';
const origin = originFrom(process.env.ZAYROVI_WEB_ORIGIN || 'https://zayrovi.com', { local: process.env.NODE_ENV !== 'production' && !process.env.RENDER });
const root = new URL('../../dist/landing/', import.meta.url);
await rm(root, { recursive: true, force: true });
await cp(new URL('./assets/', import.meta.url), new URL('site-assets/', root), { recursive: true });
for (const locale of ['fr', 'ar']) {
  const dir = new URL(locale === 'ar' ? 'ar/' : './', root);
  await mkdir(dir, { recursive: true });
  const html = landingHtml(locale, origin, { drafts });
  for (const [, asset] of html.matchAll(/(?:src|href)="\/site-assets\/([^"?]+)"/g)) {
    await access(new URL(`site-assets/${asset}`, root));
  }
  await writeFile(new URL('index.html', dir), html);
  if (drafts) for (const slug of legalPaths) await writeFile(new URL(`${slug}.html`, dir), legalHtml(locale, slug, origin));
}
await writeFile(new URL('build-info.json', root), JSON.stringify({ origin, drafts }));
await writeFile(new URL('robots.txt', root), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(new URL('sitemap.xml', root), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url><url><loc>${origin}/ar/</loc></url></urlset>`);
console.log(`Public web built: ${fileURLToPath(root)} (FR, AR${drafts ? ', legal drafts' : ''})`);
