import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Run against the composed local preview, never against a production account.
const base = process.env.ZAYROVI_TEST_WEB_URL || 'http://localhost:4173';
const output = process.env.ZAYROVI_TEST_WEB_OUTPUT;
const check = async (path, status) => {
  const r = await fetch(`${base}${path}`, { redirect: 'manual' });
  assert.equal(r.status, status, path);
  return { text: await r.text(), headers: r.headers };
};
assert.match((await check('/api/not-a-route', 404)).headers.get('content-type'), /json/);
assert.match((await check('/api/admin/auth/me', 401)).headers.get('content-type'), /json/);
assert.equal((await check('/reset-password', 200)).headers.get('referrer-policy'), 'no-referrer');
assert.equal((await check('/reset-password', 200)).headers.get('cache-control'), 'no-store');
assert.match((await check('/auth/native-done.html', 200)).text, /Connexion terminée/);
for (const url of ['/?customerAuth=success', '/?cardPayment=verify&orderId=sample&transaction=sample']) {
  const compatibility = await check(url, 200);
  assert.doesNotMatch(compatibility.text, /site-assets\/site.css/);
  assert.equal(compatibility.headers.get('referrer-policy'), 'no-referrer');
  assert.match(compatibility.headers.get('x-robots-tag'), /noindex/);
}
assert.match((await check('/publications?post=nonexistent_share', 404)).text, /Publication introuvable/);
for (const path of ['/.well-known/assetlinks.json', '/.well-known/apple-app-site-association']) {
  const association = await fetch(`${base}${path}`, { redirect: 'manual' });
  assert.ok(association.status === 200 || association.status === 404, path);
  assert.match(association.headers.get('content-type'), /json/);
}
assert.match((await check('/privacy.html', 200)).text, /confidentialit[ée]/i);
await check('/admin-build/assets/missing.js', 404);
await check('/site-assets/missing.webp', 404);
await check('/ar/r/unknown_share_item', 404);
if (process.env.ZAYROVI_TEST_WEB_FIXTURES === '1') {
  const fixtures = [
    ['/p/product_official_converse-chuck-taylor-hi', /Chuck Taylor All Star/, 'zayrovi://product/product_official_converse-chuck-taylor-hi'],
    ['/ar/r/reel_drive_capsule_wardrobe_v2', /خزانة ملابس أساسية/, 'zayrovi://reels-viewer?id=reel_drive_capsule_wardrobe_v2&amp;shared=1'],
    ['/s/official_story_everyday', /og:image/, 'zayrovi://stories?id=official_story_everyday'],
  ];
  for (const [path, copy, scheme] of fixtures) {
    const { text } = await check(path, 200);
    assert.match(text, copy);
    assert.ok(text.includes(scheme));
    const image = text.match(/property="og:image" content="([^"?]*)/)[1];
    const imageUrl = new URL(image);
    assert.ok(imageUrl.pathname.startsWith('/media/'));
    assert.match((await check(imageUrl.pathname, 200)).headers.get('content-type'), /^image\//);
  }
  const oldReel = await check('/reels-viewer?id=reel_drive_capsule_wardrobe_v2', 302);
  assert.equal(oldReel.headers.get('location'), '/r/reel_drive_capsule_wardrobe_v2');
}
if (output) await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.ZAYROVI_TEST_CHROMIUM || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  for (const [locale, width, dark] of [['fr', 1440, false], ['ar', 1440, false], ['fr', 320, false], ['ar', 360, true]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
    const failures = [];
    page.on('pageerror', e => failures.push(e.message));
    page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
    await page.goto(`${base}${locale === 'ar' ? '/ar/' : '/'}`);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('dir'), locale === 'ar' ? 'rtl' : 'ltr');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${locale} width ${width}`);
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), dark ? 'rgb(23, 18, 22)' : 'rgb(247, 244, 244)');
    const tabs = page.getByRole('tab');
    assert.equal(await tabs.count(), 3);
    await tabs.nth(0).focus();
    await page.keyboard.press(locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await tabs.nth(2).getAttribute('aria-selected'), 'true');
    await page.locator('#screen-2 img').evaluate(img => img.decode());
    await page.keyboard.press('Home');
    await page.locator('#screen-0 img').evaluate(img => img.decode());
    const question = page.locator('details').first();
    await question.locator('summary').click();
    assert.equal(await question.evaluate(el => el.open), true);
    await question.locator('summary').click();
    const url = await page.locator('#app a').first().getAttribute('href');
    assert.equal(url, 'zayrovi://lens');
    assert.deepEqual(failures, []);
    if (output) await page.evaluate(() => window.scrollTo(0, 0));
    if (output) await page.screenshot({ path: `${output}/landing-${locale}-${width}${dark ? '-dark' : ''}.png`, fullPage: true });
    await page.close();
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await context.newPage();
  await staticPage.goto(base);
  assert.equal(await staticPage.locator('main h1').isVisible(), true);
  assert.equal(await staticPage.locator('#screen-0 img').isVisible(), true);
  await context.close();
  const admin = await browser.newPage();
  const auth = admin.waitForResponse(r => r.url() === `${base}/api/admin/auth/me`);
  await admin.goto(`${base}/admin/orders`);
  assert.equal((await auth).status(), 401);
  await admin.getByRole('button', { name: 'Se connecter' }).waitFor();
  await admin.close();
  console.log('Verified HTTP boundaries, item metadata, FR/AR layout, dark mode, keyboard tabs, no-JS fallback and same-origin Admin login.');
} finally {
  await browser.close();
}
