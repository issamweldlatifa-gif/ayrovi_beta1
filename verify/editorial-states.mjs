import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
import { inspectEditorialIcons } from './editorial-icon-contract.mjs';
const base=process.env.AYROVI_BASE_URL;
const output='screenshots/editorial/complete-icons';fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[],orange=[];
function check(label,pass,details){checks.push({label,pass:Boolean(pass),details});if(!pass)throw new Error(label+': '+JSON.stringify(details));}
async function area(image){const {data,info}=await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});let n=0;for(let i=0;i<data.length;i+=info.channels){const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,max=Math.max(r,g,b),delta=max-Math.min(r,g,b);if(!delta||max<.4||delta/max<.55)continue;let h=(max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4)*60;h=(h+360)%360;if(h>=14&&h<=45)n++;}return n/(info.width*info.height);}
const browser=await chromium.launch({headless:true});
try{
 for(const locale of ['fr','ar'])for(const width of [320,390,768])for(const height of [480,844])for(const dark of [false,true]){
  const key=`${locale}/${width}x${height}/${dark?'dark':'light'}`;
  const ctx=await browser.newContext({locale,viewport:{width,height},reducedMotion:width===320?'reduce':'no-preference'});
  await ctx.addInitScript(locale=>localStorage.setItem('ayrovi.locale.v1',locale),locale);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/__verify/states');
  await page.locator('.editorial-voice').waitFor();await page.evaluate(async()=>{await document.fonts.load('16px "Noto Sans Arabic"');await document.fonts.load('16px "Zalando Sans"');await document.fonts.ready;});
  for(const state of ['idle','starting','listening','user_speaking','transcribing','thinking','speaking','muted','error']){
   await page.evaluate(({state,dark})=>window.setEditorialFixture({voice:state,dark,muted:state==='muted'}),{state,dark});
   await page.locator(`[data-voice-state="${state}"][data-tone="${dark?'dark':'light'}"]`).waitFor();
   await page.waitForFunction(dark=>{const el=document.querySelector('.editorial-voice');return el && getComputedStyle(el).backgroundColor===(dark?'rgb(0, 0, 0)':'rgb(255, 255, 255)');},dark);
   const layout=await page.locator('.editorial-voice').evaluate(el=>{const footer=el.querySelector('footer').getBoundingClientRect();return {width:el.clientWidth,scroll:el.scrollWidth,footer:footer.bottom,controls:[...el.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.closest('[inert]')).map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,label:e.getAttribute('aria-label')||e.textContent.trim()})),color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor};});
   check(`${key}/${state}: no overflow and footer remains reachable`,layout.scroll<=layout.width+1 && layout.footer<=height+1,layout);
   check(`${key}/${state}: named 44px controls`,layout.controls.every(c=>c.w>=43.9&&c.h>=43.9&&c.label),layout.controls);
   check(`${key}/${state}: semantic readable surface`,layout.bg===(dark?'rgb(0, 0, 0)':'rgb(255, 255, 255)')&&layout.color===(dark?'rgb(255, 255, 255)':'rgb(0, 0, 0)'),layout);
   const icons=await inspectEditorialIcons(page,'.editorial-voice');check(`${key}/${state}: reference SVG geometry`,icons.count>0&&!icons.errors.length,icons);
   if(state==='listening'||state==='error'){
    const shot=await page.screenshot();const ratio=await area(shot);orange.push({key,state,ratio});check(`${key}/${state}: orange <=3%`,ratio<=.03,ratio);
    if(width===390&&height===844)fs.writeFileSync(`${output}/voice-${state}-${locale}-${dark?'dark':'light'}.png`,shot);
   }
  }
  await page.getByRole('button',{name:locale==='ar'?'خيارات الوضع الصوتي':'Options du mode vocal',exact:true}).click();
  const settings=page.locator('.editorial-voice__settings');await settings.waitFor();
  const layout=await settings.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}));
  check(`${key}: settings fit viewport`,layout.scroll<=layout.width+1&&layout.top>=0&&layout.bottom<=height+1,layout);
  await page.keyboard.press('Shift+Tab');check(`${key}: nested focus wraps to Done`,await settings.getByRole('button',{name:locale==='ar'?'تم':'Terminé',exact:true}).evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Tab');check(`${key}: nested focus wraps to close`,await settings.getByRole('button',{name:locale==='ar'?'إغلاق الإعدادات':'Fermer les paramètres',exact:true}).evaluate(el=>el===document.activeElement));
  await settings.getByRole('button',{name:/Puck/}).click();await settings.getByRole('button',{name:'1.1x',exact:true}).click();
  check(`${key}: displayed voice/speed reach callback`,await page.evaluate(()=>window.editorialFixtureEvents.some(e=>e.action==='settings'&&e.settings.voiceId==='Puck')&&window.editorialFixtureEvents.some(e=>e.action==='settings'&&e.settings.rate===1.1)));
  const icons=await inspectEditorialIcons(page,'.editorial-voice__settings');check(`${key}: settings glyphs match`,icons.count>0&&!icons.errors.length,icons);
  if(width===390&&height===844)await page.screenshot({path:`${output}/voice-settings-${locale}-${dark?'dark':'light'}.png`});
  await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});check(`${key}: Escape did not exit voice`,await page.evaluate(()=>!window.editorialFixtureEvents.some(e=>e.action==='exit')));
  if(!dark){
   await page.evaluate(()=>window.setEditorialFixture({kind:'product'}));await page.getByRole('button',{name:/Commander|اطلب/}).waitFor();
   // Product card v2 : le formulaire vit dans l'accordéon « Modifier la commande » — on l'ouvre avant de le piloter.
   await page.evaluate(()=>document.querySelectorAll('.flow-product details').forEach(details=>{details.open=true;}));
   const card=page.locator('.flow-product');const size=await card.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));check(`${key}: product has no horizontal overflow`,size.scroll<=size.width+1,size);
   check(`${key}: missing review is not synthesized`,await page.locator('[data-merchant-rating]').count()===0);
   const icons=await inspectEditorialIcons(page,'.flow-product');check(`${key}: product geometry`,icons.count>0&&!icons.errors.length,icons);
   const quantity=page.getByRole('spinbutton',{name:locale==='ar'?'الكمية':'Quantité',exact:true});await quantity.fill('1.5');await page.getByRole('button',{name:/Commander|اطلب/}).click();
   check(`${key}: fractional quantity cannot be submitted`,await page.evaluate(()=>!window.editorialFixtureEvents.some(e=>e.action==='order')));
   await quantity.fill('3');await page.getByRole('button',{name:/Commander|اطلب/}).click();check(`${key}: exact integer quantity is sent`,await page.evaluate(()=>window.editorialFixtureEvents.some(e=>e.action==='order'&&e.selection.quantity===3)));
   if(width===390&&height===844){await page.locator('[data-fixture]').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`${output}/product-${locale}.png`});}
  }
  await ctx.close();
 }
 // Real commerce/social components, controlled failures and fixtures only (no provider/payment calls).
 for(const locale of ['fr','ar'])for(const width of [320,390]){
  const key=`commerce-social/${locale}/${width}`;
  const ctx=await browser.newContext({viewport:{width,height:640},reducedMotion:'reduce'});
  await ctx.addInitScript(locale=>localStorage.setItem('ayrovi.locale.v1',locale),locale);
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  let readError=true,writeError=true,configError=true,checkoutCalls=0;
  const reply=(route,status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status<400,data})});
  await p.route('**/api/public/social/comments?*',r=>reply(r,readError?503:200,[]));
  await p.route('**/api/public/social/interact',r=>reply(r,writeError?503:201,{id:'confirmed-fixture',author:'Test fixture',text:'Confirmed fixture / تعليق اختباري مؤكد',createdAt:new Date().toISOString()}));
  await p.route('**/api/public/commerce-config',r=>reply(r,configError?503:200,{deposit:{percent:40,cardDiscountPercent:10},capabilities:{cardGateway:false}}));
  await p.route('**/api/customer/account/addresses',r=>reply(r,200,[]));
  await p.route('**/api/checkout',r=>{checkoutCalls++;return reply(r,503,null);});
  await p.goto(base+'/__verify/states');await p.locator('.editorial-voice').waitFor();
  await p.evaluate(()=>window.setEditorialFixture({kind:'comments'}));await p.getByRole('alert').waitFor();
  check(`${key}: failed comments are not shown as an empty feed`,!(await p.locator('[role=dialog]').innerText()).includes(locale==='ar'?'لا توجد تعليقات':'Aucun commentaire'));
  readError=false;await p.getByRole('button',{name:locale==='ar'?'أعد المحاولة':'Réessayer',exact:true}).click();
  await p.getByText(locale==='ar'?'لا توجد تعليقات بعد. كن أول من يعلّق!':'Aucun commentaire pour le moment. Soyez le premier !',{exact:true}).waitFor();
  const input=p.getByRole('textbox');await input.fill('Test draft / نص تجريبي');await p.locator('button[type=submit]').click();await p.getByRole('alert').waitFor();
  check(`${key}: failed comment keeps draft`,await input.inputValue()==='Test draft / نص تجريبي');
  check(`${key}: failure never invents a comment`,await p.getByText('Confirmed fixture / تعليق اختباري مؤكد',{exact:true}).count()===0);
  await p.screenshot({path:`${output}/comments-error-${locale}-${width}.png`});
  writeError=false;await p.locator('button[type=submit]').click();await p.getByText('Confirmed fixture / تعليق اختباري مؤكد',{exact:true}).waitFor();
  check(`${key}: only confirmed write clears draft`,await input.inputValue()==='');
  const bounds=await p.locator('[role=dialog]').evaluate(el=>({w:el.clientWidth,scroll:el.scrollWidth,buttons:[...el.querySelectorAll('button')].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}))}));
  check(`${key}: comment controls fit and are touch-sized`,bounds.scroll<=bounds.w+1&&bounds.buttons.every(b=>b.w>=44&&b.h>=44),bounds);
  const icons=await inspectEditorialIcons(p,'[role=dialog]');check(`${key}: comment glyph geometry`,icons.count>0&&!icons.errors.length,icons);
  await p.keyboard.press('Escape');check(`${key}: comments own Escape`,await p.evaluate(()=>window.editorialFixtureEvents.some(e=>e.action==='comments-close')));
  await p.evaluate(()=>window.setEditorialFixture({kind:'cart'}));await p.getByRole('alert').waitFor();
  check(`${key}: cart config failure blocks progression`,await p.locator('.ay-btn-cta').isDisabled());
  check(`${key}: cart does not expose unsafe product links`,await p.locator('a').count()===0);
  configError=false;await p.getByRole('button',{name:locale==='ar'?'أعد المحاولة':'Réessayer',exact:true}).click();await p.locator('.ay-btn-cta:not(:disabled)').waitFor();
  check(`${key}: cart shows server 40%, not a default`,(await p.locator('[role=dialog]').innerText()).includes('(40%)'));
  const cart=await p.locator('[role=dialog]').evaluate(el=>({w:el.clientWidth,scroll:el.scrollWidth}));check(`${key}: cart no horizontal overflow`,cart.scroll<=cart.w+1,cart);
  await p.screenshot({path:`${output}/cart-${locale}-${width}.png`});
  // Reload clears the commerce cache; test a payment screen opened before config succeeds.
  configError=true;await p.reload();await p.locator('.editorial-voice').waitFor();await p.evaluate(()=>window.setEditorialFixture({kind:'checkout'}));await p.getByRole('alert').waitFor();
  await p.getByRole('checkbox').check();check(`${key}: payment confirmation stays blocked without configuration`,await p.locator('button[type=submit]').isDisabled());
  await p.locator('form').dispatchEvent('submit');check(`${key}: handler also rejects bypassing the disabled button`,checkoutCalls===0);
  check(`${key}: missing config is not treated as no configured payment methods`,await p.locator('.checkout-payment-grid').count()===0);
  configError=false;await p.getByRole('button',{name:locale==='ar'?'أعد المحاولة':'Réessayer',exact:true}).click();await p.locator('.checkout-payment-grid').waitFor();
  check(`${key}: confirmed no-provider policy still supports unpaid order creation`,await p.locator('button[type=submit]').isEnabled());
  const checkout=await p.locator('.checkout-flow-content').evaluate(el=>({w:el.clientWidth,scroll:el.scrollWidth}));check(`${key}: checkout no horizontal overflow`,checkout.scroll<=checkout.w+1,checkout);
  await p.screenshot({path:`${output}/checkout-${locale}-${width}.png`});
  await ctx.close();
 }
 // Long prose, identifiers, product names and warnings must remain complete at phone widths and enlarged text.
 for(const locale of ['fr','ar'])for(const width of [320,390,768])for(const enlarged of [false,true]){
  const key=`content/${locale}/${width}/${enlarged?'200pct':'normal'}`;
  const ctx=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  await ctx.addInitScript(locale=>localStorage.setItem('ayrovi.locale.v1',locale),locale);
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/__verify/states');await p.locator('.editorial-voice').waitFor();
  await p.evaluate(enlarged=>{if(enlarged)document.documentElement.style.fontSize='32px';window.setEditorialFixture({kind:'messages'});},enlarged);
  await p.locator('[data-assistant-messages]').waitFor();
  const layout=await p.locator('[data-assistant-messages]').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,clipped:[...el.querySelectorAll('p,h3,h4')].filter(t=>t.scrollWidth>t.clientWidth+1||parseInt(getComputedStyle(t).webkitLineClamp)>0).map(t=>({text:t.textContent.slice(0,60),width:t.clientWidth,scroll:t.scrollWidth}))}));
  check(`${key}: no horizontal overflow or clamped content`,layout.scroll<=layout.width+1&&!layout.clipped.length,layout);
  check(`${key}: all warnings and timeline entries remain readable`,await p.locator('[data-assistant-messages]').innerText().then(t=>t.includes('WARNING_FIRST')&&t.includes('WARNING_SECOND')&&t.includes('WARNING_LAST')&&t.includes('History / سجل 0')&&t.includes('History / سجل 5')));
  check(`${key}: prose preserves paragraph boundaries`,await p.locator('p.whitespace-pre-wrap').evaluate(el=>el.textContent.includes('\n\n')&&getComputedStyle(el).whiteSpace==='pre-wrap'));
  check(`${key}: SONIM reply uses feature glyph`,await p.locator('[data-editorial-icon="Sonim"]').count()===1);
  if(width===390&&!enlarged)await p.screenshot({path:`${output}/complete-content-${locale}.png`});
  await ctx.close();
 }
 // All imports also work in the ordinary document, not only the selected screens.
 const ctx=await browser.newContext({viewport:{width:1000,height:900}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/__verify/states');await p.locator('.editorial-voice').waitFor();await p.evaluate(()=>window.setEditorialFixture({kind:'icons'}));await p.locator('[data-icon-gallery]').waitFor();
 const gallery=await inspectEditorialIcons(p,'[data-icon-gallery]');check('101 public icon imports match reference drawings',gallery.count===101&&!gallery.errors.length,gallery);await p.screenshot({path:output+'/all-icons.png',fullPage:true});
 await p.route('**/api/public/commerce-config',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));await p.evaluate(()=>window.setEditorialFixture({kind:'product'}));await p.getByRole('alert').waitFor();
 check('failed config never invents a payment percentage',!(await p.locator('.flow-product').innerText()).includes('20%'));
 check('failed config disables ordering',await p.locator('.ay-btn-cta').isDisabled());
 await p.unroute('**/api/public/commerce-config');await p.getByRole('button',{name:'Réessayer',exact:true}).click();await p.getByRole('button',{name:/Commander/}).waitFor();check('retry loads actual server conditions',await p.locator('.ay-btn-cta').isEnabled());
 await p.evaluate(()=>window.setEditorialFixture({product:{sourceUrl:'javascript:alert(1)'}}));await p.waitForFunction(()=>document.querySelector('.flow-product input[type=url]').value==='javascript:alert(1)');check('unsafe URL produces no clickable merchant link',await p.locator('.flow-product a').count()===0);
 await ctx.close();check('no browser errors',errors.length===0,errors);
}catch(error){errors.push(String(error));process.exitCode=1;}finally{await browser.close();fs.writeFileSync(output+'/results.json',JSON.stringify({scope:'Test-only real components in isolated browser/Express/SQLite; voice inputs/callbacks and commerce/social failure responses are explicit test fixtures, NOT real device/provider/payment certification.',checks,orange,errors},null,2)+'\n');}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} extended-state checks passed`,errors);
