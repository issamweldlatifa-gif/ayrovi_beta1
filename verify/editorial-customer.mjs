import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import { inspectEditorialIcons } from './editorial-icon-contract.mjs';
const base=process.env.AYROVI_BASE_URL || 'http://127.0.0.1:3000';
const output='screenshots/editorial/customer';fs.mkdirSync(output,{recursive:true});
const checks=[], errors=[], orange=[];
function check(label,pass,details){checks.push({label,pass:Boolean(pass),...(details===undefined?{}:{details})});if(!pass)throw new Error(label+': '+JSON.stringify(details));}
async function orangeRatio(buffer){const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});let count=0;for(let i=0;i<data.length;i+=info.channels){const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;if(!delta||max<.4||delta/max<.55)continue;let hue=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;hue=(hue*60+360)%360;if(hue>=14&&hue<=45)count++;}return count/(info.width*info.height);}
const browser=await chromium.launch({headless:true});
try{
 for(const locale of ['fr','ar']){
  const ctx=await browser.newContext({locale,viewport:{width:390,height:844}});
  await ctx.addInitScript(locale=>localStorage.setItem('ayrovi.locale.v1',locale),locale);
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,360,390,768,1360]){
   await p.setViewportSize({width,height:844});await p.goto(base,{waitUntil:'domcontentloaded'});
   await p.locator('.editorial-hero__title').waitFor();await p.evaluate(()=>document.fonts.ready);
   const inspect=async(name,selector)=>{
    const el=p.locator(selector).first();await el.waitFor();await p.evaluate(()=>document.fonts.ready);
    const size=await el.evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));check(`${locale}/${width}/${name}: no horizontal overflow`,size.scroll<=size.client+1,size);
    const image=await p.screenshot();const ratio=await orangeRatio(image);orange.push({locale,width,screen:name,ratio,exclusions:[]});
    // Conservative: every pixel is counted, including photos. No blanket image masking.
    check(`${locale}/${width}/${name}: orange area <= 3% (no exclusions)`,ratio<=.03,ratio);
    if(width===390||width===1360)fs.writeFileSync(`${output}/${name}-${locale}-${width}.png`,image);
   };
   await inspect('home','.ayrovi-app-shell');
   check(`${locale}/${width}: actual logo source preserved`,(await p.locator('.public-site-header img').getAttribute('src')).includes('logo-ayrovi'));
   check(`${locale}/${width}: three navigation destinations preserved`,await p.locator('.ayrovi-glass-bottom-nav nav>button').count()===3);
   for(const [area,selector,names] of [['header','.public-site-header',['Menu','User']],['navigation','.ayrovi-glass-bottom-nav',['Lens','Sonim','Vision']]]){
    const icons=await inspectEditorialIcons(p,selector);
    check(`${locale}/${width}: ${area} matches editorial geometry and stroke`,icons.errors.length===0 && names.every(name=>icons.names.includes(name)),icons);
   }
   await p.getByRole('button',{name:locale==='ar'?'فتح فضائي':'Ouvrir mon espace',exact:true}).click();
   await inspect('auth','.ay-auth');
   check(`${locale}/${width}: empty credential fields`,(await p.locator('.ay-auth input[type=email]').inputValue())===''&&(await p.locator('.ay-auth input[type=password]').inputValue())==='');
   check(`${locale}/${width}: auth uses new glyphs`,await p.locator('.ay-auth [data-editorial-icon]').count()>0);
   check(`${locale}/${width}: square input controls`,await p.locator('.ay-auth input[type=email]').evaluate(e=>getComputedStyle(e).borderRadius)==='0px');
   await p.goBack();await p.locator('.ay-auth').waitFor({state:'hidden'});
   await p.getByRole('button',{name:locale==='ar'?'فتح القائمة':'Ouvrir le menu',exact:true}).click();
   const menu=p.getByRole('dialog',{name:locale==='ar'?'قائمة AYROVI':'Menu AYROVI',exact:true});
   await inspect('menu','[role=dialog]');
   check(`${locale}/${width}: initial menu focus is close`,await p.locator('[data-dialog-autofocus]').evaluate(e=>e===document.activeElement));
   await p.keyboard.press('Shift+Tab');await p.keyboard.press('Shift+Tab');check(`${locale}/${width}: menu traps focus at the end`,await menu.getByRole('button',{name:'AR',exact:true}).evaluate(e=>e===document.activeElement));
   await p.keyboard.press('Tab');check(`${locale}/${width}: menu wraps focus to first target`,await menu.getByRole('button',{name:/Se connecter \/ Créer un compte|تسجيل الدخول \/ إنشاء حساب/}).evaluate(e=>e===document.activeElement));
   await menu.getByRole('button',{name:locale==='ar'?'حول AYROVI':'À propos d’AYROVI',exact:true}).click();
   await p.getByRole('dialog',{name:locale==='ar'?'حول AYROVI':'À propos d’AYROVI',exact:true}).waitFor();
   check(`${locale}/${width}: About is a reachable screen`,await p.locator('#why-ayrovi-title').isVisible());
   await p.keyboard.press('Escape');await menu.waitFor();await p.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
   await p.getByRole('button',{name:locale==='ar'?'SONIM — المساعد الذكي لـ AYROVI':"SONIM — l'assistant IA d'AYROVI",exact:true}).click();
   await p.locator('[data-assistant-composer]').waitFor();await inspect('sonim','[data-sonim-tone]');
   const boxes=await p.evaluate(()=>{const a=document.querySelector('.assistant-editorial-header').getBoundingClientRect(),b=document.querySelector('[data-assistant-messages]').getBoundingClientRect(),c=document.querySelector('[data-assistant-composer]').getBoundingClientRect();return {header:a.bottom,messagesTop:b.top,messagesBottom:b.bottom,composer:c.top};});
   check(`${locale}/${width}: controls do not cover conversation`,boxes.header<=boxes.messagesTop+1&&boxes.messagesBottom<=boxes.composer+1,boxes);
   await p.getByRole('button',{name:locale==='ar'?'إغلاق SONIM':'Fermer SONIM',exact:true}).click();await p.locator('[data-sonim-tone]').waitFor({state:'hidden'});
   await p.getByRole('button',{name:locale==='ar'?'Lens — البحث بالصورة':'Lens — recherche par image',exact:true}).click();
   await p.locator('#ayrovix-url-input').waitFor();await inspect('lens','.ayrovix-theme-scope');
   check(`${locale}/${width}: Lens imports new icon family`,await p.locator('.ayrovix-theme-scope [data-editorial-icon]').count()>0);
   await p.goBack();
  }
  await ctx.close();
 }
 // Dark SONIM + short viewport: actual control state, no AI request.
 const extra=await browser.newContext({viewport:{width:390,height:480},locale:'fr'});const p=await extra.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base,{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:"SONIM — l'assistant IA d'AYROVI",exact:true}).click();await p.locator('[data-assistant-composer]').waitFor();
 await p.locator('.assistant-editorial-header').getByRole('button',{name:'Menu',exact:true}).click();
 await p.getByRole('switch',{name:'Mode sombre',exact:true}).click();
 await p.keyboard.press('Escape');await p.locator('[data-sonim-tone="dark"]').waitFor();
 await p.locator('[data-assistant-composer] textarea').fill('Un brouillon, sans envoi.');
 const bounds=await p.locator('[data-assistant-composer]').boundingBox();check('short viewport: composer remains reachable',bounds.y+bounds.height<=481,bounds);
 await p.waitForFunction(()=>getComputedStyle(document.querySelector('.assistant-quick-card')).backgroundColor==='rgb(36, 34, 32)');
 check('dark welcome cards use semantic dark surface',await p.locator('.assistant-quick-card').first().evaluate(e=>getComputedStyle(e).backgroundColor)==='rgb(36, 34, 32)');
 check('dark muted text is readable token',await p.locator('.assistant-quick-card .text-muted').first().evaluate(e=>getComputedStyle(e).color)==='rgb(190, 183, 176)');
 await p.screenshot({path:output+'/sonim-dark-short.png'});await extra.close();
 const restricted=await browser.newContext();await restricted.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));
 const rp=await restricted.newPage();rp.on('pageerror',e=>errors.push(e.message));await rp.goto(base,{waitUntil:'domcontentloaded'});await rp.locator('.editorial-hero__title').waitFor();check('restricted browser storage does not crash the customer shell',await rp.locator('.public-site-header').isVisible());await restricted.close();
 check('no page errors',errors.length===0,errors);
}catch(error){errors.push(String(error));process.exitCode=1;}finally{await browser.close();fs.writeFileSync(`${output}/results.json`,JSON.stringify({scope:'Actual locally served app, default CMS content, anonymous navigation; no external AI/OAuth/payment exercised',checks,orange,errors},null,2)+'\n');}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} customer checks passed`,errors);
