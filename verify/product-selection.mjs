import {chromium} from 'playwright';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
buildSync({entryPoints:['src/ayrovix/priceQuote.ts'],outfile:'.cache/selection-quote.cjs',bundle:true,platform:'node',format:'cjs'});
const {createAyrovixPriceToken,verifyAyrovixPriceToken}=createRequire(import.meta.url)(path.resolve('.cache/selection-quote.cjs'));
const output='screenshots/editorial/product-selection';fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];let page;
const check=(label,pass,details)=>{checks.push({label,pass:Boolean(pass),details});if(!pass)throw new Error(label+': '+JSON.stringify(details));};
const base={title:'Selection fixture / منتج اختباري',sourceUrl:'https://example.org/product',source:'Merchant fixture',brand:null,model:null,description:'Data for verification / بيانات اختبار',image:'',images:[],price:20,currency:'EUR',priceTnd:80,exchangeRate:4,colors:['Bleu','Rouge'],sizes:['M','L'],availability:'unknown',priceVerified:true,priceVerificationStatus:'VERIFIED'};
const token=(price,currency='EUR')=>createAyrovixPriceToken({price,currency,title:base.title,referenceUrl:base.sourceUrl,status:'VERIFIED'});
base.priceToken=token(20);
const variant=(id,size,color,price)=>({id,label:size+' · '+color,size,color,price,currency:'EUR',priceTnd:price*4,priceToken:token(price),available:true});
const blue=variant('blue-M','M','Bleu',27),red=variant('red-M','M','Rouge',35),large=variant('blue-L','L','Bleu',40);
const scenarios=[
 {name:'exact',options:[blue,red],size:'M',color:'Bleu',id:'blue-M',price:27,tnd:108},
 {name:'size-only',options:[blue,red],size:'M',color:'',id:null,price:20,tnd:80,notice:'ambiguous'},
 {name:'reordered',options:[red,blue],size:'M',color:'',id:null,price:20,tnd:80,notice:'ambiguous'},
 {name:'color-only',options:[blue,large],size:'',color:'Bleu',id:null,price:20,tnd:80,notice:'ambiguous'},
 {name:'conflicting',options:[blue,variant('other','M','Bleu',32)],size:'M',color:'Bleu',id:null,price:20,tnd:80,notice:'ambiguous'},
 {name:'custom',options:[blue,red],size:'XXL',color:'Vert',id:null,price:20,tnd:80,notice:'general'},
 {name:'unpriced-option',options:[{...blue,price:null,currency:null,priceTnd:null,priceToken:null}],size:'M',color:'Bleu',id:'blue-M',price:20,tnd:80,notice:'general'},
 {name:'missing-total',options:[{...blue,priceTnd:null}],size:'M',color:'Bleu',id:'blue-M',price:27,tnd:0},
 {name:'missing-token',options:[{...blue,priceToken:null}],size:'M',color:'Bleu',blocked:true},
 {name:'missing-currency',options:[{...blue,currency:null}],size:'M',color:'Bleu',blocked:true},
 {name:'missing-general-token',options:[],size:'',color:'',missingGeneral:true,parentReject:true},
];
const browser=await chromium.launch({headless:true});
try{
 for(const locale of ['fr','ar'])for(const width of [320,390])for(const mode of ['lens','sonim']){
  const ar=locale==='ar',key=`${mode}/${locale}/${width}`;
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  await context.addInitScript(({locale,base})=>{localStorage.setItem('ayrovi.locale.v1',locale);Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:undefined});localStorage.setItem('ayrovi_assistant_conversations_v1_guest',JSON.stringify([{id:'fixture',title:'Stored fixture',messages:[{id:'product',role:'assistant',text:'Historical selection'}],selectedProduct:{messageId:'product',product:base,priceVerified:true},createdAt:'2026-09-20T10:00:00Z',updatedAt:'2026-09-20T10:00:00Z'}]));},{locale,base});
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/assistant/status',route=>route.fulfill({json:{success:true,data:{voiceReady:false}}}));
  await page.route('**/api/ayrovix/history',route=>route.fulfill({json:{success:true,data:[]}}));
  await page.route('**/api/public/commerce-config',route=>route.fulfill({json:{success:true,data:{deposit:{percent:25}}}}));
  let fresh=base;
  await page.route('**/api/ayrovix/analyze-url',route=>route.fulfill({json:{success:true,data:{product:fresh,alternates:[],eventId:''}}}));
  for(const scenario of scenarios){
   fresh={...base,variantOptions:scenario.options,priceToken:scenario.missingGeneral?null:base.priceToken};
   await page.goto(process.env.AYROVI_BASE_URL+`/__verify/sonim?mode=${mode}&case=${scenario.name}`);await page.locator('[data-open]').click();
   if(mode==='lens'){await page.locator('.lens-access, #ayrovix-url-input').first().waitFor(); if(await page.locator('.lens-access').count()){for(const input of await page.locator('.lens-consent input').all())await input.check(); await page.locator('.lens-consent .lens-panel-primary').click();} await page.locator('#ayrovix-url-input').fill(base.sourceUrl);await page.getByRole('button',{name:ar?'تحليل':'Analyser',exact:true}).click();}
   else await page.getByRole('button',{name:ar?'تحديث المنتج وفتحه':'Actualiser et ouvrir le produit',exact:true}).click();
   const card=page.locator('.flow-product');await card.waitFor();const order=card.getByRole('button',{name:ar?'اطلب · عربون 25%':'Commander · 25%',exact:true});await order.waitFor();
   await card.evaluate(el=>el.querySelectorAll('details').forEach(details=>{details.open=true;}));
   const size=card.getByRole('combobox',{name:ar?'المقاس':'Taille',exact:true});
   if(scenario.size==='XXL'){await size.selectOption('__other__');await card.getByRole('textbox',{name:ar?'مقاس آخر':'Autre taille',exact:true}).fill('XXL');}else await size.selectOption(scenario.size);
   await card.locator('input[list]').fill(scenario.color);
   if(scenario.blocked){
    await card.locator('[data-variant-selection-notice][role=alert]').waitFor();
    check(`${key}/${scenario.name}: incomplete variant cannot borrow a general quote`,await order.isDisabled()&&await page.evaluate(()=>selectionTestOrders.length===0));
    check(`${key}/${scenario.name}: incomplete quote explanation is localized`,(await card.locator('[data-variant-selection-notice]').innerText()).includes(ar?'عرض سعر هذا الخيار غير مكتمل':'Le devis de cette variante est incomplet'));
    continue;
   }
   if(scenario.parentReject){
    await order.click();await page.getByText(ar?'عرض سعر هذا الاختيار غير مكتمل أو غير متاح. أعد البحث عن المنتج.':'Le devis de cette sélection est incomplet ou indisponible. Relancez la recherche du produit.',{exact:true}).waitFor();
    check(`${key}/${scenario.name}: real parent refuses an unsigned offer`,await page.evaluate(()=>selectionTestOrders.length===0));continue;
   }
   const text=await card.innerText();
   check(`${key}/${scenario.name}: displayed monetary source agrees with selection`,text.includes(scenario.price.toFixed(2)+' EUR')&&(scenario.tnd?text.includes(scenario.tnd.toFixed(2)):!text.includes('80.00')),text.slice(0,500));
   if(scenario.notice){
    const notice=card.locator('[data-variant-selection-notice]');await notice.waitFor();
    check(`${key}/${scenario.name}: general estimate is honest and localized`,(await notice.innerText()).includes(ar?(scenario.notice==='ambiguous'?'توجد عدة خيارات':'تقدير عام'):(scenario.notice==='ambiguous'?'Plusieurs variantes':'Estimation générale'))&&await card.getByText(ar?'السعر الإجمالي التقديري':'Prix total estimé',{exact:true}).isVisible()&&!text.includes(ar?'السعر مؤكّد':'Prix confirmé'),{text,notice:await notice.innerText()});
   }
   if(scenario.name==='size-only'){
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');const notice=card.locator('[data-variant-selection-notice]');await notice.scrollIntoViewIfNeeded();
    const layout=await notice.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,overflow:getComputedStyle(el).overflowY,height:el.clientHeight,content:el.scrollHeight}));
    check(`${key}: ambiguity notice is complete at enlarged font`,layout.scroll<=layout.width+1&&(layout.overflow==='visible'||layout.content<=layout.height+1),layout);
    const reachable=await notice.evaluate(el=>{
      const text=el.firstChild,range=document.createRange();range.setStart(text,Math.max(0,text.textContent.length-1));range.setEnd(text,text.textContent.length);
      for(let parent=el.parentElement;parent;parent=parent.parentElement){if(/auto|scroll/.test(getComputedStyle(parent).overflowY)&&parent.scrollHeight>parent.clientHeight){const r=range.getBoundingClientRect(),p=parent.getBoundingClientRect();parent.scrollTop+=Math.max(0,r.bottom-p.bottom+12);}}
      let top=0,bottom=innerHeight;for(let parent=el.parentElement;parent;parent=parent.parentElement){if(/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)){const r=parent.getBoundingClientRect();top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}}
      const r=range.getBoundingClientRect();return {top:r.top,bottom:r.bottom,clipTop:top,clipBottom:bottom};
    });
    check(`${key}: last line remains reachable through native scrolling at enlarged font`,reachable.top>=reachable.clipTop-1&&reachable.bottom<=reachable.clipBottom+1,reachable);
    await page.screenshot({path:`${output}/selection-enlarged-${mode}-${locale}-${width}.png`});await page.evaluate(()=>document.documentElement.style.fontSize='');await notice.scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/selection-${mode}-${locale}-${width}.png`});
   }
   await order.click();await page.waitForFunction(()=>selectionTestOrders.length===1);const sent=await page.evaluate(()=>selectionTestOrders[0]);
   check(`${key}/${scenario.name}: actual parent does not invent a variant or change the request`,sent.externalId===scenario.id&&sent.requestedSize===scenario.size&&sent.requestedColor===scenario.color,sent);
   check(`${key}/${scenario.name}: parent submits one coherent monetary offer`,sent.sourcePrice===scenario.price&&sent.sourceCurrency==='EUR'&&sent.priceTND===scenario.tnd,sent);
   check(`${key}/${scenario.name}: actual server HMAC verifier accepts submitted fields`,verifyAyrovixPriceToken(sent.priceToken,{price:sent.sourcePrice,currency:sent.sourceCurrency,title:sent.title,referenceUrl:sent.referenceUrl,status:sent.priceVerificationStatus}));
   if(!scenario.id)check(`${key}/${scenario.name}: manual label does not smuggle in an unchosen color or size`,!String(sent.variant).includes(' · Bleu')&&!String(sent.variant).includes(' · Rouge'),sent.variant);
  }
  await context.close();
 }
 check('No uncaught browser errors',errors.length===0,errors);
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw error;}
finally{fs.writeFileSync(`${output}/checks.json`,JSON.stringify({checks,errors},null,2));await browser.close();console.log(`${checks.filter(c=>c.pass).length}/${checks.length} product selection assertions passed`);}
