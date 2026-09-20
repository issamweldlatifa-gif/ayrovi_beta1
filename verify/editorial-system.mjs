import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const identity = JSON.parse(fs.readFileSync('client/src/design/editorial/identity.json', 'utf8'));
const glyphCount = Object.keys(JSON.parse(fs.readFileSync('client/src/design/editorial/glyphs.json','utf8'))).length;
const checks = [];
const errors = [];
const check = (label, condition, details) => { checks.push({ label, pass: Boolean(condition), ...(details === undefined ? {} : {details}) }); if (!condition) throw new Error(label + ': ' + JSON.stringify(details)); };
const browser = await chromium.launch({headless: true});
const page = await browser.newPage();
page.on('pageerror', error => errors.push(error.message));
const external = [];
page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
const reportDir = 'docs/editorial/verification';
fs.mkdirSync(reportDir, {recursive: true});
try {
  await page.goto(pathToFileURL(path.resolve('docs/editorial/AYROVI-editorial-system.html')).href);
  await page.evaluate(async fonts => { await Promise.all(fonts.map(font => document.fonts.load(`16px "${font.family}"`))); await document.fonts.ready; }, identity.fonts);
  check('all four self-hosted families load from embedded WOFF2', await page.evaluate(fonts => fonts.every(f => document.fonts.check(`16px "${f.family}"`)), identity.fonts));
  check('complete reference family', await page.locator('.glyph').count() === glyphCount);
  for (const locale of ['ar','fr']) {
    await page.evaluate(locale => { document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr'; }, locale);
    for (const width of [320,360,390,768,1360]) {
      await page.setViewportSize({width,height:844});
      const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,targets:[...document.querySelectorAll('button,input')].filter(e=>e.getBoundingClientRect().height).map(e=>({h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width}))}));
      check(`${locale}/${width}: no horizontal page overflow`, geometry.scroll<=width && geometry.body<=width,geometry);
      check(`${locale}/${width}: controls have at least 44px targets`, geometry.targets.every(t=>t.h>=44&&t.w>=44));
      const font=await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily);
      check(`${locale}/${width}: language-specific editorial face`,font.includes(locale==='ar'?'AY Amiri':'AY DM Serif Display'),font);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#locale').click();
  check('language control switches the document to Arabic RTL',await page.locator('html').getAttribute('dir')==='rtl');
  await page.locator('#search').fill('lens');
  check('icon search works', await page.locator('.glyph:visible').count()===1);
  await page.locator('#search').fill('no-such-icon');
  check('empty search is announced',await page.locator('#count').textContent()===`0 / ${glyphCount}`);
  await page.locator('#search').fill('');
  await page.locator('#example').click();
  check('sample action reports its real demonstration state', (await page.locator('#feedback').textContent()).includes('تجربة عرض فقط'));
  await page.locator('#search').focus();
  check('keyboard focus has an outline', await page.locator('#search').evaluate(e=>getComputedStyle(e).outlineStyle)!=='none');
  await page.locator('#tone').click();
  check('dark mode uses its own semantic tokens', await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)==='rgb(25, 24, 23)');
  await page.locator('#tone').click();
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:reportDir+'/system-mobile-ar.png'});
  await page.setViewportSize({width:1360,height:900});
  await page.locator('#locale').click();
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:reportDir+'/system-desktop-fr.png'});
  await page.locator('.glyphs').screenshot({path:reportDir+'/all-glyphs.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  check('reduced motion removes button transitions', await page.locator('#example').evaluate(e=>getComputedStyle(e).transitionDuration)==='0s');
  check('no external requests',external.length===0,external);
  check('no browser errors',errors.length===0,errors);
} catch(error) { errors.push(String(error)); process.exitCode=1; }
finally {
  fs.writeFileSync(reportDir+'/browser.json', JSON.stringify({scope:'Standalone design reference only; does not certify migrated application screens or live provider integrations',checks,errors},null,2)+'\n');
  await browser.close();
}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} reference checks passed`,errors);
