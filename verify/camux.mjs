import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
await p.goto('http://localhost:3000/', { waitUntil:'networkidle' });
await p.waitForTimeout(800);
await p.locator('button', { hasText: 'Lens' }).first().click();
await p.waitForTimeout(1200);
await p.screenshot({ path:'verify/cam-photo.png' });
// switch to video
const vid = p.locator('button', { hasText: 'Vidéo' });
if (await vid.count()) { await vid.click(); await p.waitForTimeout(800); await p.screenshot({ path:'verify/cam-video.png' }); }
console.log('cam captured');
await b.close();
