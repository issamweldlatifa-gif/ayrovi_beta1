/** Real browser -> real APIs -> SQLite -> mail worker. Only external mail transport is mocked.
 * npm run build
 * npx esbuild verify/customer-auth-functional.ts --bundle --platform=node --packages=external --outfile=.cache/auth-functional.cjs
 * node .cache/auth-functional.cjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

async function run() {
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_PATH: ':memory:', CUSTOMER_AUTH_SECRET: 'auth-functional-test-only-secret-01234567890123456789',
    ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'Test-admin-password-123!',
    MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'test-not-real', MAIL_FROM: 'AYROVI <no-reply@example.com>',
    GOOGLE_CLIENT_ID: '', FACEBOOK_APP_ID: '', APPLE_CLIENT_ID: '', CUSTOMER_OTP_PROVIDER: 'console',
  });
  const mails: any[] = [];
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://api.resend.com/emails') {
      mails.push(JSON.parse(String(init?.body)));
      return new Response('{}', {status: 200});
    }
    return nativeFetch(url, init);
  };
  const { app, db } = await import('../src/server');
  const { processCustomerAuthMail } = await import('../src/customer/accountMail');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  process.env.PUBLIC_BASE_URL = base;
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({viewport: {width: 390,height: 844}, locale: 'fr'});
  const page = await context.newPage();
  let count = 0;
  const check = (value: unknown, message: string) => { assert.ok(value, message); count++; };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const output = process.env.AYROVI_AUTH_OUTPUT || 'screenshots/auth-functional';
  await mkdir(output,{recursive:true});
  try {
    await page.goto(`${base}/?customerAuth=login`);
    await page.locator('#auth-email').waitFor();
    check(await page.locator('.ay-auth__provider').count()===0, 'unconfigured social providers hidden');
    await page.locator('.ay-auth__switch button').click();
    await page.locator('#auth-name').click();
    await page.locator('#auth-name').fill('Client Test');
    await page.locator('#auth-email').click();
    await page.locator('#auth-email').fill('functional@example.com');
    await page.locator('#auth-password').click();
    await page.locator('#auth-password').fill('Original-password-1!');
    await page.locator('.ay-auth__submit').click();
    await page.getByRole('heading',{name:'Mon compte',exact:true}).waitFor();
    check(db.get<any>("SELECT count(*) n FROM customer_auth_mail_jobs WHERE kind='WELCOME'")?.n===1,'welcome queued by actual registration');
    await processCustomerAuthMail(db);
    check(mails.length===1 && mails[0].to[0]==='functional@example.com','welcome handed to provider adapter');
    check(mails[0].html.includes('Client Test') && !mails[0].html.includes('Original-password'),'welcome has name, never password');
    await writeFile(`${output}/welcome-email.html`,mails[0].html);
    await page.getByRole('button',{name:'Se déconnecter',exact:true}).click();
    await page.locator('#auth-email').waitFor();
    check(await page.locator('#auth-email').inputValue()==='', 'logout clears credentials');
    await page.locator('.ay-auth__recovery-link').click();
    await page.locator('#recovery-email').waitFor();
    await page.locator('#recovery-email').fill('functional@example.com');
    await page.screenshot({path:`${output}/request-fr.png`});
    await page.getByRole('button',{name:'Envoyer le lien',exact:true}).click();
    await page.getByText('Demande enregistrée',{exact:true}).waitFor();
    check(await page.locator('button[type="submit"]').isDisabled(),'resend countdown prevents duplicate clicks');
    await processCustomerAuthMail(db);
    const mail=mails.find(mail=>mail.html.includes('/reset-password#token='));
    check(Boolean(mail),'reset message actually produced');
    const link=mail.html.match(/href="([^"]*\/reset-password#token=[^"]+)"/)[1];
    const response=await page.goto(link);
    check(response?.headers()['referrer-policy']==='no-referrer','recovery page has no-referrer policy');
    check(response?.headers()['cache-control']==='no-store','recovery page not cached');
    await page.locator('#recovery-password').waitFor();
    check(!page.url().includes('#token='),'token scrubbed from address bar');
    await page.screenshot({path:`${output}/reset-fr.png`});
    await page.locator('#recovery-password').fill('Updated-password-2!');
    await page.locator('#recovery-confirm').fill('Different-password-3!');
    await page.getByRole('button',{name:'Enregistrer le mot de passe',exact:true}).click();
    await page.getByRole('alert').waitFor();
    check(await page.getByRole('alert').innerText()==='Les mots de passe ne correspondent pas.','confirmation mismatch handled');
    await page.locator('#recovery-confirm').fill('Updated-password-2!');
    await page.getByRole('button',{name:'Afficher les mots de passe'}).click();
    check(await page.locator('#recovery-confirm').getAttribute('type')==='text','reveal works on both fields');
    await page.getByRole('button',{name:'Masquer les mots de passe'}).click();
    await page.getByRole('button',{name:'Enregistrer le mot de passe',exact:true}).click();
    await page.getByRole('heading',{name:'C’est fait !'}).waitFor();
    check(db.get<any>('SELECT count(*) n FROM customer_sessions').n===0,'old sessions actually revoked');
    await page.screenshot({path:`${output}/success-fr.png`});
    await page.getByRole('button',{name:'Se connecter',exact:true}).click();
    await page.locator('#auth-email').waitFor();
    await page.locator('#auth-email').click();
    await page.locator('#auth-email').fill('functional@example.com');
    await page.locator('#auth-password').click();
    await page.locator('#auth-password').fill('Original-password-1!');
    await page.locator('.ay-auth__submit').click();
    await page.locator('#auth-error').waitFor();
    check((await page.locator('#auth-error').innerText()).includes('incorrect'),'old password rejected');
    await page.locator('#auth-password').click();
    await page.locator('#auth-password').fill('Updated-password-2!');
    await page.locator('.ay-auth__submit').click();
    await page.getByRole('heading',{name:'Mon compte',exact:true}).waitFor();
    check(true,'new password logs in through real backend');
    await page.goto(link);
    await page.getByRole('button',{name:'Demander un nouveau lien',exact:true}).waitFor();
    check(await page.getByRole('alert').isVisible(),'reused link rejected');
    await page.getByRole('button',{name:'Demander un nouveau lien',exact:true}).click();
    await page.locator('#recovery-email').waitFor();
    check(true,'invalid-link action opens real request form');
    process.env.MAIL_API_KEY='';
    await page.goto(`${base}/?customerAuth=login`);
    // Existing session is still authenticated; a reset page can always request a new link.
    await page.goto(`${base}/reset-password`);
    await page.getByRole('button',{name:'Demander un nouveau lien',exact:true}).click();
    await page.getByRole('button',{name:'Réessayer',exact:true}).waitFor();
    check(await page.getByRole('button',{name:'Envoyer le lien',exact:true}).isDisabled(),'missing provider never offers a fake send');
    process.env.MAIL_API_KEY='test-not-real';
    await page.getByRole('button',{name:'Réessayer',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled);
    check(true,'retry re-checks actual backend readiness');
    await page.evaluate(()=>localStorage.setItem('ayrovi.locale.v1','ar'));
    await page.goto(`${base}/reset-password`);
    await page.getByRole('button',{name:'طلب رابط جديد',exact:true}).click();
    await page.locator('#recovery-email').waitFor();
    await page.screenshot({path:`${output}/request-ar.png`});
    check(await page.locator('.ay-auth').getAttribute('dir')==='rtl','Arabic recovery');
    check(errors.length===0, `no browser errors: ${errors.join(';')}`);
    for(const path of ['/terms.html','/privacy.html']) check((await context.request.get(base+path)).status()===200,`${path} serves content`);
    console.log(`PASS: ${count} browser/backend/mail assertions. External mail transport mocked; no real delivery.`);
  } finally {
    await browser.close();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    db.close();
    globalThis.fetch=nativeFetch;
  }
}
run().catch(error=>{console.error(error);process.exit(1);});
