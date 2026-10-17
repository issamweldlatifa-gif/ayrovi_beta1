import {chromium,firefox} from 'playwright';
import fs from 'node:fs';
/*
 * Contrat : les résultats Lens utilisent LA carte boutique (ProductGrid, article.s-card),
 * alimentée par candidateToView. Il n'existe pas de seconde carte Lens : ce script vérifie
 * donc la carte boutique, son prix réel, son cœur « Favori » (compte + CSRF) et l'ouverture
 * du produit d'origine. Aucune note marchand n'est affichée par cette carte : rien n'est inventé.
 */
const output='docs/lens-product-cards/evidence';fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];function check(name,pass,details){checks.push({name,pass:!!pass,details});if(!pass)throw Error(name+': '+JSON.stringify(details));}
try{
 for(const [engine,type] of [['chromium',chromium],['firefox',firefox]])for(const locale of ['fr','ar']){
  const browser=await type.launch();
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await context.addInitScript(l=>localStorage.setItem('ayrovi.locale.v1',l),locale);
   const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/*',r=>{const u=r.request().url();return /^https?:/.test(u)&&!u.startsWith(process.env.AYROVI_BASE_URL+'/')?r.abort():r.continue();});
   let favorites=[],writes=[],reads=0,failNext=false;
   await p.route('**/api/ayrovix/live-stock',r=>r.fulfill({json:{success:true,data:{results:[{url:'https://example.com/p/0',availability:'in_stock',price:84,currency:'EUR',originalPrice:null,priceTnd:598,originalPriceTnd:null,sizes:[],colors:[],images:[],checkedAt:new Date().toISOString(),reason:'fixture'}]}}}));
   await p.route('**/api/customer/account/favorites**',async r=>{
    const method=r.request().method();
    if(method==='GET'){reads++;return r.fulfill({json:{success:true,data:favorites}});}
    writes.push({method,csrf:r.request().headers()['x-csrf-token']});
    if(failNext){failNext=false;return r.fulfill({status:500,json:{success:false,error:'Controlled failure'}});}
    if(method==='POST'){const body=r.request().postDataJSON();const f={id:'fixture-favorite',source_url:body.sourceUrl,title:body.title,price_tnd:body.priceTND,product_id:null};favorites=[f];return r.fulfill({status:201,json:{success:true,data:f}});}
    favorites=[];return r.fulfill({json:{success:true}});
   });
   const priceText=new Intl.NumberFormat(locale==='ar'?'ar-TN':'fr-TN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(598)+(locale==='ar'?' د.ت':' DT');
   const heartLabel=locale==='ar'?'المفضّلة':'Favori';
   await p.goto(process.env.AYROVI_BASE_URL+'/__verify/sonim');await p.evaluate(()=>lensResultsTest.setLoading(false));await p.locator('.lens-sheet-handle').click();await p.evaluate(()=>document.fonts.ready);
   const cards=p.locator('.lens-result-grid article.s-card'),first=cards.first();await first.waitFor();
   check(`${engine}/${locale}: shop card is the only result card`,await p.locator('.lens-result-grid article.s-card').count()>0&&await p.locator('.lens-product-card').count()===0);
   check(`${engine}/${locale}: clean reference card`,await first.innerText().then(s=>!/(Estimation|Prix boutique|Prix final|douane|transport|Tailles\/couleurs|Match|94%|Voir le produit|السعر النهائي|جمركة)/.test(s)&&s.includes(priceText)),priceText);
   check('brand and real title separated',await first.locator('.s-card__brand').innerText()==='Atelier'&&await first.locator('.s-card__title').innerText()==='Veste noire — coupe droite');
   check('one price, no converted source price repeated',await first.locator('.s-card__price').count()===1&&!await first.innerText().then(s=>s.includes('84 EUR')));
   check('no invented ratings or badges',await p.locator('.lens-result-grid [data-merchant-rating], .lens-result-grid .lens-rating-star').count()===0&&!/(Meilleure note|Nouveau|Top rated|Best rated)/.test(await first.innerText()));
   const stockButton=first.getByRole('button',{name:locale==='ar'?'التحقق من المخزون: Veste noire — coupe droite':'Vérifier le stock : Veste noire — coupe droite',exact:true});
   await stockButton.click();
   await first.locator('.s-card__stock-note').waitFor();
   check('stock check is a fresh read shown with its time',await first.locator('.s-card__stock-note').innerText().then(s=>s.includes(locale==='ar'?'متوفر':'En stock')&&/\d{1,2}:\d{2}/.test(s)));
   for(const width of [320,390,768,1360]){
    await p.setViewportSize({width,height:844});await p.waitForTimeout(60);
    const g=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,cardWidth:document.querySelector('.lens-result-grid article.s-card').getBoundingClientRect().width}));
    check(`${width}: page fits and card is not clipped`,!g.overflow&&g.cardWidth>0,g);
   }
   await p.setViewportSize({width:390,height:844});
   const heart=first.getByRole('button',{name:heartLabel,exact:true});
   await heart.click();check('guest opens account without fake save',await p.evaluate(()=>lensResultsTest.accountOpens===1&&lensResultsTest.choices.length===0)&&await heart.getAttribute('aria-pressed')==='false'&&writes.length===0);
   await p.evaluate(()=>lensResultsTest.setSession({account:{id:'fixture-account'},csrfToken:'fixture-csrf'}));
   for(let i=0;i<60&&!reads;i++)await p.waitForTimeout(40);
   failNext=true;await heart.click();
   await p.waitForFunction(()=>document.querySelector('.lens-favorite-notice')!==null);
   check('failed save is never shown as saved',await heart.getAttribute('aria-pressed')==='false'&&await p.locator('.lens-favorite-notice').count()===1);
   await heart.click();await p.waitForFunction(()=>document.querySelector('.s-card [aria-pressed="true"]')!==null);
   check('successful heart uses account API and CSRF',favorites.length===1&&writes.at(-1).csrf==='fixture-csrf'&&writes.at(-1).method==='POST');
   check('heart does not open the product',await p.evaluate(()=>lensResultsTest.choices.length===0));
   await p.screenshot({path:`${output}/${engine}-${locale}-cards.png`});
   await heart.click();await p.waitForFunction(()=>document.querySelector('.s-card [aria-pressed="true"]')===null);
   check('remove reaches account favorite endpoint',writes.at(-1).method==='DELETE'&&favorites.length===0);
   await first.getByRole('button',{name:locale==='ar'?/^عرض /:/^Voir /}).focus();await p.keyboard.press('Enter');
   check('keyboard opens the original product',await p.evaluate(()=>lensResultsTest.choices.at(-1)==='item-0'));
   await p.evaluate(()=>lensResultsTest.setSession(null));await p.waitForTimeout(40);
   await p.setViewportSize({width:320,height:480});await p.evaluate(()=>document.documentElement.style.fontSize='200%');
   check('200% text does not cause horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.lens-results-list').scrollWidth<=320));
   await p.screenshot({path:`${output}/${engine}-${locale}-large-text.png`});
   await context.close();
  }finally{await browser.close();}
 }
 check('no uncaught browser errors',errors.length===0,errors);
}finally{fs.writeFileSync(output+'/browser.json',JSON.stringify({checks,errors,scope:'Actual shop product card (ProductGrid) fed by candidateToView, controlled favorites API; not a live provider/account claim.'},null,2));}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} Lens product-card browser assertions passed`);
