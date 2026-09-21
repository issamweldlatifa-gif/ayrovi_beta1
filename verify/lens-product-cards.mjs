import {chromium,firefox} from 'playwright';
import fs from 'node:fs';
const output='docs/lens-product-cards/evidence';fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];function check(name,pass,details){checks.push({name,pass:!!pass,details});if(!pass)throw Error(name+': '+JSON.stringify(details));}
try{
 for(const [engine,type] of [['chromium',chromium],['firefox',firefox]])for(const locale of ['fr','ar']){
  const browser=await type.launch();
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await context.addInitScript(l=>localStorage.setItem('ayrovi.locale.v1',l),locale);
   const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/*',r=>{const u=r.request().url();return /^https?:/.test(u)&&!u.startsWith(process.env.AYROVI_BASE_URL+'/')?r.abort():r.continue();});
   let favorites=[],writes=[],failNext=false;
   await p.route('**/api/customer/account/favorites**',async r=>{
    const method=r.request().method();
    if(method==='GET')return r.fulfill({json:{success:true,data:favorites}});
    writes.push({method,csrf:r.request().headers()['x-csrf-token']});
    if(failNext){failNext=false;return r.fulfill({status:500,json:{success:false,error:'Controlled failure'}});}
    if(method==='POST'){const body=r.request().postDataJSON();const f={id:'fixture-favorite',source_url:body.sourceUrl,title:body.title,price_tnd:body.priceTND,product_id:null};favorites=[f];return r.fulfill({status:201,json:{success:true,data:f}});}
    favorites=[];return r.fulfill({json:{success:true}});
   });
   await p.goto(process.env.AYROVI_BASE_URL+'/__verify/sonim');await p.evaluate(()=>lensResultsTest.setLoading(false));await p.locator('.lens-sheet-handle').click();await p.evaluate(()=>document.fonts.ready);
   const cards=p.locator('.lens-product-card'),first=cards.first();await first.waitFor();
   check(`${engine}/${locale}: clean reference card`,await first.innerText().then(s=>!/(Estimation|Prix boutique|Prix final|douane|transport|Tailles\/couleurs|Match|94%|Voir le produit|السعر النهائي|جمركة)/.test(s)&&s.includes('598.00 DT')));
   check('brand and real title separated',await first.locator('.lens-card-title').innerText()==='Atelier'&&await first.locator('.lens-card-description').innerText()==='Veste noire — coupe droite');
   check('one price, no converted source price repeated',await first.locator('.lens-card-price').count()===1&&!await first.innerText().then(s=>s.includes('84 EUR')));
   check('five stars only for real reviews',await first.locator('.lens-rating-star').count()===5&&await cards.nth(2).locator('[data-merchant-rating]').count()===0);
   check('review value and real count',await first.locator('[data-merchant-rating]').innerText().then(s=>s.includes('4.6/5')&&(s.includes('57')||s.includes('٥٧'))));
   check('yellow stars use official glyphs',await first.locator('.lens-rating-star>span').first().evaluate(n=>getComputedStyle(n).color==='rgb(229, 180, 0)')&&await first.locator('.lens-rating-star svg').first().getAttribute('data-ayrovi-icon')==='Star');
   check('no made-up top-rating or new badge',!/(Meilleure note|Nouveau)/.test(await first.innerText()));
   for(const width of [320,390,768,1360]){
    await p.setViewportSize({width,height:844});await p.waitForTimeout(60);
    const g=await first.evaluate(n=>{const media=n.querySelector('.lens-card-media'),heart=n.querySelector('.lens-card-favorite');const m=media.getBoundingClientRect(),h=heart.getBoundingClientRect();return {ratio:m.width/m.height,radius:getComputedStyle(media).borderRadius,fit:getComputedStyle(media.querySelector('img')).objectFit,heart:{w:h.width,h:h.height,round:getComputedStyle(heart).borderRadius,bg:getComputedStyle(heart).backgroundColor},title:getComputedStyle(n.querySelector('h4')).fontWeight,price:getComputedStyle(n.querySelector('.lens-card-price')).fontWeight,font:getComputedStyle(n).fontFamily,overflow:document.documentElement.scrollWidth>innerWidth};});
    check(`${width}: portrait image and round corners`,Math.abs(g.ratio-2/3)<.01&&parseFloat(g.radius)>=12&&g.fit==='contain',g);
    check('white 44px favorite circle',g.heart.w>=44&&g.heart.h>=44&&g.heart.round==='50%'&&g.heart.bg==='rgb(255, 255, 255)',g);
    check('official typography and regular-weight price',g.font.includes('Zalando Sans')&&g.font.includes('Noto Sans Arabic')&&g.title==='700'&&g.price==='400'&&!g.overflow,g);
   }
   await p.setViewportSize({width:390,height:844});
   await first.locator('.lens-card-favorite').click();check('guest opens account without fake save',await p.evaluate(()=>lensResultsTest.accountOpens===1&&lensResultsTest.choices.length===0)&&await first.locator('.lens-card-favorite').getAttribute('aria-pressed')==='false'&&writes.length===0);
   await p.evaluate(()=>lensResultsTest.setSession({account:{id:'fixture-account'},csrfToken:'fixture-csrf'}));await p.waitForFunction(()=>!document.querySelector('.lens-card-favorite').disabled);
   failNext=true;await first.locator('.lens-card-favorite').click();await p.waitForFunction(()=>!document.querySelector('.lens-card-favorite').disabled);
   check('failed save is never shown as saved',await first.locator('.lens-card-favorite').getAttribute('aria-pressed')==='false'&&await p.locator('.lens-favorite-notice').count()===1);
   await first.locator('.lens-card-favorite').click();await p.waitForFunction(()=>document.querySelector('.lens-card-favorite').getAttribute('aria-pressed')==='true');
   check('successful heart uses account API and CSRF',favorites.length===1&&writes.at(-1).csrf==='fixture-csrf'&&writes.at(-1).method==='POST');
   check('heart does not open the product',await p.evaluate(()=>lensResultsTest.choices.length===0));
   await p.screenshot({path:`${output}/${engine}-${locale}-cards.png`});
   await first.locator('.lens-card-favorite').click();await p.waitForFunction(()=>document.querySelector('.lens-card-favorite').getAttribute('aria-pressed')==='false');check('remove reaches account favorite endpoint',writes.at(-1).method==='DELETE'&&favorites.length===0);
   await first.locator('.lens-card-open').focus();await p.keyboard.press('Enter');check('keyboard opens the original product',await p.evaluate(()=>lensResultsTest.choices.at(-1)==='item-0'));
   await p.evaluate(()=>lensResultsTest.setSession(null));await p.waitForTimeout(40);
   await p.setViewportSize({width:320,height:480});await p.evaluate(()=>document.documentElement.style.fontSize='200%');
   check('200% text does not cause horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.lens-results-list').scrollWidth<=320));
   await p.screenshot({path:`${output}/${engine}-${locale}-large-text.png`});
   await context.close();
  }finally{await browser.close();}
 }
 check('no uncaught browser errors',errors.length===0,errors);
}finally{fs.writeFileSync(output+'/browser.json',JSON.stringify({checks,errors,scope:'Actual Lens cards with generated images, controlled SerpApi-shaped reviews and mocked account API; not a live provider/account claim.'},null,2));}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} Lens product-card browser assertions passed`);
