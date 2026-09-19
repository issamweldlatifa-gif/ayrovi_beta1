/** Run after npm run build + npm start. OAuth config is mocked; no provider calls. */
import { chromium, firefox } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.AUTH_TEST_URL || 'http://127.0.0.1:3000';
const output = 'screenshots/auth-mobile';
await mkdir(output, { recursive: true });
const config = { passwordReset: { enabled: true }, google: { enabled: true }, facebook: { enabled: false }, apple: { enabled: false }, email: { enabled: true }, phoneOtp: { enabled: true }, checkoutRequiresAuthentication: true };
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
async function open(browser, { width = 390, height = 844, locale = 'fr', providers = config, failConfig = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale });
  await context.addInitScript(({locale}) => {
    localStorage.setItem('ayrovi.locale.v1', locale);
    history.replaceState({ __ayroviNavigationV1: { version: 1, depth: 0, stack: [{ id: 'app:account' }] } }, '');
  }, { locale });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/customer/auth/config', route => failConfig ? route.abort() : route.fulfill({ json: { success: true, data: providers } }));
  await page.goto(base, {waitUntil:'domcontentloaded'});
  await page.locator('.ay-auth__card').waitFor();
  if (!failConfig && providers.email.enabled) await page.locator('#auth-email').waitFor();
  return { context, page, errors };
}
async function layout(page) {
  check(await page.locator('.ay-auth').evaluate(el => el.scrollWidth <= el.clientWidth), 'no horizontal overflow');
  check(await page.locator('.ay-auth__logo').evaluate(el => el.getBoundingClientRect().top >= 0 && el.complete && el.naturalWidth > 0), 'logo loaded and not clipped');
  check(await page.locator('#auth-email').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16 && el.getBoundingClientRect().height >= 48), 'mobile field size');
  check(await page.locator('.ay-auth__submit').evaluate(el => el.getBoundingClientRect().height >= 48), 'primary touch target');
}
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true });
  const name = engine.name();
  for (const width of [320, 360, 390, 430, 1280]) {
    const {page, context, errors} = await open(browser, {width});
    await layout(page);
    check(await page.locator('#auth-email').inputValue() === '', 'fresh email empty');
    check(await page.locator('#auth-password').inputValue() === '', 'fresh password empty');
    check(await page.locator('.ay-auth__provider').count() === 1, 'only enabled providers');
    if (width === 390 && name === 'chromium') await page.screenshot({path: `${output}/login-fr.png`});
    await page.locator('.ay-auth__switch button').click();
    await page.locator('#auth-name').waitFor();
    await layout(page);
    check(await page.locator('#auth-password').getAttribute('autocomplete') === 'off', 'registration requests manual credentials');
    if (width === 390 && name === 'chromium') await page.screenshot({path: `${output}/register-fr.png`});
    check(errors.length === 0, `no runtime errors ${errors}`);
    await context.close();
  }
  {
    const {page, context} = await open(browser, {locale: 'ar'});
    check(await page.getByRole('dialog').getAttribute('dir') === 'rtl', 'RTL dialog');
    await layout(page);
    if (name === 'chromium') await page.screenshot({path: `${output}/login-ar.png`});
    await page.locator('#auth-password').click();
    await page.locator('#auth-password').fill('Test-only-Password!');
    await page.locator('.ay-auth__password-toggle').click();
    check(await page.locator('#auth-password').getAttribute('type') === 'text', 'password reveal');
    check(await page.locator('.ay-auth__password-toggle').getAttribute('aria-pressed') === 'true', 'password state accessible');
    await page.locator('.ay-auth__switch button').click();
    check(await page.locator('#auth-password').inputValue() === '', 'mode switch clears password');
    check(await page.locator('#auth-password').getAttribute('type') === 'password', 'mode switch masks password');
    if (name === 'chromium') await page.screenshot({path: `${output}/register-ar.png`});
    await context.close();
  }
  {
    const {page, context} = await open(browser);
    await page.locator('.ay-auth__recovery-link').click();
    await page.locator('#recovery-email').waitFor();
    check(await page.locator('#recovery-email').isVisible(), 'functional recovery form');
    await page.getByRole('button', {name: 'Retour à la connexion', exact: true}).first().click();
    await page.route('**/api/customer/auth/email/login', async route => {
      check(route.request().postDataJSON().email === 'ui-test@example.com', 'entered email submitted');
      await route.fulfill({status: 401, json: { success: false, error: 'Identifiants incorrects.' }});
    });
    await page.locator('#auth-email').click();
    await page.locator('#auth-email').fill('ui-test@example.com');
    await page.locator('#auth-password').click();
    await page.locator('#auth-password').fill('Test-only-Password!');
    await page.locator('.ay-auth__submit').click();
    await page.locator('#auth-error').waitFor();
    check(await page.locator('#auth-error').getAttribute('role') === 'alert', 'error announced');
    await page.locator('.ay-auth__header button').click();
    await page.getByRole('button', {name: 'Ouvrir mon espace', exact: true}).click();
    await page.locator('#auth-email').waitFor();
    check(await page.locator('#auth-email').inputValue() === '', 'reopen clears email');
    check(await page.locator('#auth-password').inputValue() === '', 'reopen clears password');
    await page.locator('.ay-auth__phone').click();
    check(await page.getByRole('heading', {name: 'Continuer par téléphone'}).isVisible(), 'SMS route preserved');
    await context.close();
  }
  {
    const providers = structuredClone(config);
    providers.google.enabled = providers.phoneOtp.enabled = false;
    const {page, context} = await open(browser, { providers });
    check(await page.locator('.ay-auth__provider').count() === 0, 'disabled social hidden');
    check(await page.locator('.ay-auth__divider').count() === 0, 'no orphan separator');
    check(await page.locator('.ay-auth__phone').count() === 0, 'disabled SMS hidden');
    await context.close();
  }
  {
    const {page, context} = await open(browser, {failConfig: true});
    await page.getByRole('button', {name: 'Réessayer'}).waitFor();
    await page.unroute('**/api/customer/auth/config');
    await page.route('**/api/customer/auth/config', route => route.fulfill({json: {success: true, data: config}}));
    await page.getByRole('button', {name: 'Réessayer'}).click();
    await page.locator('#auth-email').waitFor();
    check(true, 'config failure can retry');
    await context.close();
  }
  {
    const {page, context} = await open(browser, {height: 480});
    await page.locator('.ay-auth__switch button').click();
    await page.locator('#auth-name').click();
    await page.locator('#auth-name').fill('Client Test');
    await page.locator('#auth-email').click();
    await page.locator('#auth-email').fill('ui-test@example.com');
    await page.locator('#auth-password').click();
    await page.locator('#auth-password').fill('Test-only-Password!');
    await page.locator('#auth-password').press('Tab');
    check(await page.locator('.ay-auth__password-toggle').evaluate(el => el === document.activeElement), 'password toggle reachable by keyboard');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/customer/auth/email/register', async route => {
      const payload = route.request().postDataJSON();
      check(payload.displayName === 'Client Test' && payload.email === 'ui-test@example.com' && payload.password === 'Test-only-Password!', 'registration payload preserved');
      await gate;
      await route.fulfill({status: 400, json: {success: false, error: 'Test : inscription refusée.'}});
    });
    await page.locator('.ay-auth__submit').click();
    check(await page.locator('.ay-auth__submit').isDisabled(), 'pending submission disabled');
    check(await page.locator('#auth-email').isDisabled(), 'pending fields disabled');
    release();
    await page.locator('#auth-error').waitFor();
    check(await page.locator('.ay-auth__submit').isEnabled(), 'can retry after error');
    await page.locator('.ay-auth__switch button').click();
    check(await page.locator('#auth-password').inputValue() === '', 'switch from failed registration clears secret');
    await context.close();
  }
  {
    const {page, context} = await open(browser);
    check(await page.locator('#auth-email').getAttribute('autocomplete') === 'off', 'email autofill disabled');
    check(await page.locator('#auth-password').getAttribute('autocomplete') === 'off', 'password autofill disabled');
    check(await page.locator('#auth-email').evaluate(el => el.readOnly), 'email protected before interaction');
    check(await page.locator('#auth-password').evaluate(el => el.readOnly), 'password protected before interaction');
    check(await page.locator('.ay-auth__submit').isDisabled(), 'empty protected form cannot submit');
    // Simulate a saved credential being injected before any visitor interaction.
    await page.locator('#auth-email').evaluate(el => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'saved-person@example.com');
      el.dispatchEvent(new Event('input', {bubbles:true}));
    });
    check(await page.locator('#auth-email').inputValue() === '', 'unsolicited email injection discarded');
    await page.locator('#auth-email').focus();
    check(await page.locator('#auth-email').isEditable(), 'keyboard focus enables normal entry');
    await page.locator('#auth-email').fill('visitor@example.com');
    await page.locator('#auth-password').focus();
    await page.locator('#auth-password').fill('Visitor-only-password!');
    check(await page.locator('.ay-auth__submit').isEnabled(), 'manual entry permits login');
    await page.locator('.ay-auth__password-toggle').click();
    check(await page.locator('#auth-email').inputValue() === 'visitor@example.com', 'unrelated render preserves manual typing');
    await page.locator('.ay-auth__switch button').click();
    check(await page.locator('#auth-email').inputValue() === '', 'switch to registration clears email');
    check(await page.locator('#auth-name').inputValue() === '', 'registration starts with no name');
    await page.locator('#auth-name').focus();
    await page.locator('#auth-name').fill('Another Visitor');
    await page.locator('#auth-email').focus();
    await page.locator('#auth-email').fill('another-visitor@example.com');
    await page.locator('.ay-auth__switch button').click();
    check(await page.locator('#auth-email').inputValue() === '', 'switch back to login clears email');
    await page.locator('#auth-email').focus();
    await page.locator('#auth-email').fill('visitor@example.com');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true})));
    check(await page.locator('#auth-email').inputValue() === '', 'back-forward restoration clears identity');
    check(await page.locator('#auth-email').evaluate(el => el.readOnly), 'restoration re-arms manual-entry guard');
    await context.close();
  }
  await browser.close();
  console.log(`${name}: mobile / desktop / RTL / empty credentials / providers / recovery / error / reopen / SMS passed`);
}
console.log(`${checks} assertions passed. Screenshots: ${output} (mocked OAuth availability, no real sign-in).`);
