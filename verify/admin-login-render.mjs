import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.ADMIN_VERIFY_ORIGIN;
assert(origin, 'Set ADMIN_VERIFY_ORIGIN to the application origin.');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const response = await page.goto(new URL('/admin', origin).href, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), 'The Admin document must load.');
  const login = page.locator('main[data-admin-login="liquid-glass"]');
  await login.waitFor();
  await login.getByRole('status').getByText('Serveur opérationnel').waitFor();
  await page.waitForFunction(() => document.querySelector('.admin-login-art')?.naturalWidth > 0);
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await login.getByRole('textbox', { name: /Adresse email/ }).waitFor();
    await login.locator('input[name="password"][type="password"]').waitFor();
    await login.getByRole('button', { name: 'Se connecter', exact: true }).waitFor();
    const colors = await login.evaluate((node) => [getComputedStyle(node).backgroundColor, getComputedStyle(node.querySelector('.admin-login-box')).backgroundColor]);
    assert.deepEqual(colors, ['rgb(10, 10, 14)', 'rgb(23, 23, 30)'], `Dark canvas and dark form at ${width}px`);
    assert(await login.evaluate((node) => document.documentElement.scrollWidth <= node.clientWidth), `Horizontal overflow at ${width}px`);
    if (process.env.ADMIN_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.ADMIN_SCREENSHOT_DIR}/login-${width}.png`, fullPage: true });
  }
  await login.getByRole('button', { name: 'Afficher le mot de passe' }).click();
  assert.equal(await login.locator('input[name="password"]').getAttribute('type'), 'text');
  await login.getByRole('button', { name: 'Masquer le mot de passe' }).click();
  assert.equal(await login.locator('input[name="password"]').getAttribute('type'), 'password');
  console.log('Verified signed-out Admin rendering at 1440, 1024, 390 and 320px.');
} finally {
  await browser.close();
}
