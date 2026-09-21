import { chromium, firefox } from 'playwright';
import fs from 'node:fs';
const output='docs/lens-results/evidence';fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];
function check(name,pass,details){checks.push({name,pass:!!pass,details});if(!pass)throw Error(name+' '+JSON.stringify(details));}
async function settle(p){await p.waitForTimeout(330);}
async function drag(p,from,to){await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:12});await p.mouse.up();await settle(p);}
async function touch(p,from,to){
 const cdp=await p.context().newCDPSession(p);
 const point=(x,y)=>[{x,y,radiusX:2,radiusY:2,force:1,id:1}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(from.x,from.y)});
 for(let i=1;i<=12;i++){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(from.x+(to.x-from.x)*i/12,from.y+(to.y-from.y)*i/12)});
  await p.waitForTimeout(16);
 }
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await cdp.detach();await settle(p);
}

try{
 for(const [engine,type] of [['chromium',chromium],['firefox',firefox]])for(const locale of ['fr','ar']){
  const browser=await type.launch();
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
   await context.addInitScript(locale=>localStorage.setItem('ayrovi.locale.v1',locale),locale);
   const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/*',r=>{const u=r.request().url();return /^https?:/.test(u)&&!u.startsWith(process.env.AYROVI_BASE_URL+'/')?r.abort():r.continue();});
   await p.goto(process.env.AYROVI_BASE_URL+'/__verify/sonim');await p.locator('.lens-results-image img').waitFor();await p.evaluate(()=>document.fonts.ready);
   check(`${engine}/${locale}: starts in peek`,await p.locator('.lens-results').getAttribute('data-expanded')==='false');
   check('analysis dots while request pending',await p.locator('.lens-analysis-dots').count()===1);
   check('no extra zoom/search/header buttons',await p.locator('.lens-results-chrome button').count()===1&&!await p.getByRole('button',{name:/^(Zoomer|Dézoomer|Agrandir|Réduire|Effacer|Nouvelle recherche)$/}).count());
   await p.screenshot({path:`${output}/${engine}-${locale}-analyzing.png`});
   await p.evaluate(()=>lensResultsTest.setLoading(false));await p.locator('article').first().waitFor();
   check('analysis animation stops',await p.locator('.lens-analysis-dots').count()===0);
   for(const width of [320,390,768,1360]){
    await p.setViewportSize({width,height:844});await settle(p);
    const geometry=await p.evaluate(()=>{const r=document.querySelector('.lens-results');const img=document.querySelector('.lens-results-image img');return {overflow:document.documentElement.scrollWidth>innerWidth,fit:getComputedStyle(img).objectFit,font:getComputedStyle(r).fontFamily,targets:[...r.querySelectorAll('.lens-product-dot,.lens-sheet-handle,.lens-results-chrome button')].map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}))};});
    check(`${width}: image contained and page fits`,!geometry.overflow&&geometry.fit==='contain',geometry);
    check('official font stack',geometry.font.includes('Zalando Sans')&&geometry.font.includes('Noto Sans Arabic'),geometry);
    check('44px targets',geometry.targets.every(x=>x.w>=44&&x.h>=44),geometry);
   }
   await p.setViewportSize({width:390,height:844});await settle(p);
   const stage=await p.locator('.lens-results-image').boundingBox();
   await p.mouse.click(stage.x+stage.width/2,stage.y+8);
   check('letterbox does not submit a crop',await p.evaluate(()=>lensResultsTest.searches.length===0));
   await p.locator('.lens-product-dot').first().click();
   const roi=await p.evaluate(()=>lensResultsTest.searches.at(-1));
   check('detected product uses exact original-image coordinates',Math.abs(roi.x-11.5)<.01&&roi.y===7.5&&roi.w===37.5&&roi.h===80,roi);
   check('selection has four adjustable corners',await p.locator('.lens-selection-corner').count()===4);
   const corner=await p.locator('.lens-corner-se').boundingBox();const count=await p.evaluate(()=>lensResultsTest.searches.length);
   await drag(p,{x:corner.x+22,y:corner.y+22},{x:corner.x+45,y:corner.y+10});
   const updated=await p.evaluate(()=>lensResultsTest.searches.at(-1));
   check('resize submits only on release',await p.evaluate(()=>lensResultsTest.searches.length)===count+1&&updated.w>roi.w&&updated.h<roi.h,updated);
   await p.locator('.lens-corner-nw').focus();await p.keyboard.press('ArrowRight');
   check('keyboard can adjust crop',await p.evaluate(()=>lensResultsTest.searches.at(-1).x)>roi.x);
   await p.screenshot({path:`${output}/${engine}-${locale}-selected.png`});
   const handle=await p.locator('.lens-sheet-handle').boundingBox();
   // Drag must not rerender cards on every move; React commits only at snap.
   await p.evaluate(()=>{window.cardMutations=0;window.cardObserver=new MutationObserver(m=>window.cardMutations+=m.length);window.cardObserver.observe(document.querySelector('.lens-result-grid'),{subtree:true,attributes:true,childList:true,characterData:true});});
   await p.mouse.move(handle.x+handle.width/2,handle.y+22);await p.mouse.down();await p.mouse.move(195,160,{steps:16});
   check('drag uses compositor without mutating list',await p.evaluate(()=>window.cardMutations===0));
   await p.mouse.up();await settle(p);await p.evaluate(()=>window.cardObserver.disconnect());
   check('upward drag expands to results only',await p.locator('.lens-results').getAttribute('data-expanded')==='true');
   const full=await p.evaluate(()=>({top:document.querySelector('.lens-results-sheet').getBoundingClientRect().top,chrome:getComputedStyle(document.querySelector('.lens-results-chrome')).opacity,inert:document.querySelector('.lens-results-chrome').inert,summary:getComputedStyle(document.querySelector('.lens-sheet-summary')).display}));
   check('no brand/back/toolbar over full results',Math.abs(full.top)<1&&full.chrome==='0'&&full.inert&&full.summary==='none',full);
   await p.screenshot({path:`${output}/${engine}-${locale}-full.png`});
   await p.locator('article button').first().click();check('existing product action preserved',await p.evaluate(()=>lensResultsTest.choices[0]==='item-0'));
   check('price remains unchanged',await p.locator('article').first().innerText().then(s=>s.includes('598.00 DT')&&!s.includes('84 EUR')&&!s.includes('Estimation')));
   await p.locator('.lens-results-list').evaluate(n=>n.scrollTop=450);
   await p.mouse.move(190,400);await p.mouse.wheel(0,300);await settle(p);
   check('expanded list scrolls without collapsing',await p.locator('.lens-results-list').evaluate(n=>n.scrollTop)>450&&await p.locator('.lens-results').getAttribute('data-expanded')==='true');
   await p.locator('.lens-sheet-handle').focus();await p.keyboard.press('ArrowDown');await settle(p);
   check('keyboard collapse resets scroll, keeps image',await p.locator('.lens-results').getAttribute('data-expanded')==='false'&&await p.locator('.lens-results-list').evaluate(n=>n.scrollTop)===0);
   await p.locator('.lens-sheet-handle').click();await settle(p);await p.keyboard.press('Escape');await settle(p);
   check('Escape returns to picture without resetting search',await p.locator('.lens-results').getAttribute('data-expanded')==='false'&&await p.evaluate(()=>lensResultsTest.resets===0));
   if(engine==='chromium'){
    // Chromium input dispatch exercises native touch/scroll arbitration, not synthetic DOM handlers.
    await touch(p,{x:190,y:770},{x:190,y:130});
    check('touch drag on content expands',await p.locator('.lens-results').getAttribute('data-expanded')==='true');
    await p.locator('.lens-results-list').evaluate(n=>n.scrollTop=300);
    await touch(p,{x:190,y:200},{x:190,y:750});
    check('scrolled content does not hand drag to sheet',await p.locator('.lens-results').getAttribute('data-expanded')==='true');
    await p.locator('.lens-results-list').evaluate(n=>n.scrollTop=0);
    await touch(p,{x:190,y:150},{x:190,y:760});
    check('downward drag at list top returns to image',await p.locator('.lens-results').getAttribute('data-expanded')==='false');
   }
   await p.setViewportSize({width:320,height:480});await p.evaluate(()=>document.documentElement.style.fontSize='200%');await settle(p);
   await p.locator('.lens-sheet-handle').click();await settle(p);
   check('large text, short viewport: no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.lens-results-list').scrollWidth<=320));
   await p.screenshot({path:`${output}/${engine}-${locale}-large-text.png`});
   await p.evaluate(()=>{document.documentElement.style.fontSize='';lensResultsTest.setItems([]);});
   check('empty state has one honest retry, no false history link',await p.getByRole('button',{name:locale==='ar'?'بحث جديد':'Nouvelle recherche',exact:true}).count()===1&&!await p.getByRole('button',{name:'Recherches récentes',exact:true}).count());
   await p.evaluate(()=>lensResultsTest.setHasImage(false));await settle(p);
   check('link/text results stay full and have an exit',await p.locator('.lens-results').getAttribute('data-expanded')==='true'&&await p.locator('.lens-sheet-handle').count()===0&&await p.locator('.lens-results-chrome button').isVisible());
   await context.close();
  }finally{await browser.close();}
 }
 check('no browser errors',errors.length===0,errors);
}finally{fs.writeFileSync(output+'/browser.json',JSON.stringify({checks,errors,scope:'Actual results UI, synthetic illustration and provider state; desktop browsers plus Chromium touch input, not physical-device performance.'},null,2));}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} Lens results browser assertions passed`);
