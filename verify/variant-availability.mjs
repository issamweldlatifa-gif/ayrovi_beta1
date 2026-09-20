import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
// Execute the production parser on controlled merchant pages, not hand-written status results.
buildSync({entryPoints:['src/scraper/productPageParser.ts'],outfile:'.cache/variant-parser.cjs',bundle:true,platform:'node',format:'cjs',packages:'external'});
const {parseProductPageHtml}=createRequire(import.meta.url)(path.resolve('.cache/variant-parser.cjs'));
const output='screenshots/editorial/variant-availability';fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];let page;
const check=(label,pass,details)=>{checks.push({label,pass:Boolean(pass),details});if(!pass)throw new Error(label+': '+JSON.stringify(details));};
function product(name,flags={},schema){
 const raw={title:name,options:['Size','Color'],variants:[{id:'variant-M-blue',option1:'M',option2:'Bleu',price:27,...flags}]};
 const html=`<head><script type="application/json">${JSON.stringify(raw)}</script><script type="application/ld+json">${JSON.stringify({'@type':'Product',name,offers:{price:20,priceCurrency:'EUR',availability:schema}})}</script></head>`;
 const parsed=parseProductPageHtml(html,'https://example.org/product','generic');
 return {title:parsed.title,sourceUrl:'https://example.org/product',source:'Merchant fixture',brand:null,model:null,description:'Verification data / بيانات اختبار',image:'',images:[],price:parsed.price,currency:parsed.currency,priceTnd:80,exchangeRate:4,priceToken:'BASE_QUOTE_FIXTURE',colors:parsed.variants.colors,sizes:parsed.variants.sizes,availability:parsed.availability,variantOptions:parsed.variants.details.map(v=>({...v,currency:parsed.currency,priceTnd:v.price*4,priceToken:'VARIANT_QUOTE_FIXTURE'}))};
}
const browser=await chromium.launch({headless:true});
try{
 for(const locale of ['fr','ar'])for(const width of [320,390]){
  const ar=locale==='ar',key=`${locale}/${width}`;
  const ctx=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  await ctx.addInitScript(locale=>localStorage.setItem('ayrovi.locale.v1',locale),locale);
  page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/public/commerce-config',route=>route.fulfill({json:{success:true,data:{deposit:{percent:25}}}}));
  await page.goto(process.env.AYROVI_BASE_URL+'/__verify/sonim');await page.waitForFunction(()=>typeof window.setVariantFixture==='function');
  const show=async(value,history=false)=>{await page.evaluate(({value,history})=>window.setVariantFixture(value,history),{value,history});await page.getByRole('heading',{name:value.title,exact:true}).waitFor();await page.getByRole('button',{name:ar?'اطلب · عربون 25%':'Commander · 25%',exact:true}).waitFor();};
  const choose=async()=>{await page.locator('details summary').click();await page.getByRole('combobox',{name:ar?'المقاس':'Taille',exact:true}).selectOption('M');await page.locator('input[list]').fill('Bleu');};
  const order=async()=>{const button=page.getByRole('button',{name:ar?'اطلب · عربون 25%':'Commander · 25%',exact:true});await button.click();await page.waitForFunction(()=>window.variantTestOrders.length===1);return page.evaluate(()=>window.variantTestOrders[0]);};
  for(const [name,flag,schema,label] of [
    ['unknown',{},undefined,ar?'التوفر يحتاج إلى تأكيد':'Disponibilité à confirmer'],
    ['negative',{},'https://schema.org/OutOfStock',ar?'غير متوفر':'Rupture signalée'],
    ['conflict',{available:true},'https://schema.org/OutOfStock',ar?'التوفر يحتاج إلى تأكيد':'Disponibilité à confirmer'],
    ['limited',{available:true},'https://schema.org/LimitedAvailability',ar?'مخزون محدود':'Stock limité'],
    ['positive',{available:true},'https://schema.org/InStock',ar?'متوفر':'Disponible'],
  ]){
    const value=product('Stock '+name,flag,schema);await show(value);
    check(`${key}/${name}: production-parser evidence reaches the stock badge`,await page.getByText(label,{exact:true}).isVisible(),{availability:value.availability});
    await choose();const selected=await order();
    check(`${key}/${name}: manual choice is preserved without inventing stock`,selected.size==='M'&&selected.color==='Bleu'&&selected.option?.id==='variant-M-blue'&&selected.option.price===27,selected);
  }
  for(const [name,available] of [['false-string','false'],['true-string','true'],['missing',undefined],['null',null],['zero',0],['object',{}],['array',[]],['known-false',false]]){
    const value=product('History '+name,{available:true});value.availability='unknown';value.variantOptions[0].available=available;
    await show(value,true);await choose();const selected=await order();
    check(`${key}/${name}: invalid history cannot select a variant-specific quote`,selected.option===null&&selected.size==='M'&&selected.color==='Bleu',selected);
    const preserved=await page.evaluate(()=>({history:window.variantTestHistory,raw:JSON.parse(localStorage.getItem('ayrovi_assistant_conversations_v1_guest'))[0]}));
    check(`${key}/${name}: message and complete variant metadata survive normalization`,preserved.history.status==='ready'&&preserved.history.conversations[0].messages[0].text==='PRESERVED_TEXT / نص محفوظ بالكامل'&&preserved.history.conversations[0].selectedProduct.product.variantOptions[0].price===27&&preserved.history.conversations[0].selectedProduct.product.variantOptions[0].available===false);
    check(`${key}/${name}: reading history never rewrites stored evidence`,JSON.stringify(preserved.raw.selectedProduct.product.variantOptions[0].available)===JSON.stringify(available));
  }
  const valid=product('Known eligible history',{available:true});valid.availability='unknown';await show(valid,true);await choose();
  check(`${key}: genuine boolean eligibility survives history`,(await order()).option?.priceToken==='VARIANT_QUOTE_FIXTURE');
  const malformed=product('Fresh malformed payload',{available:true});malformed.variantOptions[0].available='false';malformed.availability='unknown';await show(malformed);await choose();
  check(`${key}: live result also rejects a malformed eligibility flag`,(await order()).option===null);
  check(`${key}: shared UI explains selection versus stock`,await page.locator('[data-variant-stock-notice]').innerText()===(ar?'اختيار المقاس أو اللون لا يؤكّد توفره لدى المتجر.':'Le choix d’une taille ou couleur ne confirme pas son stock.'));
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  await page.locator('[data-variant-stock-notice]').scrollIntoViewIfNeeded();
  const layout=await page.locator('[data-variant-stock-notice]').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return {width:el.clientWidth,scroll:el.scrollWidth,height:el.clientHeight,content:el.scrollHeight,overflow:getComputedStyle(el).overflowY,textBottom:range.getBoundingClientRect().bottom,nextTop:el.parentElement.nextElementSibling.getBoundingClientRect().top,docWidth:document.documentElement.clientWidth,docScroll:document.documentElement.scrollWidth};});
  check(`${key}: stock explanation stays complete at 200% root font`,layout.scroll<=layout.width+1&&(layout.overflow==='visible'||layout.content<=layout.height+1)&&layout.textBottom<=layout.nextTop+1&&layout.docScroll<=layout.docWidth+1,layout);
  const quantity=page.getByRole('spinbutton',{name:ar?'الكمية':'Quantité',exact:true});await quantity.fill('99');
  const control=await quantity.evaluate(el=>{const style=getComputedStyle(el),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;return {width:el.getBoundingClientRect().width,textWidth:ctx.measureText(el.value).width,height:el.getBoundingClientRect().height,buttons:[...el.parentElement.querySelectorAll('button')].map(button=>button.getBoundingClientRect().width)};});
  check(`${key}: enlarged two-digit quantity has room and keeps 44px step controls`,control.width>=Math.max(44,control.textWidth+24)&&control.height>=44&&control.buttons.every(width=>width>=44),control);
  await page.getByRole('button',{name:ar?'تقليل الكمية':'Diminuer la quantité',exact:true}).click();
  check(`${key}: enlarged decrement retains the exact quantity`,await quantity.inputValue()==='98');
  await page.getByRole('button',{name:ar?'زيادة الكمية':'Augmenter la quantité',exact:true}).click();
  check(`${key}: enlarged increment preserves the 99-item boundary`,await quantity.inputValue()==='99'&&await page.getByRole('button',{name:ar?'زيادة الكمية':'Augmenter la quantité',exact:true}).isDisabled());
  await page.screenshot({path:`${output}/variant-stock-${locale}-${width}.png`});
  await ctx.close();
 }
 check('No uncaught browser errors',errors.length===0,errors);
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw error;}
finally{fs.writeFileSync(`${output}/checks.json`,JSON.stringify({checks,errors},null,2));await browser.close();console.log(`${checks.filter(c=>c.pass).length}/${checks.length} variant availability assertions passed`);}
