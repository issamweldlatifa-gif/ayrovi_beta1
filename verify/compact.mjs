import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:900}, deviceScaleFactor:2 });
await p.goto('http://localhost:3000/', { waitUntil:'networkidle' });
await p.waitForSelector('.lens2', { timeout:15000 });
await p.waitForTimeout(600);
const r = await p.evaluate(() => {
  const lens2=document.querySelector('.lens2');
  const cta=document.querySelector('.lens2__cta');
  const phone=document.querySelector('.lens2__phone-frame');
  return {
    lens2H: Math.round(lens2.getBoundingClientRect().height),
    pageH: Math.round(document.body.scrollHeight),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    ctaH: Math.round(cta.getBoundingClientRect().height),
    phoneH: Math.round(phone.getBoundingClientRect().height),
    steps: document.querySelectorAll('.lens2__step').length,
    merchants: document.querySelectorAll('.lens2__merchant').length,
    minis: document.querySelectorAll('.lens2__mini').length,
    ai: !!document.querySelector('.lens2__ai'), banner: !!document.querySelector('.lens2__banner'),
  };
});
console.log(JSON.stringify(r));
await p.locator('.lens2').screenshot({ path:'verify/lens2-compact-mobile.png' });
await b.close();
