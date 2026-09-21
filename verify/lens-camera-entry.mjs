import {chromium,firefox} from 'playwright';
import fs from 'node:fs';
const output='docs/lens-phase1/evidence';fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[],fonts=[];const check=(name,value,details)=>{checks.push({name,pass:!!value,details});if(!value)throw Error(name+': '+JSON.stringify(details));};
try {
for(const [engine,type] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await type.launch({headless:true});
 try{for(const locale of ['fr','ar']){
  const ar=locale==='ar';const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.addInitScript(locale=>{localStorage.setItem('ayrovi.locale.v1',locale);window.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code','ean_13'];}async detect(){const v=window.codeToDetect;window.codeToDetect=null;return v?[{rawValue:v}]:[];}};},locale);
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>{const u=r.request().url();return /^https?:/.test(u)&&!u.startsWith(process.env.AYROVI_BASE_URL+'/')?r.abort():r.continue();});
  await p.route('**/api/ayrovix/**',r=>r.fulfill({status:503,json:{success:false,error:'Verification: external analysis disabled'}}));
  await p.goto(process.env.AYROVI_BASE_URL+'/__verify/sonim');await p.locator('[data-open]').click();await p.locator('.lens-consent').waitFor();
  check(`${engine}/${locale}: no media request before agreement`,await p.evaluate(()=>lensEntryTest.mediaRequests===0));
  check('agreement disabled by default',await p.locator('.lens-consent .lens-panel-primary').isDisabled());
  await p.screenshot({path:`${output}/${engine}-${locale}-consent.png`});
  for(const e of await p.locator('.lens-consent input').all())await e.check();await p.locator('.lens-consent .lens-panel-primary').click();
  await p.waitForFunction(()=>!document.querySelector('.lens-camera-shutter')?.disabled);await p.evaluate(()=>document.fonts.ready);
  for(const width of [320,390,768,1360]){
   await p.setViewportSize({width,height:844});
   const geometry=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('.lens-camera-header button,.lens-camera-controls button,.lens-camera-tab')].filter(e=>!e.disabled).map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),font:getComputedStyle(document.querySelector('.lens-camera-brand')).fontFamily,weight:getComputedStyle(document.querySelector('.lens-camera-brand')).fontWeight}));
   check(`${engine}/${locale}/${width}: no overflow`,!geometry.overflow,geometry);
   check('44px targets',geometry.controls.every(x=>x.w>=44&&x.h>=44),geometry);
   check('official stack and medium title',geometry.font.includes('Zalando Sans')&&geometry.font.includes('Noto Sans Arabic')&&geometry.weight==='500',geometry);
  }
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:`${output}/${engine}-${locale}-camera.png`});
  if(engine==='chromium'){
   const cdp=await context.newCDPSession(p);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');
   const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.lens-camera-brand'});const actual=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});fonts.push({locale,...actual});
   check('title glyphs really rendered with official local Zalando Sans',actual.fonts.length>0&&actual.fonts.every(f=>f.isCustomFont&&f.familyName.includes('Zalando')),actual);
  }

  const help=p.getByRole('button',{name:ar?'مساعدة Lens وقواعد الاستخدام':'Aide et règles de Lens',exact:true});
  await help.click();await p.locator('.lens-panel').waitFor();
  check('background inert during help',await p.locator('.lens-camera-stage').evaluate(e=>e.inert));
  await p.screenshot({path:`${output}/${engine}-${locale}-help.png`});
  await p.keyboard.press('Tab');check('focus remains in help',await p.evaluate(()=>!!document.activeElement.closest('.lens-panel')));
  await p.keyboard.press('Escape');await p.locator('.lens-panel').waitFor({state:'hidden'});
  check('Escape returns focus to help trigger',await help.evaluate(e=>document.activeElement===e));
  check('help does not reopen camera',await p.evaluate(()=>lensEntryTest.mediaRequests===1));
  const methods=p.getByRole('button',{name:ar?'رابط أو رمز':'Lien / code',exact:true});
  await methods.click();await p.locator('.lens-methods').waitFor();check('chooser contains exactly two methods',await p.locator('.lens-methods button').count()===2);
  await p.screenshot({path:`${output}/${engine}-${locale}-methods.png`});
  await p.locator('.lens-methods button').nth(1).click();await p.locator('#lens-product-link').waitFor();
  check('link receives focus',await p.locator('#lens-product-link').evaluate(e=>document.activeElement===e));
  await p.locator('#lens-product-link').fill('https://example.com/product?size=M');await p.locator('.lens-link-form button[type=submit]').click();
  check('URL preserved by handler',await p.evaluate(()=>lensEntryTest.links[0]==='https://example.com/product?size=M'));
  await p.screenshot({path:`${output}/${engine}-${locale}-link.png`});
  await p.goBack();await p.locator('.lens-methods').waitFor();await p.locator('.lens-methods button').first().click();await p.locator('.lens-scan-actions').waitFor();
  check('scanner does not conceal a link field',await p.locator('#lens-product-link').count()===0);
  await p.evaluate(()=>window.codeToDetect='1234567890123');await p.waitForFunction(()=>lensEntryTest.codes.length===1);
  check('barcode uses existing handler',await p.evaluate(()=>lensEntryTest.codes[0]==='1234567890123'));
  await p.goBack();await p.locator('.lens-scan-actions').waitFor({state:'hidden'});
  await p.getByRole('tab',{name:ar?'مسح مباشر':'Scan en direct',exact:true}).click();
  check('Live is labeled as scanning, not video recording',!await p.getByText('Vidéo (Live)',{exact:true}).count());
  await help.click();await p.locator('.lens-panel').waitFor();await p.goBack();await p.locator('.lens-panel').waitFor({state:'hidden'});
  check('nested navigation preserves selected Live mode',await p.getByRole('tab',{name:ar?'مسح مباشر':'Scan en direct',exact:true}).getAttribute('aria-selected')==='true');
  await p.getByRole('tab',{name:ar?'تصوير':'Photo',exact:true}).click();
  await p.getByRole('tab',{name:ar?'تصوير':'Photo',exact:true}).focus();await p.keyboard.press('End');
  check('keyboard selects Live',await p.getByRole('tab',{name:ar?'مسح مباشر':'Scan en direct',exact:true}).getAttribute('aria-selected')==='true');
  await p.keyboard.press('Home');check('keyboard selects Photo',await p.getByRole('tab',{name:ar?'تصوير':'Photo',exact:true}).getAttribute('aria-selected')==='true');
  await p.setViewportSize({width:320,height:480});await p.evaluate(()=>document.documentElement.style.fontSize='200%');
  await methods.click();await p.locator('.lens-methods').waitFor();
  check('enlarged short-screen panel has no horizontal overflow',await p.locator('.lens-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await p.screenshot({path:`${output}/${engine}-${locale}-enlarged.png`});
  await p.goBack();await p.locator('.lens-panel').waitFor({state:'hidden'});await p.evaluate(()=>document.documentElement.style.fontSize='');await p.setViewportSize({width:390,height:844});
  await p.locator('.lens-camera-shutter').click();await p.waitForFunction(()=>lensEntryTest.photos.length===1);
  check('capture generated a real nonempty image',await p.evaluate(()=>lensEntryTest.photos[0]>0));
  check('result shell untouched by entry controls',await p.locator('.lens-camera-controls').count()===0);
  await p.getByRole('button',{name:ar?'العودة إلى الكاميرا':'Retour à la caméra',exact:true}).click();await p.locator('.lens-camera-controls').waitFor();
  check('return from image reuses media stream',await p.evaluate(()=>lensEntryTest.mediaRequests===1));
  await p.locator('input[type=file]').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  await p.waitForFunction(()=>lensEntryTest.photos.length===2);check('image import uses the same photo handler',true);
  await p.getByRole('button',{name:ar?'العودة إلى الكاميرا':'Retour à la caméra',exact:true}).click();await p.locator('.lens-camera-controls').waitFor();
  await p.getByRole('button',{name:ar?'مغادرة Lens':'Quitter Lens',exact:true}).click();await p.locator('.lens-camera').waitFor({state:'hidden'});
  check('exit releases camera tracks',await p.evaluate(()=>lensEntryTest.stopped===1));
  await context.close();
 }}finally{await browser.close();}
}
check('no uncaught browser errors',!errors.length,errors);
}finally{fs.writeFileSync(output+'/browser.json',JSON.stringify({checks,errors,fonts,scope:'Actual components, synthetic media stream. External analysis disabled; not a physical-device performance benchmark.'},null,2));}
console.log(`${checks.filter(x=>x.pass).length}/${checks.length} Lens entry browser assertions passed`);
