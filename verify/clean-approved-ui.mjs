/** Real web rendering + an explicitly virtual camera. Not a physical-phone acceptance test.
 * Run against a running server: node verify/clean-approved-ui.mjs
 * Optional: APP_URL, CLEAN_BROWSER_EXECUTABLE, CLEAN_BROWSER_ARGS (JSON array).
 * Screenshots are ignored review artifacts under .cache/clean-review/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
fs.mkdirSync('.cache/clean-review', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CLEAN_BROWSER_EXECUTABLE ? { executablePath: process.env.CLEAN_BROWSER_EXECUTABLE } : {}),
  args: [...JSON.parse(process.env.CLEAN_BROWSER_ARGS || '[]'), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'], reducedMotion: 'reduce' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://localhost:3000', { waitUntil: 'networkidle' });
  assert.deepEqual(await page.locator('nav button').evaluateAll(es => es.map(e => e.getAttribute('aria-label'))), ['Accueil', 'Lens — recherche par image', 'Clean', 'AYWEBs', 'Profil']);
  await page.screenshot({ path: '.cache/clean-review/home-approved.png' });
  await page.getByRole('button', { name: 'Clean', exact: true }).click(); await page.locator('textarea').waitFor();
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running'));
  const styles = await page.locator('.clean-suggestion').evaluateAll(es => es.map(e => {
    const s = getComputedStyle(e); return { font: s.fontFamily, weight: s.fontWeight, color: s.color, background: s.backgroundColor };
  }));
  assert.equal(styles.length, 3);
  assert(styles.every(s => s.font.startsWith('Arial') && s.weight === '400' && s.color === 'rgb(0, 0, 0)' && s.background === 'rgb(192, 249, 255)'));
  assert.equal(await page.locator('.clean-wordmark').evaluate(e => getComputedStyle(e).fontFamily.startsWith('Arial')), true);
  assert.equal(await page.locator('[data-clean-composer] > div').evaluate(e => getComputedStyle(e).borderTopWidth), '1px');
  await page.screenshot({ path: '.cache/clean-review/welcome-approved.png' });
  // Reduced viewport checks layout only, not an actual OS keyboard.
  await page.setViewportSize({ width: 390, height: 480 });
  await page.locator('textarea').fill('Je cherche des baskets');
  const composer = await page.locator('[data-clean-composer]').boundingBox(); assert(composer.y + composer.height <= 481);
  await page.getByRole('button', { name: 'Envoyer', exact: true }).waitFor();
  await page.screenshot({ path: '.cache/clean-review/short-viewport.png' });
  await page.locator('textarea').fill(''); await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Menu Clean', exact: true }); await menu.waitFor();
  assert.equal(await menu.getByRole('button').count(), 1); // Only the close affordance, no old contents.
  await menu.getByRole('button').click();
  await page.getByRole('button', { name: 'Ajouter au chat', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ajouter au chat', exact: true }).waitFor();
  assert.deepEqual(await page.locator('.clean-attachment-row').allTextContents(), ['Appareil photo', 'AYWEBs', 'Lens', 'Photos', 'Fichiers']);
  await page.screenshot({ path: '.cache/clean-review/sheet-approved.png' });
  await page.getByRole('button', { name: 'Appareil photo', exact: true }).click();
  const camera = page.getByRole('dialog', { name: 'Appareil photo', exact: true }); await camera.waitFor();
  await page.waitForFunction(() => document.querySelector('.clean-camera-shutter')?.disabled === false);
  await page.screenshot({ path: '.cache/clean-review/camera-virtual-device.png' });
  await camera.getByRole('button', { name: 'Options de la caméra', exact: true }).click();
  await camera.getByRole('button', { name: 'Changer de caméra', exact: true }).waitFor();
  await page.screenshot({ path: '.cache/clean-review/camera-options-virtual-device.png' });
  await camera.getByRole('button', { name: 'Options de la caméra', exact: true }).click();
  await camera.getByRole('button', { name: 'Prendre une photo', exact: true }).click();
  await camera.waitFor({ state: 'detached' });
  await page.getByRole('region', { name: 'Images prêtes à envoyer', exact: true }).waitFor();
  assert.equal(await page.locator('[data-clean-composer] img').count(), 1);
  assert.deepEqual(errors, []);
  console.log('Clean: actual computed type/color, five-tab navigation, reduced-viewport composer, empty menu, five sheet actions and virtual-device camera/options/capture passed. No physical-phone acceptance claimed.');
} finally { await browser.close(); }
